import { createHash } from "node:crypto"
import { execFile } from "node:child_process"
import { lstat, mkdir, open, readFile, readdir, realpath, rename, stat } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"

const execute = promisify(execFile)

const MAX_FILE = 4 * 1024 * 1024

export async function openWorkspace(directory: string) {
  const root = await realpath(directory)

  if (!(await stat(root)).isDirectory()) throw new Error("ide.directory")

  const candidate = (name: string) => {
    const file = path.resolve(root, name)
    const relative = path.relative(root, file)

    if (
      path.isAbsolute(relative) ||
      relative === ".." ||
      relative.startsWith(`..${path.sep}`) ||
      relative.toLowerCase().split(path.sep).includes(".git")
    )
      throw new Error("ide.path")

    return file
  }

  const resolve = async (name: string, create = false) => {
    const file = candidate(name)

    const resolved = create ? path.join(await realpath(path.dirname(file)), path.basename(file)) : await realpath(file)

    const checked = path.relative(root, resolved)

    if (path.isAbsolute(checked) || checked === ".." || checked.startsWith(`..${path.sep}`)) throw new Error("ide.path")

    return resolved
  }

  const relative = (file: string) => path.relative(root, file).split(path.sep).join("/")

  const read = async (name: string) => {
    const file = await resolve(name)

    if ((await stat(file)).size > MAX_FILE) throw new Error("ide.large")
    const bytes = await readFile(file)

    if (bytes.includes(0)) throw new Error("ide.binary")

    return { path: relative(file), text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), version: hash(bytes) }
  }

  const git = (args: readonly string[], signal?: AbortSignal) =>
    execute("git", ["-C", root, "--literal-pathspecs", ...args], {
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
      signal,
    })

  return {
    root,
    resolve,
    relative,
    read,
    git,
    async stage(name: string, staged: boolean, signal?: AbortSignal) {
      const file = relative(candidate(name))

      if (!file) throw new Error("ide.path")

      if (staged) {
        await git(["add", "--", file], signal)

        return
      }

      const head = await git(["rev-parse", "--verify", "HEAD"], signal).then(
        () => true,
        () => false,
      )

      await git(head ? ["restore", "--staged", "--", file] : ["rm", "--cached", "--", file], signal)
    },
    async list(name: string) {
      const folder = await resolve(name)

      return (await readdir(folder, { withFileTypes: true }))
        .flatMap((entry) =>
          entry.name === ".git" || entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())
            ? []
            : [{ path: relative(path.join(folder, entry.name)), directory: entry.isDirectory() }],
        )
        .sort((a, b) => Number(b.directory) - Number(a.directory) || a.path.localeCompare(b.path))
    },
    async save(name: string, text: string, version: string) {
      const file = await resolve(name)
      const handle = await open(file, "r+")

      return Promise.try(async () => {
        if (hash(await handle.readFile()) !== version) throw new Error("ide.conflict")
        const bytes = Buffer.from(text)
        await handle.write(bytes, 0, bytes.length, 0)
        await handle.truncate(bytes.length)
        await handle.sync()

        return { path: relative(file), text, version: hash(bytes) }
      }).finally(() => handle.close())
    },
    async create(name: string, directory: boolean) {
      const file = await resolve(name, true)

      if (file === root) throw new Error("ide.path")

      if (directory) return void (await mkdir(file))
      await (await open(file, "wx")).close()
    },
    async rename(name: string, target: string) {
      const source = await resolve(name)
      const destination = await resolve(target, true)

      if (source === root || destination === root) throw new Error("ide.path")

      if (
        await lstat(destination).then(
          () => true,
          () => false,
        )
      )
        throw new Error("ide.exists")
      await rename(source, destination)
    },
    async search(query: string, caseSensitive: boolean, signal: AbortSignal) {
      const matches: { path: string; line: number; text: string }[] = []

      if (!query) return { matches, truncated: false }

      const indexed = await git(["ls-files", "-z", "--cached", "--others", "--exclude-standard"], signal).then(
        (result) => result.stdout.split("\0").filter(Boolean),
        () => undefined,
      )

      const collect = async (folder: string): Promise<string[]> =>
        (await readdir(folder, { withFileTypes: true })).reduce(async (pending, item) => {
          const files = await pending

          if ([".git", "node_modules", "dist", "build", ".next", ".cache"].includes(item.name) || item.isSymbolicLink())
            return files
          const file = path.join(folder, item.name)

          if (files.length >= 20000) return files

          return files.concat(item.isDirectory() ? await collect(file) : item.isFile() ? [relative(file)] : [])
        }, Promise.resolve<string[]>([]))

      const names = indexed ?? (await collect(root))
      const needle = caseSensitive ? query : query.toLocaleLowerCase()

      for (const name of names.slice(0, 20000)) {
        signal.throwIfAborted()
        const document = await read(name).catch(() => undefined)

        if (!document) continue

        for (const [index, line] of document.text.split(/\r?\n/).entries()) {
          if (!(caseSensitive ? line : line.toLocaleLowerCase()).includes(needle)) continue
          matches.push({ path: name, line: index + 1, text: line.slice(0, 500) })

          if (matches.length >= 500) return { matches, truncated: true }
        }
      }

      return { matches, truncated: names.length > 20000 }
    },
    async status(signal?: AbortSignal) {
      const result = await git(["status", "--porcelain=v1", "-z", "--branch"], signal)

      return parseStatus(result.stdout)
    },
    async diff(name: string, signal?: AbortSignal) {
      candidate(name)

      const results = await Promise.all([
        git(["diff", "--no-ext-diff", "--", name], signal),
        git(["diff", "--cached", "--no-ext-diff", "--", name], signal),
      ])

      const text = results
        .map((result) => result.stdout)
        .join("\n")
        .trim()

      if (text) return text

      return (await read(name)).text
    },
  }
}

function hash(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex")
}

export function parseStatus(value: string) {
  const records = value.split("\0")
  const branch = records[0]?.startsWith("## ") ? (records.shift()!.slice(3).split("...")[0] ?? "") : ""
  const changes: { path: string; index: string; worktree: string }[] = []

  for (let i = 0; i < records.length; i++) {
    const item = records[i]

    if (!item || item.length < 4) continue
    changes.push({ path: item.slice(3), index: item[0] ?? " ", worktree: item[1] ?? " " })

    if (item[0] === "R" || item[0] === "C" || item[1] === "R" || item[1] === "C") i++
  }

  return { branch, changes }
}

export type Workspace = Awaited<ReturnType<typeof openWorkspace>>
