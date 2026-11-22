import { expect, test } from "bun:test"
import { accountDestination, home, partition } from "./policy"

test("Chat-Box AI uses its official workspace and isolated sign-in partition", () => {
  expect(home).toBe("https://chat-box.ai/app")
  expect(partition).toBe("persist:aai-chat-box")
  expect(accountDestination(home)).toBe(true)
  expect(accountDestination("https://accounts.google.com/")).toBe(true)
  expect(accountDestination("https://chat-box.ai.evil.test/")).toBe(false)
  expect(accountDestination("https://user:secret@chat-box.ai/")).toBe(false)
  expect(accountDestination("http://chat-box.ai/")).toBe(false)
  expect(accountDestination("javascript:alert(1)")).toBe(false)
})
