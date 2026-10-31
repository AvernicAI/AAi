import { expect, test } from "bun:test"
import { parsePaletteTheme, readPaletteThemes } from "./custom"

const palette = {
  neutral: "#111",
  ink: "#eee",
  primary: "#cba",
  success: "#8c9",
  warning: "#dc9",
  error: "#e99",
  info: "#9bd",
}

const theme = { id: "aai-custom-example", name: "My theme", light: { palette }, dark: { palette } }

test("palette themes normalize editable colors and survive a persistence round trip", () => {
  const parsed = parsePaletteTheme(theme)
  expect(parsed.dark.palette.primary).toBe("#ccbbaa")
  expect(parsed.dark.palette.interactive).toBe("#ccbbaa")
  expect(readPaletteThemes(JSON.stringify([parsed]))).toEqual([parsed])
})

test("theme imports reject invalid colors and persisted built-in replacements", () => {
  expect(() =>
    parsePaletteTheme({
      ...theme,
      dark: { palette: { ...palette, primary: "red; background:url(https://example.com)" } },
    }),
  ).toThrow()
  expect(readPaletteThemes(JSON.stringify([{ ...theme, id: "oc-2" }]))).toEqual([])
  expect(readPaletteThemes("broken JSON")).toEqual([])
})
