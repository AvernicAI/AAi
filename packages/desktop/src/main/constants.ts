import { app } from "electron"
import { APP_IDS } from "../shared/app-identity"

type Channel = "local" | "dev" | "beta" | "prod"

const raw = import.meta.env.OPENCODE_CHANNEL

export const CHANNEL: Channel = raw === "local" || raw === "dev" || raw === "beta" || raw === "prod" ? raw : "dev"

export const VERSION = app.isPackaged ? app.getVersion() : (process.env.OPENCODE_VERSION ?? app.getVersion())

const appNames = {
  local: "AAi Dev",
  dev: "AAi Dev",
  beta: "AAi Beta",
  prod: "AAi",
} satisfies Record<Channel, string>

const appIDs = {
  local: APP_IDS.dev,
  dev: APP_IDS.dev,
  beta: APP_IDS.beta,
  prod: APP_IDS.prod,
} satisfies Record<Channel, string>

// Local renderer/server mode keeps the dev application identity.
export const APP_NAME = app.isPackaged ? appNames[CHANNEL] : "AAi Dev"

export const APP_ID = app.isPackaged ? appIDs[CHANNEL] : APP_IDS.dev
