import type { DesktopNativeKey } from "@opencode/app/i18n/desktop-native"
import type { DesktopCloseBehavior } from "../../shared/ipc-rpc/desktop"

export type TrayCommand = "show" | "hide" | "newWindow" | "settings" | "quit"

export type TrayItem =
  | { readonly kind: "command"; readonly command: TrayCommand; readonly labelKey: DesktopNativeKey }
  | { readonly kind: "separator" }
  | {
      readonly kind: "toggle"
      readonly toggle: "background" | "launchAtLogin"
      readonly labelKey: DesktopNativeKey
      readonly checked: boolean
      readonly enabled: boolean
    }

export function trayItems(input: {
  visible: boolean
  closeBehavior: DesktopCloseBehavior
  launchAtLogin: boolean
  launchAtLoginSupported: boolean
}): TrayItem[] {
  return [
    {
      kind: "command",
      command: input.visible ? "hide" : "show",
      labelKey: input.visible ? "desktop.tray.hide" : "desktop.tray.show",
    },
    { kind: "command", command: "newWindow", labelKey: "desktop.menu.newWindow" },
    { kind: "command", command: "settings", labelKey: "desktop.menu.settings" },
    { kind: "separator" },
    {
      kind: "toggle",
      toggle: "background",
      labelKey: "desktop.tray.keepRunning",
      checked: input.closeBehavior === "background",
      enabled: true,
    },
    {
      kind: "toggle",
      toggle: "launchAtLogin",
      labelKey: "desktop.tray.launchAtLogin",
      checked: input.launchAtLogin,
      enabled: input.launchAtLoginSupported,
    },
    { kind: "separator" },
    { kind: "command", command: "quit", labelKey: "desktop.tray.quit" },
  ]
}
