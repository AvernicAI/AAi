import type { SessionMessageAssistantTool, SessionMessageInfo } from "@opencode/client/promise"
import { Option, Schema } from "effect"

const Mutation = Schema.Struct({
  path: Schema.optional(Schema.String),
  filePath: Schema.optional(Schema.String),
  file_path: Schema.optional(Schema.String),
  patchText: Schema.optional(Schema.String),
  patch: Schema.optional(Schema.String),
})

const decodeMutation = Schema.decodeUnknownOption(Mutation)

const Calls = Schema.Array(
  Schema.Struct({
    tool: Schema.String,
    status: Schema.Literals(["running", "completed", "error"]),
    input: Schema.optional(Schema.Record(Schema.String, Schema.Json)),
  }),
)

const decodeCalls = Schema.decodeUnknownOption(Calls)

/** Projects the native and Code Mode tool progress already published by the existing runner. */
export function activity(messages: readonly SessionMessageInfo[]) {
  const boundary = messages.findLastIndex((message) => message.type === "idle")

  const tools = messages.flatMap((message, index) =>
    message.type === "assistant"
      ? message.content
          .filter((part) => part.type === "tool")
          .flatMap((part) => project(part).map((tool) => ({ ...tool, index })))
      : [],
  )

  const recent = tools.filter((tool) => tool.index > boundary)
  const running = recent.findLast((tool) => tool.status === "running" || tool.status === "streaming")
  const latest = messages.at(-1)

  const files = tools.flatMap((tool) => {
    if (tool.status !== "completed" || !["write", "edit", "patch"].includes(tool.name)) return []
    const decoded = decodeMutation(tool.input)

    if (Option.isNone(decoded)) return []
    const input = decoded.value
    const direct = input.path ?? input.filePath ?? input.file_path
    const patch = input.patchText ?? input.patch

    return [
      ...(direct ? [direct] : []),
      ...(patch ? [...patch.matchAll(/^\*\*\* (?:Add|Update) File: (.+)$/gm)].map((match) => match[1].trim()) : []),
    ].map((path) => ({ path, id: tool.id }))
  })

  return {
    files,
    running,
    editing: !!running && ["write", "edit", "patch"].includes(running.name),
    shell: running?.name === "shell",
    responding:
      !running && latest?.type === "assistant" && !latest.time.completed && latest.content.at(-1)?.type === "text",
    error: recent.findLast((tool) => tool.status === "error"),
  }
}

function project(part: SessionMessageAssistantTool) {
  const direct = {
    id: part.id,
    name: part.name,
    status: part.state.status,
    input: part.state.status === "streaming" ? {} : part.state.input,
  }

  if (part.name !== "execute" || part.state.status === "streaming") return [direct]
  const calls = decodeCalls(part.state.metadata?.toolCalls)

  if (Option.isNone(calls)) return [direct]

  return [
    direct,
    ...calls.value.map((call, index) => ({
      id: `${part.id}:${index}`,
      name: call.tool.split(".").at(-1) ?? call.tool,
      status: call.status,
      input: call.input ?? {},
    })),
  ]
}
