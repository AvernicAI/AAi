import { expect, test } from "bun:test"
import { destination, fireworksDestination, webDestination } from "./policy"

test.each([
  ["https://app.fireworks.ai/login", true, true],
  ["https://accounts.google.com/o/oauth2/auth", true, true],
  ["https://github.com/login/oauth/authorize", true, true],
  ["https://app.fireworks.ai.attacker.example/", false, true],
  ["http://app.fireworks.ai/", false, false],
  ["https://user:secret@app.fireworks.ai/", false, false],
  ["javascript:alert(1)", false, false],
  ["file:///C:/Users/Broduer/", false, false],
  ["about:blank", false, true],
] as const)("Fireworks navigation policy: %s", (url, embedded, popup) => {
  expect(fireworksDestination(url)).toBe(embedded)
  expect(webDestination(url)).toBe(popup)
})

test("every console destination stays on the Fireworks origin", () => {
  expect(new URL(destination("signIn")).pathname).toBe("/login")
  expect(new URL(destination("keys")).pathname).toBe("/settings/users/api-keys")
  expect(new URL(destination("training")).origin).toBe("https://app.fireworks.ai")
  expect(new URL(destination("training")).pathname).toBe("/dashboard/fine-tuning")
  expect(new URL(destination("serverless")).pathname).toBe("/dashboard/serverless")
  expect(new URL(destination("deployments")).pathname).toBe("/dashboard/deployments")
  expect(new URL(destination("batch")).pathname).toBe("/dashboard/batch-inference")
})
