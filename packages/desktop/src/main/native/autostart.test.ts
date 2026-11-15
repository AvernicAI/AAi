import { describe, expect, test } from "bun:test"
import path from "node:path"
import { autostartEntry, autostartExec, autostartFilePath } from "./autostart"

describe("autostart", () => {
  test("places the entry under the XDG autostart directory", () => {
    expect(autostartFilePath("/home/me/.config", "ai.opencode.desktop")).toBe(
      path.join("/home/me/.config", "autostart", "ai.opencode.desktop.desktop"),
    )
  })

  test("quotes spaces and escapes embedded quotes in the executable", () => {
    expect(autostartExec('/opt/AAi "preview"/aai')).toBe('"/opt/AAi \\"preview\\"/aai"')
  })

  test("writes a desktop entry that runs without a terminal", () => {
    expect(autostartEntry({ name: "AAi", exec: '"/opt/AAi/aai"' })).toBe(
      [
        "[Desktop Entry]",
        "Type=Application",
        "Name=AAi",
        'Exec="/opt/AAi/aai"',
        "Terminal=false",
        "X-GNOME-Autostart-enabled=true",
        "",
      ].join("\n"),
    )
  })
})
