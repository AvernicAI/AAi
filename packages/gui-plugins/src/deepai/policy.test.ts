import { expect, test } from "bun:test"
import { deepaiDestination, destination, partition, webDestination } from "./policy"
import { transition, view, type State } from "./machine"

test("DeepAI tools use the official routes and an isolated account partition", () => {
  expect(partition).toBe("persist:aai-deepai")
  expect(destination("chat")).toBe("https://deepai.org/chat")
  expect(destination("images")).toBe("https://deepai.org/machine-learning-model/text2img")
  expect(destination("editor")).toBe("https://deepai.org/machine-learning-model/image-editor")
  expect(destination("video")).toBe("https://deepai.org/video")
  expect(destination("music")).toBe("https://deepai.org/music")
  expect(destination("voice")).toBe("https://deepai.org/voice")
  expect(destination("account")).toBe("https://deepai.org/profile/api")
})

test("DeepAI navigation rejects lookalikes, credentials and executable URLs", () => {
  expect(deepaiDestination("https://deepai.org/chat")).toBe(true)
  expect(deepaiDestination("https://accounts.google.com/o/oauth2/auth")).toBe(true)

  for (const input of [
    "http://deepai.org",
    "https://deepai.org.evil.test",
    "https://evil.test",
    "https://user:secret@deepai.org",
    "javascript:alert(1)",
    "file:///C:/",
  ])
    expect(deepaiDestination(input)).toBe(false)
  expect(webDestination("about:blank")).toBe(true)
  expect(webDestination("https://example.org/help")).toBe(true)
  expect(webDestination("data:text/html,test")).toBe(false)
})

test("DeepAI ignores stale navigation completions and cannot revive a disposed workspace", () => {
  const opening = transition({ status: "idle" }, { type: "open", attempt: "first" })

  const ready = transition(
    transition(opening, { type: "opened", attempt: "first", page: { binding: "own", embed: "view" } }),
    { type: "done", attempt: "first" },
  )

  const working = transition(ready, { type: "run", attempt: "second", action: "video" })
  expect(transition(working, { type: "failed", attempt: "first" })).toBe(working)
  expect(view(working).busy).toBe(true)
  const disposed = transition(working, { type: "dispose" })
  expect(transition(disposed, { type: "done", attempt: "second" })).toBe(disposed)
  const failed: State = { status: "failed", attempt: "second", page: { binding: "own", embed: "view" } }
  const confirm = transition(failed, { type: "confirm" })
  expect(view(confirm).confirming).toBe(true)
  expect(transition(confirm, { type: "cancel" }).status).toBe("ready")
  expect(transition(failed, { type: "run", attempt: "third", action: "reload" }).status).toBe("working")
})
