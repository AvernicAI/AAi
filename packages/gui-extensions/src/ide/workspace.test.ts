import { afterEach, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { openWorkspace, parseStatus } from "./workspace"

const roots: string[] = []

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
  expect(await workspace.search("Needle", true, signal)).toEqual({
    matches: [{ path: "file.ts", line: 2, text: "Needle here" }],
    truncated: false,
  })
  expect((await workspace.search("Needle", false, signal)).matches).toHaveLength(2)
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
