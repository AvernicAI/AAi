import { describe, expect, test } from "bun:test"
import type { Schema } from "effect"
import { decodeDesktopPreferences } from "./preference-values"

type Expected = ReturnType<typeof decodeDesktopPreferences>

const cases: { name: string; stored: Record<string, Schema.Json>; expected: Expected }[] = [
  {
    name: "defaults when nothing is stored",
    stored: {},
    expected: { launchAtLogin: false, closeBehavior: "quit", summonShortcut: null },
  },
  {
    name: "reads every stored value",
    stored: {
      launchAtLogin: true,
      closeBehavior: "background",
      summonShortcut: "Control+Shift+Space",
    },
    expected: { launchAtLogin: true, closeBehavior: "background", summonShortcut: "Control+Shift+Space" },
  },
  {
    name: "falls back per field when one value has the wrong type",
    stored: { launchAtLogin: "yes", closeBehavior: "background", summonShortcut: 42 },
    expected: { launchAtLogin: false, closeBehavior: "background", summonShortcut: null },
  },
  {
    name: "falls back when the close behavior is unknown",
    stored: { closeBehavior: "minimize" },
    expected: { launchAtLogin: false, closeBehavior: "quit", summonShortcut: null },
  },
  {
    name: "keeps null as an explicitly cleared shortcut",
    stored: { summonShortcut: null },
    expected: { launchAtLogin: false, closeBehavior: "quit", summonShortcut: null },
  },
]

describe("decodeDesktopPreferences", () => {
  for (const item of cases) {
    test(item.name, () => {
      expect(decodeDesktopPreferences((key) => item.stored[key])).toEqual(item.expected)
    })
  }
})
