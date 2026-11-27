import { randomUUID } from "node:crypto"
import { rename, rm } from "node:fs/promises"
import path from "node:path"
import { getMakeNsisPath } from "app-builder-lib/out/toolsets/windows"

export async function packageWindowsCli(binary: string, output: string, version: string) {
  const fileVersion = /^(\d+\.\d+\.\d+)(?:[-+][\w.+-]+)?$/.exec(version)?.[1]
  if (!fileVersion) throw new Error(`Invalid Windows CLI version: ${version}`)
  if (!(await Bun.file(binary).exists())) throw new Error(`Missing CLI executable: ${binary}`)

  const compiler = await getMakeNsisPath(undefined, undefined)
  const script = path.resolve(import.meta.dirname, "../../../script/windows-cli-installer.nsi")
  const temporary = `${path.resolve(output)}.${randomUUID()}.tmp`
  try {
    const result = Bun.spawn(
      [
        compiler.path,
        `/DCLI_BINARY=${path.resolve(binary)}`,
        `/DCLI_SETUP=${temporary}`,
        `/DCLI_VERSION=${version}`,
        `/DCLI_FILE_VERSION=${fileVersion}`,
        script,
      ],
      { env: { ...process.env, ...compiler.env }, stdout: "inherit", stderr: "inherit" },
    )
    const code = await result.exited
    if (code !== 0) throw new Error(`Windows CLI setup build failed (exit ${code}).`)
    await rename(temporary, output)
  } finally {
    await rm(temporary, { force: true })
  }
}
