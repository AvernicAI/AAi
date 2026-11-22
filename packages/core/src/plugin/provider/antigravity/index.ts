import { define } from "@opencode/plugin/effect/plugin"
import { Effect, Option, Schema } from "effect"
import { Antigravity } from "@opencode/schema/antigravity"
import { Agent } from "@opencode/schema/agent"
import { SessionID } from "@opencode/schema/session-id"
import { Model } from "../../../model.js"
import { Provider } from "../../../provider.js"
import { Integration } from "../../../integration.js"
import { FileWrite } from "../../../file-write.js"
import { FileAccess } from "../../../file-access.js"
import { Permission } from "../../../permission.js"
import { Shell } from "../../../shell.js"
import { Location } from "../../../location.js"
import { Environment } from "../../../environment/index.js"
import { EnvironmentUnavailable } from "../../../environment/unavailable.js"
import { ProviderRefresh } from "../refresh.js"
import { AntigravityProtocol } from "./protocol.js"
import { AntigravityHost } from "./host.js"
import { AntigravityModel } from "./model.js"
import type { PluginInternal } from "../../internal.js"

const ID = Provider.ID.make("antigravity")
const PACKAGE = "@opencode/antigravity-agent"
const Saved = Schema.Struct({ id: Schema.String, directory: Schema.String })

export const AntigravityPlugin = define({
  id: "aai.provider.antigravity",
  effect: Effect.fn(function* (ctx) {
    const location = yield* Effect.serviceOption(Location.Service)
    const environment = yield* Effect.serviceOption(Environment.Service)
    if (Option.isSome(location) && location.value.workspaceID !== undefined) return
    if (Option.isSome(environment) && environment.value.spawner === EnvironmentUnavailable.spawner) return
    const permission = yield* Permission.Service
    const shell = yield* Shell.Service
    const write = yield* FileWrite.Service
    const access = yield* FileAccess.Service
    const context = yield* Effect.context<never>()
    const run = Effect.runPromiseWith(context)
    const saved = Schema.decodeUnknownOption(Antigravity.Catalog)(yield* ctx.storage.get("catalog"))
    const state = {
      catalog: Option.getOrElse(
        saved,
        (): Antigravity.Catalog => ({
          installed: !!AntigravityProtocol.executable(),
          connected: false,
          version: "",
          message: "Connect your official Antigravity CLI account, then refresh models.",
          models: [],
        }),
      ),
    }

    yield* ctx.provider.transform((editor) =>
      editor.add({
        info: {
          id: ID,
          integrationID: Integration.ID.make("antigravity"),
          name: "Antigravity Agent",
          activation: "auto",
          package: Provider.aisdk(PACKAGE),
        },
        models: state.catalog.models.map((model) => ({
          ...Model.Info.default(ID, Model.ID.make(model.id)),
          name: model.name,
          family: Model.Family.make(model.id),
          capabilities: { tools: true, input: ["text", "image", "pdf"], output: ["text"] },
          limit: { context: 0, output: 0 },
          cost: [],
          variants: [
            { id: Model.VariantID.make("default"), name: "Review permissions", settings: { mode: "default" } },
            { id: Model.VariantID.make("plan"), name: "Plan", settings: { mode: "plan" } },
            {
              id: Model.VariantID.make("accept-edits"),
              name: "Accept edits (AAi permissions apply)",
              settings: { mode: "accept-edits" },
            },
            { id: Model.VariantID.make("auto"), name: "Auto (AAi permissions apply)", settings: { mode: "auto" } },
          ],
        })),
      }),
    )
    yield* ctx.integration.transform((editor) => {
      editor.update(ID, (integration) => {
        integration.name = "Antigravity Agent"
      })
      editor.method.update({
        integrationID: ID,
        method: { id: "antigravity-login", type: "external", label: "Official Antigravity login (agy acp --login)" },
      })
    })

    const refresh = Effect.fn("Antigravity.refresh")(function* () {
      const discovered = yield* Effect.tryPromise({
        try: () => AntigravityProtocol.discover(ctx.location.directory, AbortSignal.timeout(45_000)),
        catch: (error) => error,
      }).pipe(Effect.result)
      state.catalog =
        discovered._tag === "Success"
          ? {
              installed: true,
              connected: true,
              version: discovered.success.version,
              message: "Official CLI account catalog. Model access and quotas are enforced by Google at execution.",
              models: discovered.success.models.map((model) => ({ id: model.modelId, name: model.name })),
            }
          : {
              installed: !!AntigravityProtocol.executable(),
              connected: false,
              version: "",
              message:
                discovered.failure instanceof Error
                  ? discovered.failure.message
                  : "Antigravity could not connect. Run agy acp --login, then refresh.",
              models: [],
            }
      yield* ctx.storage.set("catalog", state.catalog)
      yield* ctx.provider.reload()
      const connection = yield* ctx.integration.connection.active(ID)
      if (connection)
        yield* ctx.integration.connection.status({
          integrationID: ID,
          connection,
          status: state.catalog.connected ? undefined : { status: "needs_auth", message: state.catalog.message },
        })
      return state.catalog
    })
    yield* ctx.rpc.register(Antigravity.Definition, { refresh: () => refresh() })
    yield* ProviderRefresh.onSwitch(ID, refresh())
    if (AntigravityProtocol.executable() && (yield* ctx.integration.connection.active(ID)))
      yield* refresh().pipe(Effect.forkScoped)

    const dependencies: AntigravityModel.Dependencies = {
      directory: ctx.location.directory,
      host: (headers, signal) =>
        AntigravityHost.create(
          {
            directory: ctx.location.directory,
            permission,
            shell,
            write,
            access,
            run: (effect, signal) => run(effect, { signal }),
          },
          {
            sessionID: headers["x-aai-antigravity-session"]
              ? Schema.decodeUnknownSync(SessionID)(headers["x-aai-antigravity-session"])
              : undefined,
            agent: Agent.ID.make(headers["x-aai-antigravity-agent"] ?? "build"),
            primary: headers["x-aai-antigravity-kind"] === "primary",
            signal,
          },
        ),
      load: async (id) =>
        Option.getOrUndefined(Schema.decodeUnknownOption(Saved)(await run(ctx.storage.get(`session:${id}`)))),
      save: (id, value) => run(ctx.storage.set(`session:${id}`, value)),
    }
    yield* ctx.aisdk.hook(
      "sdk",
      (event) =>
        Effect.sync(() => {
          if (event.package !== PACKAGE) return
          event.sdk = { languageModel: (modelID: string) => new AntigravityModel.Model(modelID, dependencies) }
        }),
      { providerID: ID },
    )
    yield* ctx.session.hook(
      "model.request",
      (event) =>
        Effect.sync(() => {
          event.headers["x-aai-antigravity-session"] = event.sessionID
          event.headers["x-aai-antigravity-agent"] = event.agent
          event.headers["x-aai-antigravity-kind"] = event.kind
        }),
      { providerID: ID },
    )
    yield* ctx.session.hook(
      "retry",
      (event) =>
        Effect.sync(() => {
          event.decision = { retry: false }
        }),
      { providerID: ID },
    )
  }, Effect.orDie),
} satisfies PluginInternal.InternalPlugin)
