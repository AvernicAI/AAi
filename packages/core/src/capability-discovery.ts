export * as CapabilityDiscovery from "./capability-discovery.js"

import { CodeModeCatalog } from "./codemode/catalog.js"
import type { Skill } from "./skill.js"
import type { Tool } from "./tool.js"

export function inventory(snapshot: Tool.Snapshot, skills: ReadonlyArray<Skill.Info>) {
  return [
    ...snapshot.definitions.map((tool) => ({ name: tool.name, description: tool.description, kind: "tool" })),
    ...(snapshot.codeModeCatalog ? CodeModeCatalog.flatten(snapshot.codeModeCatalog.tools).tools : []).map((tool) => ({
      name: tool.path,
      description: tool.description,
      kind: "Code Mode tool",
    })),
    ...skills.map((skill) => ({ name: skill.id, description: skill.description, kind: "skill" })),
  ]
}

const words = (value: string) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .match(/[a-z0-9]{3,}/g) ?? []

const filler = new Set([
  "about",
  "and",
  "can",
  "could",
  "for",
  "from",
  "how",
  "please",
  "that",
  "the",
  "this",
  "use",
  "want",
  "with",
  "would",
  "you",
])

export function rank<Item extends { readonly name: string; readonly description?: string }>(
  query: string,
  inventory: ReadonlyArray<Item>,
  limit = 6,
) {
  const terms = new Set(words(query.slice(0, 16_384)).filter((term) => !filler.has(term)))
  if (terms.size === 0) return []
  return inventory
    .map((item) => {
      const names = new Set(words(item.name))
      const description = new Set(words(item.description ?? ""))
      const score = [...terms].reduce((total, term) => total + (names.has(term) ? 5 : description.has(term) ? 1 : 0), 0)
      return { item, score }
    })
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score || left.item.name.localeCompare(right.item.name))
    .slice(0, limit)
    .map((match) => match.item)
}
