import { define } from "@opencode/plugin/effect/plugin"
import { Effect, Schedule, Schema, Stream } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http"
import { Bus } from "../../bus.js"
import { Credential } from "../../credential.js"
import { Integration } from "../../integration.js"
import { Model } from "../../model.js"
import { Provider } from "../../provider.js"
import type { PluginInternal } from "../internal.js"

const baseURL = "https://freebuff.com/api/v1/paid"
const integrationID = Integration.ID.make("freebuff")
const providerID = Provider.ID.make("freebuff")
const RemoteModel = Schema.Struct({
  id: Schema.NonEmptyString,
  name: Schema.optional(Schema.String),
  context_length: Schema.optional(Schema.Int.check(Schema.isGreaterThan(0))),
  max_output_tokens: Schema.optional(Schema.Int.check(Schema.isGreaterThan(0))),
  capabilities: Schema.Struct({ chat: Schema.Boolean, streaming: Schema.Boolean, toolCalls: Schema.Boolean }),
})
const Catalog = Schema.Struct({ data: Schema.Array(RemoteModel) })
const Body = Schema.fromJsonString(Schema.Record(Schema.String, Schema.Json))
const Completion = Schema.Struct({
  id: Schema.NonEmptyString,
  created: Schema.optional(Schema.Finite),
  model: Schema.optional(Schema.String),
  choices: Schema.Array(
    Schema.Struct({
      index: Schema.Int,
      finish_reason: Schema.NullOr(Schema.String),
      message: Schema.StructWithRest(
        Schema.Struct({
          tool_calls: Schema.optional(
            Schema.Array(
              Schema.Struct({
                id: Schema.String,
                type: Schema.Literal("function"),
                function: Schema.Struct({ name: Schema.String, arguments: Schema.String }),
              }),
            ),
          ),
        }),
        [Schema.Record(Schema.String, Schema.Json)],
      ),
    }),
  ),
  usage: Schema.optional(Schema.Record(Schema.String, Schema.Json)),
})

export const FreebuffPlugin = define({
  id: "opencode.provider.freebuff",
  effect: Effect.fn(function* (ctx) {
    const bus = yield* Bus.Service
    const http = HttpClient.filterStatusOk(yield* HttpClient.HttpClient)
    const loaded = new Map<string, typeof RemoteModel.Type>()
    const credential = Effect.fnUntraced(function* () {
      const connection = yield* ctx.integration.connection.active(integrationID)
      if (!connection) return undefined
      const value = yield* ctx.integration.connection.resolve(connection).pipe(Effect.orElseSucceed(() => undefined))
      // Legacy device/OAuth credentials must never unlock this paid-only provider.
      return value?.type === "key" ? value.key : undefined
    })

    yield* ctx.integration.transform((editor) => {
      editor.update(integrationID, (integration) => {
        integration.name = "FreeBuff (Paid API)"
      })
      editor.method
        .list(integrationID)
        .filter((method) => method.type === "oauth")
        .forEach((method) => editor.method.remove(integrationID, method))
      editor.method.update({ integrationID, method: { type: "key", label: "Paste FreeBuff paid API key" } })
      editor.method.update({ integrationID, method: { type: "env", names: ["FREEBUFF_API_KEY"] } })
    })
    yield* ctx.provider.transform((editor) =>
      editor.add({
        info: {
          id: providerID,
          name: "FreeBuff (Paid API)",
          integrationID,
          activation: "auto",
          package: "@opencode/ai/providers/openai-compatible",
          settings: { baseURL, provider: "freebuff" },
        },
        models: [...loaded.values()].map((item) => ({
          ...Model.Info.default(providerID, Model.ID.make(item.id)),
          name: item.name ?? item.id,
          capabilities: { tools: item.capabilities.toolCalls, input: ["text"], output: ["text"] },
          limit: { context: item.context_length ?? 128_000, output: item.max_output_tokens ?? 16_384 },
        })),
      }),
    )

    const load = Effect.fn("Freebuff.loadPaidModels")(function* () {
      const key = yield* credential()
      const models = key
        ? yield* http
            .execute(
              HttpClientRequest.get(`${baseURL}/models`).pipe(
                HttpClientRequest.bearerToken(key),
                HttpClientRequest.acceptJson,
              ),
            )
            .pipe(
              Effect.flatMap(HttpClientResponse.schemaBodyJson(Catalog)),
              Effect.map((catalog) => catalog.data.filter((item) => item.capabilities.chat)),
              Effect.timeout("10 seconds"),
              Effect.catch((cause) =>
                Effect.logWarning("Could not load FreeBuff paid models", { cause }).pipe(Effect.as([])),
              ),
            )
        : []
      loaded.clear()
      models.forEach((item) => loaded.set(item.id, item))
      yield* ctx.provider.reload()
    })
    yield* bus.subscribe(Credential.Event.Updated).pipe(
      Stream.runForEach(() => load()),
      Effect.forkScoped({ startImmediately: true }),
    )
    yield* load().pipe(Effect.repeat(Schedule.spaced("10 minutes")), Effect.forkScoped)

    yield* ctx.session.hook(
      "http.request",
      (event) =>
        Effect.gen(function* () {
          if (event.request.url !== `${baseURL}/chat/completions`)
            return yield* Effect.die(new Error("FreeBuff models require the paid API endpoint"))
          const key = yield* credential()
          if (!key) return yield* Effect.die(new Error("Connect a FreeBuff paid API key to use these models"))
          const body = {
            ...(yield* Effect.tryPromise(() => event.request.clone().text()).pipe(
              Effect.flatMap(Schema.decodeUnknownEffect(Body)),
              Effect.orDie,
            )),
          }
          const model = typeof body.model === "string" ? loaded.get(body.model) : undefined
          if (!model) return yield* Effect.die(new Error("This model is not in FreeBuff's paid API catalog"))
          body.stream = model.capabilities.streaming
          if (!body.stream) delete body.stream_options
          delete body.codebuff_metadata
          const headers = new Headers(event.request.headers)
          headers.set("authorization", `Bearer ${key}`)
          event.request = new Request(event.request, { headers, redirect: "error", body: JSON.stringify(body) })
        }),
      { providerID },
    )

    // Most paid models currently return a complete JSON response. Adapt only this provider's reply
    // to the existing OpenAI stream parser; the agent loop and all other providers stay unchanged.
    yield* ctx.session.hook(
      "http.response",
      (event) =>
        Effect.gen(function* () {
          if (!event.response.ok || !event.response.headers.get("content-type")?.includes("application/json")) return
          const body = yield* Effect.tryPromise(() => event.response.json()).pipe(
            Effect.flatMap(Schema.decodeUnknownEffect(Completion)),
            Effect.orDie,
          )
          const chunk = {
            ...body,
            object: "chat.completion.chunk",
            choices: body.choices.map((choice) => ({
              index: choice.index,
              finish_reason: choice.finish_reason,
              delta: {
                ...choice.message,
                ...(choice.message.tool_calls
                  ? { tool_calls: choice.message.tool_calls.map((call, index) => ({ ...call, index })) }
                  : {}),
              },
            })),
          }
          event.response = new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, {
            headers: { "content-type": "text/event-stream" },
          })
        }),
      { providerID },
    )
  }),
} satisfies PluginInternal.InternalPlugin)
