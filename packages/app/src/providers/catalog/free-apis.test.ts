import { expect, test } from "bun:test"
import { freeAPICategory, freeAPIs, freeAPIInstallable, freeAPIKind } from "./free-apis"

test("separates free routes from paid, trial and gateway presets", () => {
  const category = (id: string) => freeAPICategory(freeAPIs.find((entry) => entry.id === id)!)

  expect(category("openrouter")).toBe("free")
  expect(category("sambanova")).toBe("unverified")
  expect(category("cerebras")).toBe("limited")
  expect(category("publicai")).toBe("limited")
  expect(category("opentyphoon")).toBe("limited")
  expect(category("mistral")).toBe("paid")
  expect(category("freellmapi")).toBe("gateway")
  expect(new Set(freeAPIs.map((entry) => entry.id)).size).toBe(freeAPIs.length)
})

const requested = [
  "Novita AI",
  "FreeTheAI",
  "Free.ai",
  "Speka",
  "AMD Developer Cloud",
  "InferX",
  "SCNet",
  "Kimi for Coding",
  "Liquid AI",
  "Dots Studio",
  "Braintrust",
  "APInex",
  "YepAPI",
  "Helyx AI",
  "AkashML",
  "NaraRouter",
  "DeepInfra",
  "Hyperbolic",
  "Together AI",
  "Scaleway Generative APIs",
  "Venice AI",
  "CleanAPIs",
  "Avian API",
  "Inference.net",
  "Targon",
  "Hume AI",
  "Tripo AI",
  "Runware",
  "fal.ai",
  "Baseten",
  "Context.dev",
  "Alysis Code",
  "Coze",
  "Cartesia",
  "BAI",
  "BigModel",
  "BytePlus",
  "InternLM",
  "iFlytek Spark",
  "Meituan LongCat",
  "Xiaomi MiMo",
  "Tencent Hunyuan",
  "Volcano Engine Ark / Doubao",
  "Baidu Qianfan",
  "Baichuan AI",
  "AI Ping",
] as const

test.each(requested)("lists the requested provider %s", (name) => {
  expect(freeAPIs.some((entry) => entry.name.toLowerCase().includes(name.toLowerCase()))).toBe(true)
})

test.each(freeAPIs.filter(freeAPIInstallable))("$name has an installable chat catalog", (profile) => {
  expect(URL.canParse(profile.base)).toBe(true)
  expect(profile.models.length).toBeGreaterThan(0)
  expect(profile.models.every((model) => model.id.length > 0 && model.name.length > 0)).toBe(true)
})

test.each(freeAPIs.filter((profile) => !freeAPIInstallable(profile) && !profile.manual))(
  "$name is directory only",
  (profile) => {
    expect(freeAPIKind(profile)).not.toBe("settings.freeAPI.kind.chat")
    expect(profile.kind === "media" || profile.kind === "platform" || profile.kind === "agent").toBe(true)
  },
)

test("requires manual setup for a custom auth header", () => {
  const dots = freeAPIs.find((profile) => profile.id === "dots")!
  expect(dots.manual).toBe(true)
  expect(freeAPIKind(dots)).toBe("settings.freeAPI.kind.chat")
  expect(freeAPIInstallable(dots)).toBe(false)
})
