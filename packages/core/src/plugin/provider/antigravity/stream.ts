export * as AntigravityStream from "./stream.js"

import type { LanguageModelV3StreamPart } from "@ai-sdk/provider"
import type { SessionUpdate } from "@agentclientprotocol/sdk"
import { Schema } from "effect"

export function create(emit: (part: LanguageModelV3StreamPart) => void) {
  const calls = new Map<string, { name: string; input: string; started: boolean; done: boolean }>()
  const channels = new Set<"text" | "reasoning">()
  const write = (type: "text" | "reasoning", text: string) => {
    if (!channels.has(type)) {
      emit({ type: `${type}-start`, id: type })
      channels.add(type)
    }
    emit({ type: `${type}-delta`, id: type, delta: text })
  }

  return {
    update(update: SessionUpdate) {
      if (update.sessionUpdate === "agent_message_chunk" || update.sessionUpdate === "agent_thought_chunk") {
        if (update.content.type === "text")
          write(update.sessionUpdate === "agent_message_chunk" ? "text" : "reasoning", update.content.text)
        return
      }
      if (update.sessionUpdate === "plan") {
        write(
          "reasoning",
          `\nPlan:\n${update.entries.map((entry) => `${entry.status === "completed" ? "[x]" : "[ ]"} ${entry.content}`).join("\n")}\n`,
        )
        return
      }
      if (update.sessionUpdate !== "tool_call" && update.sessionUpdate !== "tool_call_update") return
      const id = update.toolCallId
      const call = calls.get(id) ?? {
        name: `antigravity_${update.kind ?? "tool"}`,
        input: JSON.stringify(Schema.decodeUnknownSync(Schema.Json)(update.rawInput ?? {})),
        started: false,
        done: false,
      }
      calls.set(id, call)
      if (!call.started) {
        call.started = true
        emit({
          type: "tool-call",
          toolCallId: id,
          toolName: call.name,
          input: call.input,
          providerExecuted: true,
          dynamic: true,
        })
      }
      if (!call.done && (update.status === "completed" || update.status === "failed")) {
        call.done = true
        emit({
          type: "tool-result",
          toolCallId: id,
          toolName: call.name,
          result: {
            output: JSON.stringify(Schema.decodeUnknownSync(Schema.Json)(update.rawOutput ?? update.content ?? [])),
          },
          isError: update.status === "failed",
          dynamic: true,
        })
      }
    },
    finish(stopReason: string) {
      channels.forEach((type) => emit({ type: `${type}-end`, id: type }))
      emit({
        type: "finish",
        finishReason: {
          unified: stopReason === "max_tokens" ? "length" : stopReason === "cancelled" ? "other" : "stop",
          raw: stopReason,
        },
        usage: {
          inputTokens: { total: undefined, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: undefined, text: undefined, reasoning: undefined },
        },
      })
    },
  }
}
