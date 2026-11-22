import { expect } from "bun:test"
import { Effect, Schedule } from "effect"
import { FetchHttpClient } from "effect/http"
import { Devin } from "@opencode/schema/devin"
import { Integration } from "@opencode/core/integration"
import { Plugin } from "@opencode/core/plugin"
import { PluginHost } from "@opencode/core/plugin/host"
import { Rpc } from "@opencode/core/rpc"
import { DevinPlugin } from "@opencode/core/plugin/provider/devin"
import { testEffect } from "../lib/effect"
import { PluginTestLayer } from "./fixture"

const it = testEffect(PluginTestLayer)

it.live(
  "Devin uses the selected organization's v3 endpoints with server-side credentials and an explicit session cap",
  () =>
    Effect.gen(function* () {
      const requests: Request[] = []
      const outbound: typeof fetch = Object.assign(
        async (input: string | URL | Request, init?: RequestInit) => {
          const request = input instanceof Request ? new Request(input, init) : new Request(input.toString(), init)
          requests.push(request)
          return Response.json({ session_id: "devin-fixture" })
        },
        { preconnect: () => {} },
      )
      const plugins = yield* Plugin.Service
      const host = yield* PluginHost.make(plugins, "devin-test")
      yield* DevinPlugin.effect(host).pipe(Effect.provideService(FetchHttpClient.Fetch, outbound))
      const integrations = yield* Integration.Service
      const integrationID = Integration.ID.make("devin")
      yield* integrations
        .get(integrationID)
        .pipe(
          Effect.repeat({
            until: (value) => value?.methods.some((method) => method.type === "key") === true,
            schedule: Schedule.spaced("10 millis"),
          }),
          Effect.timeout("5 seconds"),
        )
      const rpc = yield* Rpc.Service
      const client = rpc.client(Devin.Definition)
      const list = { action: "list", org: "org-fixture", resource: "sessions", after: "next+page" } as const
      expect((yield* client.request(list).pipe(Effect.result))._tag).toBe("Failure")
      expect(requests).toHaveLength(0)
      yield* integrations.connection.key({ integrationID, key: "cog_fixture" })
      yield* client.request(list)
      yield* client.request({
        action: "create",
        org: "org-fixture",
        text: "Review fixture syntax",
        maxACU: 2,
        playbook: "playbook-fixture",
      })
      yield* client.request({
        action: "message",
        org: "org-fixture",
        session: "devin-fixture",
        text: "Continue reviewing syntax",
      })

      expect(requests.map((request) => [request.method, request.url, request.redirect])).toEqual([
        ["GET", "https://api.devin.ai/v3/organizations/org-fixture/sessions?first=25&after=next%2Bpage", "error"],
        ["POST", "https://api.devin.ai/v3/organizations/org-fixture/sessions", "error"],
        ["POST", "https://api.devin.ai/v3/organizations/org-fixture/sessions/devin-fixture/messages", "error"],
      ])
      expect(requests.every((request) => request.headers.get("authorization") === "Bearer cog_fixture")).toBe(true)
      expect(yield* Effect.promise(() => requests[1].json())).toEqual({
        prompt: "Review fixture syntax",
        max_acu_limit: 2,
        playbook_id: "playbook-fixture",
      })
      expect(yield* Effect.promise(() => requests[2].json())).toEqual({ message: "Continue reviewing syntax" })
    }),
  30_000,
)
