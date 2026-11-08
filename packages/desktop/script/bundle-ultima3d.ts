import { $ } from "bun"
import { cp, mkdir, mkdtemp, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { getCurrentCli } from "./utils"

const revision = "0146672a575c45496cee8f0e99203823939c525c"

export async function bundleUltima3d(resources: string) {
  const cli = getCurrentCli()
  const blender = process.env.OPENCODE_ULTIMA3D_BLENDER_DIST
  if (blender) {
    const executable =
      cli.os === "darwin" ? "Blender.app/Contents/MacOS/Blender" : cli.os === "win32" ? "blender.exe" : "blender"
    if (!(await stat(path.join(blender, executable))).isFile())
      throw new Error(`Invalid Blender distribution for ${cli.target}: ${blender}`)
  }
  const target = [
    cli.cpu === "arm64" ? "aarch64" : "x86_64",
    cli.os === "win32" ? "pc-windows-msvc" : cli.os === "darwin" ? "apple-darwin" : "unknown-linux-gnu",
  ].join("-")
  const work = await mkdtemp(path.join(tmpdir(), "aai-ultima3d-"))

  try {
    await $`git init -q ${work}`
    await $`git -C ${work} fetch --depth 1 https://github.com/buffbot88/Ultima3D.git ${revision}`
    await $`git -C ${work} checkout --detach FETCH_HEAD`
    const dest = path.join(resources, "ultima3d")
    const binary = cli.os === "win32" ? "ultima3d-server.exe" : "ultima3d-server"
    const compiled = path.join(work, "rust", "target", target, "release", binary)
    const upstream = path.join(work, binary)
    const published = cli.os === "win32" && cli.cpu === "x64"
    if (published) {
      const expected = "cb2aacb84c1f017bc63b176413ba70200aaeb90dc5631e71547cb57c60c7717b"
      const existing = Bun.file(path.join(dest, binary))
      const cached = (await existing.exists()) ? await existing.arrayBuffer() : undefined
      if (cached && Bun.CryptoHasher.hash("sha256", cached, "hex") === expected) {
        await Bun.write(upstream, cached)
      }
      if (!(await Bun.file(upstream).exists())) {
        const response = await fetch(
          "https://github.com/buffbot88/Ultima3D/releases/download/v0.6.0/ultima3d-server.exe",
        ).catch(() => undefined)
        if (response?.ok) {
          const bytes = await response.arrayBuffer()
          if (Bun.CryptoHasher.hash("sha256", bytes, "hex") !== expected)
            throw new Error("Ultima3D release binary did not match the pinned SHA-256")
          await Bun.write(upstream, bytes)
        }
      }
    }

    const released = published && (await Bun.file(upstream).exists())
    if (!released) {
      await $`rustup target add ${target}`
      await $`cargo build --locked --release --target ${target} -p ultima3d-server`.cwd(path.join(work, "rust"))
    }

    await mkdir(dest, { recursive: true })
    await Promise.all([
      cp(released ? upstream : compiled, path.join(dest, binary)),
      cp(path.join(work, "LICENSE"), path.join(dest, "LICENSE")),
      ...["blender", "godot", "photoshop"].map((dir) =>
        cp(path.join(work, dir), path.join(dest, dir), { recursive: true }),
      ),
      ...(blender
        ? [cp(blender, path.join(dest, "blender-runtime"), { recursive: true, verbatimSymlinks: true })]
        : []),
    ])
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}
