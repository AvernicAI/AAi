import { expect } from "bun:test"
import { Effect } from "effect"
import { OpenAICompatibilityPlugin } from "../../src/plugin/provider/openai-compatibility"
import { Plugin } from "@opencode/core/plugin"
import { PluginHost } from "@opencode/core/plugin/host"
import { PluginHooks } from "@opencode/core/plugin/hooks"
import { Model } from "@opencode/core/model"
import { Provider } from "@opencode/core/provider"
import { Session } from "@opencode/core/session"
import { Agent } from "@opencode/core/agent"
import { PluginTestLayer } from "./fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(PluginTestLayer)
for (const row of [
  { id: "aai-compatible-local", noAuth: true, header: null },
  { id: "aai-compatible-hosted", noAuth: false, header: "Bearer fixture-key" },
  { id: "openai", noAuth: true, header: "Bearer fixture-key" },
]) {
  it.live(`compatible endpoint auth for ${row.id}`, () =>
    Effect.gen(function* () {
      const plugin = yield* Plugin.Service
      const host = yield* PluginHost.make(plugin)
      const providerID = Provider.ID.make(row.id)
      yield* host.provider.transform((editor) =>
        editor.add({
          info: {
            id: providerID,
            name: row.id,
            package: "@opencode/ai/providers/openai-compatible",
            activation: "enabled",
            settings: { aaiNoAuth: row.noAuth },
          },
          models: [],
        }),
      )
      yield* OpenAICompatibilityPlugin.effect(host)
      const hooks = yield* PluginHooks.Service
      const result = yield* hooks.trigger("session", "http.request", {
        sessionID: Session.ID.make("ses_compatible"),
        agent: Agent.ID.make("build"),
        kind: "primary",
        model: Model.Ref.make({ providerID, id: Model.ID.make("fixture") }),
        request: new Request("http://127.0.0.1:1234/v1/chat/completions", {
          headers: { authorization: "Bearer fixture-key", "x-retain": "yes" },
        }),
      })
      expect(result.request.headers.get("authorization")).toBe(row.header)
      expect(result.request.headers.get("x-retain")).toBe("yes")
    }),
  )
}
