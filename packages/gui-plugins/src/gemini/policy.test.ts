import { expect, test } from "bun:test"
import { geminiDestination, home, partition, webDestination } from "./policy"
import { transition, view } from "./machine"

test("Gemini keeps its own account partition and accepts only official HTTPS page navigation", () => {
  expect(home).toBe("https://gemini.google.com/app")
  expect(partition).toBe("persist:aai-gemini")
  expect(geminiDestination(home)).toBe(true)
  expect(geminiDestination("https://accounts.google.com/ServiceLogin")).toBe(true)
  expect(geminiDestination("https://one.google.com/")).toBe(true)

  for (const input of [
    "https://gemini.google.com.evil.test",
    "https://evil.test",
    "http://gemini.google.com",
    "https://user:secret@gemini.google.com/app",
    "javascript:alert(1)",
    "file:///C:/",
  ])
    expect(geminiDestination(input)).toBe(false)
  expect(webDestination("about:blank")).toBe(true)
})

test("Gemini cannot revive a disposed account view or apply a stale completion", () => {
  const first = transition({ status: "idle" }, { type: "open", attempt: "first" })
  const replacement = transition(first, { type: "open", attempt: "second" })
  expect(
    transition(replacement, { type: "opened", attempt: "first", page: { binding: "stale", embed: "stale" } }),
  ).toBe(replacement)
  const opened = transition(replacement, { type: "opened", attempt: "second", page: { binding: "own", embed: "view" } })
  expect(view(opened).busy).toBe(true)
  const disposed = transition(opened, { type: "dispose" })
  expect(transition(disposed, { type: "done", attempt: "second" })).toBe(disposed)
})
