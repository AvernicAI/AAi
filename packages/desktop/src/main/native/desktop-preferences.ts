import { BrowserWindow } from "electron"
import type { DesktopPreferences, DesktopPreferencePatch, DesktopPreferencesResult } from "../../shared/ipc-rpc/desktop"
import { DesktopPreferencesChanged } from "../../shared/ipc-rpc/events"
import { emitIpcEvent } from "../ipc-events"
import { loginItemEnabled, loginItemSupported, setLoginItemEnabled } from "./login-item"
import { onDesktopPreferencesChanged, readDesktopPreferences, writeDesktopPreferences } from "./preferences"
import { registerSummonShortcut } from "./summon-shortcut"
import { installTray, removeTray, syncTray, trayInstalled } from "./tray"
import { onNativeTranslations } from "./translations"

/** What the OS integration needs from the rest of the app; the composition root provides it. */
export type DesktopIntegrationDeps = {
  focusOrRestore: () => void
  hideWindows: () => void
  createWindow: () => void
  openSettings: () => void
  quit: () => void
}

let deps: DesktopIntegrationDeps | undefined

let wired = false

export function startDesktopIntegration(next: DesktopIntegrationDeps) {
  deps = next

  const stored = readDesktopPreferences()

  // Reconcile the saved intent with the OS. A failure leaves the intent for a later launch instead of
  // silently turning the setting off.
  if (stored.launchAtLogin && loginItemSupported() && !loginItemEnabled()) setLoginItemEnabled(true)

  if (stored.summonShortcut) registerSummonShortcut(stored.summonShortcut, () => deps?.focusOrRestore())

  syncIntegration()
  wire()
}

export function readDesktopPreferencesInfo(): DesktopPreferences {
  const stored = readDesktopPreferences()

  return {
    launchAtLogin: stored.launchAtLogin,
    launchAtLoginSupported: loginItemSupported(),
    closeBehavior: stored.closeBehavior,
    summonShortcut: stored.summonShortcut,
    summonShortcutSupported: true,
  }
}

/**
 * Applies each field independently. A field the OS refuses keeps its previous stored value and the
 * result reports why, while the fields that succeeded are persisted together.
 */
export function applyDesktopPreferences(patch: DesktopPreferencePatch): DesktopPreferencesResult {
  const current = readDesktopPreferences()
  let next = current
  let problem: DesktopPreferencesResult["problem"]

  if (patch.summonShortcut !== undefined && patch.summonShortcut !== current.summonShortcut) {
    const registration = registerSummonShortcut(patch.summonShortcut, () => deps?.focusOrRestore())

    if (registration.ok) next = { ...next, summonShortcut: registration.accelerator }
    else problem = registration.problem
  }

  if (patch.launchAtLogin !== undefined && patch.launchAtLogin !== current.launchAtLogin) {
    if (setLoginItemEnabled(patch.launchAtLogin)) next = { ...next, launchAtLogin: patch.launchAtLogin }
    else problem = problem ?? "login-item-failed"
  }

  if (patch.closeBehavior !== undefined && patch.closeBehavior !== current.closeBehavior) {
    next = { ...next, closeBehavior: patch.closeBehavior }
  }

  if (next !== current) writeDesktopPreferences(next)

  return problem
    ? { preferences: readDesktopPreferencesInfo(), problem }
    : { preferences: readDesktopPreferencesInfo() }
}

function syncIntegration() {
  if (!deps) return

  // The tray exists only while closing hides the window; a quit-on-close app has no tray to leave.
  if (readDesktopPreferences().closeBehavior !== "background") {
    // Switching this off from the tray must not strand a hidden workspace with no way back.
    if (trayInstalled()) deps.focusOrRestore()
    removeTray()

    return
  }

  installTray({
    focusOrRestore: () => deps?.focusOrRestore(),
    hideWindows: () => deps?.hideWindows(),
    createWindow: () => deps?.createWindow(),
    openSettings: () => deps?.openSettings(),
    quit: () => deps?.quit(),
    setCloseBehavior: (closeBehavior) => applyDesktopPreferences({ closeBehavior }),
    setLaunchAtLogin: (launchAtLogin) => applyDesktopPreferences({ launchAtLogin }),
  })
}

function wire() {
  if (wired) return

  wired = true

  onDesktopPreferencesChanged(() => {
    syncIntegration()
    publish()
  })
  onNativeTranslations(() => syncTray())
}

function publish() {
  const preferences = readDesktopPreferencesInfo()

  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed() || win.webContents.isDestroyed()) continue
    emitIpcEvent(win.webContents, new DesktopPreferencesChanged({ preferences }))
  }
}
