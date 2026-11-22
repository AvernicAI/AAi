export * as AntigravityModel from "./model.js"

import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3Prompt,
  LanguageModelV3StreamResult,
  LanguageModelV3StreamPart,
} from "@ai-sdk/provider"
import type { ContentBlock } from "@agentclientprotocol/sdk"
import { AntigravityProtocol } from "./protocol.js"
import { AntigravityStream } from "./stream.js"
import type { AntigravityHost } from "./host.js"

export type Saved = { id: string; directory: string }
export interface Dependencies {
  readonly directory: string
  readonly host: (
    headers: Record<string, string | undefined>,
    signal: AbortSignal,
  ) => ReturnType<typeof AntigravityHost.create>
  readonly load: (sessionID: string) => Promise<Saved | undefined>
  readonly save: (sessionID: string, value: Saved) => Promise<void>
}

export class Model implements LanguageModelV3 {
  readonly specificationVersion = "v3"
  readonly provider = "antigravity"
  readonly supportedUrls = {}

  constructor(
    readonly modelId: string,
    readonly dependencies: Dependencies,
  ) {}

  async doGenerate(): Promise<never> {
    throw new Error("Antigravity Agent supports streaming requests only.")
  }

  async doStream(options: LanguageModelV3CallOptions): Promise<LanguageModelV3StreamResult> {
    const { client } = await import("@agentclientprotocol/sdk")
    const abort = new AbortController()
    const signal = options.abortSignal ? AbortSignal.any([abort.signal, options.abortSignal]) : abort.signal
    const headers = options.headers ?? {}
    const primary = headers["x-aai-antigravity-kind"] === "primary"
    const sessionID = primary ? headers["x-aai-antigravity-session"] : undefined
    const host = this.dependencies.host(headers, signal)
    const modes = ["default", "plan", "accept-edits", "auto"]
    const selectedMode = options.providerOptions?.antigravity?.mode
    const mode =
      !primary || headers["x-aai-antigravity-agent"] === "plan"
        ? "plan"
        : (modes.find((mode) => mode === selectedMode) ?? "default")
    const state = { cancelled: false, task: Promise.resolve() }
    const stream = new ReadableStream<LanguageModelV3StreamPart>({
      start: (controller) => {
        const emit = (part: LanguageModelV3StreamPart) => {
          if (!state.cancelled) controller.enqueue(part)
        }
        emit({ type: "stream-start", warnings: [] })
        const convert = AntigravityStream.create(emit)
        const app = client({ name: "AlphaAi" })
          .onNotification("session/update", ({ params }) => convert.update(params.update))
          .onRequest("session/request_permission", ({ params }) =>
            host.permission(params).catch(() => ({ outcome: { outcome: "cancelled" as const } })),
          )
          .onRequest("fs/read_text_file", ({ params }) => host.read(params))
          .onRequest("fs/write_text_file", ({ params }) => host.write(params))
          .onRequest("terminal/create", ({ params }) => host.start(params))
          .onRequest("terminal/output", ({ params }) => host.output(params.terminalId))
          .onRequest("terminal/wait_for_exit", ({ params }) => host.wait(params.terminalId))
          .onRequest("terminal/kill", ({ params }) => host.stop(params.terminalId))
          .onRequest("terminal/release", ({ params }) => host.stop(params.terminalId))
        state.task = AntigravityProtocol.connect(
          { directory: this.dependencies.directory, app, signal },
          async (connection, initialized) => {
            const saved = sessionID ? await this.dependencies.load(sessionID) : undefined
            const restored =
              saved?.directory === this.dependencies.directory &&
              initialized.agentCapabilities?.sessionCapabilities?.resume
            const session = restored
              ? {
                  ...(await connection.request(
                    "session/resume",
                    { sessionId: saved.id, cwd: this.dependencies.directory, mcpServers: [] },
                    { cancellationSignal: signal },
                  )),
                  sessionId: saved.id,
                }
              : await connection.request(
                  "session/new",
                  { cwd: this.dependencies.directory, mcpServers: [] },
                  { cancellationSignal: signal },
                )
            if (sessionID)
              await this.dependencies.save(sessionID, { id: session.sessionId, directory: this.dependencies.directory })
            const option = AntigravityProtocol.modelSelection(session.configOptions ?? [], this.modelId)
            const configured = await connection.request(
              "session/set_config_option",
              { sessionId: session.sessionId, ...option },
              { cancellationSignal: signal },
            )
            const effort = AntigravityProtocol.effortSelection(configured.configOptions, option.value, this.modelId)
            if (effort)
              await connection.request(
                "session/set_config_option",
                { sessionId: session.sessionId, ...effort },
                { cancellationSignal: signal },
              )
            await connection.request(
              "session/set_mode",
              { sessionId: session.sessionId, modeId: mode },
              { cancellationSignal: signal },
            )
            const cancel = () => {
              void connection.notify("session/cancel", { sessionId: session.sessionId }).catch(() => undefined)
            }
            signal.addEventListener("abort", cancel, { once: true })
            try {
              const response = await connection.request(
                "session/prompt",
                { sessionId: session.sessionId, prompt: prompt(options.prompt, !!restored) },
                { cancellationSignal: signal },
              )
              convert.finish(response.stopReason)
            } finally {
              signal.removeEventListener("abort", cancel)
            }
          },
        )
          .finally(() => host.dispose())
          .then(
            () => {
              if (!state.cancelled) controller.close()
            },
            (error) => {
              if (!state.cancelled) controller.error(error)
            },
          )
      },
      cancel: () => {
        state.cancelled = true
        abort.abort()
        return state.task
      },
    })
    return { stream }
  }
}

/** Preserve files/images and conversation context; never silently drop an unsupported attachment. */
export function prompt(messages: LanguageModelV3Prompt, resumed: boolean): ContentBlock[] {
  const system = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n")
  const selected = resumed
    ? messages.filter((message) => message.role === "user").slice(-1)
    : messages.filter((message) => message.role !== "system")
  const content: ContentBlock[] = [
    {
      type: "text",
      text: `AAi session instructions and context:\n${system}\n\nFollow the AAi agent instructions above using your official Antigravity tools. Respect AAi permission decisions and the selected plan/mode. Do not claim access to AAi function tools that are not connected through MCP.`,
    },
  ]
  selected.forEach((message) => {
    content.push({ type: "text", text: `\n${message.role}:\n` })
    message.content.forEach((part) => {
      if (part.type === "text") {
        content.push({ type: "text", text: part.text })
        return
      }
      if (part.type === "file") {
        if (part.data instanceof URL) {
          content.push({
            type: "resource_link",
            uri: part.data.href,
            name: part.filename ?? "attachment",
            mimeType: part.mediaType,
          })
          return
        }
        const data = typeof part.data === "string" ? part.data : Buffer.from(part.data).toString("base64")
        if (part.mediaType.startsWith("image/")) {
          content.push({ type: "image", data, mimeType: part.mediaType })
          return
        }
        content.push({
          type: "resource",
          resource: {
            uri: `attachment:${encodeURIComponent(part.filename ?? "file")}`,
            mimeType: part.mediaType,
            blob: data,
          },
        })
        return
      }
      if (part.type === "tool-result")
        content.push({ type: "text", text: JSON.stringify({ tool: part.toolName, output: part.output }) })
    })
  })
  return content
}
