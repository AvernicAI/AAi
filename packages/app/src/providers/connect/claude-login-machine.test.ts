import { expect, test } from "bun:test"
import { transition } from "./claude-login-machine"

test("Claude login claims the launcher before async work and ignores a late reply after timeout", () => {
  const opening = transition({ status: "idle" }, { type: "open", attempt: "one" })

  expect(opening.status).toBe("opening")
  expect(transition(opening, { type: "open", attempt: "two" })).toBe(opening)

  const failed = transition(opening, { type: "failed", attempt: "one" })

  expect(failed.status).toBe("failed")
  expect(transition(failed, { type: "launched", attempt: "one" })).toBe(failed)
  const retry = transition(failed, { type: "open", attempt: "two" })
  expect(transition(retry, { type: "launched", attempt: "one" })).toBe(retry)
  expect(transition(retry, { type: "launched", attempt: "two" }).status).toBe("launched")
})

test("Claude login cannot revive a closed setup dialog", () => {
  const disposed = transition(transition({ status: "idle" }, { type: "open", attempt: "one" }), { type: "dispose" })

  expect(transition(disposed, { type: "launched", attempt: "one" })).toBe(disposed)
  expect(transition(disposed, { type: "failed", attempt: "one" })).toBe(disposed)
  expect(transition(disposed, { type: "open", attempt: "two" })).toBe(disposed)
})
