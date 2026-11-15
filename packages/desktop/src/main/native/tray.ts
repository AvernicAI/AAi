import path from "node:path"
import { app, BrowserWindow, Menu, nativeImage, Tray } from "electron"
import type { MenuItemConstructorOptions } from "electron"
import { getMainWindows } from "../windows"
import { loginItemSupported } from "./login-item"
import { readDesktopPreferences } from "./preferences"
import { nativeT } from "./translations"
import { trayItems, type TrayCommand, type TrayItem } from "./tray-state"

export type TrayDeps = {
  focusOrRestore: () => void
  hideWindows: () => void
  createWindow: () => void
  openSettings: () => void
  quit: () => void
  setCloseBehavior: (behavior: "quit" | "background") => void
  setLaunchAtLogin: (enabled: boolean) => void
}

let tray: Tray | undefined

let deps: TrayDeps | undefined

let wired = false

/** Creates the tray, or refreshes its menu when it already exists. */
export function installTray(next: TrayDeps) {
  deps = next
  wire()
  build()
}

export function syncTray() {
  if (tray) build()
}

export function removeTray() {
  tray?.destroy()
  tray = undefined
  deps = undefined
}

export const trayInstalled = () => tray !== undefined

function build() {
  if (!deps) return

  if (!tray) {
    tray = new Tray(trayIcon())
    tray.setToolTip(nativeT("desktop.tray.tooltip"))
  }

  const preferences = readDesktopPreferences()

  tray.setContextMenu(
    Menu.buildFromTemplate(
      trayItems({
        // Utility windows such as Alphie remain visible while the workspace is hidden.
        visible: getMainWindows().some((win) => !win.isDestroyed() && win.isVisible()),
        closeBehavior: preferences.closeBehavior,
        launchAtLogin: preferences.launchAtLogin,
        launchAtLoginSupported: loginItemSupported(),
      }).map((item) => menuItem(item)),
    ),
  )
}

function menuItem(item: TrayItem): MenuItemConstructorOptions {
  if (item.kind === "separator") return { type: "separator" }

  const label = nativeT(item.labelKey)

  if (item.kind === "command") return { label, click: () => run(item.command) }

  return {
    label,
    type: "checkbox",
    checked: item.checked,
    enabled: item.enabled,
    click: (menuItem) => {
      if (item.toggle === "background") deps?.setCloseBehavior(menuItem.checked ? "background" : "quit")
      else deps?.setLaunchAtLogin(menuItem.checked)
    },
  }
}

function run(command: TrayCommand) {
  if (command === "show") deps?.focusOrRestore()

  if (command === "hide") deps?.hideWindows()

  if (command === "newWindow") deps?.createWindow()

  if (command === "settings") deps?.openSettings()

  if (command === "quit") deps?.quit()

  build()
}

function trayIcon() {
  const image = nativeImage.createFromPath(path.join(app.getAppPath(), "resources/icons/32x32.png"))

  if (process.platform !== "darwin") return image

  // A template image lets macOS tint the mark for light and dark menu bars.
  const resized = image.resize({ width: 16, height: 16 })
  resized.setTemplateImage(true)

  return resized
}

// Show/Hide and the login-item check follow window and preference changes made anywhere.
function wire() {
  if (wired) return

  wired = true

  const watch = (window: BrowserWindow) => {
    window.on("show", syncTray)
    window.on("hide", syncTray)
    window.on("closed", () => queueMicrotask(syncTray))
    syncTray()
  }

  // The early startup window exists before native integration loads.
  BrowserWindow.getAllWindows().forEach(watch)
  app.on("browser-window-created", (_event, window) => watch(window))
  app.on("browser-window-focus", syncTray)
}
