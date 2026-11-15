import { describe, expect, test } from "bun:test"
import { canReconnect, nextReconnectDelay, recordReconnect, reconnectWindowMs } from "./reconnect-policy"

describe("nextReconnectDelay", () => {
  test.each([
    [0, 5_000],
    [1, 15_000],
    [2, 45_000],
    [3, 60_000],
    [9, 60_000],
  ])("attempt %i waits %i ms", (attempt, delay) => {
    expect(nextReconnectDelay(attempt)).toBe(delay)
  })
})

describe("canReconnect", () => {
  const now = 1_000_000

  test("allows the first attempt and blocks one that comes too soon", () => {
    expect(canReconnect([], now)).toBe(true)
    expect(canReconnect([now - 3_000], now)).toBe(false)
    expect(canReconnect([now - 5_000], now)).toBe(true)
  })

  test("caps attempts at five per ten minutes", () => {
    const timestamps = [now - 50_000, now - 40_000, now - 30_000, now - 20_000, now - 10_000]
    expect(canReconnect(timestamps, now)).toBe(false)
    expect(canReconnect(timestamps, now + reconnectWindowMs + 1)).toBe(true)
  })
})

test("recordReconnect drops attempts outside the window", () => {
  const now = 2_000_000
  expect(recordReconnect([now - reconnectWindowMs - 1, now - 1_000], now)).toEqual([now - 1_000, now])
})
