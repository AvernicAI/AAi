import { Effect, Option, Schema } from "effect"
import { FetchHttpClient } from "effect/http"
import { define } from "@opencode/plugin/effect/plugin"
import { Form } from "@opencode/schema/form"
import { Money } from "@opencode/schema/money"
import { Integration } from "../../integration.js"
import { IntegrationConnection } from "../../integration/connection.js"
import { Model } from "../../model.js"
import { Provider } from "../../provider.js"
import { SharedCache } from "../../shared-cache.js"
import { activeCredential } from "./credential-settings.js"
import { ProviderRefresh } from "./refresh.js"

const id = "omniroute"
const integrationID = Integration.ID.make(id)
const providerID = Provider.ID.make(id)
const localURL = "http://127.0.0.1:20128/v1"
const packages = {
  chat: "@opencode/ai/providers/openai-compatible",
  image: "@opencode/ai/providers/openai-compatible/images",
  embedding: "@opencode/ai/providers/openai-compatible/embeddings",
}

const Catalog = Schema.fromJsonString(
  Schema.Struct({
    data: Schema.Array(Schema.Unknown),
    has_more: Schema.optional(Schema.Boolean),
    last_id: Schema.optional(Schema.NullOr(Schema.String)),
  }),
)
const decodeCatalog = Schema.decodeUnknownSync(Catalog)
const decodeModel = Schema.decodeUnknownOption(
  Schema.Struct({
    id: Schema.NonEmptyString,
    name: Schema.optional(Schema.String),
    type: Schema.optional(Schema.String),
    context_length: Schema.optional(Schema.NullOr(Schema.Number)),
    max_output_tokens: Schema.optional(Schema.NullOr(Schema.Number)),
    capabilities: Schema.optional(Schema.Unknown),
    pricing: Schema.optional(Schema.Unknown),
  }),
)
const decodeCapabilities = Schema.decodeUnknownOption(
  Schema.Struct({
    tool_calling: Schema.optional(Schema.Boolean),
    vision: Schema.optional(Schema.Boolean),
    temperature: Schema.optional(Schema.Boolean),
  }),
)
const decodePricing = Schema.decodeUnknownOption(Schema.Record(Schema.String, Schema.Unknown))

export const OmniRoutePlugin = define({
  id: "aai.provider.omniroute",
  effect: Effect.fn(function* (ctx) {
    const outbound = yield* FetchHttpClient.Fetch
    const cache = yield* SharedCache.Service

    yield* ctx.integration.transform((editor) => {
      editor.update(integrationID, (item) => {
        item.name = "OmniRoute"
      })
      editor.method.update({ integrationID, method: { type: "env", names: ["OMNIROUTE_API_KEY"] } })
      editor.method.update({
        integrationID,
        method: {
          type: "key",
          label: "OmniRoute gateway key",
          form: Form.Fields.make([
            {
              type: "string",
              key: "baseURL",
              title: "OmniRoute gateway URL",
              description:
                "Use your gateway URL. The local default works when OmniRoute runs on the AAi server's machine.",
              format: "uri",
              default: localURL,
              required: true,
            },
          ]),
        },
      })
    })

    const discovered = yield* ProviderRefresh.start({
      integrationID,
      initial: {} as {
        readonly baseURL?: string
        readonly models?: readonly Model.Info[]
        readonly connection?: Effect.Success<ReturnType<typeof ctx.integration.connection.active>>
      },
      active: ctx.integration.connection.active(integrationID),
      reload: ctx.provider.reload(),
      load: Effect.fn("OmniRoutePlugin.discover")(function* (previous, options) {
        const active = yield* activeCredential(ctx, integrationID)
        const credential = active.credential
        if (credential?.type !== "key") return { connection: active.connection, value: {} }

        const baseURL = gatewayURL(
          active.connection?.type === "env"
            ? (process.env.OMNIROUTE_BASE_URL ?? localURL)
            : (credential.metadata?.baseURL ?? localURL),
        )
        if (!baseURL) return { connection: active.connection, value: {} }

        const sameSource =
          previous.baseURL === baseURL &&
          IntegrationConnection.key(previous.connection) === IntegrationConnection.key(active.connection)
        const models = yield* cache
          .get({
            ...options,
            key: `omniroute:${baseURL}:${SharedCache.fingerprint(credential.key)}`,
            load: loadCatalog(outbound, baseURL, credential.key),
          })
          .pipe(Effect.orElseSucceed(() => (sameSource ? previous.models : undefined)))

        return { connection: active.connection, value: { baseURL, models, connection: active.connection } }
      }),
    })

    yield* ctx.provider.transform((editor) => {
      const loaded = discovered.current
      if (!loaded.baseURL || !loaded.models?.length) return
      const existing = editor.get(providerID)
      editor.add({
        info: {
          ...existing?.provider,
          id: providerID,
          integrationID,
          name: "OmniRoute",
          activation: existing?.provider.activation ?? "auto",
          package: packages.chat,
          settings: { ...existing?.provider.settings, baseURL: loaded.baseURL, provider: id },
        },
        models: loaded.models,
        sourceConnection: loaded.connection,
      })
    })
  }),
})

export function gatewayURL(value: unknown) {
  if (typeof value !== "string" || !URL.canParse(value)) return
  const url = new URL(value)
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) return
  if (url.username || url.password || url.search || url.hash) return
  url.pathname = url.pathname.replace(/\/+$/, "").replace(/(?:\/v1)+$/, "") + "/v1"
  return url.href
}

function loadCatalog(outbound: typeof fetch, baseURL: string, key: string) {
  return Effect.tryPromise({
    try: async (signal) => {
      const url = new URL(baseURL + "/models")
      url.searchParams.set("prefix", "alias")
      const models = new Map<Model.ID, Model.Info>()
      const cursors = new Set<string>()
      const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(15_000)])
      for (;;) {
        const response = await outbound(url, {
          signal: requestSignal,
          redirect: "error",
          headers: { authorization: "Bearer " + key, accept: "application/json" },
        })
        if (!response.ok) throw new Error(`OmniRoute model discovery returned HTTP ${response.status}`)
        const page = decodeCatalog(await response.text())
        for (const item of page.data) {
          const model = catalogModel(item)
          if (model) models.set(model.id, model)
        }
        if (!page.has_more) return [...models.values()]
        if (!page.last_id || cursors.has(page.last_id)) throw new Error("Invalid OmniRoute catalog cursor")
        cursors.add(page.last_id)
        url.searchParams.set("after", page.last_id)
      }
    },
    catch: (cause) => cause,
  })
}

function catalogModel(raw: unknown) {
  const item = Option.getOrUndefined(decodeModel(raw))
  if (!item || item.id.trim() !== item.id || !item.id) return
  const type = item.type ?? "chat"
  if (type !== "chat" && type !== "image" && type !== "embedding") return

  const id = Model.ID.make(item.id)
  const defaults = Model.Info.default(providerID, id)
  const capabilities = Option.getOrUndefined(decodeCapabilities(item.capabilities))
  const pricing = Option.getOrUndefined(decodePricing(item.pricing))
  return Model.Info.make({
    ...defaults,
    name: item.name || (item.id === "auto" ? "Auto-Combo" : item.id),
    type,
    package: packages[type],
    capabilities: {
      tools: type === "chat" && (capabilities?.tool_calling ?? true),
      input: capabilities?.vision ? ["text", "image"] : ["text"],
      output: type === "image" ? ["image"] : type === "embedding" ? ["embedding"] : ["text"],
      temperature: capabilities?.temperature,
    },
    limit: {
      context: item.context_length && item.context_length > 0 ? Math.trunc(item.context_length) : 0,
      output: item.max_output_tokens && item.max_output_tokens > 0 ? Math.trunc(item.max_output_tokens) : 0,
    },
    ...(pricing
      ? {
          cost: [
            {
              input: price(pricing.prompt, pricing.input),
              output: price(pricing.completion, pricing.output),
              cache: {
                read: price(pricing.input_cache_read, pricing.cached),
                write: price(pricing.input_cache_write, pricing.cache_creation),
              },
            },
          ],
        }
      : {}),
  })
}

function price(perToken: unknown, perMillion: unknown) {
  const value = typeof perToken === "string" ? Number(perToken) * 1_000_000 : perMillion
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Money.USDPerMillionTokens.make(value)
    : Money.USDPerMillionTokens.zero
}
