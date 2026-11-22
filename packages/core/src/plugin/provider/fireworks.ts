import path from "node:path"
import { Effect, Option, Schedule, Schema, Stream } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http"
import { define } from "@opencode/plugin/effect/plugin"
import { Fireworks } from "@opencode/schema/fireworks"
import { Bus } from "../../bus.js"
import { Credential } from "../../credential.js"
import { Integration } from "../../integration.js"
import { Model } from "../../model.js"
import { Provider } from "../../provider.js"
import { Session } from "../../session.js"
import { Shell } from "../../shell.js"
import { trainingScript } from "./fireworks-training.js"
import type { PluginInternal } from "../internal.js"

const integrationID = Integration.ID.make("fireworks-ai")
const providerID = Provider.ID.make("fireworks-ai")
const RemoteModel = Schema.Struct({
  name: Schema.String.check(Schema.isPattern(/^accounts\/[a-zA-Z0-9_-]+\/models\/[a-zA-Z0-9._-]+$/)),
  displayName: Schema.optional(Schema.String),
  supportsServerless: Schema.optional(Schema.Boolean),
  supportsTools: Schema.optional(Schema.Boolean),
  supportsImageInput: Schema.optional(Schema.Boolean),
  contextLength: Schema.optional(Schema.Int.check(Schema.isGreaterThan(0))),
  conversationConfig: Schema.optional(Schema.Struct({ style: Schema.optional(Schema.String) })),
  peftDetails: Schema.optional(Schema.Struct({ baseModel: Schema.optional(Schema.String) })),
  deployedModelRefs: Schema.optional(
    Schema.Array(
      Schema.Struct({ deployment: Schema.String, state: Schema.String, default: Schema.optional(Schema.Boolean) }),
    ),
  ),
})
const Catalog = Schema.Struct({
  models: Schema.optional(Schema.Array(RemoteModel)),
  nextPageToken: Schema.optional(Schema.String),
})

export const FireworksPlugin = define({
  id: "opencode.provider.fireworks",
  effect: Effect.fn(function* (ctx) {
    const bus = yield* Bus.Service
    const sessions = yield* Session.Service
    const shell = yield* Shell.Service
    const http = HttpClient.filterStatusOk(yield* HttpClient.HttpClient)
    const loaded = {
      models: [] as readonly (typeof RemoteModel.Type)[],
      account: Option.getOrElse(
        Schema.decodeUnknownOption(Fireworks.Account)(yield* ctx.storage.get("account")),
        () => "fireworks",
      ),
    }
    const key = Effect.fnUntraced(function* () {
      const active = yield* ctx.integration.connection.active(integrationID)
      const value = active ? yield* ctx.integration.connection.resolve(active) : undefined
      return value?.type === "key" ? value.key : undefined
    })
    const request = Effect.fnUntraced(function* (resource: string, pageToken = "") {
      const token = yield* key()
      if (!token) return yield* Effect.fail(new Error("Connect Fireworks AI in Settings > Providers using an API key."))

      return yield* http
        .execute(
          HttpClientRequest.get(`https://api.fireworks.ai/v1/${resource}`).pipe(
            HttpClientRequest.bearerToken(token),
            HttpClientRequest.setUrlParams({ pageSize: "200", ...(pageToken ? { pageToken } : {}) }),
          ),
        )
        .pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(Schema.Json)), Effect.timeout("20 seconds"))
    })
    const catalog = Effect.fnUntraced(function* (account: string) {
      const rows: (typeof RemoteModel.Type)[] = []
      const tokens = new Set<string>()
      const page = Effect.fnUntraced(function* (token = ""): Effect.fn.Return<void, unknown> {
        const response = yield* request(`accounts/${account}/models`, token).pipe(
          Effect.flatMap(Schema.decodeUnknownEffect(Catalog)),
        )
        rows.push(...(response.models ?? []))
        if (!response.nextPageToken) return
        if (tokens.has(response.nextPageToken))
          return yield* Effect.fail(new Error("Fireworks returned a repeated catalog page token."))
        tokens.add(response.nextPageToken)
        yield* page(response.nextPageToken)
      })
      yield* page()
      return rows
    })
    const refresh = Effect.fnUntraced(function* () {
      const connected = !!(yield* key())
      loaded.models = connected
        ? [...(yield* catalog("fireworks")), ...(loaded.account === "fireworks" ? [] : yield* catalog(loaded.account))]
        : []
      yield* ctx.provider.reload()
      return {
        connected,
        models: loaded.models.flatMap(routes).length,
      }
    })

    yield* ctx.integration.transform((editor) => {
      editor.update(integrationID, (integration) => {
        integration.name = "Fireworks AI"
      })
      editor.method.update({ integrationID, method: { type: "key", label: "Paste Fireworks API key" } })
      editor.method.update({ integrationID, method: { type: "env", names: ["FIREWORKS_API_KEY"] } })
    })
    yield* ctx.provider.transform((editor) => {
      // Preserve models.dev's routes, pricing and hand-configured models; enrich or add live serverless chat models.
      if (!editor.get(providerID))
        editor.add({
          info: {
            id: providerID,
            integrationID,
            name: "Fireworks AI",
            activation: "auto",
            package: "@opencode/ai/providers/fireworks",
            settings: { baseURL: "https://api.fireworks.ai/inference/v1" },
          },
          models: [],
        })
      const record = editor.get(providerID)
      if (!record) return
      const models = new Map(record.models)
      loaded.models.flatMap(routes).forEach((item) => {
        const id = Model.ID.make(item.name)
        const existing = editor.get(providerID)?.models.get(id)
        if (existing) return
        models.set(id, {
          ...Model.Info.default(providerID, id),
            // The API does not publish model families. Keep each live model selectable in the client's latest-family view.
            family: Model.Family.make(item.name),
          name: item.displayName || item.name.split("/").at(-1) || item.name,
          capabilities: {
            tools: item.supportsTools ?? false,
            input: item.supportsImageInput ? ["text", "image"] : ["text"],
            output: ["text"],
          },
          limit: { context: item.contextLength ?? 128_000, output: Math.min(16_384, item.contextLength ?? 128_000) },
        })
      })
      editor.models.set(providerID, [...models.values()])
    })

    yield* ctx.rpc
      .register(Fireworks.Definition, {
        refresh: (input, context) =>
          Effect.gen(function* () {
            if (input.account) {
              loaded.account = input.account
              yield* ctx.storage.set("account", input.account)
            }
            return yield* refresh()
          }).pipe(
            Effect.mapError(() =>
              context.error("failed", "Fireworks request failed", {
                message: "Could not refresh Fireworks. Check your API key, permissions and network connection.",
              }),
            ),
          ),
        inventory: (input, context) =>
          request(`accounts/${input.account}/${input.resource}`, input.pageToken).pipe(
            Effect.mapError(() =>
              context.error("failed", "Fireworks request failed", {
                message:
                  "Fireworks rejected the inventory request. Check the account ID, API key permissions and connection.",
              }),
            ),
          ),
        train: (input, context) =>
          Effect.gen(function* () {
            const token = yield* key()
            if (!token) return yield* Effect.fail(new Error("Connect a Fireworks API key first."))
            const session = yield* sessions.get(Session.ID.make(input.sessionID))
            if (
              session.location.directory !== ctx.location.directory ||
              session.location.workspaceID ||
              ctx.location.workspaceID
            )
              return yield* Effect.fail(new Error("Open a local project session to run training."))
            const directory = path.join(ctx.location.directory, ".aai", "fireworks", crypto.randomUUID())
            const script = trainingScript(
              { ...input.training, dataset: path.resolve(ctx.location.directory, input.training.dataset) },
              directory,
            )
            yield* Effect.tryPromise(() => Bun.write(path.join(directory, "train.py"), script))
            const info = yield* shell.create(
              {
                command: "python -u -c \"import os;exec(os.environ['AAI_FIREWORKS_SCRIPT'])\"",
                cwd: ctx.location.directory,
                timeout: 0,
                metadata: { sessionID: session.id, background: true },
              },
              (invocation) =>
                Effect.sync(() => {
                  invocation.env.FIREWORKS_API_KEY = token
                  invocation.env.AAI_FIREWORKS_SCRIPT = script
                }),
            )
            return { shellID: info.id }
          }).pipe(
            Effect.mapError((error) =>
              context.error("failed", "Fireworks request failed", {
                message: error instanceof Error ? error.message : "Could not start training.",
              }),
            ),
          ),
      })
      .pipe(Effect.orDie)
    yield* bus.subscribe(Credential.Event.Updated).pipe(
      Stream.runForEach(() => refresh().pipe(Effect.ignore)),
      Effect.forkScoped({ startImmediately: true }),
    )
    yield* refresh().pipe(Effect.ignore, Effect.repeat(Schedule.spaced("10 minutes")), Effect.forkScoped)
  }),
} satisfies PluginInternal.InternalPlugin)

function routes(item: typeof RemoteModel.Type) {
  if (!item.conversationConfig && !item.peftDetails) return []
  if (item.supportsServerless) return [item]
  return (item.deployedModelRefs ?? [])
    .filter(
      (ref) =>
        ref.default &&
        ["READY", "DEPLOYED_MODEL_STATE_READY"].includes(ref.state) &&
        /^accounts\/[a-zA-Z0-9_-]+\/deployments\/[a-zA-Z0-9_-]+$/.test(ref.deployment),
    )
    .map((ref) => ({
      ...item,
      name: ref.deployment,
      displayName: `${item.displayName || item.name.split("/").at(-1)} · ${ref.deployment.split("/").at(-1)}`,
    }))
}
