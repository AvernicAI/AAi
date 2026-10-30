import { createHash } from "node:crypto"
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { unzipSync } from "fflate"
import matter from "gray-matter"
import { Schema } from "effect"
import { type Catalog, type Detail, type Installed, type Item } from "./contract"

const RemoteItem = Schema.Struct({
  slug: Schema.NonEmptyString,
  title: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  verified: Schema.optional(Schema.Boolean),
  raw_url: Schema.NonEmptyString,
  url: Schema.optional(Schema.String),
  bundle_url: Schema.optional(Schema.NullOr(Schema.String)),
  files: Schema.optional(Schema.Array(Schema.Struct({ path: Schema.String }))),
})

const Search = Schema.Struct({ items: Schema.Array(RemoteItem) })

const Metadata = Schema.Struct({
  ...RemoteItem.fields,
  license: Schema.optional(Schema.NullOr(Schema.String)),
  files: Schema.optional(Schema.Array(Schema.Struct({ path: Schema.String }))),
})

const Frontmatter = Schema.Struct({
  name: Schema.NonEmptyString,
  description: Schema.NonEmptyString,
  license: Schema.optional(Schema.String),
})

const maxDownload = 20 * 1024 * 1024

export function catalogURL(value: string) {
  const url = new URL(value)

  if (
    (url.protocol !== "https:" &&
      !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) ||
    url.username ||
    url.password
  )
    throw new Error("Use an HTTPS catalog URL, or HTTP on localhost, without embedded credentials")

  return url
}

export async function searchCatalog(catalog: Catalog, query: string, page: number) {
  const base = catalogURL(catalog.url)

  if (catalog.kind === "index") {
    const result = Schema.decodeUnknownSync(Search)(JSON.parse(await downloadText(base)))

    const filtered = result.items.filter((item) =>
      `${item.title ?? item.slug} ${item.description ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()),
    )

    return filtered.slice(page * 24, (page + 1) * 24).map((item) => normalize(item, base))
  }

  const url = new URL(query.trim() ? "v1/search" : "v1/skills", base.href.replace(/\/?$/, "/"))

  if (query.trim()) {
    if (page * 24 >= 100) return []

    url.searchParams.set("q", query.trim())
    // SkillMD search supports a result limit, not an offset; request a prefix and slice it locally.
    url.searchParams.set("limit", String(Math.min((page + 1) * 24, 100)))
  }

  if (!query.trim()) {
    url.searchParams.set("limit", "24")
    url.searchParams.set("offset", String(page * 24))
  }

  const result = Schema.decodeUnknownSync(Search)(JSON.parse(await downloadText(url)))

  return (query.trim() ? result.items.slice(page * 24, (page + 1) * 24) : result.items).map((item) =>
    normalize(item, base),
  )
}

export async function previewSkill(catalog: Catalog, slug: string): Promise<Detail> {
  const base = catalogURL(catalog.url)

  if (catalog.kind === "index") {
    const index = Schema.decodeUnknownSync(Search)(JSON.parse(await downloadText(base)))
    const hit = index.items.find((item) => item.slug === slug)

    if (!hit) throw new Error("Skill is no longer listed in this catalog")
    const item = normalize(hit, base)
    const content = await downloadText(catalogURL(item.rawURL))
    const header = parseSkill(content)

    return {
      ...item,
      title: header.name,
      description: header.description,
      content,
      license: header.license ?? "",
      files: ["SKILL.md", ...(hit.files ?? []).map((file) => file.path)],
    }
  }

  const key = slug.split("/")

  if (key.length !== 2 || key.some((value) => !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(value)))
    throw new Error("Invalid catalog skill identifier")
  const url = new URL(`v1/skills/${key.map(encodeURIComponent).join("/")}`, base.href.replace(/\/?$/, "/"))
  const metadata = Schema.decodeUnknownSync(Metadata)(JSON.parse(await downloadText(url)))
  const item = normalize(metadata, base)
  const content = await downloadText(catalogURL(item.rawURL))
  const header = parseSkill(content)

  return {
    ...item,
    title: header.name,
    description: header.description,
    content,
    license: metadata.license ?? header.license ?? "",
    files: ["SKILL.md", ...(metadata.files ?? []).map((file) => file.path)],
  }
}

export async function installSkill(root: string, catalog: Catalog, slug: string): Promise<Installed> {
  const detail = await previewSkill(catalog, slug)
  const id = createHash("sha256").update(`${catalog.url}\n${slug}`).digest("hex").slice(0, 24)
  const folder = `aai-library-${id}`
  const source = detail.bundleURL ? await download(catalogURL(detail.bundleURL)) : undefined
  const files = source ? unpackSkill(source) : new Map([["SKILL.md", new TextEncoder().encode(detail.content)]])
  const main = files.get("SKILL.md")

  if (!main) throw new Error("The download does not contain SKILL.md")
  const header = parseSkill(new TextDecoder().decode(main))
  const temporary = path.resolve(root, "aai-skill-library", "downloads")
  await mkdir(temporary, { recursive: true })
  const staging = await mkdtemp(path.join(temporary, "install-"))

  if (!path.resolve(staging).startsWith(temporary + path.sep)) throw new Error("Unexpected skill staging directory")

  try {
    await Promise.all(
      [...files].map(async ([name, bytes]) => {
        const destination = inside(staging, name)
        await mkdir(path.dirname(destination), { recursive: true })
        await writeFile(destination, bytes, { flag: "wx" })
      }),
    )
    const active = path.resolve(root, "skills")
    await mkdir(active, { recursive: true })
    // A completed package becomes discoverable in one move; existing skills are never overwritten.
    await rename(staging, inside(active, folder))
  } finally {
    await rm(staging, { recursive: true, force: true })
  }

  return {
    id,
    folder,
    catalog: catalog.url,
    slug,
    name: header.name,
    description: header.description,
    enabled: true,
    files: [...files.keys()],
  }
}

export async function toggleSkill(root: string, skill: Installed, enabled: boolean) {
  if (skill.enabled === enabled) return
  const active = path.resolve(root, "skills")
  const disabled = path.resolve(root, "aai-skill-library", "disabled")
  await mkdir(enabled ? active : disabled, { recursive: true })
  await rename(
    inside(skill.enabled ? active : disabled, skill.folder),
    inside(enabled ? active : disabled, skill.folder),
  )
}

export function unpackSkill(bytes: Uint8Array) {
  const sizes = { total: 0, count: 0 }

  const archive = unzipSync(bytes, {
    filter: (file) => {
      sizes.total += file.originalSize
      sizes.count++

      if (sizes.total > 32 * 1024 * 1024 || sizes.count > 256 || file.originalSize > maxDownload)
        throw new Error("Skill bundle exceeds the file or size limit")

      return true
    },
  })

  const entries = Object.entries(archive).filter(([name]) => !name.endsWith("/"))

  const primary = entries
    .map(([name]) => name)
    .filter((name) => name === "SKILL.md" || name.endsWith("/SKILL.md"))
    .toSorted((a, b) => a.length - b.length)[0]

  if (!primary) throw new Error("Skill bundle is missing SKILL.md")
  const prefix = primary.slice(0, -"SKILL.md".length)
  const result = new Map<string, Uint8Array>()
  const names = new Set<string>()
  entries.forEach(([name, data]) => {
    safeName(name)

    if (!name.startsWith(prefix)) throw new Error("Skill bundle contains files outside its skill directory")
    const relative = name.slice(prefix.length)
    safeName(relative)

    if (names.has(relative.toLowerCase())) throw new Error("Skill bundle contains conflicting filenames")
    names.add(relative.toLowerCase())
    result.set(relative, data)
  })

  return result
}

function parseSkill(content: string) {
  // gray-matter supports executable language engines; downloaded skills may only select plain YAML.
  if (!/^---[ \t]*\r?\n/.test(content)) throw new Error("Skill must include YAML frontmatter with name and description")

  return Schema.decodeUnknownSync(Frontmatter)(matter(content, { language: "yaml" }).data)
}

function safeName(name: string) {
  if (
    !name ||
    name.includes("\\") ||
    name.includes(":") ||
    name.includes("\0") ||
    path.posix.isAbsolute(name) ||
    name
      .split("/")
      .some(
        (part) =>
          !part ||
          part === "." ||
          part === ".." ||
          /[. ]$/.test(part) ||
          /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
      )
  )
    throw new Error("Skill bundle contains an unsafe relative path")
}

function inside(root: string, relative: string) {
  safeName(relative)
  const result = path.resolve(root, relative)

  if (!result.startsWith(path.resolve(root) + path.sep)) throw new Error("Skill path is outside the library directory")

  return result
}

function normalize(item: typeof RemoteItem.Type, base: URL): Item {
  const rawURL = catalogURL(new URL(item.raw_url, base).href).href
  const bundleURL = item.bundle_url ? catalogURL(new URL(item.bundle_url, base).href).href : undefined

  return {
    slug: item.slug,
    title: item.title ?? item.slug,
    description: item.description ?? "",
    verified: item.verified ?? false,
    rawURL,
    url: item.url
      ? catalogURL(new URL(item.url, base).href).href
      : base.hostname === "api.skillmd.com"
        ? `https://skillmd.com/skills/${item.slug.split("/").map(encodeURIComponent).join("/")}`
        : rawURL,
    bundleURL,
  }
}

async function downloadText(url: URL) {
  return new TextDecoder().decode(await download(url))
}

async function download(url: URL, redirects = 0): Promise<Uint8Array> {
  if (redirects > 5) throw new Error("Catalog returned too many redirects")

  const response = await fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(30000),
    headers: { accept: "application/json, text/markdown, application/zip, */*" },
  })

  if (response.status >= 300 && response.status < 400) {
    const destination = response.headers.get("location")

    if (!destination) throw new Error("Catalog returned an empty redirect")

    return download(catalogURL(new URL(destination, url).href), redirects + 1)
  }

  if (!response.ok) throw new Error(`Catalog request failed (HTTP ${response.status})`)

  if (Number(response.headers.get("content-length")) > maxDownload) throw new Error("Skill download is too large")

  if (!response.body) throw new Error("Catalog returned an empty response")
  const chunks: Uint8Array[] = []
  const reader = response.body.getReader()
  const size = { value: 0 }

  try {
    while (true) {
      const chunk = await reader.read()

      if (chunk.done) break
      size.value += chunk.value.byteLength

      if (size.value > maxDownload) throw new Error("Skill download is too large")
      chunks.push(chunk.value)
    }
  } finally {
    await reader.cancel()
  }

  return Buffer.concat(chunks)
}
