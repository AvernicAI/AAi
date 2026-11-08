import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { copyFile, cp, mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

const root = new URL("./", import.meta.url)
const source = new URL("public/", root)
const output = new URL("dist/", root)
const release = JSON.parse(await readFile(new URL("release.json", root), "utf8"))
const installer = process.argv[2] ?? fileURLToPath(new URL(`../../artifacts/AAi-${release.version}-Setup-x64.exe`, root))
const installerSize = (await stat(installer)).size
const hash = createHash("sha256")
for await (const chunk of createReadStream(installer)) hash.update(chunk)
const checksum = hash.digest("hex")
if (checksum !== release.sha256 || installerSize !== release.bytes) {
  throw new Error(
    `Installer does not match the ${release.version} release manifest. Verify the build and update release.json before packaging.`,
  )
}

await cp(source, output, { recursive: true })
const index = new URL("index.html", output)
await writeFile(
  index,
  (await readFile(index, "utf8"))
    .replaceAll("{{VERSION}}", release.version)
    .replaceAll("{{SIZE_MB}}", String(Math.round(installerSize / 1_000_000))),
)
const downloads = new URL("downloads/", output)
await mkdir(downloads, { recursive: true })
await copyFile(installer, new URL("AAi-Setup-x64.exe", downloads))
await writeFile(new URL("SHA256SUMS.txt", downloads), `${checksum}  AAi-Setup-x64.exe\n`)
console.log(`Ready to upload: ${fileURLToPath(output)} (${release.version}, Windows x64)`)
