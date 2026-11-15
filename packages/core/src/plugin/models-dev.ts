import { define } from "@opencode/plugin/effect/plugin"
import { Integration } from "@opencode/schema/integration"
import { Provider } from "@opencode/schema/provider"
import { Effect, Stream } from "effect"
import { Bus } from "../bus.js"
import { Model } from "../model.js"
import { ModelsDev } from "../models-dev.js"
import { Money } from "@opencode/schema/money"

// These catalog entries require inference profiles on Bedrock Runtime.
// Opus/Sonnet 4.6 and Opus 5.5 support in-region calls in eu-west-2 and must remain available.
const BEDROCK_PROFILE_ONLY_IDS = [
  "amazon.nova-2-lite-v1:0",
  "anthropic.claude-fable-5",
  "anthropic.claude-fable-5-1",
  "anthropic.claude-haiku-4-5-20251001-v1:0",
  "anthropic.claude-haiku-5-5",
  "anthropic.claude-opus-4-1-20250805-v1:0",
  "anthropic.claude-opus-4-5-20251101-v1:0",
  "anthropic.claude-opus-4-7",
  "anthropic.claude-opus-4-8",
  "anthropic.claude-opus-5",
  "anthropic.claude-sonnet-4-5-20250929-v1:0",
  "anthropic.claude-sonnet-5",
  "anthropic.claude-sonnet-5-5",
  "deepseek.r1-v1:0",
  "meta.llama4-maverick-17b-instruct-v1:0",
  "meta.llama4-scout-17b-instruct-v1:0",
  "mistral.pixtral-large-2502-v1:0",
  "writer.palmyra-x4-v1:0",
  "writer.palmyra-x5-v1:0",
]

type CompatibleModel = {
  id: string
  name?: string
  context: number
  output?: number
  tools?: boolean
  input?: readonly string[]
  cost?: { input: number; output: number }
  body?: Record<string, string | number | boolean>
}

type CompatibleProvider = {
  id: string
  name: string
  base: string
  /** Variables treated as API keys. Omitted for endpoints that need no credential. */
  env?: string
  headers?: Record<string, string>
  body?: Record<string, string | number | boolean>
  models: readonly CompatibleModel[]
}

// Extra OpenAI-compatible chat providers absent from the bundled models.dev catalog.
// Model IDs, endpoints, and prices come from provider docs or their public model lists.
// Providers whose docs do not publish exact model IDs stay out rather than guessing.
const compatible: readonly CompatibleProvider[] = [
  { id: "opentyphoon", name: "OpenTyphoon", base: "https://api.opentyphoon.ai/v1", env: "OPENTYPHOON_API_KEY", models: [
    { id: "typhoon-v2.5-30b-a3b-instruct", context: 128000, tools: true },
    { id: "typhoon-v2.1-12b-instruct", context: 56000, tools: true },
  ] }, // https://docs.opentyphoon.ai/en/models/
  { id: "simplellm", name: "SimpleLLM", base: "https://api.simplellm.eu/v1", env: "SIMPLELLM_API_KEY", models: [
    { id: "free-gemma-4-E4B", context: 50000, tools: false },
  ] }, // https://simplellm.eu/docs/models.html
  { id: "freeinference", name: "FreeInference", base: "https://freeinference.org/v1", env: "FREEINFERENCE_API_KEY", models: [
    { id: "glm-5.3-flash", context: 1000000, tools: true },
    { id: "deepseek-v4-flash", context: 1000000, tools: true },
    { id: "qwen3.6-35b", context: 262000, tools: true },
  ] }, // https://doc.freeinference.org/models
  { id: "token-harbor", name: "Token Harbor", base: "https://tokenharbor.ai/v1", env: "TOKENHARBOR_API_KEY", models: [
    { id: "mimo-v2.6-flash:free", context: 1048576, tools: false },
  ] }, // https://tokenharbor.ai/models/mimo-v2.6-flash:free
  { id: "novai", name: "NovAI", base: "https://aiapi-pro.com/v1", env: "NOVAI_API_KEY", models: [
    { id: "glm-4.6v-flash", context: 128000, tools: false },
  ] }, // https://aiapi-pro.com/docs
  { id: "inferbase", name: "Inferbase", base: "https://api.inferbase.ai/api/v1/inference", env: "INFERBASE_API_KEY", models: [
    { id: "auto", context: 9216, tools: true, output: 1024 },
  ] }, // https://inferbase.ai/docs/getting-started/quickstart
  { id: "publicai", name: "Public AI", base: "https://api.publicai.co/v1", env: "PUBLICAI_API_KEY", headers: { "User-Agent": "AlphaAi" }, models: [
    { id: "swiss-ai/apertus-v1.5-8b", context: 128000, cost: { input: 0.1, output: 0.2 } },
    { id: "swiss-ai/apertus-v1.5-70b", context: 128000, cost: { input: 0.1, output: 0.2 } },
    { id: "aisingapore/Qwen-SEA-LION-v4-32B-IT", context: 128000, cost: { input: 0.1, output: 0.2 } },
  ] }, // https://platform.publicai.co/plans
  { id: "pollinations", name: "Pollinations", base: "https://text.pollinations.ai/v1", models: [
    { id: "openai-fast", context: 32000, output: 4096, tools: true, cost: { input: 0, output: 0 } },
  ] }, // https://github.com/pollinations/pollinations/blob/master/APIDOCS.md
  { id: "aion", name: "Aion Labs", base: "https://api.aionlabs.ai/v1", env: "AION_API_KEY", models: [
    { id: "aion-labs/aion-3.5", context: 262144, output: 32768, tools: true, cost: { input: 3, output: 6 } },
    { id: "aion-labs/aion-3.5-mini", context: 262144, output: 32768, tools: true, cost: { input: 0.7, output: 1.4 } },
  ] }, // https://www.aionlabs.ai/pricing/
  { id: "gonka", name: "Gonka", base: "https://proxy.gonkabroker.com/v1", env: "GONKABROKER_API_KEY", models: [
    { id: "zai-org/GLM-5.3-Flash", context: 400000, output: 16384, tools: true, cost: { input: 0.1, output: 0.1 } },
    { id: "deepseek-ai/DeepSeek-V4-Flash-0731", context: 400000, output: 16384, tools: true, cost: { input: 0.1, output: 0.1 } },
    { id: "MiniMaxAI/MiniMax-M2.7", context: 204800, output: 16384, tools: true, cost: { input: 0.12, output: 0.12 } },
  ] }, // https://gonkabroker.com/docs
  { id: "llm7", name: "LLM7", base: "https://api.llm7.io/v1", env: "LLM7_API_KEY", models: [
    { id: "gpt-oss:20b", context: 128000, tools: true },
    { id: "nemotron-3-nano:30b", context: 1000000, tools: true },
    { id: "codestral-latest", context: 32000, tools: true },
  ] }, // https://docs.llm7.io/guides/models-api
  { id: "bazaarlink", name: "BazaarLink", base: "https://api.bazaarlink.ai/v1", env: "BAZAARLINK_API_KEY", models: [
    { id: "qwen/qwen3.7-flash:free", context: 1000000, tools: true },
    { id: "nemotron-3.5-lightning-free", context: 1000000, tools: true },
  ] }, // https://bazaarlink.ai/en/docs
  { id: "nara", name: "NaraRouter", base: "https://router.bynara.id/v1", env: "NARA_API_KEY", models: [
    { id: "laguna-s-2.1", context: 262144, tools: true },
  ] }, // https://router.bynara.id/docs
  { id: "radeon", name: "Radeon Developer Cloud", base: "https://developer.amd.com.cn/radeon/api/v1", env: "RADEON_API_KEY", body: { parallel_tool_calls: false }, models: [
    { id: "DeepSeek-V4-Flash", context: 1048576, output: 8192, tools: true },
    { id: "Qwen3.8-Flash-Next", context: 262144, output: 8192, tools: true },
  ] }, // https://developer.amd.com.cn/radeon/api/v1/models
  { id: "routeway", name: "Routeway", base: "https://api.routeway.ai/v1", env: "ROUTEWAY_API_KEY", models: [
    { id: "muse-glimmer-30b:free", context: 131072, tools: true, cost: { input: 0, output: 0 } },
  ] }, // https://routeway.ai/models
  { id: "sealion", name: "SEA-LION", base: "https://api.sea-lion.ai/v1", env: "SEALION_API_KEY", models: [
    { id: "aisingapore/Qwen-SEA-LION-v4.5-27B-IT", context: 32768, tools: false },
    { id: "aisingapore/Gemma-SEA-LION-v4-27B-IT", context: 131072, tools: false },
  ] }, // https://docs.sea-lion.ai/models
  { id: "xkiro", name: "Xkiro", base: "https://api.xkiro.com/v1", env: "XKIRO_API_KEY", models: [
    { id: "cohere/command-a", context: 288000, output: 8192, cost: { input: 0, output: 0 } },
    { id: "cohere/north-mini-code", context: 256000, output: 64000, cost: { input: 0, output: 0 } },
    { id: "sensenova/sensenova-6.8-flash-lite", context: 262144, output: 65536, cost: { input: 0, output: 0 } },
    { id: "mistralai/ministral-14b", context: 256000, output: 8192, cost: { input: 0, output: 0 } },
  ] }, // https://xkiro.com/models
  { id: "electronhub", name: "Electron Hub", base: "https://api.electronhub.ai/v1", env: "ELECTRONHUB_API_KEY", models: [
    { id: "gpt-oss-120b:free", context: 64000, tools: true },
    { id: "gemma-4-31b-it:free", context: 40000, tools: true },
    { id: "deepseek-v4.1-flash:free", context: 40000, tools: true },
  ] }, // https://docs.electronhub.ai/models
  { id: "router9", name: "Router9", base: "https://api.router9.com/v1", env: "ROUTER9_API_KEY", models: [
    { id: "z-ai/glm-5.2", context: 1048576, tools: true },
    { id: "qwen/qwen3-235b-a22b-2507", context: 262144, tools: true },
    { id: "deepseek/deepseek-v4-flash", context: 1048576, tools: true },
  ] }, // https://router9.com/models
  { id: "septor", name: "Septor Labs", base: "https://api.septorlabs.com/v1", env: "SEPTOR_API_KEY", models: [
    { id: "hermes-3-llama-3.1-405b-free", context: 128000, tools: true, cost: { input: 0, output: 0 } },
    { id: "minimax-m2.5-free", context: 128000, tools: true, cost: { input: 0, output: 0 } },
    { id: "qwen3-coder-free", context: 128000, tools: true, cost: { input: 0, output: 0 } },
  ] }, // https://septorlabs.com/models
  { id: "airforce", name: "Airforce API", base: "https://api.airforce/v1", env: "AIRFORCE_API_KEY", models: [
    { id: "gpt-oss-20b", context: 131072, tools: true },
    { id: "codestral-2508", context: 256000, tools: true },
  ] }, // https://api.airforce/docs
  { id: "dreamprompting", name: "Dream Prompting", base: "https://dreamprompting.com/api/v1", env: "DREAMPROMPTING_API_KEY", models: [
    { id: "auto", context: 40192, output: 8192, tools: true },
    { id: "groq/openai/gpt-oss-120b", context: 40192, output: 8192, tools: true },
  ] }, // https://dreamprompting.com/api
  { id: "waterfall", name: "Waterfall", base: "https://api.getwaterfall.org/v1", env: "WATERFALL_API_KEY", body: { routing_strategy: "free_smart" }, models: [
    { id: "auto", context: 32768, output: 4096, tools: true },
  ] }, // https://docs.getwaterfall.org
  { id: "logfare", name: "Logfare", base: "https://logfare.ai/v1", env: "LOGFARE_API_KEY", models: [
    { id: "logfare/auto", context: 131072, tools: true },
    { id: "gemma-4-31b-it", context: 262144, output: 16384, tools: true },
  ] }, // https://logfare.ai/docs
  { id: "ovh", name: "OVHcloud AI Endpoints", base: "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1", models: [
    { id: "gpt-oss-120b", context: 131072, cost: { input: 0.09, output: 0.47 } },
    { id: "Qwen3.6-27B", context: 262144, cost: { input: 0.47, output: 3.19 } },
    { id: "Qwen3.8-27B", context: 262144, cost: { input: 0.47, output: 3.19 } },
  ] }, // https://endpoints.ai.cloud.ovh.net/models
  { id: "hyperbolic", name: "Hyperbolic", base: "https://api.hyperbolic.ai/inference/v1", env: "HYPERBOLIC_API_KEY", models: [
    { id: "glm-5.3-flash", context: 1048576, output: 131072, tools: true },
    { id: "kimi-k3", context: 1048576, output: 943718, tools: true },
    { id: "minimax-m3", context: 524288, output: 512000, tools: true },
  ] }, // https://www.hyperbolic.ai/docs/inference/overview
  { id: "featherless", name: "Featherless", base: "https://api.featherless.ai/v1", env: "FEATHERLESS_API_KEY", models: [
    { id: "Qwen/Qwen3-Next-80B-A3B-Instruct", context: 32000, tools: true },
    { id: "zai-org/GLM-5.3", context: 256000, tools: true },
  ] }, // https://featherless.ai/docs/api-overview-and-common-options
  // Baidu's docs inline the key; this variable name is just how the catalog stores it.
  { id: "qianfan", name: "Baidu Qianfan", base: "https://qianfan.baidubce.com/v2", env: "QIANFAN_API_KEY", models: [
    { id: "ernie-5.1", context: 128000, output: 65536, tools: true },
    { id: "ernie-5.0", context: 128000, output: 65536, tools: true },
    { id: "deepseek-v3.2", context: 128000, output: 32768, tools: true },
  ] }, // https://cloud.baidu.com/doc/qianfan/s/rmh4stp0j
  { id: "tokenhub", name: "Tencent TokenHub", base: "https://tokenhub.tencentmaas.com/v1", env: "TOKENHUB_API_KEY", models: [
    { id: "hy4-preview", context: 1048576, output: 65536, tools: true },
    { id: "hy3", context: 262144, output: 131072, tools: true },
    { id: "hunyuan-role-latest", context: 32768, output: 4096, tools: true },
  ] }, // https://cloud.tencent.com/document/product/1823/132252
  { id: "awan", name: "Awan LLM", base: "https://api.awanllm.com/v1", env: "AWANLLM_API_KEY", models: [
    { id: "Meta-Llama-3.1-8B-Instruct", context: 131072, tools: true, cost: { input: 0, output: 0 } },
    { id: "Meta-Llama-3.1-70B-Instruct", context: 131072, tools: true, cost: { input: 0, output: 0 } },
    { id: "Meta-Llama-3-8B-Instruct", context: 8192, tools: true, cost: { input: 0, output: 0 } },
  ] }, // https://www.awanllm.com/models
  // Nscale publishes the request string in its SDK sample but not the context window, which comes from the model card.
  { id: "nscale", name: "Nscale", base: "https://inference.api.nscale.com/v1", env: "NSCALE_SERVICE_TOKEN", models: [
    { id: "Qwen/Qwen3.8-Flash-Next-FP8", context: 262144, tools: true, cost: { input: 0.15, output: 0.47 } },
  ] }, // https://docs.nscale.com/docs/use-cases/chat
]

const compatibleSnapshots: readonly ModelsDev.Snapshot[] = compatible.map((item) => {
  const providerID = Provider.ID.make(item.id)
  return {
    info: {
      id: providerID,
      name: item.name,
      activation: "auto",
      package: "@opencode/ai/providers/openai-compatible",
      settings: { baseURL: item.base, ...(item.env ? undefined : { aaiNoAuth: true }) },
      ...(item.headers ? { headers: item.headers } : undefined),
      ...(item.body ? { body: item.body } : undefined),
    },
    environment: item.env ? [item.env] : [],
    models: item.models.map((model) => ({
      ...Model.Info.default(providerID, Model.ID.make(model.id)),
      ...(model.name ? { name: model.name } : undefined),
      ...(model.body ? { body: model.body } : undefined),
      capabilities: { tools: model.tools ?? true, input: [...(model.input ?? ["text"])], output: ["text"] },
      // A missing output budget is published as a conservative 4K rather than a guessed window.
      limit: { context: model.context, output: model.output ?? Math.min(4096, Math.floor(model.context / 2)) },
      cost: model.cost
        ? [
            {
              input: Money.USDPerMillionTokens.make(model.cost.input),
              output: Money.USDPerMillionTokens.make(model.cost.output),
              cache: { read: Money.USDPerMillionTokens.zero, write: Money.USDPerMillionTokens.zero },
            },
          ]
        : [],
    })),
  }
})

export const CompatibleCatalogPlugin = define({
  id: "aai.provider.compatible-catalog",
  effect: Effect.fn(function* (ctx) {
    const modelsDev = yield* ModelsDev.Service
    const bus = yield* Bus.Service
    const loaded = { data: yield* modelsDev.get() }
    yield* ctx.integration.transform((integrations) => {
      for (const provider of compatibleSnapshots) {
        if (provider.environment.length === 0) continue
        if (loaded.data.some((entry) => entry.info.id === provider.info.id)) continue
        const integrationID = provider.info.id
        integrations.update(integrationID, (integration) => (integration.name = provider.info.name))
        integrations.method.update({ integrationID, method: { type: "key" } })
        integrations.method.update({ integrationID, method: { type: "env", names: [...provider.environment] } })
      }
    })
    yield* ctx.provider.transform((providers) => {
      for (const provider of compatibleSnapshots) {
        if (loaded.data.some((entry) => entry.info.id === provider.info.id) || providers.get(provider.info.id)) continue
        const integrationID = provider.environment.length ? Integration.ID.make(provider.info.id) : undefined
        providers.add({ info: { ...provider.info, ...(integrationID ? { integrationID } : undefined) }, models: provider.models })
      }
      // The bundled Mixlayer inventory has paid models but omits its documented free route.
      const mixlayer = providers.get("mixlayer")
      if (mixlayer && !mixlayer.models.has("qwen/qwen3.5-4b-free"))
        providers.models.update("mixlayer", "qwen/qwen3.5-4b-free", (model) => {
          model.name = "Qwen 3.5 4B (Free)"
          model.settings = { baseURL: "https://mixlayer.ai/v1" }
          model.capabilities = { tools: true, input: ["text"], output: ["text"] }
          model.limit = { context: 131000, output: 4096 }
        })
    })
    const apply = (data: readonly ModelsDev.Snapshot[]) => {
      loaded.data = data
      return ctx.integration.reload().pipe(Effect.andThen(ctx.provider.reload()))
    }
    yield* bus.subscribe(ModelsDev.Event.Refreshed).pipe(
      Stream.runForEach(() => modelsDev.get().pipe(Effect.flatMap(apply))),
      Effect.forkScoped({ startImmediately: true }),
    )
    const latest = yield* modelsDev.get()
    if (latest !== loaded.data) yield* apply(latest)
  }),
})

export const ModelsDevPlugin = define({
  id: "opencode.models.dev",
  effect: Effect.fn(function* (ctx) {
    const modelsDev = yield* ModelsDev.Service
    const bus = yield* Bus.Service
    // Filtering and definition indexes are shared across Locations. Only Model materialization
    // makes mutable copies, after provider configuration and access have been resolved.
    const loaded = { data: snapshots(yield* modelsDev.get()) }
    yield* ctx.integration.transform((integrations) => {
      for (const provider of loaded.data) {
        if (provider.environment.length === 0) continue
        const integrationID = provider.info.id
        integrations.update(integrationID, (integration) => (integration.name = provider.info.name))
        integrations.method.update({
          integrationID,
          method: { type: "key" },
        })
        integrations.method.update({
          integrationID,
          method: {
            type: "env",
            // Every listed variable is treated as a key; plugins override providers that also list setup values.
            names: [...provider.environment],
          },
        })
      }
    })
    yield* ctx.provider.transform((providers) => {
      for (const provider of loaded.data) {
        providers.add({
          info: { ...provider.info, integrationID: Integration.ID.make(provider.info.id) },
          models: provider.models,
        })
      }
    })
    const apply = (data: readonly ModelsDev.Snapshot[]) => {
      loaded.data = snapshots(data)
      return ctx.integration.reload().pipe(Effect.andThen(ctx.provider.reload()))
    }
    yield* bus.subscribe(ModelsDev.Event.Refreshed).pipe(
      Stream.runForEach(() => modelsDev.get().pipe(Effect.flatMap(apply))),
      Effect.forkScoped({ startImmediately: true }),
    )
    // A refresh that landed between the initial read and the subscription above published
    // Refreshed to nobody here. On a cold cache that read served the bundled snapshot, so
    // re-read now instead of waiting for the next TTL refresh.
    const latest = yield* modelsDev.get()
    if (snapshots(latest) !== loaded.data) yield* apply(latest)
  }),
})

const prepared = new WeakMap<readonly ModelsDev.Snapshot[], readonly ModelsDev.Snapshot[]>()

function snapshots(data: readonly ModelsDev.Snapshot[]) {
  const cached = prepared.get(data)
  if (cached) return cached
  const result = data
    .filter(
      // These deprecated aliases are replaced by the canonical Azure and Google Vertex providers.
      (provider) => provider.info.id !== "azure-cognitive-services" && provider.info.id !== "google-vertex-anthropic",
    )
    .map((provider) => ({
      ...provider,
      models: provider.models.filter(
        (model) =>
          model.status !== "deprecated" &&
          // Non-chat models are kept for lookups; the Model service never offers them for sessions.
          ((model.type ?? "chat") !== "chat" || Model.supportsText(model)) &&
          !(
            provider.info.id === Provider.ID.amazonBedrock &&
            BEDROCK_PROFILE_ONLY_IDS.includes(model.modelID ?? model.id)
          ),
      ),
    }))
  prepared.set(data, result)
  return result
}
