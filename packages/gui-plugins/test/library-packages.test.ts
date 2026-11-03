import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { configurePlugin, decodePackage, editPluginConfig, packageSpec } from "../src/skills/packages"
import { exportRecipes, importRecipes } from "../src/skills/recipes-model"

const item = { name: "@aai/fixture", version: "1.2.3", enabled: true }

test.each([
  ["@aai/fixture", "1.2.3", true],
  ["aai-fixture", "1.2.3-beta.1", true],
  ["aai-fixture", "latest", false],
  ["aai-fixture", "^1.2.3", false],
  ["aai-fixture", "1.2.3;whoami", false],
  ["../fixture", "1.2.3", false],
  ["https://example.com/plugin.tgz", "1.2.3", false],
  ["file:./plugin", "1.2.3", false],
  ["@scope/../escape", "1.2.3", false],
])("library pins only registry package identities: %s %s", (name, version, valid) => {
  if (!valid) return expect(() => packageSpec(name, version)).toThrow()
  expect(packageSpec(name, version)).toBe(`${name}@${version}`)
})

test("plugin enable, disable and removal preserve unrelated JSONC configuration and option-bearing declarations", () => {
  const original = '{\n // Keep AAi settings\n "shell":"powershell.exe", "mcp":{"servers":{"existing":{"type":"remote","url":"https://example.test/mcp"}}}, "plugin":["legacy-plugin"], "plugins":["opencode.*",{"package":"other@2.0.0","options":{"team":"AAi"}},"-unrelated"]\n}'
  const enabled = editPluginConfig(original, item, true)
  expect(enabled).toContain("// Keep AAi settings")
  expect(enabled).toContain('"@aai/fixture@1.2.3"')
  const disabled = editPluginConfig(enabled, item, false)
  const config = JSON.parse(disabled.replace("// Keep AAi settings", ""))
  expect(config.plugins).toEqual(["opencode.*", { package: "other@2.0.0", options: { team: "AAi" } }, "-unrelated"])
  expect(config.plugin).toEqual(["legacy-plugin"])
  expect(config.shell).toBe("powershell.exe")
  expect(config.mcp.servers.existing.url).toBe("https://example.test/mcp")
  expect(editPluginConfig(disabled, item, true)).toContain('"@aai/fixture@1.2.3"')
})

test.each([
  '{"plugins":["@aai/fixture@2.0.0"]}',
  '{"plugins":[{"package":"@aai/fixture@1.2.3","options":{"key":"keep"}}]}',
  '{"plugin":[["@aai/fixture@1.2.3",{"key":"keep"}]]}',
  '{"plugin":["@aai/fixture"]}',
  '{"plugins":false}',
  '{broken JSON',
])("library refuses conflicting declarations or invalid configuration: %s", text => {
  expect(() => editPluginConfig(text, item, true)).toThrow()
})

test("configuration writes use the highest-priority global file and preserve invalid files on failure", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "aai-library-config-"))

  try {
    await writeFile(path.join(root, "opencode.json"), '{"shell":"untouched"}')
    await writeFile(path.join(root, "opencode.jsonc"), '{\n // Higher priority\n "shell":"powershell.exe"\n}')
    await configurePlugin(root, item, true)
    expect(await readFile(path.join(root, "opencode.json"), "utf8")).toBe('{"shell":"untouched"}')
    expect(await readFile(path.join(root, "opencode.jsonc"), "utf8")).toContain("@aai/fixture@1.2.3")
    await writeFile(path.join(root, "opencode.jsonc"), "{invalid")
    await expect(configurePlugin(root, item, false)).rejects.toThrow()
    expect(await readFile(path.join(root, "opencode.jsonc"), "utf8")).toBe("{invalid")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("package review decodes identity and declared components without running package contents", () => {
  const result = decodePackage(JSON.stringify({
    name: item.name, version: item.version, description: "AAi fixture", license: "MIT", _npmUser: { name: "fixture" },
    exports: { ".": "./server.js", "./gui-experimental": "./desktop.cjs", "./tui": "./terminal.js" },
    dependencies: { example: "1.0.0" }, scripts: { install: "must never run during review" },
  }))

  expect(result.parts).toEqual(["server", "desktop", "terminal"])
  expect(result.dependencies).toEqual(["example@1.0.0"])
  expect(result.scripts).toEqual(["install"])
  expect(result.publisher).toBe("fixture")
  expect(result.url).toBe("https://www.npmjs.com/package/@aai/fixture/v/1.2.3")
  expect(() => decodePackage('{"name":"file:../escape","version":"latest"}')).toThrow()
})

test("personal prompt import/export preserves instructions as inert text and enforces collection limits", () => {
  const recipe = { id: "fixture", title: "Review", description: "A fixture", prompt: "Review the code.\n<script>never execute</script>" }
  expect(importRecipes(exportRecipes([recipe]))).toEqual([recipe])
  expect(() => importRecipes('{"version":2,"recipes":[]}')).toThrow()
  expect(() => importRecipes(JSON.stringify({ version: 1, recipes: [{ ...recipe, prompt: "" }] }))).toThrow()
  expect(() => importRecipes(JSON.stringify({ version: 1, recipes: Array.from({ length: 101 }, () => recipe) }))).toThrow()
  expect(() => importRecipes(JSON.stringify({ version: 1, recipes: [{ ...recipe, prompt: "x".repeat(100001) }] }))).toThrow()
  expect(() => importRecipes("x".repeat(1024 * 1024 + 1))).toThrow()
})
