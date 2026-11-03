import type { IntegrationOAuthMethodRegistration } from "@opencode/plugin/effect/integration"
import { define } from "@opencode/plugin/effect/plugin"
import { Effect, Schema, Semaphore } from "effect"
import { Credential } from "../../credential.js"
import { Integration } from "../../integration.js"
import { Model } from "../../model.js"
import { Provider } from "../../provider.js"
import type { PluginInternal } from "../internal.js"

const origin = "https://freebuff.com"
const integrationID = Integration.ID.make("freebuff")
const apiOrigin = "https://codebuff.com"
const providerID = Provider.ID.make("freebuff")
const agents = new Map<string, string>([
  ["deepseek/deepseek-v4-flash", "base3-free-deepseek-flash"],
  ["deepseek/deepseek-v4-flash-fast", "base3-fast-free-deepseek-flash"],
  ["deepseek/deepseek-v4-pro", "base3-free-deepseek"],
  ["mimo/mimo-v2.5", "base3-free-mimo"],
  ["mimo/mimo-v2.6-pro", "base3-free-mimo-2-6-pro"],
  ["minimax/minimax-m3", "base3-free-minimax-m3"],
  ["upstage/solar-mini4", "base3-free-solar-mini4"],
  ["openai/gpt-5.6-luna", "base3-free-luna"],
  ["openai/gpt-6-luna", "base3-free-luna-6"],
  ["openai/gpt-6.1-sol", "base3-free-gpt-6-1-sol"],
  ["openai/gpt-6.1-terra", "base3-free-gpt-6-1-terra"],
  ["google/gemini-4-argon", "base3-free-gemini-4-argon"],
  ["stealth/space-bunny-alpha", "base3-free-space-bunny-alpha"],
  ["z-ai/glm-5.2", "base3-free-glm"],
  ["z-ai/glm-5.3-flash", "base3-free-glm-5-3-flash"],
  ["crof/kimi-k3-eco", "base3-free-kimi-k3-eco"],
  ["openai/gpt-5.6-luna-es", "base3-free-luna-es"],
  ["anthropic/claude-fable-5.1", "base2-free-fable"],
  ["meta/muse-spark-1.3-contributor", "base3-free-muse-spark-1-3"],
  ["stealth/ox-alpha", "base3-free-ox-alpha"],
  ["google/gemini-3.8-flash", "base3-free-gemini-3-8-flash"],
  ["deepseek/deepseek-v4.1-flash", "base2-free-deepseek-v4-1-flash"],
  ["z-ai/glm-5.3", "base2-free-glm-5-3"],
  ["openai/gpt-6-sol", "base2-free-gpt-6-sol"],
  ["openai/gpt-6-sol-pro", "base2-free-gpt-6-sol-pro"],
  ["openai/gpt-6-luna-pro", "base2-free-gpt-6-luna-pro"],
  ["openai/gpt-6-astra", "base2-free-gpt-6-astra"],
  ["openai/gpt-6-astra-pro", "base2-free-gpt-6-astra-pro"],
  ["openai/gpt-5.6-sol", "base2-free-gpt-5-6-sol"],
  ["openai/gpt-5.6-sol-pro", "base2-free-gpt-5-6-sol-pro"],
  ["openai/gpt-5.6-terra", "base2-free-gpt-5-6-terra"],
  ["openai/gpt-5.6-terra-pro", "base2-free-gpt-5-6-terra-pro"],
  ["openai/gpt-5.6-luna-pro", "base2-free-gpt-5-6-luna-pro"],
  ["openai/gpt-5.5", "base2-free-gpt-5-5"],
  ["openai/gpt-5.5-pro", "base2-free-gpt-5-5-pro"],
  ["openai/gpt-5.4-pro", "base2-free-gpt-5-4-pro"],
  ["openai/o3-pro", "base2-free-o3-pro"],
  ["anthropic/claude-opus-5.5", "base2-free-claude-opus-5-5"],
  ["anthropic/claude-opus-5", "base2-free-claude-opus-5"],
  ["anthropic/claude-sonnet-5", "base2-free-claude-sonnet-5"],
  ["anthropic/claude-opus-4.8", "base2-free-claude-opus-4-8"],
  ["anthropic/claude-sonnet-4.6", "base2-free-claude-sonnet-4-6"],
  ["qwen/qwen3.8-max-prime", "base2-free-qwen3-8-max-prime"],
  ["qwen/qwen3.8-max-0902", "base2-free-qwen3-8-max-0902"],
  ["qwen/qwen3.8-flash", "base2-free-qwen3-8-flash"],
  ["qwen/qwen3.8-27b", "base2-free-qwen3-8-27b"],
  ["qwen/qwen3.7-max", "base2-free-qwen3-7-max"],
  ["qwen/qwen3.7-plus", "base2-free-qwen3-7-plus"],
  ["qwen/qwen3.6-max-preview", "base2-free-qwen3-6-max-preview"],
  ["qwen/qwen3.6-plus", "base2-free-qwen3-6-plus"],
  ["x-ai/grok-4.7", "base2-free-grok-4-7"],
  ["x-ai/grok-4.6", "base2-free-grok-4-6"],
  ["x-ai/grok-4.5", "base2-free-grok-4-5"],
  ["x-ai/grok-4.20", "base2-free-grok-4-20"],
  ["google/gemini-3.7-flash", "base2-free-gemini-3-7-flash"],
  ["google/gemini-3.6-flash", "base2-free-gemini-3-6-flash"],
  ["google/gemini-3.5-flash", "base2-free-gemini-3-5-flash"],
  ["moonshotai/kimi-k3", "base2-free-kimi-k3"],
  ["z-ai/glm-5.3-prime", "base2-free-glm-5-3-prime"],
  ["z-ai/glm-5.3-flashx", "base2-free-glm-5-3-flashx"],
  ["z-ai/glm-5-turbo", "base2-free-glm-5-turbo"],
  ["mistralai/mistral-large", "base2-free-mistral-large"],
  ["mistralai/codestral-2508", "base2-free-codestral-2508"],
  ["meta-llama/llama-4-maverick", "base2-free-llama-4-maverick"],
])
const Session = Schema.Struct({
  status: Schema.String,
  model: Schema.optional(Schema.String),
  instanceId: Schema.optional(Schema.String),
})
const Run = Schema.Struct({ runId: Schema.NonEmptyString })
const Body = Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown))
const methodID = Integration.MethodID.make("device")

const Device = Schema.Struct({
  loginUrl: Schema.NonEmptyString,
  fingerprintHash: Schema.NonEmptyString,
  expiresAt: Schema.Union([Schema.NonEmptyString, Schema.Finite]),
  expiresInMs: Schema.optional(Schema.Finite),
})
const Status = Schema.Struct({
  user: Schema.optional(Schema.Struct({ authToken: Schema.NonEmptyString })),
})

const oauth = {
  integrationID,
  method: { id: methodID, type: "oauth", label: "Sign in to Freebuff" },
  authorize: () =>
    Effect.gen(function* () {
      const fingerprintId = crypto.randomUUID()
      const response = yield* request("/api/auth/cli/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fingerprintId }),
      })
      if (!response.ok) return yield* Effect.fail(new Error("Freebuff could not start sign-in"))
      const device = yield* json(response).pipe(Effect.flatMap(Schema.decodeUnknownEffect(Device)))
      if (!URL.canParse(device.loginUrl) || new URL(device.loginUrl).origin !== origin)
        return yield* Effect.fail(new Error("Freebuff returned an invalid sign-in URL"))

      const query = new URLSearchParams({
        fingerprintId,
        fingerprintHash: device.fingerprintHash,
        expiresAt: String(device.expiresAt),
      })
      const callback = Effect.gen(function* () {
        while (true) {
          const status = yield* request(`/api/auth/cli/status?${query}`)
          if (status.ok) {
            const result = yield* json(status).pipe(Effect.flatMap(Schema.decodeUnknownEffect(Status)))
            if (result.user) {
              return Credential.OAuth.make({
                type: "oauth",
                methodID,
                access: result.user.authToken,
                refresh: result.user.authToken,
                expires: 0,
              })
            }
          } else if (status.status !== 401 && status.status !== 429 && status.status < 500) {
            return yield* Effect.fail(new Error("Freebuff sign-in failed"))
          }
          yield* Effect.sleep("5 seconds")
        }
      }).pipe(Effect.timeout(Math.max(1, Math.min(3_600_000, device.expiresInMs ?? 3_600_000))))

      return {
        mode: "auto" as const,
        url: device.loginUrl,
        instructions: "Finish signing in to Freebuff in your browser.",
        callback,
      }
    }),
} satisfies IntegrationOAuthMethodRegistration

export const FreebuffPlugin = define({
  id: "opencode.provider.freebuff",
  effect: Effect.fn(function* (ctx) {
    yield* ctx.integration.transform((editor) => {
      editor.update(integrationID, (integration) => {
        integration.name = "Freebuff"
      })
      editor.method.update(oauth)
    })
    yield* ctx.provider.transform((editor) => {
      editor.add({
        info: {
          id: providerID,
          name: "Freebuff",
          integrationID,
          activation: "auto",
          package: "@opencode/ai/providers/openai-compatible",
          settings: { baseURL: `${apiOrigin}/api/v1`, provider: "freebuff" },
        },
        models: Array.from(agents.keys(), (id) => ({
          ...Model.Info.default(providerID, Model.ID.make(id)),
          name: id.slice(id.indexOf("/") + 1),
          capabilities: { tools: true, input: ["text"], output: ["text"] },
          limit: { context: 128_000, output: 16_384 },
        })),
      })
    })

    const admission = yield* Semaphore.make(1)
    yield* ctx.session.hook("http.request", (event) =>
      Effect.gen(function* () {
        if (event.request.url !== `${apiOrigin}/api/v1/chat/completions`)
          return yield* Effect.fail(new Error("Unexpected Freebuff inference endpoint"))
        const auth = event.request.headers.get("authorization")
        if (!auth) return yield* Effect.fail(new Error("Connect your Freebuff account before using this model"))
        const body = yield* Effect.tryPromise(() => event.request.clone().text()).pipe(
          Effect.flatMap(Schema.decodeUnknownEffect(Body)),
        )
        const modelID = typeof body.model === "string" ? body.model : ""
        const agentID = agents.get(modelID)
        if (!agentID) return yield* Effect.fail(new Error("Unsupported Freebuff model"))
        const instanceId = yield* admission.withPermit(Effect.gen(function* () {
          const path = "/api/v1/freebuff/session"
          const headers = { Authorization: auth }
          const current = yield* request(path, { headers }, apiOrigin)
          if (current.ok) {
            const session = yield* json(current).pipe(Effect.flatMap(Schema.decodeUnknownEffect(Session)))
            if (session.status === "active") {
              if (session.model === modelID && session.instanceId) return session.instanceId
              return yield* Effect.fail(new Error("A Freebuff session is already active for another model"))
            }
          } else if (current.status !== 404) {
            return yield* Effect.fail(new Error(`Could not check Freebuff session (HTTP ${current.status})`))
          }
          const admitted = yield* request(`${path}/admission`, {
            method: "POST",
            headers: {
              ...headers,
              "x-freebuff-model": modelID,
              "x-freebuff-wallet-spend-limit": "session",
            },
          }, apiOrigin)
          if (!admitted.ok)
            return yield* Effect.fail(new Error(`Freebuff session admission failed (HTTP ${admitted.status})`))
          const session = yield* json(admitted).pipe(Effect.flatMap(Schema.decodeUnknownEffect(Session)))
          if (session.status !== "active" || !session.instanceId || session.model !== modelID)
            return yield* Effect.fail(new Error(`Freebuff did not admit the requested model (${session.status})`))
          return session.instanceId
        }))
        const started = yield* request("/api/v1/agent-runs", {
          method: "POST",
          headers: { Authorization: auth, "Content-Type": "application/json" },
          body: JSON.stringify({ action: "START", agentId: agentID }),
        }, apiOrigin)
        if (!started.ok)
          return yield* Effect.fail(new Error(`Freebuff could not start inference (HTTP ${started.status})`))
        const run = yield* json(started).pipe(Effect.flatMap(Schema.decodeUnknownEffect(Run)))
        event.request = new Request(event.request, {
          redirect: "error",
          body: JSON.stringify({
            ...body,
            codebuff_metadata: {
              run_id: run.runId,
              client_id: event.sessionID,
              cost_mode: "free",
              freebuff_instance_id: instanceId,
            },
          }),
        })
      }).pipe(Effect.orDie), { providerID })
  }),
} satisfies PluginInternal.InternalPlugin)

function request(path: string, init?: RequestInit, baseURL = origin) {
  return Effect.tryPromise({
    try: (signal) => fetch(baseURL + path, { ...init, signal, redirect: "error" }),
    catch: () => new Error("Could not reach Freebuff"),
  }).pipe(Effect.timeout("15 seconds"))
}

function json(response: Response) {
  return Effect.tryPromise({
    try: (): Promise<unknown> => response.json(),
    catch: () => new Error("Freebuff returned an invalid response"),
  })
}
