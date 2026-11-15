export const reconnectWindowMs = 10 * 60_000

export const reconnectLimit = 5

const delays = [5_000, 15_000, 45_000, 60_000] as const

/** Delay before the next automatic reconnect, growing to a minute and staying there. */
export function nextReconnectDelay(attempt: number): number {
  return delays[Math.min(Math.max(attempt, 0), delays.length - 1)]
}

export function recentReconnects(timestamps: readonly number[], now: number): number[] {
  return timestamps.filter((at) => now - at < reconnectWindowMs)
}

/** At most five attempts per ten minutes, each no sooner than its backoff. */
export function canReconnect(timestamps: readonly number[], now: number) {
  const recent = recentReconnects(timestamps, now)

  if (recent.length >= reconnectLimit) return false
  const last = recent.at(-1)

  return last === undefined || now - last >= nextReconnectDelay(recent.length - 1)
}

export function recordReconnect(timestamps: readonly number[], now: number) {
  return [...recentReconnects(timestamps, now), now]
}
