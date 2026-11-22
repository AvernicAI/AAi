import { expect } from "bun:test"
import { Effect, Schedule } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http"
import { Integration } from "@opencode/core/integration"
import { Credential } from "@opencode/core/credential"
import { Model } from "@opencode/core/model"
import { Plugin } from "@opencode/core/plugin"
import { PluginHost } from "@opencode/core/plugin/host"
import { FireworksPlugin } from "@opencode/core/plugin/provider/fireworks"
import { Rpc } from "@opencode/core/rpc"
import { Fireworks } from "@opencode/schema/fireworks"
import { testEffect } from "../lib/effect"
import { PluginTestLayer } from "./fixture"

const it = testEffect(PluginTestLayer)
const integrationID = Integration.ID.make("fireworks-ai")

it.live("Fireworks discovers paginated serverless chat models with authoritative tool and vision capabilities", () =>
  Effect.gen(function* () {
    const calls: string[] = []
    const client = HttpClient.make((request) =>
      Effect.gen(function* () {
        const web = yield* HttpClientRequest.toWeb(request).pipe(Effect.orDie)
        const url = new URL(web.url)
        expect(url.origin).toBe("https://api.fireworks.ai")
        expect(web.headers.get("authorization")).toBe("Bearer fixture-key")
        if (url.pathname === "/v1/accounts/my-account/models")
          return HttpClientResponse.fromWeb(
            request,
            Response.json({
              models: [
                {
                  name: "accounts/my-account/models/trained",
                  displayName: "My trained model",
                  peftDetails: { baseModel: "accounts/fireworks/models/coder" },
                  deployedModelRefs: [
                    { deployment: "accounts/my-account/deployments/trained", state: "READY", default: true },
                  ],
                },
              ],
            }),
          )
        expect(url.pathname).toBe("/v1/accounts/fireworks/models")
        calls.push(url.searchParams.get("pageToken") ?? "")
        return HttpClientResponse.fromWeb(
          request,
          Response.json(
            url.searchParams.has("pageToken")
              ? {
                  models: [
                    {
                      name: "accounts/fireworks/models/vision",
                      supportsServerless: true,
                      conversationConfig: {},
                      supportsImageInput: true,
                      contextLength: 256000,
                    },
                  ],
                }
              : {
                  models: [
                    {
                      name: "accounts/fireworks/models/coder",
                      displayName: "Coder",
                      supportsServerless: true,
                      supportsTools: true,
                      conversationConfig: {},
                      contextLength: 128000,
                    },
                    { name: "accounts/fireworks/models/dedicated", supportsServerless: false, conversationConfig: {} },
                    { name: "accounts/fireworks/models/embedding", supportsServerless: true },
                  ],
                  nextPageToken: "page-two",
                },
          ),
        )
      }),
    )
    const plugins = yield* Plugin.Service
    const host = yield* PluginHost.make(plugins, "fireworks-test")
    yield* FireworksPlugin.effect(host).pipe(Effect.provideService(HttpClient.HttpClient, client))
    const integrations = yield* Integration.Service
    expect((yield* integrations.get(integrationID))?.methods).toContainEqual({
      type: "env",
      names: ["FIREWORKS_API_KEY"],
    })
    yield* integrations.connection.key({ integrationID, key: "fixture-key" })
    const rpc = yield* Rpc.Service
    const refreshed = yield* rpc.client(Fireworks.Definition).refresh({})
    expect(refreshed).toEqual({ connected: true, models: 2 })
    const models = yield* Model.Service
    const visible = yield* models.available().pipe(
      Effect.map((items) => items.filter((item) => item.providerID === "fireworks-ai")),
      Effect.repeat({ until: (items) => items.length === 2, schedule: Schedule.spaced("10 millis") }),
      Effect.timeout("3 seconds"),
    )
    expect(visible.map((item) => String(item.id))).toEqual([
      "accounts/fireworks/models/coder",
      "accounts/fireworks/models/vision",
    ])
    expect(visible[0].capabilities.tools).toBe(true)
    expect(visible[0].family).toBe(Model.Family.make("accounts/fireworks/models/coder"))
    expect(visible[1].family).toBe(Model.Family.make("accounts/fireworks/models/vision"))
    expect(visible[1].capabilities.input).toEqual(["text", "image"])
    expect(visible[1].capabilities.tools).toBe(false)
    expect(calls).toContain("page-two")
    expect(yield* rpc.client(Fireworks.Definition).refresh({ account: "my-account" })).toEqual({
      connected: true,
      models: 3,
    })
    const deployed = yield* models.available().pipe(
      Effect.map((items) => items.find((item) => item.id === "accounts/my-account/deployments/trained")),
      Effect.repeat({ until: (item) => !!item, schedule: Schedule.spaced("10 millis") }),
      Effect.timeout("3 seconds"),
    )
    expect(deployed?.name).toBe("My trained model · trained")
    const credentials = yield* Credential.Service
    yield* Effect.forEach(yield* credentials.list(integrationID), (saved) => credentials.remove(saved.id))
    expect(yield* rpc.client(Fireworks.Definition).refresh({})).toEqual({ connected: false, models: 0 })
  }),
)
