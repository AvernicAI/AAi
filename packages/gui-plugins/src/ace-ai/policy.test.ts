import { expect, test } from "bun:test"
import { accountDestination, home, partition } from "./policy"

test("Ace AI uses its official workspace and isolated sign-in partition", () => {
  expect(home).toBe("https://app.ace.ai/chat_ai")
  expect(partition).toBe("persist:aai-ace-ai")
  expect(accountDestination(home)).toBe(true)
  expect(accountDestination("https://accounts.google.com/")).toBe(true)
  expect(accountDestination("https://app.ace.ai.evil.test/")).toBe(false)
  expect(accountDestination("https://user:secret@app.ace.ai/")).toBe(false)
  expect(accountDestination("http://app.ace.ai/")).toBe(false)
  expect(accountDestination("javascript:alert(1)")).toBe(false)
})
