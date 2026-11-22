import { expect, test } from "bun:test"
import { orlonDestination, webDestination } from "./policy"

test.each([
  ["https://orlon.org/", true, true],
  ["https://orlon.org/account", true, true],
  ["https://orlon.org:443/", true, true],
  ["https://accounts.google.com/", false, true],
  ["https://orlon.org.attacker.example/", false, true],
  ["about:blank", false, true],
  ["https://user:secret@orlon.org/", false, false],
  ["http://orlon.org/", false, false],
  ["file:///C:/Users/Broduer/.config/opencode", false, false],
  ["javascript:alert(1)", false, false],
  ["data:text/html,test", false, false],
  ["opencode://session", false, false],
  ["not a URL", false, false],
] as const)("Orlon page and popup navigation policy: %s", (url, embedded, popup) => {
  expect(orlonDestination(url)).toBe(embedded)
  expect(webDestination(url)).toBe(popup)
})
