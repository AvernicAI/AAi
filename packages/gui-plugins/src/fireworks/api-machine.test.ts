import { expect, test } from "bun:test"
import { transition } from "./api-machine"

test("Fireworks API actions discard stale completions and cannot restart after disposal", () => {
  const running = transition({ status: "idle" }, { type: "start", attempt: "current" })
  expect(transition(running, { type: "start", attempt: "double-click" })).toBe(running)
  expect(transition(running, { type: "done", attempt: "previous", result: "old account" })).toBe(running)
  const failed = transition(running, { type: "failed", attempt: "current", message: "Timed out" })
  expect(failed).toEqual({ status: "failed", message: "Timed out" })
  expect(transition(failed, { type: "done", attempt: "current", result: "late success" })).toBe(failed)
  const disposed = transition(running, { type: "dispose" })
  expect(transition(disposed, { type: "start", attempt: "retry" })).toBe(disposed)
})
