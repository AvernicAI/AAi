import { randomUUID } from "node:crypto"
import { shell } from "electron"
import { MenubarItem, type Plugin } from "@opencode/plugin/gui/main"
import { Ide } from "./contract"
import { openWorkspace, type Workspace } from "./workspace"
import { startLanguage, type Language } from "./language"
import { startAdapter, type Adapter } from "./dap"

type Binding = {
  window: number
  workspace: Workspace
  controller: AbortController
  languages: Map<string, Language>
  paths: Map<string, string>
  adapter?: Adapter
}

const setup: Plugin.MainSetup = (ctx) => {
  const bindings = new Map<string, Binding>()

  const get = (binding: string, window: number) => {
    const target = bindings.get(binding)

    if (!target || target.window !== window) throw new Error("ide.binding")

    return target
  }

  const close = async (id: string) => {
    const binding = bindings.get(id)

    if (!binding) return
    bindings.delete(id)
    await binding.adapter?.stop()
    binding.controller.abort()
    await Promise.all([...binding.languages.values()].map((language) => language.close()))
  }

  const language = (binding: Binding, path: string) => {
    const service = binding.languages.get(binding.paths.get(path) ?? "")

    if (!service) throw new Error("ide.language.unavailable")

    return service
  }

  ctx.windows.on("close", (window) =>
    bindings.forEach((binding, id) => {
      if (binding.window === window.id) close(id)
    }),
  )
  ctx.onCleanup(async () => {
    await Promise.all([...bindings.keys()].map(close))
  })

  const provider = ctx.provide(Ide, {
    open: async (input, caller) => {
      if (!ctx.serverEndpoints.get(input.server)?.sameMachine) throw new Error("ide.local")
      const workspace = await openWorkspace(input.directory)
      caller.signal.throwIfAborted()
      const binding = randomUUID()
      bindings.set(binding, {
        window: caller.window,
        workspace,
        controller: new AbortController(),
        languages: new Map(),
        paths: new Map(),
      })

      return { binding, root: workspace.root }
    },
    close: (input, caller) => {
      get(input.binding, caller.window)

      return close(input.binding)
    },
    list: (input, caller) => get(input.binding, caller.window).workspace.list(input.path),
    read: (input, caller) => get(input.binding, caller.window).workspace.read(input.path),
    save: (input, caller) => get(input.binding, caller.window).workspace.save(input.path, input.text, input.version),
    create: (input, caller) => get(input.binding, caller.window).workspace.create(input.path, input.directory),
    renameFile: (input, caller) => get(input.binding, caller.window).workspace.rename(input.path, input.target),
    trash: async (input, caller) => {
      const workspace = get(input.binding, caller.window).workspace
      const file = await workspace.resolve(input.path)

      if (file === workspace.root) throw new Error("ide.path")
      await shell.trashItem(file)
    },
    search: (input, caller) =>
      get(input.binding, caller.window).workspace.search(input.query, input.caseSensitive, caller.signal),
    git: (input, caller) => get(input.binding, caller.window).workspace.status(caller.signal),
    diff: (input, caller) => get(input.binding, caller.window).workspace.diff(input.path, caller.signal),
    stage: async (input, caller) => {
      const workspace = get(input.binding, caller.window).workspace
      await workspace.stage(input.path, input.staged, caller.signal)
    },
    commit: async (input, caller) => {
      if (!input.message.trim()) throw new Error("ide.commit.message")

      return (await get(input.binding, caller.window).workspace.git(["commit", "-m", input.message], caller.signal))
        .stdout
    },
    languageStart: async (input, caller) => {
      const target = get(input.binding, caller.window)
      await target.languages.get(input.language)?.close()
      target.languages.delete(input.language)

      const service = await startLanguage({
        command: input.command,
        workspace: target.workspace,
        signal: target.controller.signal,
        diagnostics: (path, diagnostics) =>
          provider.emit("diagnostics", { binding: input.binding, path, diagnostics }, caller.window),
        output: (message) =>
          provider.emit("status", { binding: input.binding, service: input.language, message }, caller.window),
      })

      if (target.controller.signal.aborted) return service.close()
      target.languages.set(input.language, service)
    },
    languageStop: async (input, caller) => {
      const target = get(input.binding, caller.window)
      await target.languages.get(input.language)?.close()
      target.languages.delete(input.language)
    },
    document: async (input, caller) => {
      const target = get(input.binding, caller.window)
      target.paths.set(input.path, input.language)
      await target.languages.get(input.language)?.document(input.path, input.language, input.text, input.version)
    },
    complete: (input, caller) =>
      language(get(input.binding, caller.window), input.path).complete(input.path, input.position),
    hover: (input, caller) => language(get(input.binding, caller.window), input.path).hover(input.path, input.position),
    locations: (input, caller) =>
      language(get(input.binding, caller.window), input.path).locations(input.path, input.position, input.kind),
    format: (input, caller) => language(get(input.binding, caller.window), input.path).format(input.path),
    rename: (input, caller) =>
      language(get(input.binding, caller.window), input.path).rename(input.path, input.position, input.name),
    debugStart: async (input, caller) => {
      const target = get(input.binding, caller.window)
      await target.adapter?.stop()

      const adapter = startAdapter({
        command: input.command,
        directory: target.workspace.root,
        signal: target.controller.signal,
        event: (event, body) => provider.emit("debug", { binding: input.binding, event, body }, caller.window),
        output: (message) =>
          provider.emit("status", { binding: input.binding, service: "debug", message }, caller.window),
      })

      target.adapter = adapter
      await adapter.request("initialize", {
        clientID: "aai",
        clientName: "AAi",
        adapterID: "aai",
        pathFormat: "path",
        linesStartAt1: true,
        columnsStartAt1: true,
        supportsVariableType: true,
        supportsRunInTerminalRequest: false,
      })
      const request = input.configuration.request === "attach" ? "attach" : "launch"
      void adapter.request(request, { ...input.configuration, cwd: target.workspace.root }).catch((error: Error) => {
        provider.emit("status", { binding: input.binding, service: "debug", message: String(error) }, caller.window)
        adapter.close()
      })
    },
    debugRequest: (input, caller) => {
      const adapter = get(input.binding, caller.window).adapter

      if (!adapter) throw new Error("ide.debug.unavailable")

      return adapter.request(input.command, input.arguments)
    },
    debugStop: async (input, caller) => {
      const target = get(input.binding, caller.window)
      const adapter = target.adapter
      target.adapter = undefined

      if (!adapter) return
      await adapter.stop()
    },
  })

  ctx.add(MenubarItem, {
    menu: "view",
    id: "open",
    get label() {
      return ctx.t("open")
    },
    after: "fileTree.toggle",
    run(window) {
      if (window) provider.emit("open", null, window.id)
    },
  })
}

export default setup
