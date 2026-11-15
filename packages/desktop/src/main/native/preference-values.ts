import { Option, Schema } from "effect"
import type { DesktopCloseBehavior, DesktopPreferences } from "../../shared/ipc-rpc/desktop"

export const defaultDesktopPreferences: DesktopPreferences = {
  launchAtLogin: false,
  launchAtLoginSupported: false,
  closeBehavior: "quit",
  summonShortcut: null,
  summonShortcutSupported: false,
}

const CloseBehavior = Schema.Literals(["quit", "background"])

const Shortcut = Schema.NullOr(Schema.String)

/**
 * Decodes the settings file's values once, at the boundary that reads untrusted JSON. A value of the
 * wrong shape falls back on its own, so one corrupt setting never resets the others.
 */
export function decodeDesktopPreferences(
  read: (key: string) => Schema.Json | undefined,
): Pick<DesktopPreferences, "launchAtLogin" | "closeBehavior" | "summonShortcut"> {
  return {
    launchAtLogin: decodeBoolean(read("launchAtLogin")),
    closeBehavior: decodeCloseBehavior(read("closeBehavior")),
    summonShortcut: decodeShortcut(read("summonShortcut")),
  }
}

function decodeBoolean(value: Schema.Json | undefined) {
  const result = Schema.decodeUnknownOption(Schema.Boolean)(value)

  return Option.isSome(result) ? result.value : defaultDesktopPreferences.launchAtLogin
}

function decodeCloseBehavior(value: Schema.Json | undefined): DesktopCloseBehavior {
  const result = Schema.decodeUnknownOption(CloseBehavior)(value)

  return Option.isSome(result) ? result.value : defaultDesktopPreferences.closeBehavior
}

function decodeShortcut(value: Schema.Json | undefined) {
  const result = Schema.decodeUnknownOption(Shortcut)(value)

  return Option.isSome(result) ? result.value : defaultDesktopPreferences.summonShortcut
}
