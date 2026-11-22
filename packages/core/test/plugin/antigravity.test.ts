import { describe, expect, test } from "bun:test"
import type { SessionConfigOption } from "@agentclientprotocol/sdk"
import type { LanguageModelV3StreamPart } from "@ai-sdk/provider"
import { AntigravityProtocol } from "../../src/plugin/provider/antigravity/protocol"
import { AntigravityStream } from "../../src/plugin/provider/antigravity/stream"
import { AntigravityModel } from "../../src/plugin/provider/antigravity/model"

const options: SessionConfigOption[] = [
  {
    id: "model",
    name: "Model",
    category: "model",
    type: "select",
    currentValue: "gemini-4-carbon",
    options: [
      { value: "gemini-4-carbon", name: "Carbon" },
      { value: "gemini-4-hydrogen", name: "Hydrogen" },
    ],
  },
  {
    id: "thought_level",
    name: "Effort",
    type: "select",
    currentValue: "high",
    options: [
      { value: "high", name: "High" },
      { value: "xhigh", name: "Extra high" },
    ],
  },
]
describe("official Antigravity adapter", () => {
  test("discovers exact TSV IDs without inventing models from status messages", () => {
    expect(
      AntigravityProtocol.parseModels(
        "Fetching available models...\nMODEL\tNAME\ngemini-4-hydrogen-xhigh\tGemini Hydrogen (Extra High)\n",
      ),
    ).toEqual([{ modelId: "gemini-4-hydrogen-xhigh", name: "Gemini Hydrogen (Extra High)" }])
  })
  test("selects the live model then its updated reasoning choices", () => {
    expect(AntigravityProtocol.modelSelection(options, "gemini-4-hydrogen-xhigh")).toEqual({
      configId: "model",
      value: "gemini-4-hydrogen",
    })
    expect(AntigravityProtocol.effortSelection(options, "gemini-4-hydrogen", "gemini-4-hydrogen-xhigh")).toEqual({
      configId: "thought_level",
      value: "xhigh",
    })
    expect(() => AntigravityProtocol.modelSelection(options, "removed-model")).toThrow("no longer offers")
    expect(() => AntigravityProtocol.effortSelection(options, "gemini-4-hydrogen", "gemini-4-hydrogen-max")).toThrow(
      "reasoning level",
    )
  })
  test("streams actual text, live plans and provider-executed tools once", () => {
    const parts: LanguageModelV3StreamPart[] = []
    const stream = AntigravityStream.create((part) => parts.push(part))
    stream.update({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Hello Alphie" } })
    stream.update({ sessionUpdate: "plan", entries: [{ content: "Verify", priority: "high", status: "completed" }] })
    stream.update({
      sessionUpdate: "tool_call",
      toolCallId: "read-1",
      title: "Read",
      kind: "read",
      status: "in_progress",
      rawInput: { path: "hello.js" },
    })
    stream.update({ sessionUpdate: "tool_call_update", toolCallId: "read-1", status: "completed", rawOutput: "hello" })
    stream.update({ sessionUpdate: "tool_call_update", toolCallId: "read-1", status: "completed" })
    stream.finish("end_turn")
    expect(parts.filter((part) => part.type === "tool-call")).toHaveLength(1)
    expect(parts.filter((part) => part.type === "tool-result")).toHaveLength(1)
    expect(parts.find((part) => part.type === "text-delta")).toMatchObject({ delta: "Hello Alphie" })
    expect(parts.find((part) => part.type === "reasoning-delta")).toMatchObject({ delta: "\nPlan:\n[x] Verify\n" })
    expect(parts.at(-1)).toMatchObject({ type: "finish", finishReason: { unified: "stop" } })
  })
  test("resumption preserves current AAi instructions and attachments without replaying old requests", () => {
    const parts = AntigravityModel.prompt(
      [
        { role: "system", content: "You are Alphie. Keep my project." },
        { role: "user", content: [{ type: "text", text: "Old request" }] },
        { role: "assistant", content: [{ type: "text", text: "Done" }] },
        {
          role: "user",
          content: [
            { type: "text", text: "Continue" },
            { type: "file", data: "aGVsbG8=", mediaType: "image/png" },
          ],
        },
      ],
      true,
    )
    expect(JSON.stringify(parts)).toContain("You are Alphie")
    expect(JSON.stringify(parts)).not.toContain("Old request")
    expect(parts.at(-1)).toMatchObject({ type: "image", data: "aGVsbG8=" })
  })
})

test("an aborted request disposes its host without launching workspace tools", async () => {
  const observed = { disposed: false }
  const deny = async (): Promise<never> => {
    throw new Error("Unexpected workspace access")
  }
  const model = new AntigravityModel.Model("unused", {
    directory: process.cwd(),
    host: () => ({
      dispose: async () => {
        observed.disposed = true
      },
      permission: deny,
      read: deny,
      write: deny,
      start: deny,
      output: deny,
      wait: deny,
      stop: deny,
    }),
    load: deny,
    save: deny,
  })
  const abort = new AbortController()
  abort.abort(new Error("Cancelled before launch"))
  const result = await model.doStream({ prompt: [], abortSignal: abort.signal })
  const reader = result.stream.getReader()
  expect((await reader.read()).value).toMatchObject({ type: "stream-start" })
  await expect(reader.read()).rejects.toThrow()
  expect(observed.disposed).toBe(true)
}, 30_000)
