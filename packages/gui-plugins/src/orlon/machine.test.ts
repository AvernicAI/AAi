import { expect, test } from "bun:test"
import { transition, view, type State } from "./machine"

const page = { binding: "binding-one", embed: "embed-one" }

test("Orlon claims operations synchronously and ignores results from an earlier connection", () => {
  const opening = transition({ status: "idle" }, { type: "open", attempt: "one" })
  const working = transition(opening, { type: "opened", attempt: "one", page })
  expect(view(working).busy).toBe(true)
  expect(transition(working, { type: "run", attempt: "duplicate", action: "images" })).toBe(working)
  const next = transition(working, { type: "open", attempt: "two" })
  expect(transition(next, { type: "done", attempt: "one" })).toBe(next)
  expect(transition(next, { type: "failed", attempt: "one" })).toBe(next)
  expect(transition(next, { type: "opened", attempt: "one", page })).toBe(next)
})

test("Orlon failures release controls for retry, while clear-sign-in needs confirmation", () => {
  const ready: State = { status: "ready", attempt: "one", page }
  const confirming = transition(ready, { type: "confirm" })
  expect(view(confirming).confirming).toBe(true)
  expect(transition(confirming, { type: "cancel" })).toEqual(ready)
  const working = transition(confirming, { type: "run", attempt: "clear", action: "clear" })
  const failed = transition(working, { type: "failed", attempt: "clear" })
  expect(view(failed)).toMatchObject({ busy: false, failed: true, page })
  const retry = transition(failed, { type: "run", attempt: "retry", action: "reload" })
  expect(transition(retry, { type: "done", attempt: "retry" })).toEqual({
    status: "ready",
    attempt: "retry",
    page,
  })
})

test("Orlon open failure and disposal cannot leave a working spinner or revive a closed panel", () => {
  const opening = transition({ status: "idle" }, { type: "open", attempt: "one" })
  expect(view(transition(opening, { type: "failed", attempt: "one" }))).toMatchObject({ busy: false, failed: true })
  const disposed = transition(opening, { type: "dispose" })
  expect(view(disposed).busy).toBe(false)
  expect(transition(disposed, { type: "opened", attempt: "one", page })).toBe(disposed)
  expect(transition(disposed, { type: "open", attempt: "two" })).toBe(disposed)
})
