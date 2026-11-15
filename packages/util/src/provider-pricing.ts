// Provider-level categories describe availability, not the price of every model or account.
// Preset classifications also follow the documented tiers in the app's provider catalog.
// Sources: https://console.groq.com/docs/rate-limits, https://ai.google.dev/gemini-api/docs/pricing,
// https://openrouter.ai/pricing, https://docs.mistral.ai/admin/billing-usage/usage-limits,
// https://docs.z.ai/guides/overview/pricing, https://docs.mixlayer.com/qwen-3-5,
// https://docs.aihubmix.com/en/blogs/free-ai-models, https://iteracompute.com/models,
// https://modelscope.cn/docs/model-service/API-Inference/intro, https://doc.freeinference.org/models,
// https://simplellm.eu/docs/models.html, https://tokenharbor.ai/models/mimo-v2.6-flash:free,
// https://aiapi-pro.com/docs, https://inferbase.ai/pricing, https://docs.opentyphoon.ai/en/faq/,
// https://docs.meganova.ai/free-model-quota, https://moark.ai/docs/appendix/qa,
// https://docs.bytez.com/model-api/docs/billing, https://inference-docs.cerebras.ai/support/rate-limits,
// https://ollama.com/pricing, https://platform.openai.com/docs/pricing,
// https://www.anthropic.com/pricing, https://docs.cohere.com/docs/rate-limits,
// https://www.hyperbolic.ai/docs/inference/overview, https://cloud.tencent.com/document/product/1823/130053,
// https://www.awanllm.com/pricing, https://docs.nscale.com/changelog/changelog,
// https://featherless.ai/docs/plans, https://cloud.baidu.com/doc/qianfan/s/Imi2rpirg.
const freeAccess = new Set([
  "google", "groq", "openrouter", "zai", "zhipu", "zhipuai", "mixlayer", "aihubmix",
  "modelscope", "freeinference", "simplellm", "token-harbor", "novai",
  "inferbase", "meganova", "moark", "bytez",
  "cloudflare", "cloudflare-workers-ai", "gonka", "kilo", "llm7", "nvidia", "ovh", "siliconflow",
  "pollinations", "bazaarlink", "nara", "requesty", "routeway", "sealion", "unorouter", "xkiro",
  "electronhub", "router9", "septor", "clod", "airforce", "dreamprompting", "waterfall", "logfare", "awan",
  "freetheai", "freeai", "speka", "inferx", "dots", "apinex", "venice", "inference",
  "iflytek", "longcat", "mimo", "aiping", "cartesia", "coze", "contextdev",
])

const trial = new Set([
  "cerebras", "cohere", "iteracompute", "opentyphoon", "hetzner", "publicai", "agnes", "radeon",
  "hyperbolic", "qianfan", "tokenhub", "nscale",
  "novita", "amd-developer-cloud", "kimi-coding", "liquid", "braintrust", "helyx", "akashml",
  "deepinfra", "together", "scaleway", "avian", "targon", "hume", "tripo", "fal", "baseten",
  "byteplus", "hunyuan", "volcano", "alysis", "runware", "scnet",
])
const paid = new Set(["openai", "anthropic", "mistral", "ollama-cloud", "featherless", "freebuff"])

export function providerPricing(id: string) {
  const canonical = id.startsWith("aai-compatible-free-") ? id.slice("aai-compatible-free-".length) : id
  if (freeAccess.has(canonical)) return "free-access"
  if (trial.has(canonical)) return "trial"
  if (paid.has(canonical)) return "paid"
  return "unknown"
}
