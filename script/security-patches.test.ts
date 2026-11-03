import { expect, test } from "bun:test"
import { createRequire } from "node:module"
import path from "node:path"

// Resolve through the real consumers so these probes test the installed patched copies.
const bundler = createRequire(
  path.join(import.meta.dir, "../node_modules/.bun/node_modules/@rollup/plugin-node-resolve/package.json"),
)
const core = createRequire(path.join(import.meta.dir, "../packages/core/package.json"))
const provider = createRequire(core.resolve("gitlab-ai-provider"))
const merge = bundler("deepmerge")
const z = provider("zod").z

test("patched deepmerge cannot poison a result through null-prototype source or target objects", () => {
  const attack = JSON.parse('{"__proto__":{"aaiPoisoned":true},"kept":{"value":1}}')
  const result = merge(Object.create(null), attack)
  expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
  expect(result.aaiPoisoned).toBeUndefined()
  expect(result.kept).toEqual({ value: 1 })
  const target = Object.assign(Object.create(null), attack)
  expect(Object.getPrototypeOf(merge(target, {}))).toBe(Object.prototype)
  expect(merge({ values: [1] }, { values: [2] })).toEqual({ values: [1, 2] })
})

test("legacy Zod rejects oversized bounded collections before element refinements", async () => {
  const counter = { calls: 0 }
  const element = z.string().refine(() => {
    counter.calls++
    return true
  })
  const array = z.array(element).max(1)
  expect(array.safeParse(["a", "b"]).success).toBe(false)
  expect((await array.safeParseAsync(["a", "b"])).success).toBe(false)
  expect(z.array(element).length(1).safeParse(["a", "b"]).success).toBe(false)
  expect(
    z
      .set(element)
      .max(1)
      .safeParse(new Set(["a", "b"])).success,
  ).toBe(false)
  expect(counter.calls).toBe(0)
  expect(array.safeParse(["a"]).success).toBe(true)
  expect(counter.calls).toBe(1)
})
