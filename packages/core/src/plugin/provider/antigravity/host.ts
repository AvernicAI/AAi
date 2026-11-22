export * as AntigravityHost from "./host.js"

import type {
  CreateTerminalRequest,
  ReadTextFileRequest,
  WriteTextFileRequest,
  RequestPermissionRequest,
} from "@agentclientprotocol/sdk"
import { Effect } from "effect"
import path from "node:path"
import type { FileWrite } from "../../../file-write.js"
import type { FileAccess } from "../../../file-access.js"
import type { Permission } from "../../../permission.js"
import type { Interface } from "../../../shell.js"
import { SessionID } from "@opencode/schema/session-id"
import { Agent } from "@opencode/schema/agent"
import { Shell } from "@opencode/schema/shell"

export type Request = { sessionID?: SessionID; agent: Agent.ID; primary: boolean; signal: AbortSignal }

export function create(
  input: {
    directory: string
    write: FileWrite.Interface
    access: FileAccess.Interface
    permission: Permission.Interface
    shell: Interface
    run: <A, E>(effect: Effect.Effect<A, E>, signal: AbortSignal) => Promise<A>
  },
  request: Request,
) {
  const terminals = new Set<Shell.ID>()
  const run = <A, E>(effect: Effect.Effect<A, E>) => input.run(effect, request.signal)
  const approve = async (action: string, resources: string[], metadata?: Permission.AssertInput["metadata"]) => {
    request.signal.throwIfAborted()
    if (!request.primary || !request.sessionID)
      throw new Error("Auxiliary Antigravity requests cannot access workspace tools.")
    await run(
      input.permission.assert({ sessionID: request.sessionID, agent: request.agent, action, resources, metadata }),
    )
  }
  const target = async (file: string, action: "read" | "edit") => {
    const absolute = path.resolve(input.directory, file)
    const relative = path.relative(input.directory, absolute)

    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
      await approve("external_directory", [path.dirname(absolute)])
    await approve(action, [absolute])
    return absolute
  }
  const terminal = async (id: string) => {
    const info = await run(input.shell.get(Shell.ID.make(id)))

    if (info.metadata.sessionID !== request.sessionID || info.metadata.antigravity !== true)
      throw new Error("This Antigravity terminal belongs to a different session.")
    return info
  }

  return {
    async dispose() {
      // The ACP process ends after this request; stop only terminals created by this host to avoid orphan commands.
      await Promise.allSettled(
        [...terminals].map((id) => input.run(input.shell.stop(id, "killed"), AbortSignal.timeout(5_000))),
      )
      terminals.clear()
    },
    async permission(params: RequestPermissionRequest) {
      const option = params.options.find((option) => option.kind === "allow_once")
      if (!option) return { outcome: { outcome: "cancelled" as const } }
      const resources = params.toolCall.locations?.map((location) => location.path) ?? []
      await approve("antigravity", resources.length ? resources : [params.toolCall.title ?? "Antigravity action"], {
        title: params.toolCall.title,
        kind: params.toolCall.kind,
      })
      return { outcome: { outcome: "selected" as const, optionId: option.optionId } }
    },
    async read(params: ReadTextFileRequest) {
      const file = await target(params.path, "read")
      const lines = (await Bun.file(file).text()).split("\n")
      const start = Math.max(0, (params.line ?? 1) - 1)
      return { content: lines.slice(start, params.limit == null ? undefined : start + params.limit).join("\n") }
    },
    async write(params: WriteTextFileRequest) {
      const file = await target(params.path, "edit")
      request.signal.throwIfAborted()
      const resolved = await run(input.access.resolve({ path: file, kind: "file" }))
      await run(input.write.commit(resolved, params.content))
      return {}
    },
    async start(params: CreateTerminalRequest) {
      const cwd = path.resolve(input.directory, params.cwd ?? ".")
      const quote = (value: string) =>
        process.platform === "win32" ? `'${value.replaceAll("'", "''")}'` : `'${value.replaceAll("'", "'\\''")}'`
      const command = `${process.platform === "win32" ? "& " : ""}${[params.command, ...(params.args ?? [])].map(quote).join(" ")}`
      await approve("shell", [command], { cwd })
      const info = await run(
        input.shell.create(
          {
            command,
            cwd,
            shell: process.platform === "win32" ? "powershell.exe" : "/bin/sh",
            timeout: 0,
            metadata: { sessionID: request.sessionID, antigravity: true, background: true },
          },
          (invocation) =>
            Effect.sync(() => {
              params.env?.forEach((item) => {
                invocation.env[item.name] = item.value
              })
            }),
        ),
      )
      terminals.add(info.id)
      return { terminalId: info.id }
    },
    async output(id: string) {
      const info = await terminal(id)
      const output = await run(input.shell.output(info.id, { limit: 262144 }))
      return {
        output: output.output,
        truncated: output.truncated,
        ...(info.status === "running"
          ? {}
          : { exitStatus: { exitCode: info.exit ?? null, signal: info.signal ?? null } }),
      }
    },
    async wait(id: string) {
      const info = await terminal(id)
      const ended = await run(input.shell.wait(info.id))
      return { exitCode: ended.exit ?? null, signal: ended.signal ?? null }
    },
    async stop(id: string) {
      const info = await terminal(id)
      if (info.status === "running") await run(input.shell.stop(info.id, "killed"))
      return {}
    },
  }
}
