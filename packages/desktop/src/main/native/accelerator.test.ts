import { describe, expect, test } from "bun:test"
import { parseAccelerator } from "./accelerator"

const valid: { input: string; expected: string }[] = [
  { input: "Control+Shift+Space", expected: "Control+Shift+Space" },
  { input: "ctrl+shift+space", expected: "Control+Shift+Space" },
  { input: "CommandOrControl+Shift+K", expected: "CommandOrControl+Shift+K" },
  { input: "CmdOrCtrl+Alt+F4", expected: "CommandOrControl+Alt+F4" },
  { input: "Cmd+Option+B", expected: "Command+Alt+B" },
  { input: " Super + 9 ", expected: "Super+9" },
]

const invalid = [
  "",
  "Space",
  "A",
  "Ctrl+Shift",
  "Control++Space",
  "Control+Shift+Shift+K",
  "Hyper+K",
  "Control+Shift+NotAKey",
  "Control+K+Shift",
  `Control+${"A".repeat(64)}`,
]

describe("parseAccelerator", () => {
  for (const item of valid) {
    test(`canonicalizes ${item.input}`, () => {
      expect(parseAccelerator(item.input)).toBe(item.expected)
    })
  }

  for (const input of invalid) {
    test(`rejects ${JSON.stringify(input)}`, () => {
      expect(parseAccelerator(input)).toBeUndefined()
    })
  }
})
