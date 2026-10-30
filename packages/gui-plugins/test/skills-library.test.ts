import { expect, test } from "bun:test"
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { zipSync } from "fflate"
import { catalogURL, installSkill, previewSkill, searchCatalog, toggleSkill, unpackSkill } from "../src/skills/library"

const content =
  "---\nname: aa-fixture\ndescription: A library fixture\nlicense: MIT\n---\n# AAi fixture\nRead references/guide.md.\n"

const encode = (value: string) => new TextEncoder().encode(value)

function fixture(raw = content) {
  const archive = zipSync({
    "fixture/SKILL.md": encode(raw),
    "fixture/LICENSE.txt": encode("MIT fixture"),
    "fixture/references/guide.md": encode("AAi reference file"),
    "fixture/scripts/example.js": encode("throw new Error('Downloaded scripts must not run during install')"),
  })

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const url = new URL(request.url)

      const metadata = {
        slug: "aai/fixture",
        title: "AAi fixture",
        description: "A library fixture",
        raw_url: `${url.origin}/raw`,
        bundle_url: `${url.origin}/bundle`,
        verified: true,
        files: [{ path: "LICENSE.txt" }, { path: "references/guide.md" }, { path: "scripts/example.js" }],
      }

      if (url.pathname === "/raw") return new Response(raw)

      if (url.pathname === "/bundle") return new Response(archive)

      if (url.pathname === "/v1/skills/aai/fixture") return Response.json(metadata)

      return Response.json({ items: [metadata] })
    },
  })

  return { server, catalog: { id: "fixture", name: "Fixture", url: server.url.origin, kind: "skillmd" as const } }
}

test("catalog search and preview preserve instructions, license and bundled resource paths", async () => {
  const source = fixture()

  try {
    const result = await searchCatalog(source.catalog, "fixture", 0)
    expect(result.map((item) => item.slug)).toEqual(["aai/fixture"])
    const detail = await previewSkill(source.catalog, result[0].slug)
    expect(detail.content).toBe(content)
    expect(detail.license).toBe("MIT")
    expect(detail.files).toContain("references/guide.md")
    expect(detail.files).toContain("scripts/example.js")
    const custom = { ...source.catalog, url: `${source.catalog.url}/index.json`, kind: "index" as const }
    expect(await searchCatalog(custom, "no matching description", 0)).toEqual([])
    expect((await previewSkill(custom, "aai/fixture")).content).toBe(content)
  } finally {
    source.server.stop(true)
  }
})

test("bundle installs preserve all resources, toggle discovery, and leave existing skills unchanged", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "aai-library-test-"))

  if (!path.resolve(root).startsWith(path.join(path.resolve(os.tmpdir()), "aai-library-test-")))
    throw new Error("Unexpected test root")
  const source = fixture()

  try {
    await mkdir(path.join(root, "skills", "existing"), { recursive: true })
    await writeFile(path.join(root, "skills", "existing", "SKILL.md"), content)
    const installed = await installSkill(root, source.catalog, "aai/fixture")
    const active = path.join(root, "skills", installed.folder)
    expect(await readFile(path.join(active, "references", "guide.md"), "utf8")).toBe("AAi reference file")
    expect(await readFile(path.join(active, "LICENSE.txt"), "utf8")).toBe("MIT fixture")
    expect(await readFile(path.join(active, "scripts", "example.js"), "utf8")).toContain("must not run")
    await toggleSkill(root, installed, false)
    expect(await readdir(path.join(root, "skills"))).toEqual(["existing"])
    await toggleSkill(root, { ...installed, enabled: false }, true)
    expect((await stat(path.join(active, "SKILL.md"))).isFile()).toBe(true)
    await expect(installSkill(root, source.catalog, "aai/fixture")).rejects.toThrow()
    expect(await readFile(path.join(root, "skills", "existing", "SKILL.md"), "utf8")).toBe(content)
  } finally {
    source.server.stop(true)
    await rm(root, { recursive: true, force: true })
  }
})

test.each([
  "../escape.md",
  "fixture/../../escape.md",
  "C:/escape.md",
  "fixture/CON",
  "fixture/file.",
  "fixture\\escape.md",
])("rejects unsafe archive path %s", (name) => {
  const archive = zipSync({ "fixture/SKILL.md": encode(content), [name]: encode("untrusted") })
  expect(() => unpackSkill(archive)).toThrow()
})

test("rejects filename collisions and excessive bundle entries", () => {
  expect(() =>
    unpackSkill(zipSync({ "fixture/SKILL.md": encode(content), "fixture/skill.md": encode(content) })),
  ).toThrow("conflicting")
  expect(() =>
    unpackSkill(
      zipSync(Object.fromEntries(Array.from({ length: 257 }, (_, index) => [`fixture/${index}.md`, encode("x")]))),
    ),
  ).toThrow("limit")
})

test("downloaded frontmatter cannot select an executable JavaScript parser", async () => {
  const source = fixture("---javascript\n({name:'unsafe',description:'must reject'})\n---\n")

  try {
    await expect(previewSkill(source.catalog, "aai/fixture")).rejects.toThrow("YAML frontmatter")
  } finally {
    source.server.stop(true)
  }
})

test.each(["file:///C:/secret", "https://user:password@example.com", "http://example.com"])(
  "rejects unsupported catalog URL %s",
  (url) => {
    expect(() => catalogURL(url)).toThrow()
  },
)

test("search paginates limit-only catalog results without repeating the first page", async () => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const url = new URL(request.url)
      const count = Math.min(Number(url.searchParams.get("limit") ?? 24), 80)

      return Response.json({
        items: Array.from({ length: count }, (_, index) => ({
          slug: `fixture/skill-${index}`,
          raw_url: `${url.origin}/${index}.md`,
        })),
      })
    },
  })

  const catalog = { id: "fixture", name: "Fixture", url: server.url.origin, kind: "skillmd" as const }

  try {
    expect((await searchCatalog(catalog, "fixture", 0))[0].slug).toBe("fixture/skill-0")
    expect((await searchCatalog(catalog, "fixture", 1))[0].slug).toBe("fixture/skill-24")
    expect((await searchCatalog(catalog, "fixture", 2))[0].slug).toBe("fixture/skill-48")
    expect(await searchCatalog(catalog, "fixture", 3)).toHaveLength(8)
  } finally {
    server.stop(true)
  }
})
