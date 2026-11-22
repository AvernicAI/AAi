import { Effect, Schema } from "effect"
import { FetchHttpClient } from "effect/http"
import { define } from "@opencode/plugin/effect/plugin"
import { Devin } from "@opencode/schema/devin"
import { Integration } from "../../integration.js"
import type { PluginInternal } from "../internal.js"

const integrationID = Integration.ID.make("devin")
const resources = {
  sessions: "sessions",
  playbooks: "playbooks",
  knowledge: "knowledge/notes",
  repositories: "repositories",
  automations: "automations",
  usage: "consumption/daily",
}

function target(input: Devin.Request) {
  const root = `https://api.devin.ai/v3/organizations/${input.org}/`
  if (input.action === "list") {
    const url = new URL(resources[input.resource], root)
    if (input.resource !== "usage") {
      url.searchParams.set("first", "25")
      if (input.after) url.searchParams.set("after", input.after)
    }
    return { url, method: "GET" }
  }

  if (input.action === "create")
    return {
      url: new URL("sessions", root),
      method: "POST",
      body: { prompt: input.text, max_acu_limit: input.maxACU, playbook_id: input.playbook },
    }

  const session = `sessions/${input.session}`
  if (input.action === "session") return { url: new URL(session, root), method: "GET" }
  if (input.action === "messages") return { url: new URL(session + "/messages", root), method: "GET" }
  if (input.action === "message")
    return { url: new URL(session + "/messages", root), method: "POST", body: { message: input.text } }

  return { url: new URL(session + "/" + input.action, root), method: "POST" }
}

export const DevinPlugin = define({
  id: "aai.integration.devin",
  effect: Effect.fn(function* (ctx) {
    const outbound = yield* FetchHttpClient.Fetch
    yield* ctx.integration.transform((editor) => {
      editor.update(integrationID, (info) => {
        info.name = "Devin"
      })
      editor.method.update({
        integrationID,
        method: { type: "key", label: "Devin personal access token or service key" },
      })
      editor.method.update({ integrationID, method: { type: "env", names: ["DEVIN_API_KEY"] } })
    })
    yield* ctx.rpc.register(Devin.Definition, {
      request: (input, context) =>
        Effect.gen(function* () {
          const connection = yield* ctx.integration.connection.active(integrationID)
          const value = connection ? yield* ctx.integration.connection.resolve(connection) : undefined

          if (value?.type !== "key" || !value.key.startsWith("cog_"))
            return yield* Effect.fail(
              new Error("Connect a Devin v3 personal access token or service user key under Providers."),
            )

          const request = target(input)
          return yield* Effect.tryPromise({
            try: async (signal) => {
              const response = await outbound(request.url, {
                signal: AbortSignal.any([signal, AbortSignal.timeout(25_000)]),
                method: request.method,
                redirect: "error",
                headers: {
                  authorization: "Bearer " + value.key,
                  accept: "application/json",
                  "content-type": "application/json",
                },
                body: request.body ? JSON.stringify(request.body) : undefined,
              })
              if (!response.ok)
                throw new Error(
                  `Devin returned HTTP ${response.status}. Check the organization, token permissions and account limits.`,
                )
              if (response.status === 204) return { accepted: true }
              const body = await response.text()
              return body ? Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Json))(body) : { accepted: true }
            },
            catch: (error) =>
              error instanceof Error && error.message.startsWith("Devin returned HTTP ")
                ? error
                : new Error(
                    "Could not complete the Devin API request. Check the connection or inspect the session before retrying a write.",
                  ),
          })
        }).pipe(
          Effect.mapError((error) =>
            context.error("failed", "Devin API request failed", {
              message: error instanceof Error ? error.message : "Could not access the Devin credential.",
            }),
          ),
        ),
    })
  }, Effect.orDie),
} satisfies PluginInternal.InternalPlugin)
