import { define } from "@opencode/plugin/effect/plugin"
import { Duration, Effect, Schedule, Schema, Stream } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http"
import { App } from "../../app.js"
import { Bus } from "../../bus.js"
import { Config } from "../../config.js"
import { Credential } from "../../credential.js"
import { Integration } from "../../integration.js"
import { Model } from "../../model.js"
import { Provider } from "../../provider.js"
import type { PluginInternal } from "../internal.js"
import { foldSettings } from "./configured.js"

const providerID = Provider.ID.make("avernicai")
const integrationID = Integration.ID.make("avernicai")
const providerName = "AvernicAi"
const providerPackage = "@opencode/ai/providers/openai-compatible"
const defaultBaseURL = "https://api.avernic.ai/v1"
const envNames = ["AVERNICAI_API_KEY", "AVERNIC_AI_API_KEY"]
const defaultContext = 128_000
const defaultOutput = 16_384

// AvernicAi is an optional OpenAI-compatible provider. It stays hidden until the user supplies a key,
// so OpenCode's own catalog and Zen/Go providers remain the default experience.
const RemoteModel = Schema.Struct({
  id: Schema.NonEmptyString,
  name: Schema.optional(Schema.String),
  created: Schema.optional(Schema.Finite),
  context_length: Schema.optional(Schema.Finite),
  max_context_length: Schema.optional(Schema.Finite),
  context_window: Schema.optional(Schema.Finite),
  max_model_len: Schema.optional(Schema.Finite),
})
const RemoteModels = Schema.Union([Schema.Struct({ data: Schema.Array(RemoteModel) }), Schema.Array(RemoteModel)])

export const AvernicAIPlugin = define({
  id: "opencode.provider.avernicai",
  effect: Effect.fn(function* (ctx) {
    const config = yield* Config.Service
    const bus = yield* Bus.Service
    const http = HttpClient.filterStatusOk(yield* HttpClient.HttpClient)
    const loaded: { baseURL: string; models: readonly Model.Info[] } = { baseURL: defaultBaseURL, models: [] }

    const baseURL = Effect.fnUntraced(function* () {
      const settings = foldSettings(yield* config.entries(), providerID, undefined)
      const configured = typeof settings?.baseURL === "string" ? settings.baseURL : undefined
      return normalizeBaseURL(process.env.AVERNICAI_BASE_URL ?? configured ?? defaultBaseURL)
    })

    const discover = Effect.fn("AvernicAIPlugin.discover")(function* (baseURL: string) {
      const connection = yield* ctx.integration.connection.active(integrationID)
      if (!connection) return []
      const credential = yield* ctx.integration.connection
        .resolve(connection)
        .pipe(Effect.orElseSucceed(() => undefined))
      const token =
        credential?.type === "key" ? credential.key : credential?.type === "oauth" ? credential.access : undefined
      if (!token) return []
      const response = yield* http
        .execute(
          HttpClientRequest.get(`${baseURL}/models`).pipe(
            HttpClientRequest.bearerToken(token),
            HttpClientRequest.acceptJson,
            HttpClientRequest.setHeader("User-Agent", App.useragent(ctx.app)),
          ),
        )
        .pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(RemoteModels)), Effect.timeout("10 seconds"))
      return ("data" in response ? response.data : response).map(model)
    })

    const load = Effect.fn("AvernicAIPlugin.load")(function* () {
      const next = yield* baseURL()
      const models = yield* discover(next).pipe(
        Effect.catch((cause) =>
          Effect.logWarning("failed to sync AvernicAi models", { cause }).pipe(Effect.as(undefined)),
        ),
      )
      if (!models) return
      if (next === loaded.baseURL && JSON.stringify(models) === JSON.stringify(loaded.models)) return
      loaded.baseURL = next
      loaded.models = models
      yield* ctx.integration.reload()
      yield* ctx.provider.reload()
    })

    yield* ctx.integration.transform((integrations) => {
      integrations.update(integrationID, (integration) => {
        integration.name = providerName
      })
      integrations.method.update({ integrationID, method: { type: "key", label: "Paste AvernicAi API key" } })
      integrations.method.update({ integrationID, method: { type: "env", names: envNames } })
    })

    yield* ctx.provider.transform((providers) => {
      if (loaded.models.length === 0) return
      providers.add({
        info: {
          id: providerID,
          name: providerName,
          activation: "auto",
          integrationID,
          package: providerPackage,
          settings: { baseURL: loaded.baseURL, provider: "avernicai" },
        },
        models: loaded.models,
      })
    })

    yield* bus.subscribe(Credential.Event.Updated).pipe(
      Stream.runForEach(() => load()),
      Effect.forkScoped({ startImmediately: true }),
    )
    yield* ctx.event.subscribe().pipe(
      Stream.filter((event) => event.type === "config.updated"),
      Stream.runForEach(() => load()),
      Effect.forkScoped({ startImmediately: true }),
    )
    yield* load().pipe(Effect.repeat(Schedule.spaced(Duration.minutes(10))), Effect.forkScoped)
  }),
} satisfies PluginInternal.InternalPlugin)

function model(item: typeof RemoteModel.Type): Model.Info {
  const context =
    [item.context_length, item.max_context_length, item.context_window, item.max_model_len].find(
      (value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0,
    ) ?? defaultContext
  return {
    ...Model.Info.default(providerID, Model.ID.make(item.id)),
    name: item.name?.trim() || item.id,
    time: { released: item.created === undefined ? 0 : item.created * 1000 },
    capabilities: { tools: true, input: ["text"], output: ["text"] },
    limit: { context, output: Math.min(defaultOutput, context) },
  }
}

function normalizeBaseURL(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "")
  if (!URL.canParse(trimmed)) return defaultBaseURL
  const url = new URL(trimmed)
  if (url.protocol !== "http:" && url.protocol !== "https:") return defaultBaseURL
  return trimmed
}
