import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { Computer } from "../src/computer"

describe("desktop control input boundary", () => {
  test.each([
    { actions: [] },
    { actions: Array.from({ length: 21 }, () => ({ type: "status" })) },
    { actions: [{ type: "press", key: "W", durationMs: 2001 }] },
    { actions: [{ type: "press", key: "Control+s; Start-Process calc" }] },
    { actions: [{ type: "type", text: "x".repeat(2001) }] },
    { windowID: "not-a-window", actions: [{ type: "focus" }] },
    { actions: [{ type: "screenshot", region: { x: 0, y: 0, width: 0, height: 50 } }] },
  ])("rejects unsupported or unbounded actions: %j", (input) => {
    expect(Schema.decodeUnknownResult(Computer.Input)(input)._tag).toBe("Failure")
  })

  test("supports secondary-monitor coordinates, literal Unicode text and bounded game chords", () => {
    const input = {
      windowID: "123456",
      actions: [
        { type: "move", x: -1200, y: 200 },
        { type: "type", text: "AAi — 你好; $(literal text)" },
        { type: "press", key: "Shift+W", durationMs: 300 },
        { type: "screenshot" },
      ],
    } satisfies Computer.Input
    expect(Schema.decodeUnknownSync(Computer.Input)(input)).toEqual(input)
  })

  test.skipIf(process.platform !== "win32")(
    "rejects excessive holds and incomplete click positions before injecting input",
    async () => {
      await expect(
        Computer.run({
          actions: [
            { type: "press", key: "W", durationMs: 2000 },
            { type: "press", key: "W", durationMs: 2000 },
            { type: "press", key: "W", durationMs: 2000 },
          ],
        }),
      ).rejects.toThrow("five seconds")
      await expect(Computer.run({ actions: [{ type: "click", x: 100 }] })).rejects.toThrow("both x and y")
    },
  )
})
