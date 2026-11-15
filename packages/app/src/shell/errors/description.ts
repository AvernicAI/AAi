import { Predicate } from "effect"

const localServerFailureKeys = {
  "cli-missing": "error.page.description.localServerStartup.cliMissing",
  "spawn-failed": "error.page.description.localServerStartup.spawnFailed",
  "port-conflict": "error.page.description.localServerStartup.portConflict",
  "auth-mismatch": "error.page.description.localServerStartup.authMismatch",
  "version-mismatch": "error.page.description.localServerStartup.versionMismatch",
  "timeout": "error.page.description.localServerStartup.timeout",
} as const

export function hasLocalServerStartup(error: unknown): error is Error & { localServerStartup: true } {
  if (!(error instanceof Error) || !Object.hasOwn(error, "localServerStartup")) return false

  // SAFETY: the property was checked present; only the literal true marks a startup failure.
  return (error as Error & { localServerStartup?: unknown }).localServerStartup === true
}

export function errorDescriptionKey(error: unknown) {
  if (!hasLocalServerStartup(error)) return "error.page.description" as const

  // SAFETY: the property was checked present; the `isString` guard rejects every other value.
  const failure = Object.hasOwn(error, "localServerFailure")
    ? (error as Error & { localServerFailure?: unknown }).localServerFailure
    : undefined

  if (Predicate.isString(failure) && Object.hasOwn(localServerFailureKeys, failure)) {
    // SAFETY: Object.hasOwn ensures the string names a key of the closed literal map above.
    return localServerFailureKeys[failure as keyof typeof localServerFailureKeys]
  }

  return "error.page.description.localServerStartup" as const
}

export function errorStatus(error: unknown) {
  const seen = new Set<object>()

  const visit = (value: unknown): number | undefined => {
    if (typeof value !== "object" || value === null || seen.has(value)) return
    seen.add(value)
    const item = value as Record<string, unknown>

    for (const key of ["status", "statusCode"] as const) {
      const status = item[key]

      if (typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599) return status
    }

    return visit(item.cause) ?? visit(item.data)
  }

  return visit(error)
}
