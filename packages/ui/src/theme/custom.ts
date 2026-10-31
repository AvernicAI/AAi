import { Option, Schema, flow } from "effect"
import type { ThemePaletteColors } from "./types"

export const CUSTOM_THEMES_KEY = "opencode-custom-themes"

export const paletteKeys = [
  "neutral",
  "ink",
  "primary",
  "accent",
  "interactive",
  "success",
  "warning",
  "error",
  "info",
  "diffAdd",
  "diffDelete",
] as const

const Color = Schema.TemplateLiteral(["#", Schema.String]).check(Schema.isPattern(/^#(?:[a-f\d]{3}|[a-f\d]{6})$/i))

const Palette = Schema.Struct({
  neutral: Color,
  ink: Color,
  primary: Color,
  success: Color,
  warning: Color,
  error: Color,
  info: Color,
  accent: Schema.optional(Color),
  interactive: Schema.optional(Color),
  diffAdd: Schema.optional(Color),
  diffDelete: Schema.optional(Color),
})

const Theme = Schema.Struct({
  id: Schema.String.check(Schema.isPattern(/^[a-z0-9-]+$/)),
  name: Schema.String.check(Schema.isPattern(/\S/)),
  light: Schema.Struct({ palette: Palette }),
  dark: Schema.Struct({ palette: Palette }),
})

export type PaletteTheme = {
  id: string
  name: string
  light: { palette: Required<ThemePaletteColors> }
  dark: { palette: Required<ThemePaletteColors> }
}

export const parsePaletteTheme = flow(Schema.decodeUnknownSync(Theme), normalized)

export function readPaletteThemes(text: string | null) {
  const value = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Array(Theme)))(text ?? "[]")

  return Option.isSome(value) ? value.value.filter((theme) => theme.id.startsWith("aai-custom-")).map(normalized) : []
}

function normalized(value: typeof Theme.Type): PaletteTheme {
  return {
    id: value.id,
    name: value.name.trim(),
    light: { palette: palette(value.light.palette) },
    dark: { palette: palette(value.dark.palette) },
  }
}

function palette(value: typeof Palette.Type): Required<ThemePaletteColors> {
  return {
    neutral: color(value.neutral),
    ink: color(value.ink),
    primary: color(value.primary),
    success: color(value.success),
    error: color(value.error),
    warning: color(value.warning),
    info: color(value.info),
    accent: color(value.accent ?? value.primary),
    interactive: color(value.interactive ?? value.primary),
    diffAdd: color(value.diffAdd ?? value.success),
    diffDelete: color(value.diffDelete ?? value.error),
  }
}

function color(input: typeof Color.Type): typeof Color.Type {
  return input.length === 4
    ? `#${input
        .slice(1)
        .split("")
        .map((digit) => digit + digit)
        .join("")}`
    : input
}
