import { expect, test } from "bun:test"
import { classifyConnectFailure, retryableConnectFailure } from "./connect-retry"

const classified: [string, ReturnType<typeof classifyConnectFailure>][] = [
  ["spawn opencode-cli ENOENT", "cli-missing"],
  ["EACCES: permission denied", "spawn-failed"],
  ["listen EADDRINUSE 127.0.0.1:4096", "port-conflict"],
  ["V2 CLI background service did not provide authentication", "auth-mismatch"],
  ["Timed out waiting for the background service to start", "timeout"],
  ["background service version mismatch", "version-mismatch"],
  ["socket hang up", "unknown"],
]

test.each(classified)("classifies %s as %s", (message, failure) => {
  expect(classifyConnectFailure(new Error(message))).toBe(failure)
})

test("accepts non-Error failures at the boundary", () => {
  expect(classifyConnectFailure("spawn EACCES")).toBe("spawn-failed")
})

test.each([
  ["spawn-failed", true],
  ["port-conflict", true],
  ["timeout", true],
  ["unknown", true],
  ["cli-missing", false],
  ["auth-mismatch", false],
  ["version-mismatch", false],
] as const)("retryable(%s) returns %s", (failure, retryable) => {
  expect(retryableConnectFailure(failure)).toBe(retryable)
})
