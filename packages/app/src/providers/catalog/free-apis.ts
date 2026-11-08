import { freeAPIs, type FreeAPI, type FreeAPIModel } from "./free-api-data"

export { freeAPIs, type FreeAPI, type FreeAPIModel }

// CC0 catalog snapshot from mnfst/awesome-free-llm-apis/data.json (2026-10-25),
// supplemented with Hetzner, Pollinations and Public AI's official documentation (2026-11-08).
export const freeAPISource = "https://github.com/mnfst/awesome-free-llm-apis"

const prefix = "aai-compatible-free-"

const byProvider = new Map(freeAPIs.map((profile) => [freeAPIProviderID(profile), profile]))

export function freeAPIProviderID(profile: FreeAPI) {
  return prefix + profile.id
}

export function freeAPIProfile(providerID: string) {
  return byProvider.get(providerID)
}

export function freeAPITier(profile: FreeAPI) {
  if (profile.tier === "gateway") return "settings.freeAPI.gateway"

  if (profile.tier === "promotional") return "settings.freeAPI.promotional"

  if (profile.tier === "experimental") return "settings.freeAPI.experimental"

  if (profile.tier === "credit") return "settings.freeAPI.credit"

  if (profile.tier === "trial") return "settings.freeAPI.trial"

  if (profile.tier === "allowance") return "settings.freeAPI.allowance"

  if (profile.tier === "paid") return "settings.freeAPI.paid"

  return "settings.freeAPI.routes"
}

export function freeAPIModel(providerID: string, id: string) {
  const profile = freeAPIProfile(providerID)
  const model = profile?.models.find((entry) => entry.id === id && !entry.reference)

  if (profile && model) return { profile, model }
}

export function freeAPIEndpoint(profile: FreeAPI, account: string, url = profile.base) {
  if (profile.configurableEndpoint) return url.trim()

  if (profile.auth !== "account") return profile.base

  const id = account.trim()

  if (/^[a-f\d]{32}$/i.test(id)) return profile.base.replace("{account_id}", id.toLowerCase())
}

export function freeAPIInput(model: FreeAPIModel) {
  // AAi's Chat Completions adapter sends text and image_url parts. Catalog audio/video
  // support is still visible in the guide, but is not advertised to the composer.
  return /Image|Vision|Multimodal/.test(model.modality) ? ["text", "image"] : ["text"]
}

export function freeAPILimit(model: FreeAPIModel) {
  const context = model.context ?? 16000

  return {
    context,
    output: Math.min(model.output ?? 4096, Math.floor(context / 2)),
    ...(model.input ? { input: model.input } : undefined),
  }
}

export function freeAPIUse(model: FreeAPIModel, profile: FreeAPI) {
  if (model.reference === "embeddings") return "settings.freeAPI.use.embeddings"

  if (/safeguard|content-safety|moderation/i.test(model.id)) return "settings.freeAPI.use.moderation"

  if (/translation|translate|hunyuan-mt/i.test(model.id)) return "settings.freeAPI.use.translation"

  if (/code|glyph|devstral|leanstral|laguna/i.test(model.id) || model.modality.includes("Code"))
    return "settings.freeAPI.use.coding"

  if (freeAPIInput(model).includes("image")) return "settings.freeAPI.use.vision"

  if (profile.id === "aion") return "settings.freeAPI.use.creative"

  if (/reasoning|gpt-oss|nemotron/i.test(`${model.modality} ${model.id}`)) return "settings.freeAPI.use.reasoning"

  if (profile.id === "sealion" || profile.id === "publicai") return "settings.freeAPI.use.translation"

  if (profile.id === "cohere") return "settings.freeAPI.use.documents"

  if (profile.id === "llm7" || profile.id === "groq") return "settings.freeAPI.use.fast"

  return "settings.freeAPI.use.general"
}
