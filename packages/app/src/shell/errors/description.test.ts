import { describe, expect, test } from "bun:test"
import { errorDescriptionKey, errorStatus } from "./description"

describe("error description", () => {
  test("describes local server startup errors", () => {
    expect(errorDescriptionKey(Object.assign(new Error("migration failed"), { localServerStartup: true }))).toBe(
      "error.page.description.localServerStartup",
    )
  })

  test.each([new Error("unknown"), Object.assign(new Error("unknown"), { localServerStartup: false })])(
    "uses the generic description for other errors",
    (error) => {
      expect(errorDescriptionKey(error)).toBe("error.page.description")
    },
  )

  test.each([
    ["cli-missing", "error.page.description.localServerStartup.cliMissing"],
    ["spawn-failed", "error.page.description.localServerStartup.spawnFailed"],
    ["port-conflict", "error.page.description.localServerStartup.portConflict"],
    ["auth-mismatch", "error.page.description.localServerStartup.authMismatch"],
    ["version-mismatch", "error.page.description.localServerStartup.versionMismatch"],
    ["timeout", "error.page.description.localServerStartup.timeout"],
    ["unknown", "error.page.description.localServerStartup"],
  ] as const)("describes a %s startup failure", (failure, key) => {
    expect(
      errorDescriptionKey(Object.assign(new Error("startup"), { localServerStartup: true, localServerFailure: failure })),
    ).toBe(key)
  })
})

describe("error status", () => {
  test.each([
    [new Error("UnexpectedStatus", { cause: { status: 502 } }), 502],
    [{ name: "APIError", data: { statusCode: 401 } }, 401],
  ])("finds status codes in an error cause or structured data", (error, status) => {
    expect(errorStatus(error)).toBe(status)
  })

  test("ignores invalid and circular status values", () => {
    const error: { status: number; cause?: unknown } = { status: 99 }
    error.cause = error
    expect(errorStatus(error)).toBeUndefined()
  })
})
