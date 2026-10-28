import { spawn } from "node:child_process"
import { Schema } from "effect"

const Message = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("response"),
    request_seq: Schema.Number,
    success: Schema.Boolean,
    message: Schema.optional(Schema.String),
    body: Schema.optional(Schema.Json),
  }),
  Schema.Struct({ type: Schema.Literal("event"), event: Schema.String, body: Schema.optional(Schema.Json) }),
  Schema.Struct({ type: Schema.Literal("request"), seq: Schema.Number, command: Schema.String }),
])

const decode = Schema.decodeUnknownSync(Schema.fromJsonString(Message))

export function startAdapter(input: {
  command: readonly string[]
  directory: string
  signal: AbortSignal
  event: (event: string, body: Schema.Json) => void
  output: (text: string) => void
}) {
  if (!input.command[0]) throw new Error("ide.command")

  const child = spawn(input.command[0], input.command.slice(1), {
    cwd: input.directory,
    stdio: "pipe",
    windowsHide: true,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  })

  const pending = new Map<
    number,
    { resolve: (value: Schema.Json) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }
  >()

  const state = { sequence: 0, buffer: Buffer.alloc(0), closed: false }
  const exited = Promise.withResolvers<void>()
  child.once("close", () => exited.resolve())

  const write = (message: Schema.JsonObject) => {
    const bytes = Buffer.from(JSON.stringify(message))
    child.stdin.write(`Content-Length: ${bytes.length}\r\n\r\n`)
    child.stdin.write(bytes)
  }

  const close = (error = new Error("ide.debug.closed")) => {
    if (state.closed) return
    state.closed = true
    pending.forEach((item) => {
      clearTimeout(item.timer)
      item.reject(error)
    })
    pending.clear()
    child.kill()
    input.signal.removeEventListener("abort", abort)
    input.event("terminated", { message: error.message })
  }

  const abort = () => close()
  child.stdout.on("data", (chunk: Buffer) => {
    state.buffer = Buffer.concat([state.buffer, chunk])

    try {
      while (true) {
        const header = state.buffer.indexOf("\r\n\r\n")

        if (header < 0) {
          if (state.buffer.length > 8192) throw new Error("ide.debug.framing")

          return
        }

        const length = Number(/Content-Length:\s*(\d+)/i.exec(state.buffer.subarray(0, header).toString())?.[1])

        if (!Number.isSafeInteger(length) || length < 0 || length > 16 * 1024 * 1024)
          throw new Error("ide.debug.framing")

        if (state.buffer.length < header + 4 + length) return
        const message = decode(state.buffer.subarray(header + 4, header + 4 + length).toString("utf8"))
        state.buffer = state.buffer.subarray(header + 4 + length)

        if (message.type === "event") input.event(message.event, message.body ?? null)

        if (message.type === "request")
          write({
            seq: ++state.sequence,
            type: "response",
            request_seq: message.seq,
            command: message.command,
            success: false,
            message: "Client does not support reverse requests; use internalConsole.",
          })

        if (message.type !== "response") continue
        const item = pending.get(message.request_seq)

        if (!item) continue
        pending.delete(message.request_seq)
        clearTimeout(item.timer)

        if (message.success) item.resolve(message.body ?? null)

        if (!message.success) item.reject(new Error(message.message ?? "ide.debug.request"))
      }
    } catch (error) {
      close(error instanceof Error ? error : new Error(String(error)))
    }
  })
  child.stderr.setEncoding("utf8").on("data", input.output)
  child.stdin.on("error", close)
  child.on("error", close)
  child.on("exit", () => close())
  input.signal.addEventListener("abort", abort, { once: true })

  if (input.signal.aborted) close()

  return {
    request(command: string, args: Schema.JsonObject = {}): Promise<Schema.Json> {
      if (state.closed) return Promise.reject(new Error("ide.debug.closed"))
      const seq = ++state.sequence

      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(seq)
          reject(new Error(`ide.debug.timeout: ${command}`))
        }, 30000)

        pending.set(seq, { resolve, reject, timer })
        write({ seq, type: "request", command, arguments: args })
      })
    },
    close,
    async stop() {
      if (state.closed) return exited.promise
      const timer = setTimeout(close, 1000)
      await this.request("disconnect", { terminateDebuggee: true }).catch(() => undefined)
      close()
      await exited.promise
      clearTimeout(timer)
    },
  }
}

export type Adapter = ReturnType<typeof startAdapter>
