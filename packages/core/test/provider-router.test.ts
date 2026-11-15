import { describe, expect, test } from "bun:test"
import { ProviderRouter, type Candidate } from "@opencode/core/provider-router"

const model = (
  providerID: string,
  id: string,
  extra: Partial<Omit<Candidate, "providerID" | "id">> = {},
): Candidate => ({
  providerID,
  id,
  type: "chat",
  status: "active",
  capabilities: { tools: true, input: ["text"] },
  cost: [{ input: 0, output: 0, cache: { read: 0, write: 0 } }],
  ...extra,
})

describe("ProviderRouter", () => {
  test.each([
    ["openai/gpt-oss-120b:free", "gpt-oss-120b"],
    ["meta-llama/Llama-3.3-70B-Instruct", "llama-3.3-70b-instruct"],
    ["Qwen3.8-27B", "qwen3.8-27b"],
    ["deepseek-v4-flash-free", "deepseek-v4-flash"],
    [" some_model  name ", "some-model-name"],
    ["moonshotai/Kimi-K2.5:nitro", "kimi-k2.5"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(ProviderRouter.normalizeModelID(input)).toBe(expected)
  })

  test("finds the same model across provider-specific spellings", () => {
    const selected = model("deepinfra", "deepseek-ai/DeepSeek-V3.1")
    const alternate = model("together", "deepseek-v3.1:free")

    expect(ProviderRouter.sameModel(selected, alternate)).toBe(true)
    expect(ProviderRouter.sameModel(selected, model("other", "deepseek-v4.1"))).toBe(false)
  })

  test.each([
    ["a different type", { type: "image" }],
    ["a disabled route", { status: "disabled" }],
    ["missing tool support", { capabilities: { tools: false, input: ["text"] } }],
    ["missing image support", { capabilities: { tools: true, input: ["text"] } }],
  ])("rejects %s", (_name, extra) => {
    const selected = model("selected", "llama-3.3-70b", {
      capabilities: { tools: true, input: ["text", "image"] },
    })

    expect(ProviderRouter.sameModel(selected, model("alternate", "llama-3.3-70b", extra))).toBe(false)
  })

  test("keeps the selected route while it is healthy", () => {
    const selected = model("paid", "llama-3.3-70b", { cost: [{ input: 1 }] })
    const free = model("free", "llama-3.3-70b")

    expect(ProviderRouter.pick(selected, [selected, free], new Map(), 0)).toBe(selected)
  })

  test("prefers a free same-model route after the selected route cools", () => {
    const selected = model("paid", "llama-3.3-70b", { cost: [{ input: 1 }] })
    const free = model("free", "llama-3.3-70b")
    const otherPaid = model("other-paid", "meta-llama/Llama-3.3-70B-Instruct", { cost: [{ input: 1 }] })
    const cooldowns: ProviderRouter.Cooldowns = new Map()

    ProviderRouter.mark(cooldowns, selected, 100)

    expect(ProviderRouter.pick(selected, [selected, otherPaid, free], cooldowns, 0)).toBe(free)
  })

  test("skips cooling alternates and falls back to the selected route when none remain", () => {
    const selected = model("paid", "llama-3.3-70b", { cost: [{ input: 1 }] })
    const free = model("free", "llama-3.3-70b")
    const cooldowns: ProviderRouter.Cooldowns = new Map()

    ProviderRouter.mark(cooldowns, selected, 100)
    ProviderRouter.mark(cooldowns, free, 100)

    expect(ProviderRouter.pick(selected, [selected, free], cooldowns, 0)).toBe(selected)
    expect(ProviderRouter.candidates(selected, [selected, free], cooldowns, 0)).toEqual([])
  })

  test("does not treat another route from the selected provider as failover", () => {
    const selected = model("provider", "llama-3.3-70b")
    const alias = model("provider", "meta-llama/Llama-3.3-70B-Instruct")

    expect(ProviderRouter.candidates(selected, [selected, alias], new Map(), 0)).toEqual([])
  })

  test("reports available same-model routes after marking one exhausted", () => {
    const selected = model("paid", "llama-3.3-70b", { cost: [{ input: 1 }] })
    const free = model("free", "llama-3.3-70b")
    const cooldowns: ProviderRouter.Cooldowns = new Map()

    ProviderRouter.mark(cooldowns, selected, 100)

    expect(ProviderRouter.candidates(selected, [selected, free], cooldowns, 0)).toEqual([free])
  })

  test("never routes an exhausted OpenCode free selection to paid or unpriced providers", () => {
    const selected = model("opencode", "deepseek-v4.1-flash-free")
    const paid = model("ollama-cloud", "deepseek-v4.1-flash", { cost: [{ input: 0.15, output: 0.6 }] })
    const outputOnly = model("output-priced", "deepseek-v4.1-flash", { cost: [{ input: 0, output: 1 }] })
    const cacheOnly = model("cache-priced", "deepseek-v4.1-flash", {
      cost: [{ input: 0, output: 0, cache: { read: 0, write: 1 } }],
    })
    const unknown = model("unpriced", "deepseek-v4.1-flash", { cost: [] })
    const subscription = model("ollama-cloud", "deepseek-v4.1-flash")
    const free = model("free", "deepseek-v4.1-flash")
    const cooldowns: ProviderRouter.Cooldowns = new Map()
    ProviderRouter.mark(cooldowns, selected, 100)
    expect(
      ProviderRouter.candidates(
        selected,
        [selected, paid, outputOnly, cacheOnly, unknown, subscription, free],
        cooldowns,
        0,
      ),
    ).toEqual([free])
    expect(ProviderRouter.pick(selected, [selected, paid, unknown], cooldowns, 0)).toBe(selected)
  })

  test("treats an output-priced selection as paid when considering alternatives", () => {
    const selected = model("output-priced", "deepseek-v4.1-flash", { cost: [{ input: 0, output: 1 }] })
    const alternate = model("alternate", "deepseek-v4.1-flash", { cost: [{ input: 0.15, output: 0.6 }] })
    const free = model("free", "deepseek-v4.1-flash")
    expect(ProviderRouter.candidates(selected, [alternate], new Map(), 0)).toEqual([alternate])
    expect(ProviderRouter.candidates(alternate, [selected, free], new Map(), 0)).toEqual([free, selected])
  })

  test.each([
    ["provider.rate-limit", undefined, 10 * 60_000],
    ["provider.quota", undefined, 30 * 60_000],
    ["provider.rate-limit", 1_000, 5_000],
    ["provider.quota", 2 * 60 * 60_000, 60 * 60_000],
  ])("computes a bounded cooldown for %s", (type, retryAfterMs, expected) => {
    expect(ProviderRouter.cooldownFor({ type, ...(retryAfterMs === undefined ? {} : { retryAfterMs }) })).toBe(expected)
  })

  test.each([
    ["provider.rate-limit", true],
    ["provider.quota", true],
    // OpenCode's free allowance is service-wide. Trying another route hides its quota/reset response.
    ["provider.free-limit", false],
    ["provider.go-limit", true],
    ["provider.budget-limit", true],
    ["provider.model-budget-limit", true],
    ["provider.auth", false],
    ["provider.transport", false],
  ])("classifies %s usage limits", (type, expected) => {
    expect(ProviderRouter.isUsageLimit(type)).toBe(expected)
  })
})
