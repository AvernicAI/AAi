import { expect, test } from "bun:test"
import {
  accountDestination,
  bots,
  home,
  isAccountCallback,
  isSection,
  navigationTarget,
  sectionReturn,
  signIn,
} from "./policy"

test.each([
  ["chat", "bots", "", home],
  ["bots", "chat", "", bots],
  ["automations", "chat", "", "https://app.devin.ai/automations"],
  ["security", "chat", "", "https://app.devin.ai/security"],
  ["wiki", "chat", "", "https://app.devin.ai/wiki"],
  ["signIn", "chat", home, signIn],
  ["signIn", "bots", bots, signIn],
  ["reload", "bots", "https://app.devin.ai/bots/example", "https://app.devin.ai/bots/example"],
  ["reload", "bots", "https://app.devin.ai.example.org/bots", bots],
  ["reload", "wiki", "", "https://app.devin.ai/wiki"],
  ["reload", "chat", "", home],
] as const)("%s from %s preserves the intended Devin destination", (action, section, current, expected) => {
  expect(navigationTarget(action, section, current)).toBe(expected)
})

test.each([
  ["https://app.devin.ai/bots", true],
  ["https://accounts.google.com/signin", true],
  ["https://github.com/login", true],
  ["https://app.devin.ai:444/bots", false],
  ["https://app.devin.ai.example.com/bots", false],
  ["https://user@app.devin.ai/bots", false],
  ["http://app.devin.ai/bots", false],
] as const)("restricts in-app account navigation to trusted HTTPS origins (%s)", (destination, expected) => {
  expect(accountDestination(destination)).toBe(expected)
})

test("returns to the selected section after the provider flow has reached the application", () => {
  const login = sectionReturn("idle", signIn)
  const consent = sectionReturn(login, "https://accounts.google.com/signin")
  const callback = sectionReturn(consent, "https://app.devin.ai/auth/callback?code=example&state=example")
  const landing = sectionReturn(callback, home)

  expect([login, consent, callback, landing, sectionReturn(landing, signIn)]).toEqual([
    "waiting",
    "waiting",
    "waiting",
    "restored",
    "restored",
  ])
})

test.each([
  ["idle", home, "idle"],
  ["waiting", "https://app.devin.ai.example.org/", "waiting"],
  ["waiting", "https://app.devin.ai/?error=access_denied", "waiting"],
  ["waiting", "https://app.devin.ai/?code=example&state=example", "waiting"],
] as const)("ignores ordinary browsing and uncompleted sign-in (%s, %s)", (state, url, expected) => {
  expect(sectionReturn(state, url)).toBe(expected)
})

test.each([
  ["bots", "https://app.devin.ai/bots/example", true],
  ["security", "https://app.devin.ai/security/findings", true],
  ["wiki", "https://app.devin.ai/wiki/", true],
  ["wiki", "https://app.devin.ai/wiki-settings", false],
  ["automations", "https://app.devin.ai.example.org/automations", false],
] as const)("checks whether a return URL already belongs to %s (%s)", (section, url, expected) => {
  expect(isSection(section, url)).toBe(expected)
})

test.each([
  ["https://app.devin.ai/auth/callback/google?code=example&state=example", true],
  ["https://app.devin.ai/auth/callback?error=access_denied", false],
  ["https://app.devin.ai.example.com/auth/callback", false],
  ["https://accounts.google.com/signin", false],
] as const)("recognizes a close-on-return callback only on Devin (%s)", (url, expected) => {
  expect(isAccountCallback(url)).toBe(expected)
})
