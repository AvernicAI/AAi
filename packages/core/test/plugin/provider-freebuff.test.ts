import { expect } from "bun:test"
import { Effect, Schedule } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http"
import { Agent } from "@opencode/core/agent"
import { Credential } from "@opencode/core/credential"
import { Integration } from "@opencode/core/integration"
import { Model } from "@opencode/core/model"
import { Plugin } from "@opencode/core/plugin"
import { PluginHooks } from "@opencode/core/plugin/hooks"
import { PluginHost } from "@opencode/core/plugin/host"
import { FreebuffPlugin } from "@opencode/core/plugin/provider/freebuff"
import { Provider } from "@opencode/core/provider"
import { Session } from "@opencode/core/session"
import { providerPricing } from "@opencode/util/provider-pricing"
import { testEffect } from "../lib/effect"
import { PluginTestLayer } from "./fixture"

const it = testEffect(PluginTestLayer)
const integrationID = Integration.ID.make("freebuff")
const providerID = Provider.ID.make("freebuff")
const endpoint = "https://freebuff.com/api/v1/paid/chat/completions"
const fixture = Effect.gen(function* () {
  const requests: string[] = []
  const http = HttpClient.make((request) =>
    Effect.gen(function* () {
      const web = yield* HttpClientRequest.toWeb(request).pipe(Effect.orDie)
      requests.push(web.url)
      expect(web.url).toBe("https://freebuff.com/api/v1/paid/models")
      expect(web.headers.get("authorization")).toBe("Bearer paid-test-key")
      return HttpClientResponse.fromWeb(
        request,
        Response.json({
          data: [
            { id: "paid-stream", capabilities: { chat: true, streaming: true, toolCalls: true } },
            { id: "paid-json", capabilities: { chat: true, streaming: false, toolCalls: false } },
            { id: "not-chat", capabilities: { chat: false, streaming: false, toolCalls: false } },
          ],
        }),
      )
    }),
  )
  const plugin = yield* Plugin.Service
  const host = yield* PluginHost.make(plugin)
  yield* FreebuffPlugin.effect(host).pipe(Effect.provideService(HttpClient.HttpClient, http))
  const integrations = yield* Integration.Service
  const credentials = yield* Credential.Service
  const models = yield* Model.Service
  const hooks = yield* PluginHooks.Service
  const available = (expected: string[]) =>
    models.available().pipe(
      Effect.map((items) => items.filter((item) => item.providerID === providerID)),
      Effect.repeat({
        until: (items) => items.map((item) => item.id).join() === expected.join(),
        schedule: Schedule.spaced("10 millis"),
      }),
      Effect.timeout("3 seconds"),
    )
  const event = (id = "paid-json", provider = providerID) => ({
    sessionID: Session.ID.make("ses_freebuff_paid"),
    agent: Agent.ID.make("build"),
    model: Model.Ref.make({ providerID: provider, id: Model.ID.make(id) }),
    kind: "primary" as const,
  })
  return { integrations, credentials, models, hooks, available, event, requests }
})

it.live("FreeBuff exposes only paid API key methods and never enables models with saved OAuth", () =>
  Effect.gen(function* () {
    const target = yield* fixture
    expect((yield* target.integrations.get(integrationID))?.methods).toEqual([
      { type: "key", label: "Paste FreeBuff paid API key" },
      { type: "env", names: ["FREEBUFF_API_KEY"] },
    ])
    const old = yield* target.credentials.create({
      integrationID,
      value: Credential.OAuth.make({
        type: "oauth",
        methodID: Integration.MethodID.make("device"),
        access: "legacy-oauth",
        refresh: "legacy-oauth",
        expires: 0,
      }),
    })
    expect(yield* target.available([])).toEqual([])
    expect(target.requests).toEqual([])
    const result = yield* target.hooks
      .trigger("session", "http.request", {
        ...target.event(),
        request: new Request(endpoint, { method: "POST", body: JSON.stringify({ model: "paid-json" }) }),
      })
      .pipe(Effect.exit)
    expect(result._tag).toBe("Failure")
    expect(String(result)).toContain("paid API key")
    expect(yield* target.credentials.get(old.id)).toBeDefined()
  }),
)

it.live("paid key discovery uses only the paid catalog and removes models when the key is removed", () =>
  Effect.gen(function* () {
    const target = yield* fixture
    yield* target.integrations.connection.key({ integrationID, key: "paid-test-key" })
    const models = yield* target.available(["paid-stream", "paid-json"])
    expect(models.map((item) => item.capabilities.tools)).toEqual([true, false])
    expect(providerPricing("freebuff")).toBe("paid")
    const providers = yield* Provider.Service
    const provider = yield* providers.get(providerID)
    expect(provider?.settings?.baseURL).toBe("https://freebuff.com/api/v1/paid")
    const saved = yield* target.credentials.list(integrationID)
    yield* Effect.forEach(saved, (item) => target.credentials.remove(item.id))
    expect(yield* target.available([])).toEqual([])
  }),
)

it.live("FreeBuff requests reject the old free endpoint and use paid keys without free-session metadata", () =>
  Effect.gen(function* () {
    const target = yield* fixture
    yield* target.integrations.connection.key({ integrationID, key: "paid-test-key" })
    yield* target.available(["paid-stream", "paid-json"])
    const run = (url: string, model: string) =>
      target.hooks.trigger("session", "http.request", {
        ...target.event(model),
        request: new Request(url, {
          method: "POST",
          headers: { authorization: "Bearer old-token" },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: "Hello" }],
            stream: true,
            stream_options: { include_usage: true },
            codebuff_metadata: { cost_mode: "free", freebuff_instance_id: "old-session" },
          }),
        }),
      })
    const result = yield* run(endpoint, "paid-json")
    expect(result.request.url).toBe(endpoint)
    expect(result.request.headers.get("authorization")).toBe("Bearer paid-test-key")
    expect(yield* Effect.promise(() => result.request.json())).toEqual({
      model: "paid-json",
      messages: [{ role: "user", content: "Hello" }],
      stream: false,
    })
    const stream = yield* run(endpoint, "paid-stream")
    expect(yield* Effect.promise(() => stream.request.json())).toMatchObject({ stream: true })
    const old = yield* run("https://codebuff.com/api/v1/chat/completions", "paid-json").pipe(Effect.exit)
    expect(old._tag).toBe("Failure")
    const missing = yield* run(endpoint, "openai/gpt-6-sol").pipe(Effect.exit)
    expect(missing._tag).toBe("Failure")
  }),
)

it.live("paid JSON completions feed the existing stream parser while other providers and HTTP errors stay intact", () =>
  Effect.gen(function* () {
    const target = yield* fixture
    const body = {
      id: "chatcmpl-paid",
      model: "paid-json",
      created: 1,
      choices: [
        {
          index: 0,
          finish_reason: "tool_calls",
          message: {
            role: "assistant",
            content: "Hello",
            tool_calls: [{ id: "call_1", type: "function", function: { name: "shell", arguments: "{}" } }],
          },
        },
      ],
      usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 },
    }
    const response = yield* target.hooks.trigger("session", "http.response", {
      ...target.event(),
      request: new Request(endpoint),
      response: Response.json(body),
    })
    expect(response.response.headers.get("content-type")).toBe("text/event-stream")
    const text = yield* Effect.promise(() => response.response.text())
    expect(text).toContain(
      '"delta":{"tool_calls":[{"id":"call_1","type":"function","function":{"name":"shell","arguments":"{}"},"index":0}],"role":"assistant","content":"Hello"}',
    )
    expect(text).toContain('"total_tokens":15')
    expect(text).toEndWith("data: [DONE]\n\n")
    for (const [provider, status] of [
      [Provider.ID.make("openai"), 200],
      [providerID, 401],
    ] as const) {
      const original = Response.json(body, { status })
      const event = yield* target.hooks.trigger("session", "http.response", {
        ...target.event("paid-json", provider),
        request: new Request(endpoint),
        response: original,
      })
      expect(event.response).toBe(original)
      expect(original.bodyUsed).toBe(false)
    }
  }),
)
