import path from "node:path"
import { mkdir } from "node:fs/promises"
import pkg from "../package.json"

const root = path.resolve(import.meta.dirname, "..")
const mode = process.argv[2] ?? "build"
const args = process.argv.slice(3)
const channel = process.env.OPENCODE_CHANNEL ?? "dev"
const arch = process.arch
const target = arch === "x64" ? "cli-windows-x64-baseline" : "cli-windows-arm64"
const cliRoot = path.join(root, "packages/cli/dist")
const cli = path.join(cliRoot, target, "bin/opencode.exe")
const executable = channel === "prod" ? "AAi.exe" : channel === "beta" ? "AAi Beta.exe" : "AAi Dev.exe"
const desktop = path.join(root, "packages/desktop/dist", arch === "arm64" ? "win-arm64-unpacked" : "win-unpacked", executable)
const env = {
  ...process.env,
  PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH ?? ""}`,
  OPENCODE_CHANNEL: channel,
  OPENCODE_VERSION: process.env.OPENCODE_VERSION ?? pkg.version,
  OPENCODE_CLI_DIST: cliRoot,
  OPENCODE_CLI_TARGET: arch === "arm64" ? "aarch64-pc-windows-msvc" : "x86_64-pc-windows-msvc",
}

if (process.platform !== "win32") throw new Error("The batch workflow builds Windows executables only.")
if (arch !== "x64" && arch !== "arm64") throw new Error(`Unsupported Windows architecture: ${arch}`)
if (!["dev", "beta", "prod"].includes(channel)) throw new Error("OPENCODE_CHANNEL must be dev, beta, or prod.")
if (!Bun.semver.satisfies(Bun.version, `^${pkg.packageManager.split("@")[1]}`))
  throw new Error(`Install ${pkg.packageManager} or a compatible newer Bun version, then run this script again.`)

await main()

async function main() {
  if (mode === "--help" || (["build", "build-cli"].includes(mode) && args.includes("--help"))) {
    console.log("[AAi] Windows workflows: build, build-cli, run, run-cli, install, dev, desktop-dev, web, check, sync.")
    console.log("[AAi] build.bat creates the matching CLI, desktop executable, and installer. run.bat opens the desktop.")
    console.log("[AAi] Set OPENCODE_CHANNEL=dev, beta, or prod to choose the application identity; the default is dev.")
    return
  }

  if (mode === "run") {
    if (!(await Bun.file(desktop).exists())) throw new Error("Desktop executable missing. Run build.bat first.")
    console.log(`[AAi] Opening ${desktop}`)
    const child = Bun.spawn([desktop, ...args], { cwd: root, env, stdio: ["ignore", "ignore", "ignore"] })
    child.unref()
    return
  }

  if (mode === "run-cli") {
    if (!(await Bun.file(cli).exists())) throw new Error("CLI executable missing. Run build-cli.bat first.")
    return run([cli, ...args])
  }

  if (mode === "install") return run([process.execPath, "install", "--frozen-lockfile", ...args])
  if (mode === "dev") return script(root, "dev", args)
  if (mode === "desktop-dev") return script(root, "dev:desktop", args)
  if (mode === "web") return script(root, "dev:web", args)
  if (mode === "check") return script(root, "check", args)
  if (mode === "sync") return script(root, "sync:upstream", args)
  if (!["build", "build-cli"].includes(mode)) throw new Error(`Unknown Windows workflow: ${mode}`)
  if (args.length) throw new Error("Builds use the current Windows architecture. Set OPENCODE_CHANNEL to dev, beta, or prod.")
  const missing = ["node", "git"].find((tool) => !Bun.which(tool))
  if (missing) throw new Error(`Install ${missing === "node" ? "Node.js 24 or newer" : "Git for Windows"} and reopen the terminal before building.`)

  console.log(`[AAi] Building ${pkg.version} (${channel}, Windows ${arch}) from this checkout.`)
  await run([process.execPath, "install", "--frozen-lockfile"])
  // The desktop calls its stable channel "prod"; the CLI calls it "latest" and uses that to discover service.json.
  await script(
    path.join(root, "packages/cli"),
    "build",
    [`--target=${target.replace("cli-", "opencode-")}`, "--skip-install"],
    { ...env, OPENCODE_CHANNEL: channel === "prod" ? "latest" : channel },
  )
  const verify = path.join(root, "node_modules/.cache/windows-cli-check")
  await run([cli, "--version"], {
    ...env,
    XDG_DATA_HOME: path.join(verify, "data"),
    XDG_CONFIG_HOME: path.join(verify, "config"),
    XDG_STATE_HOME: path.join(verify, "state"),
    OPENCODE_CONFIG_DIR: path.join(verify, "config/opencode"),
  })
  await mkdir(path.join(root, "artifacts"), { recursive: true })
  await Bun.write(path.join(root, "artifacts/aai.exe"), Bun.file(cli))

  if (mode === "build-cli") return console.log(`[AAi] CLI ready: ${path.join(root, "artifacts/aai.exe")}`)

  const directory = path.join(root, "packages/desktop")
  await script(directory, "install-electron")
  // Bun runs prebuild before build: it copies this checkout's CLI, never a downloaded server.
  await script(directory, "build")
  await script(directory, "package:win", [`--${arch}`, "--publish=never"])
  if (!(await Bun.file(desktop).exists())) throw new Error(`Packaged desktop executable missing: ${desktop}`)
  const installer = path.join(directory, `dist/opencode-desktop-win-${arch}.exe`)
  if (!(await Bun.file(installer).exists())) throw new Error(`Windows installer missing: ${installer}`)
  await Bun.write(path.join(root, `artifacts/AAi-Setup-${arch}.exe`), Bun.file(installer))
  console.log(`[AAi] Desktop ready: ${desktop}`)
  console.log(`[AAi] Installer ready: ${path.join(root, `artifacts/AAi-Setup-${arch}.exe`)}`)
  console.log("[AAi] Use run.bat to launch the desktop, or run-cli.bat for the terminal UI.")
}

async function script(directory: string, name: string, extra: string[] = [], environment = env) {
  await run([process.execPath, "run", "--cwd", directory, name, ...extra], environment)
}

async function run(command: string[], environment = env) {
  const code = await Bun.spawn(command, { cwd: root, env: environment, stdio: ["inherit", "inherit", "inherit"] }).exited
  if (code !== 0) throw new Error(`[AAi] ${command.join(" ")} failed (exit ${code}).`)
}
