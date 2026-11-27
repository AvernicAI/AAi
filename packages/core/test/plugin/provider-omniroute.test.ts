import { expect, test } from "bun:test"
import { ai } from "@opencode/ai/effect"
import { LLMClient, RequestExecutor } from "@opencode/ai/route"
import { Effect, Layer, Schedule, Stream } from "effect"
import { Integration } from "@opencode/core/integration"
import { Model } from "@opencode/core/model"
import { ModelResolver } from "@opencode/core/model-resolver"
import { Plugin } from "@opencode/core/plugin"
import { PluginHost } from "@opencode/core/plugin/host"
import { gatewayURL, OmniRoutePlugin } from "@opencode/core/plugin/provider/omniroute"
import { Provider } from "@opencode/core/provider"
import { withEnv } from "../fixture/env"
import { testEffect } from "../lib/effect"
import { PluginTestLayer } from "./fixture"

const it = testEffect(PluginTestLayer)
const integrationID = Integration.ID.make("omniroute")
const providerID = Provider.ID.make("omniroute")

test("normalizes OmniRoute base URLs and limits cleartext keys to loopback", () => {
  expect(gatewayURL("http://localhost:20128")).toBe("http://localhost:20128/v1")
  expect(gatewayURL("https://gateway.example/proxy/v1/v1///")).toBe("https://gateway.example/proxy/v1")
  expect(gatewayURL("https://key@gateway.example/v1")).toBeUndefined()
  expect(gatewayURL("https://gateway.example/v1?token=key")).toBeUndefined()
  expect(gatewayURL("http://gateway.example/v1")).toBeUndefined()
})

it.live("discovers the active key's chat, routing, image and embedding models through the native provider", () =>
  withEnv({ OMNIROUTE_API_KEY: undefined }, () =>
    Effect.gen(function* () {
      const seen: { key: string | null; path: string; after: string | null; prefix: string | null }[] = []
      const chat: { key: string | null; body: unknown }[] = []
      const server = yield* Effect.acquireRelease(
        Effect.sync(() =>
          Bun.serve({
            hostname: "127.0.0.1",
            port: 0,
            async fetch(request) {
              const url = new URL(request.url)
              const key = request.headers.get("authorization")
              if (url.pathname === "/proxy/v1/chat/completions") {
                chat.push({ key, body: await request.json() })
                return new Response(
                  'data: {"id":"chatcmpl-fixture","model":"auto","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
                  { headers: { "content-type": "text/event-stream" } },
                )
              }
              const after = url.searchParams.get("after")
              seen.push({ key, path: url.pathname, after, prefix: url.searchParams.get("prefix") })
              if (key === "Bearer second") return Response.json({ data: [{ id: "second/combo" }] })
              if (key !== "Bearer first") return new Response(null, { status: 401 })
              if (after === "auto")
                return Response.json({
                  data: [
                    { id: "img/model", type: "image" },
                    { id: "embed/model", type: "embedding" },
                  ],
                })
              return Response.json({
                data: [
                  {
                    id: "provider/model",
                    context_length: 200000,
                    max_output_tokens: 16000,
                    capabilities: { tool_calling: true, vision: true, temperature: false },
                    pricing: { prompt: "0.000001", output: 2 },
                  },
                  { id: "auto" },
                  { id: "rerank/model", type: "rerank" },
                  { id: "" },
                ],
                has_more: true,
                last_id: "auto",
              })
            },
          }),
        ),
        (server) => Effect.promise(() => server.stop(true)),
      )
      const plugins = yield* Plugin.Service
      const host = yield* PluginHost.make(plugins, "test")
      yield* OmniRoutePlugin.effect(host)
      const integrations = yield* Integration.Service
      const providers = yield* Provider.Service
      const models = yield* Model.Service
      const inventory = models
        .available(["chat", "image", "embedding"])
        .pipe(Effect.map((items) => items.filter((model) => model.providerID === providerID)))
      expect((yield* integrations.get(integrationID))?.name).toBe("OmniRoute")
      expect(yield* providers.get(providerID)).toBeUndefined()

      yield* integrations.connection.key({
        integrationID,
        key: "first",
        answer: { baseURL: server.url.origin + "/proxy" },
      })
      const published = yield* inventory.pipe(
        Effect.filterOrFail(
          (items) => items.length === 4,
          () => new Error("OmniRoute models have not loaded"),
        ),
        Effect.retry(Schedule.spaced("20 millis")),
        Effect.timeout("8 seconds"),
        Effect.mapError(() => new Error(`OmniRoute catalog did not load. Gateway requests: ${JSON.stringify(seen)}`)),
      )
      expect(seen).toEqual([
        { key: "Bearer first", path: "/proxy/v1/models", after: null, prefix: "alias" },
        { key: "Bearer first", path: "/proxy/v1/models", after: "auto", prefix: "alias" },
      ])
      expect((yield* providers.get(providerID))?.settings).toMatchObject({ baseURL: server.url.origin + "/proxy/v1" })
      expect((yield* providers.get(providerID))?.settings?.apiKey).toBeUndefined()
      expect(published.find((model) => model.id === "provider/model")).toMatchObject({
        modelID: "provider/model",
        capabilities: { tools: true, input: ["text", "image"], temperature: false },
        limit: { context: 200000, output: 16000 },
        cost: [{ input: 1, output: 2 }],
      })
      expect(published.find((model) => model.id === "auto")?.name).toBe("Auto-Combo")
      expect(published.find((model) => model.id === "img/model")?.type).toBe("image")
      expect(published.find((model) => model.id === "embed/model")?.type).toBe("embedding")

      const resolved = yield* Effect.gen(function* () {
        const resolver = yield* ModelResolver.Service
        return yield* resolver.resolve({ providerID, id: Model.ID.make("auto") })
      }).pipe(Effect.provide(ModelResolver.layer))
      if (!resolved) return yield* Effect.fail(new Error("OmniRoute routing combo did not resolve"))
      yield* LLMClient.stream(ai.request({ model: resolved.model, prompt: "Hello" })).pipe(
        Stream.runDrain,
        Effect.provide(LLMClient.layer.pipe(Layer.provide(RequestExecutor.layer))),
      )
      expect(chat).toEqual([{ key: "Bearer first", body: expect.objectContaining({ model: "auto", stream: true }) }])

      yield* integrations.connection.key({
        integrationID,
        key: "second",
        answer: { baseURL: server.url.origin },
      })
      const switched = yield* inventory.pipe(
        Effect.filterOrFail(
          (items) => items.some((model) => model.id === "second/combo"),
          () => new Error("Key not switched"),
        ),
        Effect.retry(Schedule.spaced("20 millis")),
        Effect.timeout("8 seconds"),
      )
      expect(switched.map((model) => model.id)).toEqual([Model.ID.make("second/combo")])
      expect((yield* providers.get(providerID))?.settings?.baseURL).toBe(server.url.origin + "/v1")
    }),
  ),
)
