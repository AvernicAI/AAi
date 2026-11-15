import { describe, expect, test } from "bun:test"
import { trayItems } from "./tray-state"

describe("trayItems", () => {
  test("offers hide while a window is visible and reflects keep-running", () => {
    const items = trayItems({
      visible: true,
      closeBehavior: "background",
      launchAtLogin: true,
      launchAtLoginSupported: true,
    })

    expect(items[0]).toEqual({ kind: "command", command: "hide", labelKey: "desktop.tray.hide" })
    expect(items.find((item) => item.kind === "toggle" && item.toggle === "background")).toMatchObject({
      checked: true,
      enabled: true,
    })
    expect(items.find((item) => item.kind === "toggle" && item.toggle === "launchAtLogin")).toMatchObject({
      checked: true,
      enabled: true,
    })
    expect(items.at(-1)).toEqual({ kind: "command", command: "quit", labelKey: "desktop.tray.quit" })
  })

  test("offers show while every window is hidden", () => {
    const items = trayItems({
      visible: false,
      closeBehavior: "background",
      launchAtLogin: false,
      launchAtLoginSupported: true,
    })

    expect(items[0]).toEqual({ kind: "command", command: "show", labelKey: "desktop.tray.show" })
  })

  test("disables the login-item toggle where the build cannot register one", () => {
    const items = trayItems({
      visible: false,
      closeBehavior: "quit",
      launchAtLogin: false,
      launchAtLoginSupported: false,
    })

    expect(items.find((item) => item.kind === "toggle" && item.toggle === "launchAtLogin")).toMatchObject({
      enabled: false,
    })
    expect(items.find((item) => item.kind === "toggle" && item.toggle === "background")).toMatchObject({
      checked: false,
    })
  })
})
