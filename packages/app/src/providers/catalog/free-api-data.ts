import { communityFreeAPIs } from "./free-api-community-data"

export type FreeAPIModel = {
  id: string
  name: string
  modality: string
  tools: boolean
  context: number | null
  output: number | null
  input?: number
  body?: Readonly<Record<string, string | number | boolean>>
  quota: string | null
  reference?: "embeddings" | "retirement"
}

export type FreeAPI = {
  id: string
  name: string
  auth: "key" | "anonymous" | "optional" | "account"
  tier: "routes" | "allowance" | "trial" | "paid" | "experimental" | "credit" | "promotional" | "gateway"
  docs: string
  keyURL: string
  base: string
  headers?: Readonly<Record<string, string>>
  body?: Readonly<Record<string, string | number | boolean>>
  configurableEndpoint?: boolean
  catalog?: string
  models: readonly FreeAPIModel[]
}

export const freeAPIs: readonly FreeAPI[] = [
  {
    id: "hetzner",
    name: "Hetzner Inference",
    auth: "key",
    tier: "experimental",
    docs: "https://docs.hetzner.com/general/company-and-policy/experiments/inference/",
    keyURL: "https://experiments.hetzner.com/",
    base: "https://inference.hetzner.com/api/v1",
    models: [
      { id: "Qwen/Qwen3.6-35B-A3B-FP8", name: "Qwen3.6 35B A3B", modality: "Text + Image", tools: false, context: 262144, output: null, quota: "10 RPM; 4M input TPM and 100K output TPM per API key (shared)" },
      { id: "Qwen3.8-27B", name: "Qwen3.8 27B", modality: "Text + Image", tools: false, context: 262144, output: null, quota: "10 RPM; 4M input TPM and 100K output TPM per API key (shared)" },
    ],
  },
  {
    id: "pollinations",
    name: "Pollinations Classic",
    auth: "anonymous",
    tier: "routes",
    docs: "https://github.com/pollinations/pollinations/blob/master/APIDOCS.md",
    keyURL: "https://pollinations.ai/",
    base: "https://text.pollinations.ai/v1",
    models: [
      { id: "openai-fast", name: "GPT-OSS 20B (Pollinations)", modality: "Text (reasoning)", tools: true, context: null, output: null, quota: "1 concurrent request; at least 30 seconds apart per IP; 402 with Retry-After when limited" },
    ],
  },
  {
    id: "publicai",
    name: "Public AI",
    auth: "key",
    tier: "credit",
    docs: "https://platform.publicai.co/plans",
    keyURL: "https://platform.publicai.co/",
    base: "https://api.publicai.co/v1",
    headers: { "User-Agent": "AlphaAi" },
    models: [
      { id: "swiss-ai/apertus-v1.5-8b", name: "Apertus 1.5 8B", modality: "Text", tools: false, context: 262000, output: null, quota: "$2 starter credit per new account; 100 RPM per API key on Free plan" },
      { id: "swiss-ai/apertus-v1.5-8b-thinking", name: "Apertus 1.5 8B Thinking", modality: "Text (reasoning)", tools: false, context: 262000, output: null, quota: "$2 starter credit per new account; 100 RPM per API key on Free plan" },
      { id: "swiss-ai/apertus-v1.5-70b", name: "Apertus 1.5 70B", modality: "Text", tools: false, context: 262000, output: null, quota: "$2 starter credit per new account; 100 RPM per API key on Free plan" },
      { id: "swiss-ai/apertus-v1.5-70b-thinking", name: "Apertus 1.5 70B Thinking", modality: "Text (reasoning)", tools: false, context: 262000, output: null, quota: "$2 starter credit per new account; 100 RPM per API key on Free plan" },
      { id: "swiss-ai/apertus-8b-instruct", name: "Apertus 8B Instruct", modality: "Text", tools: false, context: 65000, output: null, quota: "$2 starter credit per new account; 100 RPM per API key on Free plan" },
      { id: "swiss-ai/apertus-70b-instruct", name: "Apertus 70B Instruct", modality: "Text", tools: false, context: 65000, output: null, quota: "$2 starter credit per new account; 100 RPM per API key on Free plan" },
      { id: "aisingapore/Gemma-SEA-LION-v4-27B-IT", name: "Gemma SEA-LION v4 27B", modality: "Text", tools: false, context: 128000, output: null, quota: "$2 starter credit per new account; 100 RPM per API key on Free plan" },
      { id: "aisingapore/Qwen-SEA-LION-v4-32B-IT", name: "Qwen SEA-LION v4 32B", modality: "Text", tools: false, context: 128000, output: null, quota: "$2 starter credit per new account; 100 RPM per API key on Free plan" },
      { id: "speakleash/Bielik-11B-v3.0-Instruct", name: "Bielik 11B v3", modality: "Text", tools: false, context: 32000, output: null, quota: "$2 starter credit per new account; 100 RPM per API key on Free plan" },
    ],
  },
  {
    "id": "aion",
    "name": "Aion Labs",
    "auth": "key",
    "tier": "allowance",
    "docs": "https://www.aionlabs.ai/docs/rate-limits/",
    "keyURL": "https://www.aionlabs.ai/app/api-keys/",
    "base": "https://api.aionlabs.ai/v1",
    "models": [
      {"id": "aion-labs/aion-2.0", "name": "aion-labs/aion-2.0", "modality": "Text (reasoning)", "tools": true, "context": 128000, "output": 32000, "quota": "15 RPM, 20K TPD"},
      {"id": "aion-labs/aion-rp-llama-3.1-8b", "name": "aion-labs/aion-rp-llama-3.1-8b", "modality": "Text", "tools": false, "context": 32000, "output": 32000, "quota": "15 RPM, 20K TPD"},
      {"id": "aion-labs/aion-3.0", "name": "aion-labs/aion-3.0", "modality": "Text (reasoning)", "tools": true, "context": 128000, "output": 32000, "quota": "15 RPM, 20K TPD"},
      {"id": "aion-labs/aion-3.0-mini", "name": "aion-labs/aion-3.0-mini", "modality": "Text (reasoning)", "tools": true, "context": 128000, "output": 32000, "quota": "15 RPM, 20K TPD"}
    ]
  },
  {
    "id": "cohere",
    "name": "Cohere",
    "auth": "key",
    "tier": "trial",
    "docs": "https://docs.cohere.com/docs/rate-limits",
    "keyURL": "https://dashboard.cohere.com/api-keys",
    "base": "https://api.cohere.ai/compatibility/v1",
    "models": [
      {"id": "command-a-plus-05-2026", "name": "Command A+ (218B)", "modality": "Text + Image", "tools": false, "context": 128000, "output": 64000, "quota": "20 RPM"},
      {"id": "command-a-03-2025", "name": "Command A (111B)", "modality": "Text", "tools": true, "context": 256000, "output": 8000, "quota": "20 RPM"},
      {"id": "command-r-plus-08-2024", "name": "Command R+", "modality": "Text", "tools": true, "context": 128000, "output": 4000, "quota": "20 RPM"},
      {"id": "command-r-08-2024", "name": "Command R", "modality": "Text", "tools": true, "context": 128000, "output": 4000, "quota": "20 RPM"},
      {"id": "command-r7b-12-2024", "name": "Command R7B", "modality": "Text", "tools": true, "context": 128000, "output": 4000, "quota": "20 RPM"},
      {"id": "command-a-reasoning-08-2025", "name": "Command A Reasoning", "modality": "Text (reasoning)", "tools": false, "context": 256000, "output": 32000, "quota": "20 RPM"},
      {"id": "command-a-translate-08-2025", "name": "Command A Translate", "modality": "Text", "tools": false, "context": 8000, "output": 8000, "quota": "20 RPM"},
      {"id": "command-a-vision-07-2025", "name": "Command A Vision", "modality": "Text + Image", "tools": false, "context": 128000, "output": 8000, "quota": "20 RPM"},
      {"id": "command-r7b-arabic-02-2025", "name": "Command R7B Arabic", "modality": "Text", "tools": false, "context": 128000, "output": 4000, "quota": "20 RPM"},
      {"id": "c4ai-aya-expanse-32b", "name": "Aya Expanse 32B", "modality": "Text", "tools": false, "context": 128000, "output": 4000, "quota": "20 RPM"},
      {"id": "c4ai-aya-vision-32b", "name": "Aya Vision 32B", "modality": "Text + Image", "tools": false, "context": 16000, "output": 4000, "quota": "20 RPM"}
    ]
  },
  {
    "id": "google",
    "name": "Google Gemini",
    "auth": "key",
    "tier": "allowance",
    "docs": "https://ai.google.dev/gemini-api/docs/pricing",
    "keyURL": "https://aistudio.google.com/app/apikey",
    "base": "https://generativelanguage.googleapis.com/v1beta/openai",
    "models": [
      {"id": "gemini-3.8-flash", "name": "Gemini 3.8 Flash", "modality": "Text + Image + Audio + Video", "tools": true, "context": 1000000, "output": 65000, "quota": null},
      {"id": "gemini-3.6-flash", "name": "Gemini 3.6 Flash", "modality": "Text + Image + Audio + Video", "tools": true, "context": 1000000, "output": 65000, "quota": null},
      {"id": "gemini-3.5-flash-lite", "name": "Gemini 3.5 Flash-Lite", "modality": "Text + Image + Audio + Video", "tools": true, "context": 1000000, "output": 65000, "quota": null},
      {"id": "gemini-3.1-flash-lite", "name": "Gemini 3.1 Flash-Lite", "modality": "Text + Image + Audio + Video", "tools": true, "context": 1000000, "output": 65000, "quota": null},
      {"id": "gemini-2.5-flash", "name": "Gemini 2.5 Flash", "modality": "Text + Image + Audio + Video", "tools": true, "context": 1000000, "output": 65000, "quota": null},
      {"id": "gemini-2.5-flash-lite", "name": "Gemini 2.5 Flash-Lite", "modality": "Text + Image + Audio + Video", "tools": true, "context": 1000000, "output": 65000, "quota": null},
      {"id": "gemma-4-31b-it", "name": "Gemma 4 31B", "modality": "Text + Image", "tools": false, "context": 256000, "output": 32000, "quota": null},
      {"id": "gemma-4-26b-a4b-it", "name": "Gemma 4 26B A4B", "modality": "Text + Image", "tools": false, "context": 256000, "output": 32000, "quota": null}
    ]
  },
  {
    "id": "mistral",
    "name": "Mistral AI",
    "auth": "key",
    "tier": "paid",
    "docs": "https://docs.mistral.ai/admin/billing-usage/usage-limits",
    "keyURL": "https://console.mistral.ai/api-keys",
    "base": "https://api.mistral.ai/v1",
    "models": [
      {"id": "mistral-medium-3-5", "name": "Mistral Medium 3.5 (128B)", "modality": "Text + Image + Code", "tools": true, "context": 256000, "output": null, "quota": null},
      {"id": "mistral-small-2603", "name": "Mistral Small 4", "modality": "Text + Image + Code", "tools": true, "context": 256000, "output": null, "quota": null},
      {"id": "mistral-large-2512", "name": "Mistral Large 3", "modality": "Multimodal", "tools": true, "context": 256000, "output": null, "quota": null},
      {"id": "ministral-8b-2512", "name": "Ministral 3 8B", "modality": "Text + Vision", "tools": true, "context": 256000, "output": null, "quota": null},
      {"id": "codestral-2508", "name": "Codestral", "modality": "Code", "tools": false, "context": 128000, "output": null, "quota": null},
      {"id": "ministral-3b-2512", "name": "Ministral 3 3B", "modality": "Text + Vision", "tools": true, "context": 256000, "output": null, "quota": null},
      {"id": "ministral-14b-2512", "name": "Ministral 3 14B", "modality": "Text + Vision", "tools": true, "context": 256000, "output": null, "quota": null}
    ]
  },
  {
    "id": "zhipu",
    "name": "Z AI (Zhipu AI)",
    "auth": "key",
    "tier": "routes",
    "docs": "https://open.bigmodel.cn/pricing",
    "keyURL": "https://open.bigmodel.cn/usercenter/apikeys",
    "base": "https://open.bigmodel.cn/api/paas/v4",
    "models": [
      {"id": "glm-4.7-flash", "name": "GLM-4.7-Flash", "modality": "Text (reasoning)", "tools": true, "context": 200000, "output": 128000, "quota": "1 concurrent request"},
      {"id": "glm-4.5-flash", "name": "GLM-4.5-Flash (retirement announced)", "modality": "Text (reasoning)", "tools": false, "context": 128000, "output": 96000, "quota": "1 concurrent request", "reference": "retirement"},
      {"id": "glm-4.6v-flash", "name": "GLM-4.6V-Flash", "modality": "Multimodal", "tools": false, "context": 128000, "output": 32000, "quota": "1 concurrent request"}
    ]
  },
  {
    "id": "cloudflare",
    "name": "Cloudflare Workers AI",
    "auth": "account",
    "tier": "allowance",
    "docs": "https://developers.cloudflare.com/workers-ai/platform/pricing/",
    "keyURL": "https://dash.cloudflare.com/profile/api-tokens",
    "base": "https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1",
    "models": [
      {"id": "@cf/meta/llama-3.3-70b-instruct-fp8-fast", "name": "@cf/meta/llama-3.3-70b-instruct-fp8-fast", "modality": "Text", "tools": true, "context": 24000, "output": null, "quota": "10K neurons/day (shared)"},
      {"id": "@cf/meta/llama-4-scout-17b-16e-instruct", "name": "@cf/meta/llama-4-scout-17b-16e-instruct", "modality": "Multimodal", "tools": false, "context": 131000, "output": null, "quota": "10K neurons/day (shared)"},
      {"id": "@cf/openai/gpt-oss-120b", "name": "@cf/openai/gpt-oss-120b", "modality": "Text", "tools": true, "context": 128000, "output": null, "quota": "10K neurons/day (shared)"},
      {"id": "@cf/google/gemma-4-26b-a4b-it", "name": "@cf/google/gemma-4-26b-a4b-it", "modality": "Text + Vision", "tools": false, "context": 256000, "output": null, "quota": "10K neurons/day (shared)"},
      {"id": "@cf/zai-org/glm-4.7-flash", "name": "@cf/zai-org/glm-4.7-flash", "modality": "Text", "tools": false, "context": 131000, "output": null, "quota": "10K neurons/day (shared)"},
      {"id": "@cf/mistralai/mistral-small-3.1-24b-instruct", "name": "@cf/mistralai/mistral-small-3.1-24b-instruct", "modality": "Text + Vision", "tools": false, "context": 128000, "output": null, "quota": "10K neurons/day (shared)"},
      {"id": "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b", "name": "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b", "modality": "Text (reasoning)", "tools": false, "context": 80000, "output": null, "quota": "10K neurons/day (shared)"}
    ]
  },
  {
    "id": "gonka",
    "name": "Gonka Broker",
    "auth": "key",
    "tier": "allowance",
    "docs": "https://docs.gonkabroker.com/guides/billing-and-deposits/",
    "keyURL": "https://app.gonkabroker.com/signup",
    "base": "https://proxy.gonkabroker.com/v1",
    "models": [
      {"id": "MiniMaxAI/MiniMax-M2.7", "name": "MiniMaxAI/MiniMax-M2.7", "modality": "Text (reasoning)", "tools": false, "context": 200000, "output": 16000, "quota": "~1M tokens/month (shared, varies by model)"},
      {"id": "deepseek-ai/DeepSeek-V4-Flash-0731", "name": "deepseek-ai/DeepSeek-V4-Flash-0731", "modality": "Text (reasoning)", "tools": false, "context": 400000, "output": 16000, "quota": "~1M tokens/month (shared, varies by model)"},
      {"id": "zai-org/GLM-5.3-Flash", "name": "zai-org/GLM-5.3-Flash", "modality": "Text (reasoning)", "tools": false, "context": 400000, "output": 16000, "quota": "~1M tokens/month (shared, varies by model)"},
      {"id": "BAAI/bge-m3", "name": "BAAI/bge-m3", "modality": "Embeddings", "tools": false, "context": 8000, "output": null, "quota": "~1M tokens/month (shared, varies by model)", "reference": "embeddings"}
    ]
  },
  {
    "id": "groq",
    "name": "Groq",
    "auth": "key",
    "tier": "allowance",
    "docs": "https://console.groq.com/docs/rate-limits",
    "keyURL": "https://console.groq.com/keys",
    "base": "https://api.groq.com/openai/v1",
    "models": [
      {"id": "openai/gpt-oss-120b", "name": "openai/gpt-oss-120b", "modality": "Text", "tools": true, "context": 131000, "output": 65000, "quota": "30 RPM, 1,000 RPD"},
      {"id": "openai/gpt-oss-20b", "name": "openai/gpt-oss-20b", "modality": "Text", "tools": true, "context": 131000, "output": 65000, "quota": "30 RPM, 1,000 RPD"},
      {"id": "qwen/qwen3.8-27b", "name": "qwen/qwen3.8-27b", "modality": "Text + Image", "tools": true, "context": 131000, "output": 16000, "quota": "30 RPM, 1,000 RPD"}
    ]
  },
  {
    "id": "kilo",
    "name": "Kilo Code",
    "auth": "anonymous",
    "tier": "routes",
    "docs": "https://kilo.ai/docs/gateway/authentication",
    "keyURL": "https://app.kilo.ai/profile",
    "base": "https://ai-gateway.kilo.ai/api/v1",
    "models": [
      {"id": "nvidia/nemotron-3-ultra-550b-a55b:free", "name": "nvidia/nemotron-3-ultra-550b-a55b:free", "modality": "Text", "tools": true, "context": 1000000, "output": 65000, "quota": "200 req/hr"},
      {"id": "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", "name": "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", "modality": "Multimodal", "tools": true, "context": 256000, "output": 65000, "quota": "200 req/hr"},
      {"id": "cohere/north-mini-code:free", "name": "cohere/north-mini-code:free", "modality": "Text (code)", "tools": true, "context": 256000, "output": 64000, "quota": "200 req/hr"},
      {"id": "openrouter/free", "name": "openrouter/free", "modality": "Text", "tools": false, "context": null, "output": null, "quota": "200 req/hr"},
      {"id": "nvidia/nemotron-3.5-lightning:free", "name": "nvidia/nemotron-3.5-lightning:free", "modality": "Text", "tools": true, "context": 1000000, "output": 65000, "quota": "200 req/hr"},
      {"id": "kilo-auto/free", "name": "kilo-auto/free", "modality": "Text", "tools": false, "context": 256000, "output": 32000, "quota": "200 req/hr"},
      {"id": "dots-studio/dots-3-note-preview:free", "name": "dots-studio/dots-3-note-preview:free", "modality": "Text + Vision", "tools": true, "context": 512000, "output": 460000, "quota": "200 req/hr"},
      {"id": "nvidia/nemotron-3.5-super-vl:free", "name": "nvidia/nemotron-3.5-super-vl:free", "modality": "Multimodal", "tools": true, "context": 1000000, "output": 131000, "quota": "200 req/hr"},
      {"id": "reflection/beam-free", "name": "reflection/beam-free", "modality": "Text", "tools": true, "context": 1000000, "output": 131000, "quota": "200 req/hr"},
      {"id": "stealth/glyph-cluster", "name": "stealth/glyph-cluster", "modality": "Text (code)", "tools": true, "context": 256000, "output": 256000, "quota": "200 req/hr"}
    ]
  },
  {
    "id": "llm7",
    "name": "LLM7.io",
    "auth": "optional",
    "tier": "routes",
    "docs": "https://docs.llm7.io/limits",
    "keyURL": "https://token.llm7.io",
    "base": "https://api.llm7.io/v1",
    "models": [
      {"id": "gpt-oss:20b", "name": "gpt-oss:20b", "modality": "Text", "tools": false, "context": 128000, "output": null, "quota": "60 RPM, 250 req/hr (free token)"},
      {"id": "mistral-Nemo-Instruct-2407", "name": "mistral-Nemo-Instruct-2407", "modality": "Text", "tools": false, "context": 128000, "output": null, "quota": "60 RPM, 250 req/hr (free token)"},
      {"id": "nemotron-3-nano:30b", "name": "nemotron-3-nano:30b", "modality": "Text (reasoning)", "tools": false, "context": 1000000, "output": null, "quota": "60 RPM, 250 req/hr (free token)"},
      {"id": "codestral-latest", "name": "codestral-latest", "modality": "Text", "tools": false, "context": 32000, "output": null, "quota": "60 RPM, 250 req/hr (free token)"}
    ]
  },
  {
    "id": "modelscope",
    "name": "ModelScope",
    "auth": "key",
    "tier": "allowance",
    "docs": "https://modelscope.cn/docs/model-service/API-Inference/limits",
    "keyURL": "https://modelscope.cn/my/myaccesstoken",
    "base": "https://api-inference.modelscope.cn/v1",
    "models": [
      {"id": "Qwen/Qwen3.5-35B-A3B", "name": "Qwen/Qwen3.5-35B-A3B", "modality": "Text", "tools": false, "context": 256000, "output": null, "quota": "2,000 RPD total; <=500 RPD/model (dynamic)"},
      {"id": "Qwen/Qwen3.5-27B", "name": "Qwen/Qwen3.5-27B", "modality": "Text", "tools": false, "context": 256000, "output": null, "quota": "2,000 RPD total; <=500 RPD/model (dynamic)"}
    ]
  },
  {
    "id": "nvidia",
    "name": "NVIDIA NIM",
    "auth": "key",
    "tier": "allowance",
    "docs": "https://build.nvidia.com/explore/discover",
    "keyURL": "https://build.nvidia.com/explore/discover",
    "base": "https://integrate.api.nvidia.com/v1",
    "models": [
      {"id": "google/gemma-4-31b-it", "name": "google/gemma-4-31b-it", "modality": "Text + Image + Video", "tools": false, "context": 262000, "output": 8000, "quota": "40 RPM, 10,000 RPD"},
      {"id": "nvidia/nemotron-3-ultra-550b-a55b", "name": "nvidia/nemotron-3-ultra-550b-a55b", "modality": "Text", "tools": false, "context": 1000000, "output": 262000, "quota": "40 RPM, 10,000 RPD"},
      {"id": "openai/gpt-oss-20b", "name": "openai/gpt-oss-20b", "modality": "Text", "tools": false, "context": 131000, "output": 131000, "quota": "40 RPM, 10,000 RPD"}
    ]
  },
  {
    "id": "openrouter",
    "name": "OpenRouter",
    "auth": "key",
    "tier": "routes",
    "docs": "https://openrouter.ai/docs/api-reference/limits",
    "keyURL": "https://openrouter.ai/keys",
    "base": "https://openrouter.ai/api/v1",
    "models": [
      {"id": "cohere/north-mini-code:free", "name": "cohere/north-mini-code:free", "modality": "Text (code)", "tools": true, "context": 256000, "output": 64000, "quota": "20 RPM, 50 RPD"},
      {"id": "google/gemma-4-26b-a4b-it:free", "name": "google/gemma-4-26b-a4b-it:free", "modality": "Text + Image + Video", "tools": true, "context": 262000, "output": 32000, "quota": "20 RPM, 50 RPD"},
      {"id": "google/gemma-4-31b-it:free", "name": "google/gemma-4-31b-it:free", "modality": "Text + Image + Video", "tools": true, "context": 262000, "output": 32000, "quota": "20 RPM, 50 RPD"},
      {"id": "dots-studio/dots-3-note-preview:free", "name": "dots-studio/dots-3-note-preview:free", "modality": "Text + Image", "tools": true, "context": 512000, "output": 460000, "quota": "20 RPM, 50 RPD"},
      {"id": "liquid/lfm-2.5-2.6b:free", "name": "liquid/lfm-2.5-2.6b:free", "modality": "Text", "tools": true, "context": 64000, "output": 8000, "quota": "20 RPM, 50 RPD"},
      {"id": "nvidia/nemotron-3.5-lightning:free", "name": "nvidia/nemotron-3.5-lightning:free", "modality": "Text", "tools": true, "context": 1000000, "output": 65000, "quota": "20 RPM, 50 RPD"},
      {"id": "nvidia/nemotron-3-ultra-550b-a55b:free", "name": "nvidia/nemotron-3-ultra-550b-a55b:free", "modality": "Text", "tools": true, "context": 1000000, "output": 65000, "quota": "20 RPM, 50 RPD"},
      {"id": "recursive/flint-v1.0:free", "name": "recursive/flint-v1.0:free", "modality": "Text", "tools": true, "context": 262000, "output": 235000, "quota": "20 RPM, 50 RPD"},
      {"id": "xingchen-agi/xing4.0-29b-a4b:free", "name": "xingchen-agi/xing4.0-29b-a4b:free", "modality": "Text", "tools": true, "context": 262000, "output": 235000, "quota": "20 RPM, 50 RPD"},
      {"id": "nvidia/nemotron-3.5-super-vl:free", "name": "nvidia/nemotron-3.5-super-vl:free", "modality": "Text + Image + Video", "tools": true, "context": 1000000, "output": 131000, "quota": "20 RPM, 50 RPD"},
      {"id": "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", "name": "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", "modality": "Text + Image + Audio + Video", "tools": true, "context": 256000, "output": 65000, "quota": "20 RPM, 50 RPD"},
      {"id": "openrouter/free", "name": "Free Models Router", "modality": "Text", "tools": false, "context": null, "output": null, "quota": "20 RPM, 50 RPD"}
    ]
  },
  {
    "id": "ovh",
    "name": "OVHcloud AI Endpoints",
    "auth": "anonymous",
    "tier": "routes",
    "docs": "https://www.ovhcloud.com/en/public-cloud/ai-endpoints/catalog/",
    "keyURL": "https://www.ovhcloud.com/en/public-cloud/ai-endpoints/catalog/",
    "base": "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1",
    "models": [
      {"id": "Qwen3.5-397B-A17B", "name": "Qwen3.5-397B-A17B", "modality": "Text + Vision", "tools": false, "context": 262000, "output": 32000, "quota": "2 RPM (anonymous)"},
      {"id": "gpt-oss-120b", "name": "gpt-oss-120b", "modality": "Text", "tools": false, "context": 131000, "output": 32000, "quota": "2 RPM (anonymous)"},
      {"id": "gpt-oss-20b", "name": "gpt-oss-20b", "modality": "Text", "tools": false, "context": 131000, "output": 8000, "quota": "2 RPM (anonymous)"},
      {"id": "Meta-Llama-3_3-70B-Instruct", "name": "Meta-Llama-3_3-70B-Instruct", "modality": "Text", "tools": false, "context": 131000, "output": 4000, "quota": "2 RPM (anonymous)"},
      {"id": "Qwen3.8-27B", "name": "Qwen3.8-27B", "modality": "Text + Vision", "tools": false, "context": 262000, "output": null, "quota": "2 RPM (anonymous)"},
      {"id": "Qwen3.6-27B", "name": "Qwen3.6-27B", "modality": "Text + Vision", "tools": false, "context": 262000, "output": 32000, "quota": "2 RPM (anonymous)"},
      {"id": "Qwen3.5-9B", "name": "Qwen3.5-9B", "modality": "Text + Vision", "tools": false, "context": 262000, "output": 8000, "quota": "2 RPM (anonymous)"},
      {"id": "Qwen2.5-VL-72B-Instruct", "name": "Qwen2.5-VL-72B-Instruct", "modality": "Text + Vision", "tools": false, "context": 32000, "output": 8000, "quota": "2 RPM (anonymous)"},
      {"id": "Mistral-Small-3.2-24B-Instruct-2506", "name": "Mistral-Small-3.2-24B-Instruct", "modality": "Text + Vision", "tools": false, "context": 128000, "output": 4000, "quota": "2 RPM (anonymous)", "reference": "retirement"}
    ]
  },
  {
    "id": "siliconflow",
    "name": "SiliconFlow",
    "auth": "key",
    "tier": "routes",
    "docs": "https://siliconflow.cn/pricing",
    "keyURL": "https://cloud.siliconflow.cn/account/ak",
    "base": "https://api.siliconflow.cn/v1",
    "models": [
      {"id": "tencent/Hunyuan-MT-7B", "name": "tencent/Hunyuan-MT-7B", "modality": "Text", "tools": false, "context": null, "output": null, "quota": null},
      {"id": "XingChenAGI/Xing4.0-29B", "name": "XingChenAGI/Xing4.0-29B", "modality": "Text", "tools": false, "context": null, "output": null, "quota": null}
    ]
  },
  ...communityFreeAPIs,
]
