export * as AntigravityProtocol from "./protocol.js"

import type { ClientApp, ClientContext, InitializeResponse, SessionConfigOption } from "@agentclientprotocol/sdk"
import { execFile, spawn } from "node:child_process"
import { promisify } from "node:util"
import { existsSync } from "node:fs"
import path from "node:path"
import { Readable, Writable } from "node:stream"
import { which } from "../../../util/which.js"

export function executable() {
  const configured = process.env.OPENCODE_ANTIGRAVITY_PATH
  const found =
    configured ||
    which("agy") ||
    (process.platform === "win32" && process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, "agy", "bin", "agy.exe")
      : undefined)

  return found && existsSync(found) ? found : undefined
}

export async function connect<T>(
  input: {
    directory: string
    app?: ClientApp
    signal: AbortSignal
    env?: Record<string, string>
  },
  operation: (connection: ClientContext, initialized: InitializeResponse) => Promise<T>,
) {
  const { client, ndJsonStream } = await import("@agentclientprotocol/sdk")
  const command = executable()

  if (!command)
    throw new Error(
      "Antigravity CLI is missing. Install the official CLI, or set OPENCODE_ANTIGRAVITY_PATH. Then run agy acp --login.",
    )
  input.signal.throwIfAborted()
  const child = spawn(command, ["acp", "--disable-telemetry", "--sandbox"], {
    cwd: input.directory,
    env: { ...process.env, ...input.env },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  })
  const aborted = () => child.kill()
  const exited = Promise.withResolvers<never>()
  child.once("error", (error) => exited.reject(error))
  child.once("exit", (code) =>
    exited.reject(new Error(`Antigravity CLI exited (${code ?? "interrupted"}). Reconnect or run agy acp --login.`)),
  )
  child.stderr.resume()
  input.signal.addEventListener("abort", aborted, { once: true })
  const app = input.app ?? client({ name: "AlphaAi" })
  const stream = ndJsonStream(Writable.toWeb(child.stdin), Readable.toWeb(child.stdout))

  try {
    return await Promise.race([
      app.connectWith(stream, async (connection) => {
        const initialized = await connection.request(
          "initialize",
          {
            protocolVersion: 1,
            clientInfo: { name: "AlphaAi", title: "AlphaAi by AAi", version: "1" },
            clientCapabilities: {
              fs: { readTextFile: !!input.app, writeTextFile: !!input.app },
              terminal: !!input.app,
            },
          },
          { cancellationSignal: input.signal },
        )
        return operation(connection, initialized)
      }),
      exited.promise,
    ])
  } finally {
    input.signal.removeEventListener("abort", aborted)
    child.stdin.end()
    child.kill()
  }
}

export async function discover(directory: string, signal: AbortSignal) {
  const command = executable()
  if (!command) throw new Error("Install the official Antigravity CLI, then run agy acp --login.")
  const result = await promisify(execFile)(command, ["models"], {
    cwd: directory,
    signal,
    windowsHide: true,
    maxBuffer: 2 * 1024 * 1024,
  })
  const models = parseModels(result.stdout)
  if (!models.length) throw new Error("Antigravity returned no models. Sign in with agy acp --login and refresh.")
  return connect({ directory, signal }, async (_connection, initialized) => ({
    version: initialized.agentInfo?.version ?? "unknown",
    models,
  }))
}

export function parseModels(output: string) {
  return output.split(/\r?\n/).flatMap((line) => {
    const columns = line.trim().split("\t")
    if (columns.length < 2 || !/^[a-z0-9][a-z0-9._-]+$/.test(columns[0]) || columns[0] === "model") return []
    return [{ modelId: columns[0], name: columns[1] }]
  })
}

/** Only select values advertised by the running official agent. */
export function modelSelection(options: SessionConfigOption[], modelID: string) {
  const choices = options.find((option) => option.category === "model")
  const values =
    choices?.type === "select"
      ? choices.options.flatMap((option) =>
          "value" in option ? [option.value] : option.options.map((item) => item.value),
        )
      : []
  const model = values
    .filter((value) => modelID === value || modelID.startsWith(`${value}-`))
    .sort((a, b) => b.length - a.length)[0]
  if (!model || !choices)
    throw new Error("Antigravity no longer offers this model. Refresh models or update the official CLI.")
  return { configId: choices.id, value: model }
}

export function effortSelection(options: SessionConfigOption[], model: string, modelID: string) {
  if (modelID === model) return
  const thought = options.find((option) => option.id === "thought_level" || option.id === "thinking_level")
  const suffix = modelID.slice(model.length + 1)
  const efforts =
    thought?.type === "select"
      ? thought.options.flatMap((option) =>
          "value" in option ? [option.value] : option.options.map((item) => item.value),
        )
      : []
  if (!thought || !efforts.includes(suffix))
    throw new Error("Antigravity does not offer this reasoning level. Refresh the model catalog.")
  return { configId: thought.id, value: suffix }
}
