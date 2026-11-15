import { Schema } from "effect"

export const connectFailures = [
  "cli-missing",
  "spawn-failed",
  "port-conflict",
  "auth-mismatch",
  "version-mismatch",
  "timeout",
  "unknown",
] as const

export type ConnectFailure = (typeof connectFailures)[number]

export const ConnectFailureSchema = Schema.Literals(connectFailures)
