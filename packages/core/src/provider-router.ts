export * as ProviderRouter from "./provider-router.js"

import { providerPricing } from "@opencode/util/provider-pricing"

// A provider can serve the same open model under a vendor-prefixed or promotional id. Normalizing
// those ids lets a session continue on another provider after its current route runs out of usage.
const ROUTING_SUFFIX = /:(?:free|nitro|floor)$/i
const FREE_SUFFIX = /-free$/i

export type Candidate = {
  readonly id: string
  readonly providerID: string
  readonly type?: string
  readonly status?: string
  readonly capabilities: {
    readonly tools: boolean
    readonly input: readonly string[]
  }
  readonly cost: readonly {
    readonly input: number
    readonly output?: number
    readonly cache?: { readonly read: number; readonly write: number }
  }[]
}

export type Cooldowns = Map<string, number>

export const RATE_LIMIT_COOLDOWN_MS = 10 * 60_000
export const QUOTA_COOLDOWN_MS = 30 * 60_000
const MAX_COOLDOWN_MS = 60 * 60_000

export function modelKey(model: Pick<Candidate, "providerID" | "id">) {
  return `${model.providerID}\u0000${model.id}`
}

/** The stable model family name shared by providers that spell the vendor prefix differently. */
export function normalizeModelID(id: string) {
  const normalized = id.trim().toLowerCase().replace(ROUTING_SUFFIX, "").replace(FREE_SUFFIX, "")
  const last = normalized.slice(normalized.lastIndexOf("/") + 1)
  return last.replace(/[_\s]+/g, "-").replace(/-+/g, "-")
}

export function cooldownFor(error: { readonly type: string; readonly retryAfterMs?: number }) {
  const requested = error.retryAfterMs
  const base = error.type === "provider.quota" ? QUOTA_COOLDOWN_MS : RATE_LIMIT_COOLDOWN_MS
  return Math.min(Math.max(requested ?? base, 5_000), MAX_COOLDOWN_MS)
}

export function isUsageLimit(type: string) {
  // Preserve the hosted free-tier refusal and its reset time instead of masking it with another provider's error.
  return (
    type === "provider.rate-limit" ||
    type === "provider.quota" ||
    type === "provider.go-limit" ||
    type === "provider.budget-limit" ||
    type === "provider.model-budget-limit"
  )
}

export function cooling(cooldowns: ReadonlyMap<string, number>, model: Candidate, now: number) {
  return (cooldowns.get(modelKey(model)) ?? 0) > now
}

export function mark(cooldowns: Cooldowns, model: Pick<Candidate, "providerID" | "id">, until: number) {
  cooldowns.set(modelKey(model), until)
}

export function sameModel(left: Candidate, right: Candidate) {
  if ((left.type ?? "chat") !== (right.type ?? "chat")) return false
  if (normalizeModelID(left.id) !== normalizeModelID(right.id)) return false
  if (right.status !== undefined && right.status !== "active") return false
  if (left.capabilities.tools && !right.capabilities.tools) return false
  const inputs = new Set(right.capabilities.input.map((item) => item.split("/")[0]))
  return left.capabilities.input.every((item) => inputs.has(item.split("/")[0]))
}

function paid(model: Candidate) {
  return model.cost.some(
    (cost) => cost.input > 0 || (cost.output ?? 0) > 0 || (cost.cache?.read ?? 0) > 0 || (cost.cache?.write ?? 0) > 0,
  )
}

/** Equally capable routes for the selected model, most useful free route first. */
export function candidates<M extends Candidate>(
  selected: M,
  available: readonly M[],
  cooldowns: ReadonlyMap<string, number>,
  now: number,
) {
  const allowPaid = paid(selected)
  return (
    available
      .filter((model) => model.providerID !== selected.providerID && sameModel(selected, model))
      // A free selection must never authorize a paid route. Missing prices do not establish a free alternative.
      .filter(
        (model) =>
          allowPaid ||
          (providerPricing(model.providerID) !== "paid" &&
            model.cost.length > 0 &&
            model.cost.every(
              (cost) => cost.input === 0 && cost.output === 0 && cost.cache?.read === 0 && cost.cache?.write === 0,
            )),
      )
      .filter((model) => !cooling(cooldowns, model, now))
      .toSorted(
        (left, right) =>
          Number(paid(left)) - Number(paid(right)) ||
          left.providerID.localeCompare(right.providerID) ||
          left.id.localeCompare(right.id),
      )
  )
}

/** Keeps the selected route while it is healthy, then uses a same-model route that is not cooling. */
export function pick<M extends Candidate>(
  selected: M,
  available: readonly M[],
  cooldowns: ReadonlyMap<string, number>,
  now: number,
) {
  if (!cooling(cooldowns, selected, now)) return selected
  return candidates(selected, available, cooldowns, now)[0] ?? selected
}
