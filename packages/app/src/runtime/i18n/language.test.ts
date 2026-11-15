import { describe, expect, test } from "bun:test"
import { DESKTOP_NATIVE_LOCALES } from "./desktop-native"
import { localizedListParts, richTemplateParts } from "./language"

describe("rich translations", () => {
  test("lets the translated phrase position a rich slot", () => {
    const names = { type: "names" }
    expect(richTemplateParts("Written by {{names}}", { names })).toEqual(["Written by ", names])
    expect(richTemplateParts("{{names}} tarafından yazıldı", { names })).toEqual([names, " tarafından yazıldı"])
  })

  test("keeps list elements intact while localizing punctuation", () => {
    const items = [{ id: 1 }, { id: 2 }, { id: 3 }]
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the check is that no element was stringified
    expect(localizedListParts("en", items).filter((part) => typeof part !== "string")).toEqual(items)
  })
})

describe("dictionaries", () => {
  test("native menu identities and CLI placeholders survive additions to the English catalog", async () => {
    const modules = await Promise.all([import("./hr"), import("./hu"), import("./is"), import("./lt")])

    for (const module of modules) {
      expect(module.dict["desktop.menu.app"]).toBe("AAi")
      expect(module.dict["desktop.cli.installed.message"]).toContain("{{path}}")
      expect(module.dict["desktop.cli.failed.message"]).toContain("{{error}}")
      expect(module.dict["desktop.recovery.loadFailed.detail"]).toContain("{{url}}")
      expect(module.dict["desktop.recovery.terminated.detail"]).toContain("{{reason}}")
    }
  })

  test("are flat string maps in every locale", async () => {
    const modules = await Promise.all(
      DESKTOP_NATIVE_LOCALES.flatMap((locale) => [import(`./${locale}`), import(`../../../../ui/src/i18n/${locale}`)]),
    )

    const nested = modules.flatMap((module) =>
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the check is that no value is nested
      Object.entries<unknown>(module.dict).filter(([, value]) => typeof value !== "string"),
    )

    expect(nested).toEqual([])
  })
})
