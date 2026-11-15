import type { ConnectFailure } from "../../shared/ipc-rpc/connect"

/** Delays between attempts after a failed sidecar start. */
export const connectRetryDelays = [250, 1_000, 3_000] as const

export class ConnectFailed extends Error {
  readonly failure: ConnectFailure

  constructor(failure: ConnectFailure, cause?: unknown) {
    super(`Background service connect failed: ${failure}`, { cause })
    this.name = "ConnectFailed"
    this.failure = failure
  }
}

/**
 * Classifies a startup failure once, at the promise boundary, so retry policy and the UI reason do
 * not each re-inspect error text. A missing or unlaunchable CLI needs a reinstall, not another try.
 */
export function classifyConnectFailure(error: unknown): ConnectFailure {
  const message = error instanceof Error ? error.message : String(error)

  if (/ENOENT|no such file|not found/i.test(message)) return "cli-missing"
  if (/EACCES|EPERM|exec format|spawn .* failed/i.test(message)) return "spawn-failed"
  if (/EADDRINUSE/i.test(message)) return "port-conflict"
  if (/did not provide authentication/i.test(message)) return "auth-mismatch"
  if (/version.*(mismatch|incompatible)|incompatible.*version/i.test(message)) return "version-mismatch"
  if (/timed out|timeout/i.test(message)) return "timeout"

  return "unknown"
}

/** A second attempt often wins after an antivirus scan or a losing port race; a bad CLI never does. */
export function retryableConnectFailure(failure: ConnectFailure) {
  return failure === "timeout" || failure === "port-conflict" || failure === "spawn-failed" || failure === "unknown"
}
