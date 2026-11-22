import { expect, test } from "bun:test"
import { metaDestination, webDestination } from "./policy"

test.each([
  ["https://www.meta.ai/", true, true],
  ["https://meta.ai/", true, true],
  ["https://accounts.meta.com/", true, true],
  ["https://www.facebook.com/login/", true, true],
  ["https://www.instagram.com/accounts/login/", true, true],
  ["https://meta.ai.attacker.example/", false, true],
  ["https://notmeta.ai/", false, true],
  ["https://user:secret@www.meta.ai/", false, false],
  ["http://www.meta.ai/", false, false],
  ["file:///C:/Users/credentials", false, false],
  ["javascript:alert(1)", false, false],
  ["about:blank", false, true],
] as const)("Meta sign-in navigation stays on first-party HTTPS origins: %s", (url, embedded, popup) => {
  expect(metaDestination(url)).toBe(embedded)
  expect(webDestination(url)).toBe(popup)
})
