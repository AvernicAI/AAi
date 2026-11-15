import { afterEach, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, symlink, truncate, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { openWorkspace, parseStatus } from "./workspace"

const roots: string[] = []

test("project script discovery honors the package manager and rejects malformed manifests", async () => {
  const root = await directory()
  const workspace = await openWorkspace(root)
  expect(await workspace.tasks()).toEqual([])
  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ packageManager: "bun@1.4.4", scripts: { test: "bun test", "build:web": "vite build" } }),
  )
  expect(await workspace.tasks()).toEqual([
    { name: "test", command: "bun run test", script: "bun test" },
    { name: "build:web", command: "bun run build:web", script: "vite build" },
  ])
  await writeFile(path.join(root, "package.json"), '{"scripts":{"test":123}}')
  await expect(workspace.tasks()).rejects.toThrow()
})

test("Git comparisons separate staged and working text and honor a nested workspace", async () => {
  const root = await directory()
  const repo = await openWorkspace(root)
  await repo.git(["init"])
  const folder = path.join(root, " nested folder")
  await mkdir(folder)
  const file = path.join(folder, "file.ts")
  await writeFile(file, "original\n")
  await repo.git(["add", "--", "."])
  await repo.git(["-c", "user.name=IDE Test", "-c", "user.email=ide@example.invalid", "commit", "-m", "fixture"])
  const workspace = await openWorkspace(folder)
  await writeFile(file, "staged\n")
  await workspace.stage("file.ts", true)
  await writeFile(file, "working\n")
  const signal = new AbortController().signal
  expect(await workspace.compare("file.ts", true, signal)).toEqual({ before: "original\n", after: "staged\n" })
  expect(await workspace.compare("file.ts", false, signal)).toEqual({ before: "original\n", after: "working\n" })
  await expect(workspace.compare("../escape.ts", false, signal)).rejects.toThrow("ide.path")
  await writeFile(file, Buffer.from([1, 0, 2]))
  await expect(workspace.compare("file.ts", false, signal)).rejects.toThrow("ide.binary")
  await rm(file)
  expect(await workspace.compare("file.ts", false, signal)).toEqual({ before: "original\n", after: "" })
})

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function directory() {
  const root = await mkdtemp(path.join(tmpdir(), "aai-ide-"))
  roots.push(root)

  return root
}

test("workspace boundaries reject traversal, Git internals and escaping directory links", async () => {
  const parent = await directory()
  const root = path.join(parent, "workspace")
  await mkdir(root)
  await mkdir(path.join(root, ".git"))
  await writeFile(path.join(parent, "outside.txt"), "outside")
  await symlink(parent, path.join(root, "link"), "junction")
  const workspace = await openWorkspace(root)

  for (const name of ["../outside.txt", path.join(parent, "outside.txt"), ".git/config", "link/outside.txt"]) {
    await expect(workspace.resolve(name, true)).rejects.toThrow("ide.path")
  }

  expect(await workspace.list("")).toEqual([])
  await expect(workspace.create("../escape.txt", false)).rejects.toThrow("ide.path")
})

test("save preserves Unicode, truncates shorter edits, and rejects an external change without overwriting it", async () => {
  const root = await directory()
  await writeFile(path.join(root, "file.ts"), "original content\r\n")
  const workspace = await openWorkspace(root)
  const original = await workspace.read("file.ts")
  const saved = await workspace.save("file.ts", "é\n", original.version)
  expect(await readFile(path.join(root, "file.ts"), "utf8")).toBe("é\n")
  expect(saved.version).not.toBe(original.version)
  await writeFile(path.join(root, "file.ts"), "external change")
  await expect(workspace.save("file.ts", "local change", saved.version)).rejects.toThrow("ide.conflict")
  expect(await readFile(path.join(root, "file.ts"), "utf8")).toBe("external change")
})

test("create and rename do not overwrite existing files, and binary files cannot enter a text editor", async () => {
  const root = await directory()
  const workspace = await openWorkspace(root)
  await workspace.create("source.ts", false)
  await workspace.create("target.ts", false)
  await writeFile(path.join(root, "target.ts"), "keep")
  await expect(workspace.create("target.ts", false)).rejects.toThrow()
  await expect(workspace.rename("source.ts", "target.ts")).rejects.toThrow("ide.exists")
  expect(await readFile(path.join(root, "target.ts"), "utf8")).toBe("keep")
  await writeFile(path.join(root, "binary.bin"), Buffer.from([1, 0, 2]))
  await expect(workspace.read("binary.bin")).rejects.toThrow("ide.binary")
})

test("workspace search respects Git ignores and reports exact file and line positions", async () => {
  const root = await directory()
  const workspace = await openWorkspace(root)
  await workspace.git(["init"])
  await Promise.all([
    writeFile(path.join(root, ".gitignore"), "ignored.txt\n"),
    writeFile(path.join(root, "file.ts"), "first\nNeedle here\nneedle again\n"),
    writeFile(path.join(root, "ignored.txt"), "Needle"),
  ])
  const signal = new AbortController().signal
  expect((await workspace.files(signal)).paths.sort()).toEqual([".gitignore", "file.ts"])
  expect(await workspace.search("Needle", true, signal)).toEqual({
    matches: [{ path: "file.ts", line: 2, text: "Needle here" }],
    truncated: false,
  })
  expect((await workspace.search("Needle", false, signal)).matches).toHaveLength(2)
})

test("file picker indexes collapsed folders without Git and skips build output and links", async () => {
  const root = await directory()
  await mkdir(path.join(root, "src", "nested"), { recursive: true })
  await mkdir(path.join(root, "node_modules"))
  await writeFile(path.join(root, "src", "nested", "editor.ts"), "export const answer = 42")
  await writeFile(path.join(root, "node_modules", "ignored.ts"), "ignored")
  await symlink(path.join(root, "src"), path.join(root, "linked"), "junction")
  const workspace = await openWorkspace(root)
  expect(await workspace.files(new AbortController().signal)).toEqual({
    paths: ["src/nested/editor.ts"],
    truncated: false,
  })
  const cancelled = new AbortController()
  cancelled.abort()
  await expect(workspace.files(cancelled.signal)).rejects.toThrow()
})

test("image previews preserve binary bytes and reject out-of-workspace or oversized files", async () => {
  const root = await directory()
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRZkAAAAASUVORK5CYII="
  await writeFile(path.join(root, "Image.PNG"), Buffer.from(png, "base64"))
  const workspace = await openWorkspace(root)
  const signal = new AbortController().signal

  expect(await workspace.readImage("Image.PNG", signal)).toEqual({
    path: "Image.PNG",
    mime: "image/png",
    base64: png,
  })
  await expect(workspace.readImage("../outside.png", signal)).rejects.toThrow("ide.path")
  await truncate(path.join(root, "Image.PNG"), 16 * 1024 * 1024 + 1)
  await expect(workspace.readImage("Image.PNG", signal)).rejects.toThrow("ide.image.large")
})

test("Git status keeps renamed and punctuated paths intact", () => {
  expect(parseStatus("## dev...origin/dev\0R  new name.ts\0old name.ts\0?? a#b.ts\0 M modified.ts\0")).toEqual({
    branch: "dev",
    changes: [
      { path: "new name.ts", index: "R", worktree: " " },
      { path: "a#b.ts", index: "?", worktree: "?" },
      { path: "modified.ts", index: " ", worktree: "M" },
    ],
  })
})

test("Git stages literal filenames and unstages before the first commit without deleting the worktree file", async () => {
  const root = await directory()
  const workspace = await openWorkspace(root)
  await workspace.git(["init"])
  await writeFile(path.join(root, "[one].ts"), "keep")
  await writeFile(path.join(root, "o.ts"), "leave untracked")
  await workspace.stage("[one].ts", true)
  expect((await workspace.status()).changes).toEqual([
    { path: "[one].ts", index: "A", worktree: " " },
    { path: "o.ts", index: "?", worktree: "?" },
  ])
  await workspace.stage("[one].ts", false)
  expect((await workspace.status()).changes.every((item) => item.index === "?")).toBe(true)
  expect(await readFile(path.join(root, "[one].ts"), "utf8")).toBe("keep")
})
