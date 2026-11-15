import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import type { editor } from "monaco-editor"
import { Icon } from "@opencode/ui/icon"
import { artifactKind } from "@opencode/util/artifact"
import {
  Style,
  createKeyed,
  createLatest,
  usePlugin,
  type MountedSession,
  type SessionScreen,
} from "@opencode/plugin/gui"
import { Ide, IdeEditor } from "./contract"
import { Alphie } from "../alphie/contract"
import type definition from "./index"
import { createIdeModel, type IdeModel } from "./model"
import CodeEditor from "./editor"
import Debugger, { parseCommand } from "./debugger"
import WorkspacePicker, { type IdeAction } from "./picker"
import FileComparison from "./diff"
import ProjectTasks from "./tasks"
import css from "./styles.css?inline"

type WorkspaceHost = {
  editor?: editor.IStandaloneCodeEditor
  root?: HTMLDivElement
  filter?: HTMLInputElement
  search?: HTMLInputElement
}

export default function WorkspacePanel(props: { session: MountedSession; screen: SessionScreen }) {
  const ctx = usePlugin<typeof definition>()
  ctx.add(Style, css)
  const client = ctx.use(Ide)
  const key = () => props.session.server.id + "\n" + props.session.directory

  const source = createMemo(
    () => {
      const service = client()

      return service.status === "active" && props.session.server.local
        ? {
            client: service.value,
            key: key(),
            server: props.session.server.id,
            directory: props.session.directory,
            generation: service.generation,
          }
        : undefined
    },
    undefined,
    { equals: (previous, next) => previous?.key === next?.key && previous?.generation === next?.generation },
  )

  const opened = createLatest(source, async (value, signal) => {
    const result = await value.client.open({ server: value.server, directory: value.directory }, { signal })
    const close = () => void value.client.close({ binding: result.binding }).catch(() => undefined)

    if (signal.aborted) {
      close()
      throw new Error("ide.closed")
    }

    signal.addEventListener("abort", close, { once: true })

    return { ...result, key: value.key, client: value.client }
  })

  const current = createMemo(() =>
    opened.latest?.key === key() && client().status === "active" ? opened.latest : undefined,
  )

  return (
    <Show
      when={!!ctx.desktop && props.session.server.local}
      fallback={<div class="aai-ide-message">{ctx.t("unavailable")}</div>}
    >
      <Show
        when={current()}
        keyed
        fallback={
          <div class="aai-ide-message" role="status">
            {opened.error
              ? ctx.t("error", { message: String(opened.error) })
              : client().status !== "active"
                ? ctx.t("disconnected")
                : ctx.t("loading")}
          </div>
        }
      >
        {(workspace) => {
          const model = createIdeModel({
            ctx,
            client: workspace.client,
            binding: workspace.binding,
            root: workspace.root,
          })

          return (
            <Show
              when={!model.state.restoring}
              fallback={
                <div class="aai-ide-message" role="status">
                  {ctx.t("restoring")}
                </div>
              }
            >
              <IdeWorkspace model={model} session={props.session} screen={props.screen} />
            </Show>
          )
        }}
      </Show>
    </Show>
  )
}

function IdeWorkspace(props: { model: IdeModel; session: MountedSession; screen: SessionScreen }) {
  const ctx = usePlugin<typeof definition>()
  const preferences = ctx.stores.preferences
  const alphie = ctx.use(Alphie)
  const editorBridge = ctx.use(IdeEditor)
  createKeyed(
    () => props.model.state.active || undefined,
    () => {
      const service = alphie()

      if (service.status === "active") service.value.navigate()
    },
  )

  const alphieStatus = () => {
    const service = alphie()

    return service.status === "active" && service.value.enabled() ? service.value.snapshot() : undefined
  }

  // Exposes real IDE task outcomes to the companion; closing the IDE tears down this subscription.
  createKeyed(
    () => {
      const task = props.model.state.task

      return task ? `${task.id}:${task.status}` : undefined
    },
    () => {
      const task = props.model.state.task
      const service = alphie()

      if (task && service.status === "active") service.value.task({ ...task, session: props.session.key })
    },
  )
  onCleanup(() => {
    const task = props.model.state.task
    const service = alphie()

    if (task?.status === "running" && service.status === "active")
      service.value.task({ ...task, session: props.session.key, status: "stopped" })
  })

  const [state, setState] = createStore<{
    tool: "explorer" | "search" | "git" | "debug" | "settings"
    bottom: "problems" | "output" | "tasks" | undefined
    query: string
    caseSensitive: boolean
    fileFilter: string
    searching: boolean
    matches: { path: string; line: number; text: string }[]
    truncated: boolean
    searched: boolean
    picker?: "files" | "commands"
    creating?: "file" | "folder" | "rename"
    source?: string
    path: string
    commit: string
    branch: string
    changes: readonly { path: string; index: string; worktree: string }[]
    diff?: string
    reveal?: { path: string; line: number; column: number }
  }>({
    tool: "explorer",
    bottom: undefined,
    query: "",
    caseSensitive: false,
    fileFilter: "",
    searching: false,
    matches: [],
    truncated: false,
    searched: false,
    path: "",
    commit: "",
    branch: "",
    changes: [],
  })

  const widget: WorkspaceHost = {}
  const [svgSource, setSvgSource] = createSignal("")

  const refreshGit = async () => {
    const result = await props.model.client.git({ binding: props.model.binding }, props.model.options)

    if (!props.model.options.signal.aborted) setState({ branch: result.branch, changes: result.changes })
  }

  const reveal = async (path: string, line?: number, column = 1) => {
    const normalized = path.replaceAll("\\", "/")
    const root = props.model.root.replaceAll("\\", "/")

    const relative = normalized.toLowerCase().startsWith(root.toLowerCase() + "/")
      ? normalized.slice(root.length + 1)
      : normalized

    const opened = await props.model.open(relative, line, column)

    if (!opened) return
    const openedPath = props.model.state.active
    setState({ diff: undefined, reveal: line === undefined ? undefined : { path: openedPath, line, column } })
    setSvgSource(line === undefined ? "" : openedPath)
  }

  // A completed agent mutation reveals the real file. Dirty editor drafts are never reloaded.
  createKeyed(
    () => {
      const bridge = editorBridge()

      return bridge.status === "active" ? bridge.value.pending(props.session.key) : undefined
    },
    (request) => {
      void props.model.run(async () => {
        await props.model.refresh()
        await reveal(request.path)
        const file = props.model.activeFile()

        if (file?.kind === "text" && file.text === file.saved) await props.model.reload(true)
        await refreshGit()
      })
    },
  )

  const breakpoint = (line: number) => {
    const path = props.model.state.active

    if (!path) return
    const lines = props.model.state.breakpoints.find((item) => item.path === path)?.lines ?? []
    const next = lines.includes(line) ? lines.filter((item) => item !== line) : [...lines, line].sort((a, b) => a - b)
    props.model.setState("breakpoints", (items) => [
      ...items.filter((item) => item.path !== path),
      { path, lines: next },
    ])
    void props.model.client
      .debugRequest(
        {
          binding: props.model.binding,
          command: "setBreakpoints",
          arguments: { source: { path: props.model.root + "/" + path }, breakpoints: next.map((line) => ({ line })) },
        },
        props.model.options,
      )
      .catch(() => undefined)
  }

  const tool = (value: typeof state.tool) => {
    setState("tool", value)
    void preferences.update((draft) => {
      draft.sidebar = true
    })

    if (value === "git") void props.model.run(refreshGit)

    if (value === "search") queueMicrotask(() => widget.search?.focus())
  }

  const search = async () => {
    setState({ searching: true, searched: true })
    await props.model.run(async () => {
      const result = await props.model.client.search(
        { binding: props.model.binding, query: state.query, caseSensitive: state.caseSensitive },
        props.model.options,
      )

      if (!props.model.options.signal.aborted) setState({ matches: [...result.matches], truncated: result.truncated })
    })

    if (!props.model.options.signal.aborted) setState("searching", false)
  }

  const changeLanguage = async () => {
    const language = preferences.value.language.trim()
    await props.model.client.languageStart(
      { binding: props.model.binding, language, command: parseCommand(preferences.value.languageCommand) },
      props.model.options,
    )

    if (props.model.options.signal.aborted) return
    props.model.setState("languages", (items) => [...items.filter((item) => item !== language), language])
    await Promise.all(
      props.model
        .documents()
        .filter((item) => item.language === language)
        .map(props.model.sync),
    )
    props.model.append(ctx.t("connected", { language }))
  }

  const stopLanguage = async () => {
    const language = preferences.value.language
    await props.model.client.languageStop({ binding: props.model.binding, language }, props.model.options)

    if (props.model.options.signal.aborted) return
    props.model.setState("languages", (items) => items.filter((item) => item !== language))
    props.model.append(ctx.t("stopped", { language }))
  }

  const attach = () => {
    const current = active()
    const editor = preview() ? undefined : widget.editor
    const selection = editor?.getSelection()

    if (!current) return
    props.screen.composer.attach({
      type: "file",
      path: current.path,
      preview: selection && !selection.isEmpty() ? editor?.getModel()?.getValueInRange(selection) : undefined,
      selection:
        selection && !selection.isEmpty()
          ? {
              startLine: selection.startLineNumber,
              endLine: selection.endLineNumber,
              startChar: selection.startColumn - 1,
              endChar: selection.endColumn - 1,
            }
          : undefined,
    })
  }

  const entries = createMemo(() =>
    props.model.state.entries
      .filter((item) => {
        const parents = item.path.split("/").slice(0, -1)

        return (
          parents.every((_, i) => props.model.state.expanded.includes(parents.slice(0, i + 1).join("/"))) &&
          item.path.toLowerCase().includes(state.fileFilter.toLowerCase())
        )
      })
      .sort((a, b) => {
        const left = a.path.split("/")
        const right = b.path.split("/")
        const common = left.findIndex((part, i) => part !== right[i])

        if (common < 0) return -1
        const leftDirectory = common < left.length - 1 || a.directory
        const rightDirectory = common < right.length - 1 || b.directory

        return Number(rightDirectory) - Number(leftDirectory) || (left[common] ?? "").localeCompare(right[common] ?? "")
      }),
  )

  const active = props.model.activeFile
  const document = props.model.current

  const svg = () => {
    const file = document()

    return file && artifactKind(file.path) === "svg" ? file : undefined
  }

  const preview = createMemo(() => {
    const file = active()

    if (file?.kind === "image") return file.src
    const vector = svg()

    if (!vector || svgSource() === vector.path) return
    const src = URL.createObjectURL(new Blob([vector.text], { type: "image/svg+xml" }))
    onCleanup(() => URL.revokeObjectURL(src))

    return src
  })

  const editing = () => !!document() && !preview()

  const save = () =>
    props.model.run(async () => {
      await props.model.save()
      await refreshGit()
    })

  const workspaceName = () => props.model.root.replaceAll("\\", "/").split("/").at(-1) ?? props.model.root

  const diagnostics = createMemo(() => [
    ...props.model.state.markers,
    ...props.model.state.diagnostics.filter(
      (file) => !props.model.state.markers.some((marker) => marker.path === file.path),
    ),
  ])

  const problems = () => diagnostics().reduce((count, file) => count + file.items.length, 0)

  const action = (id: string) => {
    widget.editor?.focus()
    widget.editor?.trigger("aai-workspace", id, undefined)
  }

  const openTerminal = () => {
    if (ctx.commands.run("terminal.toggle")) return
    props.model.setState("error", ctx.t("terminalUnavailable"))
  }

  const toggle = (key: "minimap" | "wordWrap" | "sidebar") =>
    void preferences.update((draft) => {
      draft[key] = !(draft[key] ?? key !== "wordWrap")
    })

  const commands = (): (IdeAction & { menu: "file" | "edit" | "view" | "go" | "run" | "ai" })[] => [
    {
      id: "new",
      menu: "file",
      title: ctx.t("newFile"),
      run: () => {
        tool("explorer")
        setState({ creating: "file", path: "" })
      },
    },
    { id: "open", menu: "file", title: ctx.t("quickOpen"), shortcut: "Ctrl+P", run: () => setState("picker", "files") },
    {
      id: "save",
      menu: "file",
      title: ctx.t("save"),
      shortcut: "Ctrl+S",
      disabled: !editing(),
      run: () => void save(),
    },
    {
      id: "saveAll",
      menu: "file",
      title: ctx.t("saveAll"),
      shortcut: "Ctrl+Shift+S",
      run: () => void props.model.run(props.model.saveAll),
    },
    { id: "undo", menu: "edit", title: ctx.t("undo"), disabled: !editing(), run: () => action("undo") },
    { id: "redo", menu: "edit", title: ctx.t("redo"), disabled: !editing(), run: () => action("redo") },
    { id: "find", menu: "edit", title: ctx.t("findInFile"), disabled: !editing(), run: () => action("actions.find") },
    {
      id: "replace",
      menu: "edit",
      title: ctx.t("replace"),
      disabled: !editing(),
      run: () => action("editor.action.startFindReplaceAction"),
    },
    {
      id: "format",
      menu: "edit",
      title: ctx.t("format"),
      disabled: !editing(),
      run: () => action("editor.action.formatDocument"),
    },
    { id: "sidebar", menu: "view", title: ctx.t("toggleSidebar"), shortcut: "Ctrl+B", run: () => toggle("sidebar") },
    { id: "minimap", menu: "view", title: ctx.t("toggleMinimap"), run: () => toggle("minimap") },
    { id: "wrap", menu: "view", title: ctx.t("toggleWrap"), shortcut: "Alt+Z", run: () => toggle("wordWrap") },
    {
      id: "problems",
      menu: "view",
      title: ctx.t("problems"),
      run: () => setState("bottom", state.bottom === "problems" ? undefined : "problems"),
    },
    {
      id: "line",
      menu: "go",
      title: ctx.t("goToLine"),
      shortcut: "Ctrl+G",
      disabled: !editing(),
      run: () => action("editor.action.gotoLine"),
    },
    {
      id: "outline",
      menu: "go",
      title: ctx.t("outline"),
      shortcut: "Ctrl+Shift+O",
      disabled: !editing(),
      run: () => action("editor.action.quickOutline"),
    },
    {
      id: "definition",
      menu: "go",
      title: ctx.t("definition"),
      disabled: !editing(),
      run: () => action("editor.action.revealDefinition"),
    },
    { id: "tasks", menu: "run", title: ctx.t("tasks"), run: () => setState("bottom", "tasks") },
    { id: "debug", menu: "run", title: ctx.t("debug"), run: () => tool("debug") },
    {
      id: "terminal",
      menu: "run",
      title: ctx.t("terminal"),
      shortcut: "Ctrl+`",
      run: openTerminal,
    },
    { id: "attach", menu: "ai", title: ctx.t(preview() ? "attachFile" : "attach"), disabled: !active(), run: attach },
  ]

  onMount(() => {
    void refreshGit().catch(() => undefined)

    const dismissMenus = (event: Event) => {
      const target = event.target

      widget.root?.querySelectorAll<HTMLDetailsElement>(".aai-ide-menu[open]").forEach((menu) => {
        if (target instanceof Node && !menu.contains(target)) menu.open = false
      })
    }

    const keydown = (event: KeyboardEvent) => {
      if (state.picker) return

      if (event.key === "Escape") {
        widget.root?.querySelectorAll<HTMLDetailsElement>(".aai-ide-menu[open]").forEach((menu) => {
          menu.open = false
        })
      }

      if (event.altKey && event.key.toLowerCase() === "z") {
        event.preventDefault()
        event.stopPropagation()
        toggle("wordWrap")

        return
      }

      if (!(event.ctrlKey || event.metaKey) || event.altKey) return
      const key = event.key.toLowerCase()

      if (!["s", "p", "w", "b", "g", "`"].includes(key) && !(key === "f" && event.shiftKey)) return
      event.preventDefault()
      event.stopPropagation()

      if (key === "s" && (event.shiftKey || editing()))
        void (event.shiftKey ? props.model.run(props.model.saveAll) : save())

      if (key === "w" && active()) props.model.close(props.model.state.active)

      if (key === "p") {
        setState("picker", event.shiftKey ? "commands" : "files")
      }

      if (key === "f") tool("search")

      if (key === "b") toggle("sidebar")

      if (key === "g") action("editor.action.gotoLine")

      if (key === "`") openTerminal()
    }

    widget.root?.addEventListener("keydown", keydown, { capture: true })
    window.document.addEventListener("pointerdown", dismissMenus)
    onCleanup(() => widget.root?.removeEventListener("keydown", keydown, { capture: true }))
    onCleanup(() => window.document.removeEventListener("pointerdown", dismissMenus))
  })

  // Monaco's EditContext is not a textarea; keep the composer's type-to-focus handler out of this panel.
  return (
    <div
      class="aai-ide"
      data-prevent-autofocus
      ref={(element) => {
        widget.root = element
      }}
      aria-label={ctx.t("panel")}
    >
      <header class="aai-ide-commandbar">
        <span class="aai-ide-brand" title="AlphaAi — by AAi">
          AAi
        </span>
        <nav class="aai-ide-menubar" aria-label={ctx.t("workspaceMenu")}>
          <For each={["file", "edit", "view", "go", "run", "ai"] as const}>
            {(menu) => (
              <details class="aai-ide-menu">
                <summary>{ctx.t(`menu.${menu}`)}</summary>
                <div>
                  <For each={commands().filter((item) => item.menu === menu)}>
                    {(item) => (
                      <button
                        disabled={item.disabled}
                        onClick={(event) => {
                          event.currentTarget.closest("details")?.removeAttribute("open")
                          item.run()
                        }}
                      >
                        <span>{item.title}</span>
                        <kbd>{item.shortcut}</kbd>
                      </button>
                    )}
                  </For>
                </div>
              </details>
            )}
          </For>
        </nav>
        <button
          class="aai-ide-command-search"
          onClick={() => setState("picker", "commands")}
          aria-label={ctx.t("commandPalette")}
        >
          <Icon name="magnifying-glass" size="small" />
          <span>
            {workspaceName()} <span>— {ctx.t("commandHint")}</span>
          </span>
          <kbd>Ctrl Shift P</kbd>
        </button>
        <button
          title={ctx.t("toggleSidebar")}
          aria-label={ctx.t("toggleSidebar")}
          aria-pressed={preferences.value.sidebar !== false}
          onClick={() => toggle("sidebar")}
        >
          <Icon name="filetree" />
        </button>
      </header>
      <div class="aai-ide-body">
        <nav class="aai-ide-activity" aria-label={ctx.t("tools")}>
          <For
            each={
              [
                { id: "explorer", icon: "filetree" },
                { id: "search", icon: "magnifying-glass" },
                { id: "git", icon: "branch" },
                { id: "debug", icon: "flask" },
                { id: "settings", icon: "settings-gear" },
              ] as const
            }
          >
            {(item) => (
              <button
                title={ctx.t(item.id)}
                aria-label={ctx.t(item.id)}
                aria-pressed={state.tool === item.id && preferences.value.sidebar !== false}
                onClick={() =>
                  state.tool === item.id && preferences.value.sidebar !== false ? toggle("sidebar") : tool(item.id)
                }
              >
                <Icon name={item.icon} />
                <Show when={item.id === "git" && state.changes.length}>
                  <span class="aai-ide-badge">{state.changes.length}</span>
                </Show>
              </button>
            )}
          </For>
          <button title={ctx.t("terminal")} aria-label={ctx.t("terminal")} onClick={openTerminal}>
            <Icon name="outline-console" />
          </button>
        </nav>
        <aside class="aai-ide-sidebar" hidden={preferences.value.sidebar === false} aria-label={ctx.t(state.tool)}>
          <div class="aai-ide-sidebar-heading">
            <span>{ctx.t(state.tool)}</span>
            <button aria-label={ctx.t("commandPalette")} onClick={() => setState("picker", "commands")}>
              <Icon name="menu" size="small" />
            </button>
          </div>
          <Show when={state.tool === "explorer"}>
            <div class="aai-ide-workspace-name" title={props.model.root}>
              <Icon name="chevron-down" size="small" />
              {workspaceName()}
            </div>
            <div class="aai-ide-toolbar">
              <button
                onClick={() => {
                  setState({ creating: "file", path: "" })
                }}
              >
                {ctx.t("newFile")}
              </button>
              <button
                onClick={() => {
                  setState({ creating: "folder", path: "" })
                }}
              >
                {ctx.t("newFolder")}
              </button>
              <button onClick={() => void props.model.run(props.model.refresh)}>{ctx.t("refresh")}</button>
              <button
                title={ctx.t("collapseFolders")}
                aria-label={ctx.t("collapseFolders")}
                onClick={() => props.model.setState("expanded", [])}
              >
                <Icon name="collapse" size="small" />
              </button>
            </div>
            <input
              ref={(element) => {
                widget.filter = element
              }}
              aria-label={ctx.t("filterExplorer")}
              placeholder={ctx.t("filterExplorer")}
              value={state.fileFilter}
              onInput={(event) => setState("fileFilter", event.currentTarget.value)}
            />
            <Show when={state.creating}>
              <form
                class="aai-ide-create"
                onSubmit={(event) => {
                  event.preventDefault()
                  void props.model.run(async () => {
                    if (state.creating === "rename") {
                      const source = state.source ?? props.model.state.active
                      await props.model.save(source)
                      await props.model.client.renameFile(
                        { binding: props.model.binding, path: source, target: state.path },
                        props.model.options,
                      )
                      props.model.close(source)
                    }

                    if (state.creating !== "rename")
                      await props.model.client.create(
                        { binding: props.model.binding, path: state.path, directory: state.creating === "folder" },
                        props.model.options,
                      )
                    const created = state.path
                    const file = state.creating !== "folder"
                    setState("creating", undefined)
                    await props.model.refresh()

                    if (file) await reveal(created)
                  })
                }}
              >
                <input
                  autofocus
                  aria-label={ctx.t("path")}
                  placeholder={ctx.t("path")}
                  value={state.path}
                  onInput={(event) => setState("path", event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setState("creating", undefined)
                  }}
                />
                <button disabled={!state.path.trim()}>{ctx.t("create")}</button>
                <button type="button" onClick={() => setState("creating", undefined)}>
                  {ctx.t("cancel")}
                </button>
              </form>
            </Show>
            <div class="aai-ide-tree">
              <For each={entries()}>
                {(entry) => (
                  <button
                    class="aai-ide-row"
                    style={{ "padding-inline-start": `${8 + (entry.path.split("/").length - 1) * 14}px` }}
                    aria-pressed={!entry.directory && entry.path === props.model.state.active}
                    aria-expanded={entry.directory ? props.model.state.expanded.includes(entry.path) : undefined}
                    onClick={() =>
                      void props.model.run(() =>
                        entry.directory ? props.model.expand(entry.path) : reveal(entry.path),
                      )
                    }
                    title={entry.path}
                  >
                    <Show when={entry.directory}>
                      <Icon
                        name={
                          props.model.state.expanded.includes(entry.path) ? "chevron-down" : "outline-chevron-right"
                        }
                        size="small"
                      />
                    </Show>
                    <Icon name={entry.directory ? "folder" : "code-slash"} size="small" />
                    <span>{entry.path.split("/").at(-1)}</span>
                    <Show when={state.changes.find((change) => change.path === entry.path)}>
                      {(change) => <small>{change().worktree.trim() || change().index.trim()}</small>}
                    </Show>
                  </button>
                )}
              </For>
            </div>
            <button
              class="aai-ide-quick-open"
              aria-label={ctx.t("quickOpen")}
              onClick={() => setState("picker", "files")}
            >
              <Icon name="magnifying-glass" size="small" />
              {ctx.t("quickOpen")}
              <kbd>Ctrl P</kbd>
            </button>
          </Show>
          <Show when={state.tool === "search"}>
            <form
              onSubmit={(event) => {
                event.preventDefault()
                void search()
              }}
            >
              <input
                ref={(element) => {
                  widget.search = element
                }}
                aria-label={ctx.t("find")}
                placeholder={ctx.t("find")}
                value={state.query}
                onInput={(event) => setState("query", event.currentTarget.value)}
              />
              <label class="aai-ide-check">
                <input
                  type="checkbox"
                  checked={state.caseSensitive}
                  onChange={(event) => setState("caseSensitive", event.currentTarget.checked)}
                />
                {ctx.t("caseSensitive")}
              </label>
              <button disabled={state.searching || !state.query}>
                {ctx.t(state.searching ? "common.loading" : "search")}
              </button>
            </form>
            <Show when={state.searched && !state.searching && !state.matches.length}>
              <p>{ctx.t("noMatches")}</p>
            </Show>
            <For each={state.matches}>
              {(item) => (
                <button class="aai-ide-match" onClick={() => void reveal(item.path, item.line)}>
                  <span>
                    {item.path}:{item.line}
                  </span>
                  <code>{item.text}</code>
                </button>
              )}
            </For>
            <Show when={state.truncated}>
              <p>{ctx.t("truncated")}</p>
            </Show>
          </Show>
          <Show when={state.tool === "git"}>
            <div class="aai-ide-toolbar">
              <span>{state.branch}</span>
              <button onClick={() => void props.model.run(refreshGit)}>{ctx.t("refresh")}</button>
            </div>
            <For each={state.changes}>
              {(item) => (
                <div class="aai-ide-change">
                  <button class="aai-ide-row" onClick={() => void reveal(item.path)}>
                    <code>
                      {item.index}
                      {item.worktree}
                    </code>
                    <span>{item.path}</span>
                  </button>
                  <div class="aai-ide-toolbar">
                    <button onClick={() => setState("diff", item.path)}>{ctx.t("diff")}</button>
                    <button
                      onClick={() =>
                        void props.model.run(async () => {
                          await props.model.client.stage(
                            {
                              binding: props.model.binding,
                              path: item.path,
                              staged: item.index === " " || item.index === "?",
                            },
                            props.model.options,
                          )
                          await refreshGit()
                        })
                      }
                    >
                      {ctx.t(item.index === " " || item.index === "?" ? "stage" : "unstage")}
                    </button>
                  </div>
                </div>
              )}
            </For>
            <Show when={!state.changes.length}>
              <p>{ctx.t("clean")}</p>
            </Show>
            <form
              onSubmit={(event) => {
                event.preventDefault()
                void props.model.run(async () => {
                  props.model.append(
                    await props.model.client.commit(
                      { binding: props.model.binding, message: state.commit },
                      props.model.options,
                    ),
                  )
                  setState("commit", "")
                  await refreshGit()
                })
              }}
            >
              <textarea
                aria-label={ctx.t("commitMessage")}
                placeholder={ctx.t("commitMessage")}
                value={state.commit}
                onInput={(event) => setState("commit", event.currentTarget.value)}
              />
              <button
                disabled={
                  !state.commit.trim() || !state.changes.some((item) => item.index !== " " && item.index !== "?")
                }
              >
                {ctx.t("commit")}
              </button>
            </form>
          </Show>
          <div hidden={state.tool !== "debug"}>
            <Debugger model={props.model} reveal={reveal} />
          </div>
          <Show when={state.tool === "settings"}>
            <h3>{ctx.t("editorPreferences")}</h3>
            <label class="aai-ide-check">
              <input type="checkbox" checked={preferences.value.minimap ?? true} onChange={() => toggle("minimap")} />
              {ctx.t("minimap")}
            </label>
            <label class="aai-ide-check">
              <input
                type="checkbox"
                checked={preferences.value.wordWrap ?? false}
                onChange={() => toggle("wordWrap")}
              />
              {ctx.t("wordWrap")}
            </label>
            <label>
              {ctx.t("fontSize")}
              <input
                type="number"
                min="10"
                max="28"
                value={preferences.value.fontSize ?? 13}
                onChange={(event) => {
                  const size = Number(event.currentTarget.value)

                  if (!Number.isFinite(size)) return
                  void preferences.update((draft) => {
                    draft.fontSize = Math.min(28, Math.max(10, size))
                  })
                }}
              />
            </label>
            <h3>{ctx.t("settings")}</h3>
            <label>
              {ctx.t("language")}
              <input
                value={preferences.value.language}
                onInput={(event) => {
                  const value = event.currentTarget.value
                  void preferences.update((draft) => {
                    draft.language = value
                  })
                }}
              />
            </label>
            <label>
              {ctx.t("languageCommand")}
              <textarea
                rows={4}
                value={preferences.value.languageCommand}
                onInput={(event) => {
                  const value = event.currentTarget.value
                  void preferences.update((draft) => {
                    draft.languageCommand = value
                  })
                }}
              />
            </label>
            <p>{ctx.t("languageHelp")}</p>
            <button onClick={() => void props.model.run(changeLanguage)}>{ctx.t("connect")}</button>
            <button
              disabled={!props.model.state.languages.includes(preferences.value.language)}
              onClick={() => void props.model.run(stopLanguage)}
            >
              {ctx.t("disconnect")}
            </button>
            <For each={props.model.state.languages}>
              {(language) => <p role="status">{ctx.t("connected", { language })}</p>}
            </For>
          </Show>
        </aside>
        <main class="aai-ide-main">
          <div class="aai-ide-tabs" role="tablist" aria-label={ctx.t("files")}>
            <For each={props.model.state.files}>
              {(item) => (
                <div
                  class="aai-ide-tab"
                  data-active={props.model.state.active === item.path}
                  onAuxClick={(event) => {
                    if (event.button === 1) {
                      event.preventDefault()
                      props.model.close(item.path)
                    }
                  }}
                >
                  <button
                    role="tab"
                    aria-selected={props.model.state.active === item.path}
                    title={item.path}
                    onClick={() => {
                      void props.model.open(item.path)
                      setState("diff", undefined)
                    }}
                  >
                    <Icon name={item.kind === "image" ? "outline-photo" : "code-slash"} size="small" />
                    {item.path.split("/").at(-1)}
                    <Show when={item.kind === "text" && item.text !== item.saved}>
                      <span aria-label={ctx.t("dirty")}> ●</span>
                    </Show>
                  </button>
                  <button aria-label={ctx.t("close", { path: item.path })} onClick={() => props.model.close(item.path)}>
                    <Icon name="close" size="small" />
                  </button>
                </div>
              )}
            </For>
          </div>
          <div class="aai-ide-breadcrumbs" aria-label={ctx.t("breadcrumbs")}>
            <span>{workspaceName()}</span>
            <For each={props.model.state.active.split("/").filter(Boolean)}>
              {(part) => (
                <>
                  <Icon name="outline-chevron-right" size="small" />
                  <span>{part}</span>
                </>
              )}
            </For>
            <button
              aria-label={ctx.t("outline")}
              title={ctx.t("outline")}
              disabled={!editing()}
              onClick={() => action("editor.action.quickOutline")}
            >
              <Icon name="code-slash" size="small" />
            </button>
          </div>
          <div class="aai-ide-toolbar aai-ide-editor-actions">
            <button disabled={!editing() || props.model.state.saving} onClick={() => void save()}>
              {ctx.t("save")}
            </button>
            <button disabled={props.model.state.saving} onClick={() => void props.model.run(props.model.saveAll)}>
              {ctx.t("saveAll")}
            </button>
            <button disabled={!active()} onClick={attach}>
              {ctx.t(preview() ? "attachFile" : "attach")}
            </button>
            <button onClick={openTerminal}>{ctx.t("terminal")}</button>
            <Show when={svg()} keyed>
              {(file) => (
                <button onClick={() => setSvgSource(preview() ? file.path : "")}>
                  {ctx.t(preview() ? "svgSource" : "imagePreview")}
                </button>
              )}
            </Show>
            <Show when={active()}>
              <details class="aai-ide-file-actions">
                <summary>{ctx.t("common.moreOptions")}</summary>
                <div>
                  <Show when={editing()}>
                    <button onClick={() => void widget.editor?.getAction("editor.action.formatDocument")?.run()}>
                      {ctx.t("format")}
                    </button>
                    <button onClick={() => void widget.editor?.getAction("editor.action.revealDefinition")?.run()}>
                      {ctx.t("definition")}
                    </button>
                    <button
                      onClick={() => void widget.editor?.getAction("editor.action.referenceSearch.trigger")?.run()}
                    >
                      {ctx.t("references")}
                    </button>
                    <button onClick={() => void widget.editor?.getAction("editor.action.rename")?.run()}>
                      {ctx.t("rename")}
                    </button>
                  </Show>
                  <button
                    onClick={() => {
                      tool("explorer")
                      setState({ creating: "rename", path: props.model.state.active, source: props.model.state.active })
                    }}
                  >
                    {ctx.t("renameFile")}
                  </button>
                  <button
                    onClick={() => {
                      if (
                        document()?.text === document()?.saved ||
                        window.confirm(ctx.t("confirmReload", { path: props.model.state.active }))
                      )
                        void props.model.run(props.model.reload)
                    }}
                  >
                    {ctx.t("reload")}
                  </button>
                  <button
                    onClick={() => {
                      if (!window.confirm(ctx.t("confirmTrash", { path: props.model.state.active }))) return
                      void props.model.run(async () => {
                        const path = props.model.state.active
                        await props.model.client.trash({ binding: props.model.binding, path }, props.model.options)
                        props.model.close(path)
                        await props.model.refresh()
                      })
                    }}
                  >
                    {ctx.t("trash")}
                  </button>
                </div>
              </details>
            </Show>
          </div>
          <Show when={props.model.state.error}>
            <div class="aai-ide-error" role="alert">
              {props.model.state.error}
              <button onClick={() => props.model.setState("error", "")} aria-label={ctx.t("common.close")}>
                <Icon name="close" size="small" />
              </button>
            </div>
          </Show>
          <div class="aai-ide-editor-area">
            <CodeEditor
              model={props.model}
              screen={props.screen}
              editing={editing()}
              reveal={state.reveal}
              onReady={(value) => {
                widget.editor = value
              }}
              breakpoint={breakpoint}
            />
            <Show when={preview()} keyed>
              {(src) => <ImageTab src={src} path={props.model.state.active} />}
            </Show>
            <Show when={props.model.state.loading}>
              <div class="aai-ide-empty" role="status">
                {ctx.t("common.loading")}
              </div>
            </Show>
            <Show when={!active() && !props.model.state.loading}>
              <div class="aai-ide-empty aai-ide-welcome">
                <div class="aai-ide-welcome-logo">
                  AAi<span>{ctx.t("workspaceBrand")}</span>
                </div>
                <h2>{workspaceName()}</h2>
                <p>{ctx.t("empty")}</p>
                <button onClick={() => setState("picker", "files")}>
                  <span>{ctx.t("quickOpen")}</span>
                  <kbd>Ctrl P</kbd>
                </button>
                <button onClick={() => setState("picker", "commands")}>
                  <span>{ctx.t("commandPalette")}</span>
                  <kbd>Ctrl Shift P</kbd>
                </button>
                <button onClick={() => tool("search")}>
                  <span>{ctx.t("find")}</span>
                  <kbd>Ctrl Shift F</kbd>
                </button>
                <button onClick={openTerminal}>
                  <span>{ctx.t("terminal")}</span>
                  <kbd>Ctrl `</kbd>
                </button>
              </div>
            </Show>
            <Show when={state.diff}>
              {(path) => <FileComparison model={props.model} path={path()} close={() => setState("diff", undefined)} />}
            </Show>
          </div>
          <section
            class="aai-ide-bottom"
            classList={{ "aai-ide-task-dock": state.bottom === "tasks" }}
            hidden={!state.bottom}
            aria-label={ctx.t(state.bottom ?? "output")}
          >
            <div class="aai-ide-dock-tabs">
              <For each={["problems", "output", "tasks"] as const}>
                {(tab) => (
                  <button aria-pressed={state.bottom === tab} onClick={() => setState("bottom", tab)}>
                    {ctx.t(tab)}
                  </button>
                )}
              </For>
              <button aria-label={ctx.t("common.close")} onClick={() => setState("bottom", undefined)}>
                <Icon name="close" size="small" />
              </button>
            </div>
            <div class="aai-ide-task-container" hidden={state.bottom !== "tasks"}>
              <ProjectTasks model={props.model} />
            </div>
            <div hidden={state.bottom === "tasks"}>
              <Show
                when={state.bottom === "problems"}
                fallback={<pre>{props.model.state.output || ctx.t("noOutput")}</pre>}
              >
                <Show when={diagnostics().some((item) => item.items.length)} fallback={<p>{ctx.t("noProblems")}</p>}>
                  <For each={diagnostics()}>
                    {(file) => (
                      <For each={file.items}>
                        {(item) => (
                          <button
                            class="aai-ide-row"
                            onClick={() =>
                              void reveal(file.path, item.range.start.line + 1, item.range.start.character + 1)
                            }
                          >
                            {file.path}:{item.range.start.line + 1} {item.message}
                          </button>
                        )}
                      </For>
                    )}
                  </For>
                </Show>
              </Show>
            </div>
          </section>
        </main>
      </div>
      <footer class="aai-ide-status">
        <Show when={alphieStatus()}>
          {(status) => (
            <span class="alphie-status" role="status">
              <span class="alphie-status-dot" />
              Alphie · {status().label}
            </span>
          )}
        </Show>
        <button class="aai-ide-branch" onClick={() => tool("git")} title={ctx.t("git")}>
          <Icon name="branch" size="small" />
          {state.branch || workspaceName()}
        </button>
        <button
          aria-pressed={state.bottom === "problems"}
          onClick={() => setState("bottom", state.bottom === "problems" ? undefined : "problems")}
        >
          <Icon name="circle-exclamation" size="small" />
          {problems()} <span>{ctx.t("problems")}</span>
        </button>
        <button
          aria-pressed={state.bottom === "output"}
          onClick={() => setState("bottom", state.bottom === "output" ? undefined : "output")}
        >
          {ctx.t("output")}
        </button>
        <button
          aria-pressed={state.bottom === "tasks"}
          onClick={() => setState("bottom", state.bottom === "tasks" ? undefined : "tasks")}
        >
          {ctx.t("tasks")}
          <Show when={props.model.state.task?.status === "running"}> ●</Show>
        </button>
        <Show
          when={preview()}
          fallback={
            <Show when={document()}>
              <span>{document()?.language}</span>
              <span>UTF-8</span>
              <span>{document()?.text.includes("\r\n") ? "CRLF" : "LF"}</span>
              <span>
                {ctx.t("lineColumn", {
                  line: props.model.state.cursor.line,
                  column: props.model.state.cursor.column,
                })}
              </span>
              <span>{document()?.text !== document()?.saved ? ctx.t("dirty") : ctx.t("saved")}</span>
            </Show>
          }
        >
          <span>{ctx.t("imagePreview")}</span>
        </Show>
      </footer>
      <Show when={state.picker} keyed>
        {(mode) => (
          <WorkspacePicker
            mode={mode}
            model={props.model}
            actions={commands()}
            open={(path, line, column) => {
              void reveal(path, line, column)
            }}
            close={() => setState("picker", undefined)}
          />
        )}
      </Show>
    </div>
  )
}

function ImageTab(props: { src: string; path: string }) {
  const ctx = usePlugin<typeof definition>()
  const [size, setSize] = createSignal("")
  const [failed, setFailed] = createSignal(false)
  const [actual, setActual] = createSignal(false)
  const name = () => props.path.split("/").at(-1) ?? props.path

  return (
    <section class="aai-ide-image" aria-label={ctx.t("imagePreview")}>
      <div class="aai-ide-image-body" data-actual={actual()} tabindex={actual() ? 0 : undefined}>
        <img
          src={props.src}
          alt={name()}
          hidden={failed()}
          onLoad={(event) => setSize(`${event.currentTarget.naturalWidth} × ${event.currentTarget.naturalHeight}`)}
          onError={() => setFailed(true)}
        />
        <Show when={failed()}>
          <p role="status">{ctx.t("imageError")}</p>
        </Show>
      </div>
      <div class="aai-ide-toolbar">
        <span title={props.path}>{name()}</span>
        <span>{size()}</span>
        <button disabled={failed() || !size()} onClick={() => setActual(!actual())}>
          {ctx.t(actual() ? "fitImage" : "actualSize")}
        </button>
      </div>
    </section>
  )
}
