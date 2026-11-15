import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { app } from "electron"
import { APP_ID, APP_NAME } from "../constants"
import { autostartEntry, autostartExec, autostartFilePath } from "./autostart"

/** Electron's login-item API covers macOS and Windows; Linux uses an XDG autostart entry. */
export function loginItemSupported() {
  return app.isPackaged
}

export function loginItemEnabled() {
  if (!app.isPackaged) return false

  if (process.platform === "linux") return existsSync(autostartFile())

  return attempt(() => app.getLoginItemSettings().openAtLogin) ?? false
}

/** Returns false when the platform or the build cannot register a login item. */
export function setLoginItemEnabled(enabled: boolean) {
  if (!app.isPackaged) return false

  if (process.platform === "linux") return writeAutostart(enabled)

  return attempt(() => {
    app.setLoginItemSettings({ openAtLogin: enabled })

    return true
  }) ?? false
}

function autostartFile() {
  const configHome = process.env.XDG_CONFIG_HOME ?? path.join(app.getPath("home"), ".config")

  return autostartFilePath(configHome, APP_ID)
}

function writeAutostart(enabled: boolean) {
  return (
    attempt(() => {
      const file = autostartFile()

      if (!enabled) {
        rmSync(file, { force: true })

        return true
      }

      mkdirSync(path.dirname(file), { recursive: true })
      writeFileSync(file, autostartEntry({ name: APP_NAME, exec: autostartExec(process.execPath) }))

      return true
    }) ?? false
  )
}

// OS login-item APIs can throw for a restricted profile or a missing launcher; a failed write is a
// reportable problem, not a crash.
function attempt<Value>(run: () => Value): Value | undefined {
  try {
    return run()
  } catch {
    return undefined
  }
}
