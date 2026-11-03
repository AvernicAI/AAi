import { describe, expect, test } from "bun:test"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { resolveExternalURL, resolveLocalFilePath, shouldRevealLocalFile } from "./external-url"

test.each([
  ["payload.cmd", true],
  ["payload.py", true],
  ["payload.exe::$DATA", true],
  ["payload.PS1", true],
  ["payload.exe. ", true],
  ["shortcut.lnk", true],
  ["script.js", true],
  ["script.sh", true],
  ["application.desktop", true],
  ["executable", true],
  ["source.ts", false],
  ["guide.md", false],
  ["report.pdf", false],
  ["image.png", false],
])("local file links select reveal rather than launch for %s", (name, reveal) => {
  expect(shouldRevealLocalFile(name)).toBe(reveal)
})

describe("external URLs", () => {
  test("opens only web and mail URLs externally", () => {
    expect(resolveExternalURL("https://example.com/a?b=c")).toBe("https://example.com/a?b=c")
    expect(resolveExternalURL("http://example.com")).toBe("http://example.com/")
    expect(resolveExternalURL("mailto:hello@opencode.ai")).toBe("mailto:hello@opencode.ai")

    for (const url of ["file:///tmp/index.html", "javascript:alert(1)", "data:text/html,hello", "not a url"])
      expect(resolveExternalURL(url)).toBeUndefined()
  })

  test("resolves only local file URLs", () => {
    const path = resolve("example.html")
    expect(resolveLocalFilePath(pathToFileURL(path).href)).toBe(path)
    expect(resolveLocalFilePath("file://example.com/share/index.html")).toBeUndefined()
    expect(resolveLocalFilePath("https://example.com/index.html")).toBeUndefined()
  })
})
