import path from "node:path"
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import { Predicate, Schema } from "effect"
import { applyEdits, modify, parse, type ParseError } from "jsonc-parser"
import { ConfigPlugin } from "@opencode/schema/config/plugin"
import type { PackageInstall } from "./contract"

const registry = "https://registry.npmjs.org/"

const packageName = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/

const exactVersion = /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?$/

const SearchResult = Schema.Struct({
  objects: Schema.Array(
    Schema.Struct({
      package: Schema.Struct({
        name: Schema.String,
        version: Schema.String,
        description: Schema.optional(Schema.String),
        publisher: Schema.optional(Schema.Struct({ username: Schema.optional(Schema.String) })),
      }),
    }),
  ),
})

const Manifest = Schema.Struct({
  name: Schema.String,
  version: Schema.String,
  description: Schema.optional(Schema.String),
  license: Schema.optional(Schema.String),
  deprecated: Schema.optional(Schema.String),
  dependencies: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  scripts: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  exports: Schema.optional(Schema.Union([Schema.String, Schema.Record(Schema.String, Schema.Unknown)])),
  main: Schema.optional(Schema.String),
  _npmUser: Schema.optional(Schema.Struct({ name: Schema.optional(Schema.String) })),
})

const Configuration = Schema.Struct({
  plugins: Schema.optional(ConfigPlugin.Plugins),
  plugin: Schema.optional(
    Schema.Array(
      Schema.Union([Schema.String, Schema.Tuple([Schema.String, Schema.Record(Schema.String, Schema.Unknown)])]),
    ),
  ),
})

export function packageSpec(name: string, version: string) {
  if (name.length > 214 || !packageName.test(name) || name.includes("..") || !exactVersion.test(version))
    throw new Error("packages.invalid")

  return `${name}@${version}`
}

export async function searchPackages(query: string, page: number) {
  const url = new URL("-/v1/search", registry)
  url.searchParams.set("text", `${query.trim() || "opencode"} keywords:opencode-plugin`)
  url.searchParams.set("size", "24")
  url.searchParams.set("from", String(page * 24))
  const result = Schema.decodeUnknownSync(Schema.fromJsonString(SearchResult))(await registryJSON(url))

  return result.objects.flatMap(({ package: item }) => {
    if (!packageName.test(item.name) || !exactVersion.test(item.version)) return []

    return [
      {
        name: item.name,
        version: item.version,
        description: item.description ?? "",
        publisher: item.publisher?.username ?? "",
        url: packageURL(item.name, item.version),
      },
    ]
  })
}

export function decodePackage(text: string) {
  const manifest = Schema.decodeUnknownSync(Schema.fromJsonString(Manifest))(text)
  packageSpec(manifest.name, manifest.version)
  const exports = manifest.exports && !Predicate.isString(manifest.exports) ? Object.keys(manifest.exports) : []

  return {
    name: manifest.name,
    version: manifest.version,
    description: manifest.description ?? "",
    publisher: manifest._npmUser?.name ?? "",
    url: packageURL(manifest.name, manifest.version),
    license: manifest.license ?? "",
    deprecated: manifest.deprecated ?? "",
    dependencies: Object.entries(manifest.dependencies ?? {}).map(([name, version]) => `${name}@${version}`),
    scripts: Object.keys(manifest.scripts ?? {}),
    parts: [
      ...(manifest.main || Predicate.isString(manifest.exports) || exports.includes(".") || exports.includes("./server")
        ? ["server"]
        : []),
      ...(exports.includes("./gui-experimental") ? ["desktop"] : []),
      ...(exports.includes("./tui") ? ["terminal"] : []),
    ],
  }
}

export async function previewPackage(name: string, version: string) {
  packageSpec(name, version)

  const result = decodePackage(
    await registryJSON(new URL(`${encodeURIComponent(name)}/${encodeURIComponent(version)}`, registry)),
  )

  if (result.name !== name || result.version !== version) throw new Error("packages.identity")

  return result
}

/** Only this library's exact pinned entry is changed; other declarations, options and JSONC comments survive. */
export function editPluginConfig(text: string, item: PackageInstall, enabled: boolean) {
  const errors: ParseError[] = []
  const input: unknown = parse(text, errors, { allowTrailingComma: true })

  if (errors.length) throw new Error("packages.configInvalid")
  const config = Schema.decodeUnknownSync(Configuration)(input)
  const spec = packageSpec(item.name, item.version)
  const legacy = (config.plugin ?? []).map((entry) => (Predicate.isString(entry) ? entry : entry[0]))
  const entries = config.plugins ?? []
  const targets = [...entries.map((entry) => (Predicate.isString(entry) ? entry : entry.package)), ...legacy]

  if (
    enabled &&
    (legacy.includes(spec) || entries.some((entry) => !Predicate.isString(entry) && entry.package === spec))
  )
    throw new Error("packages.conflict")

  if (
    enabled &&
    targets.some((target) => target !== spec && (target === item.name || target.startsWith(`${item.name}@`)))
  )
    throw new Error("packages.conflict")
  const next = entries.filter((entry) => entry !== spec)

  return applyEdits(
    text,
    modify(text, ["plugins"], enabled ? [...next, spec] : next, {
      formattingOptions: { tabSize: 2, insertSpaces: true },
    }),
  )
}

export async function configurePlugin(root: string, item: PackageInstall, enabled: boolean) {
  await mkdir(root, { recursive: true })
  const files = await readdir(root)

  const name = files.includes("opencode.jsonc")
    ? "opencode.jsonc"
    : files.includes("opencode.json")
      ? "opencode.json"
      : "opencode.jsonc"

  const target = path.join(root, name)
  const text = files.includes(name) ? await readFile(target, "utf8") : "{}\n"
  const updated = editPluginConfig(text, item, enabled)
  await writeFile(target, updated.endsWith("\n") ? updated : `${updated}\n`)
}

function packageURL(name: string, version: string) {
  return `https://www.npmjs.com/package/${name}/v/${version}`
}

async function registryJSON(url: URL) {
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(15000),
    headers: { accept: "application/json" },
  })

  if (!response.ok || !response.body) throw new Error("packages.network")
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  const size = { value: 0 }

  try {
    while (true) {
      const chunk = await reader.read()

      if (chunk.done) break
      size.value += chunk.value.byteLength

      if (size.value > 3 * 1024 * 1024) throw new Error("packages.network")
      chunks.push(chunk.value)
    }

    return Buffer.concat(chunks).toString("utf8")
  } finally {
    await reader.cancel()
  }
}
