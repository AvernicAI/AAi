import { Schema } from "effect"

const Request = Schema.fromJsonString(
  Schema.Struct({ seq: Schema.Number, command: Schema.String, arguments: Schema.JsonObject }),
)

const state = { buffer: Buffer.alloc(0) }

process.stdin.on("data", (data: Buffer) => {
  state.buffer = Buffer.concat([state.buffer, data])

  while (true) {
    const end = state.buffer.indexOf("\r\n\r\n")

    if (end < 0) return
    const length = Number(/Content-Length: (\d+)/.exec(state.buffer.subarray(0, end).toString())?.[1])

    if (state.buffer.length < end + 4 + length) return
    const request = Schema.decodeUnknownSync(Request)(state.buffer.subarray(end + 4, end + 4 + length).toString())
    state.buffer = state.buffer.subarray(end + 4 + length)

    if (request.command === "crash") process.exit(3)

    const body = Buffer.from(
      JSON.stringify({
        type: "response",
        request_seq: request.seq,
        success: request.command !== "fail",
        message: "rejected",
        body: request.arguments,
      }),
    )

    const message = Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`), body])
    process.stdout.write(message.subarray(0, 3))
    process.stdout.write(message.subarray(3, message.length - 1))
    process.stdout.write(message.subarray(message.length - 1))
  }
})
