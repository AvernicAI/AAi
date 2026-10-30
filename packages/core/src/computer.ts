/// <reference path="./markdown.d.ts" />

export * as Computer from "./computer.js"

import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { Schema } from "effect"
import script from "./computer/windows.ps1" with { type: "text" }

const coordinate = Schema.Int.check(Schema.isBetween({ minimum: -32768, maximum: 32767 }))
const point = { x: coordinate, y: coordinate }
const region = Schema.Struct({
  ...point,
  width: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 16384 })),
  height: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 16384 })),
})
export const Input = Schema.Struct({
  windowID: Schema.optional(Schema.String.check(Schema.isPattern(/^[1-9][0-9]*$/))),
  actions: Schema.Array(
    Schema.Union([
      Schema.Struct({ type: Schema.Literal("status") }),
      Schema.Struct({ type: Schema.Literal("screenshot"), region: Schema.optional(region) }),
      Schema.Struct({ type: Schema.Literal("focus") }),
      Schema.Struct({ type: Schema.Literal("move"), ...point }),
      Schema.Struct({
        type: Schema.Literal("click"),
        x: Schema.optional(coordinate),
        y: Schema.optional(coordinate),
        button: Schema.optional(Schema.Literals(["left", "right", "middle"])),
        count: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 2 }))),
      }),
      Schema.Struct({ type: Schema.Literal("drag"), ...point, toX: coordinate, toY: coordinate }),
      Schema.Struct({
        type: Schema.Literal("scroll"),
        amount: Schema.Int.check(Schema.isBetween({ minimum: -20, maximum: 20 })),
        horizontal: Schema.optional(Schema.Boolean),
      }),
      Schema.Struct({ type: Schema.Literal("type"), text: Schema.String.check(Schema.isMaxLength(2000)) }),
      Schema.Struct({
        type: Schema.Literal("press"),
        key: Schema.String.check(Schema.isPattern(/^[a-zA-Z0-9]+(?:\+[a-zA-Z0-9]+){0,3}$/)),
        durationMs: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 2000 }))),
      }),
    ]),
  ).check(Schema.isMinLength(1), Schema.isMaxLength(20)),
})
export type Input = typeof Input.Type
export const Output = Schema.Struct({
  results: Schema.Array(Schema.Struct({ type: Schema.String, data: Schema.JsonObject })),
})
const response = Schema.Struct({
  ...Output.fields,
  images: Schema.Array(Schema.Struct({ name: Schema.String, data: Schema.String })),
})

export async function run(input: Input, signal?: AbortSignal) {
  if (process.platform !== "win32")
    throw new Error("Native desktop control currently requires Windows. Use browser tools for browser applications.")
  const duration = input.actions.reduce(
    (total, action) => total + (action.type === "press" ? (action.durationMs ?? 30) : action.type === "drag" ? 400 : 0),
    0,
  )
  if (duration > 5000)
    throw new Error("Keep each desktop-control batch within five seconds, then inspect a fresh screenshot.")
  if (input.actions.some((action) => action.type === "click" && (action.x === undefined) !== (action.y === undefined)))
    throw new Error("Click coordinates require both x and y.")
  const directory = await mkdtemp(path.join(os.tmpdir(), "aai-computer-"))
  if (!path.resolve(directory).startsWith(path.join(path.resolve(os.tmpdir()), "aai-computer-")))
    throw new Error("Unexpected desktop-control temporary directory")
  const cancel = () => writeFileSync(path.join(directory, "cancel"), "")
  signal?.addEventListener("abort", cancel, { once: true })
  try {
    if (signal?.aborted) cancel()
    const file = path.join(directory, "control.ps1")
    await writeFile(file, script)
    const payload = path.join(directory, "input.json")
    await writeFile(payload, JSON.stringify({ ...input, cancelPath: path.join(directory, "cancel") }))
    // Pass a JSON file, avoiding command-line length limits and interpreting user text as source.
    // Core is also embedded in Node servers; load its process adapter only when Windows control is requested.
    const { execFile } = await import("node:child_process")
    const result = await promisify(execFile)(
      "powershell.exe",
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-File", file, "-PayloadFile", payload],
      { encoding: "utf8", windowsHide: true, maxBuffer: 32 * 1024 * 1024 },
    )
    return Schema.decodeUnknownSync(Schema.fromJsonString(response))(result.stdout)
  } finally {
    signal?.removeEventListener("abort", cancel)
    await rm(directory, { recursive: true, force: true })
  }
}
