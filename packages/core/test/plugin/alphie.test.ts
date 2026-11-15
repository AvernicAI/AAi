import { expect } from "bun:test"
import { Effect } from "effect"
import { SystemPart } from "@opencode/ai/effect"
import { Agent } from "@opencode/core/agent"
import { AlphiePlugin } from "@opencode/core/plugin/alphie"
import { Plugin } from "@opencode/core/plugin"
import { PluginHooks } from "@opencode/core/plugin/hooks"
import { PluginHost } from "@opencode/core/plugin/host"
import { Session } from "@opencode/core/session"
import { Model } from "@opencode/schema/model"
import { Provider } from "@opencode/core/provider"
import type { SessionHooks } from "@opencode/plugin/effect/session"
import { testEffect } from "../lib/effect"
import { PluginTestLayer } from "./fixture"

const it = testEffect(PluginTestLayer)

it.effect("Alphie appends personality without replacing the agent system, tools, model or options", () =>
  Effect.gen(function* () {
    const hooks = yield* PluginHooks.Service
    const plugins = yield* Plugin.Service
    const host = yield* PluginHost.make(plugins)
    yield* AlphiePlugin.Plugin.effect(host)
    const input: SessionHooks["context"] = {
      sessionID: Session.ID.make("ses_alphie"),
      agent: Agent.ID.make("build"),
      model: Model.Ref.make({ providerID: Provider.ID.make("test"), id: Model.ID.make("test") }),
      system: [SystemPart.make("Existing project and permission instructions")],
      messages: [],
      tools: { shell: { description: "Existing shell", input: { type: "object" } } },
      options: { temperature: 0.2 },
    }
    const result = yield* hooks.trigger("session", "context", input)
    expect(result.system.map((part) => part.text)).toEqual([
      "Existing project and permission instructions",
      AlphiePlugin.personality,
    ])
    expect(result.tools).toEqual(input.tools)
    expect(result.model).toEqual(input.model)
    expect(result.options).toEqual(input.options)
    const secondary = yield* hooks.trigger("session", "generate", {
      ...input,
      system: [SystemPart.make("Existing side chat constraints")],
    })
    expect(secondary.system.map((part) => part.text)).toEqual([
      "Existing side chat constraints",
      AlphiePlugin.personality,
    ])
    expect(secondary.model).toEqual(input.model)
    expect(secondary.tools).toEqual(input.tools)
  }),
)
