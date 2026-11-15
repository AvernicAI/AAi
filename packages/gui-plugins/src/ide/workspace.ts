import { createHash } from "node:crypto"
import { execFile } from "node:child_process"
import { lstat, mkdir, open, readFile, readdir, realpath, rename, stat } from "node:fs/promises"
import path from "node:path"
import { buffer } from "node:stream/consumers"
import { promisify } from "node:util"
import { artifactMime } from "@opencode/util/artifact"
import { Schema } from "effect"

const execute = promisify(execFile)

const MAX_FILE = 4 * 1024 * 1024

const MAX_IMAGE = 16 * 1024 * 1024

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

  const files = async (signal: AbortSignal) => {
    signal.throwIfAborted()

    const indexed = await git(["ls-files", "-z", "--cached", "--others", "--exclude-standard"], signal).then(
      (result) => [...new Set(result.stdout.split("\0").filter(Boolean))],
      () => undefined,
    )

    signal.throwIfAborted()

    if (indexed) return { paths: indexed.slice(0, 20000), truncated: indexed.length > 20000 }
    const paths: string[] = []

    const collect = async (folder: string): Promise<void> => {
      signal.throwIfAborted()

      for (const item of await readdir(folder, { withFileTypes: true })) {
        signal.throwIfAborted()

        if (paths.length >= 20000) return

        if ([".git", "node_modules", "dist", "build", ".next", ".cache"].includes(item.name) || item.isSymbolicLink())
          continue
        const file = path.join(folder, item.name)

        if (item.isDirectory()) await collect(file)

        if (item.isFile()) paths.push(relative(file))
      }
    }

    await collect(root)

    return { paths, truncated: paths.length >= 20000 }
  }

  return {
    files,
    root,
    resolve,
    relative,
    read,
    async readImage(name: string, signal: AbortSignal) {
      const file = await resolve(name)
      const mime = artifactMime(file)

      if (!mime?.startsWith("image/")) throw new Error("ide.image.type")
      const handle = await open(file, "r")

      return Promise.try(async () => {
        const info = await handle.stat()

        if (!info.isFile()) throw new Error("ide.image.type")

        if (info.size > MAX_IMAGE) throw new Error("ide.image.large")
        signal.throwIfAborted()
        const bytes = await buffer(handle.createReadStream({ end: MAX_IMAGE, autoClose: false, signal }))

        if (bytes.length > MAX_IMAGE) throw new Error("ide.image.large")

        return { path: relative(file), mime, base64: bytes.toString("base64") }
      }).finally(() => handle.close())
    },
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

      const indexed = await files(signal)
      const names = indexed.paths
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

      return { matches, truncated: indexed.truncated }
    },
    async status(signal?: AbortSignal) {
      const result = await git(["status", "--porcelain=v1", "-z", "--branch"], signal)

      return parseStatus(result.stdout)
    },
    async tasks() {
      const manifest = await read("package.json").catch(() => undefined)

      if (!manifest) return []

      const value = Schema.decodeUnknownSync(
        Schema.fromJsonString(
          Schema.Struct({
            scripts: Schema.optional(Schema.Record(Schema.String, Schema.String)),
            packageManager: Schema.optional(Schema.String),
          }),
        ),
      )(manifest.text)

      const manager = value.packageManager?.split("@")[0] ?? "npm"
      const executable = ["bun", "npm", "pnpm", "yarn"].includes(manager) ? manager : "npm"

      return Object.entries(value.scripts ?? {})
        .filter(([name]) => /^[\w:./-]+$/.test(name))
        .map(([name, script]) => ({
          name,
          script,
          command: `${executable} run ${name}`,
        }))
    },
    async compare(name: string, staged: boolean, signal: AbortSignal) {
      const file = relative(candidate(name))
      const prefix = (await git(["rev-parse", "--show-prefix"], signal)).stdout.replace(/\r?\n$/, "")

      const show = (revision: string) =>
        git(["show", `${revision}:${prefix}${file}`], signal).then(
          (result) => result.stdout,
          () => "",
        )

      const [before, after] = await Promise.all([
        show("HEAD"),
        staged
          ? show("")
          : read(name).then(
              (document) => document.text,
              (error: Error) => {
                if (Schema.is(Schema.Struct({ code: Schema.Literals(["ENOENT"]) }))(error)) return ""
                throw error
              },
            ),
      ])

      if (before.includes("\0") || after.includes("\0")) throw new Error("ide.binary")

      if (Buffer.byteLength(before) > MAX_FILE || Buffer.byteLength(after) > MAX_FILE) throw new Error("ide.large")

      return { before, after }
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
