import { describe, expect, test } from "bun:test"
import type { Schema } from "effect"
import { crashLoopWindowMs, crashTimestampsKey, nextCrashState, parseCrashTimestamps } from "./crash-loop"

describe("nextCrashState", () => {
  test("keeps crashes from the last minute and drops older ones", () => {
    const now = 120_000
    expect(nextCrashState([now - 59_000, now - crashLoopWindowMs], now)).toEqual({
      crashes: [now - 59_000, now],
      loop: false,
    })
  })

  test("reports a loop at exactly three crashes", () => {
    const now = 90_000
    expect(nextCrashState([now - 2_000, now - 1_000], now).loop).toBe(true)
    expect(nextCrashState([now - 2_000], now).loop).toBe(false)
  })

  test("a clean history after a reset starts over", () => {
    expect(nextCrashState([], 5_000)).toEqual({ crashes: [5_000], loop: false })
  })
})

describe("parseCrashTimestamps", () => {
  const cases: [Schema.Json | undefined, number[]][] = [
    [[1_000, 2_000], [1_000, 2_000]],
    ["corrupt", []],
    [{ 0: 1_000 }, []],
    [[1_000, "2000"], []],
    [[1_000, -1, 0], [1_000]],
  ]

  test.each(cases)("parses %j", (stored, expected) => {
    expect(parseCrashTimestamps(stored)).toEqual(expected)
  })

  test("keys history per window", () => {
    expect(crashTimestampsKey("window-1")).toBe("crashTimestamps:window-1")
  })
})
