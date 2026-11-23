import path from "node:path"
import { APP_IDS } from "../shared/app-identity"

export type Channel = "local" | "dev" | "beta" | "prod"

const appNames: Record<Channel, string> = {
  local: "AAi Dev",
  dev: "AAi Dev",
  beta: "AAi Beta",
  prod: "AAi",
}

const appIDs: Record<Channel, string> = {
  local: APP_IDS.dev,
  ...APP_IDS,
}

// Keep the dev profile without letting Electron's notification shortcut shadow the installed app.
const LOCAL_APP_USER_MODEL_ID = "com.avernic.aai.local"

export function resolveIdentity(channel: Channel, packaged: boolean) {
  return {
    appName: packaged ? appNames[channel] : appNames.local,
    appID: packaged ? appIDs[channel] : APP_IDS.dev,
    appUserModelID: packaged ? appIDs[channel] : LOCAL_APP_USER_MODEL_ID,
  }
}

export function isCollidingDevShortcut(
  shortcut: { readonly appUserModelId?: string; readonly target: string },
  appUserModelID: string,
  execPath: string,
) {
  if (!shortcut.appUserModelId) return false

  if (shortcut.appUserModelId.toLowerCase() !== appUserModelID.toLowerCase()) return false

  return path.win32.normalize(shortcut.target).toLowerCase() !== path.win32.normalize(execPath).toLowerCase()
}
