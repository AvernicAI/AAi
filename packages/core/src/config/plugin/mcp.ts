export * as ConfigMcpPlugin from "./mcp.js"

import { define } from "@opencode/plugin/effect/plugin"
import { Document, type Entry } from "@opencode/schema/config"
import type { ServerConfig } from "@opencode/schema/mcp"
import { Effect, Stream } from "effect"
import { join } from "node:path"
import { existsSync } from "node:fs"
import { Config } from "../../config.js"
import { Mcp } from "../../mcp/index.js"
import { which } from "../../util/which.js"

export const Plugin = define({
  id: "opencode.config.mcp",
  effect: Effect.fn(function* (ctx) {
    yield* register(ctx.event.subscribe({ types: ["config.updated"] }))
  }),
})

export const register = Effect.fn("ConfigMCPPlugin.register")(function* (
  events: Stream.Stream<{ readonly type: string }, unknown>,
) {
  const config = yield* Config.Service
  const mcp = yield* Mcp.Service
  const loaded = { entries: [] as Entry[] }

  yield* events.pipe(
    Stream.filter((event) => event.type === "config.updated"),
    Stream.runForEach(() =>
      config.entries().pipe(
        Effect.tap((entries) => Effect.sync(() => (loaded.entries = entries))),
        Effect.andThen(mcp.reload()),
        Effect.catchCause((cause) => Effect.logError("failed to reload MCP config", { cause })),
      ),
    ),
    Effect.ignore,
    Effect.forkScoped({ startImmediately: true }),
  )

  // Subscribe before the initial load so updates racing it trigger a rebuild.
  loaded.entries = yield* config.entries()
  yield* mcp.transform((editor) => {
    const documents = loaded.entries.filter((entry): entry is Document => entry.type === "document")
    // Global timeout defaults merge in config order; each server can override them.
    const timeout = Object.assign(
      {},
      ...documents.flatMap((entry) => (entry.info.mcp?.timeout ? [entry.info.mcp.timeout] : [])),
    )
    const servers = new Map<string, ServerConfig>()
    for (const document of documents) {
      for (const [name, server] of Object.entries(document.info.mcp?.servers ?? {})) {
        servers.set(name, server)
      }
    }
    for (const [name, server] of servers) {
      if (editor.get(name)) continue
      // The original desktop REA preset selected a profile that REA 6.8.0 rejects.
      if (
        name === "rea" &&
        server.type === "local" &&
        server.command.length === 2 &&
        server.command[0] === "rea" &&
        server.command[1] === "mcp" &&
        server.environment?.REA_MCP_OUTPUT_SCHEMA_PROFILE === "compact"
      ) {
        editor.set(name, {
          ...server,
          environment: { ...server.environment, REA_MCP_OUTPUT_SCHEMA_PROFILE: "off" },
          timeout: { ...timeout, ...server.timeout },
        })
        continue
      }
      editor.set(name, { ...server, timeout: { ...timeout, ...server.timeout } })
    }
    const ultima3d = process.env.OPENCODE_ULTIMA3D_RESOURCES
    if (!ultima3d || editor.get("ultima3d")) return
    const bundledBlender = join(
      ultima3d,
      "blender-runtime",
      process.platform === "darwin"
        ? "Blender.app/Contents/MacOS/Blender"
        : process.platform === "win32"
          ? "blender.exe"
          : "blender",
    )
    const blender =
      process.env.ULTIMA3D_BLENDER ??
      (existsSync(bundledBlender) ? bundledBlender : undefined) ??
      which("blender") ??
      (process.platform === "darwin" ? "/Applications/Blender.app/Contents/MacOS/Blender" : undefined)

    editor.set("ultima3d", {
      type: "local",
      command: [join(ultima3d, process.platform === "win32" ? "ultima3d-server.exe" : "ultima3d-server")],
      environment: {
        ULTIMA3D_WORKER: join(ultima3d, "blender", "worker.py"),
        ...(blender ? { ULTIMA3D_BLENDER: blender } : {}),
      },
      timeout: { execution: 610_000, ...timeout },
    })
  })
})
