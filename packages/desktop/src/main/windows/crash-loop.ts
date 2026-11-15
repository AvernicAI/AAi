import { Option, Schema } from "effect"

export const crashLoopWindowMs = 60_000

export const crashLoopThreshold = 3

const CrashTimestamps = Schema.Array(Schema.Number)

/** A persisted history is untrusted settings JSON; one bad entry resets only this window's history. */
export function parseCrashTimestamps(value: Schema.Json | undefined): number[] {
  const decoded = Schema.decodeUnknownOption(CrashTimestamps)(value)

  if (Option.isNone(decoded)) return []

  return decoded.value.filter((at) => Number.isFinite(at) && at > 0)
}

export function nextCrashState(previous: readonly number[], now: number) {
  const crashes = [...previous.filter((at) => now - at < crashLoopWindowMs), now]

  return { crashes, loop: crashes.length >= crashLoopThreshold }
}

export function crashTimestampsKey(windowID: string) {
  return `crashTimestamps:${windowID}`
}
