import { For, Show, createMemo, onCleanup, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import type { editor } from "monaco-editor"
import { Icon } from "@opencode/ui/icon"
import { Style, createLatest, useExtension, type MountedSession, type SessionScreen } from "../sdk"
import { Ide } from "./contract"
import type definition from "./index"
import { createIdeModel, type IdeModel } from "./model"
import CodeEditor from "./editor"
import Debugger, { parseCommand } from "./debugger"
import css from "./styles.css?inline"

type WorkspaceHost = {
  editor?: editor.IStandaloneCodeEditor
  root?: HTMLDivElement
  filter?: HTMLInputElement
  search?: HTMLInputElement
}

export default function WorkspacePanel(props: { session: MountedSession; screen: SessionScreen }) {
  const ctx = useExtension<typeof definition>()
  ctx.add(Style, css)
  const client = ctx.uses.workspace.load(Ide)
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

          return <IdeWorkspace model={model} session={props.session} screen={props.screen} />
        }}
      </Show>
    </Show>
  )
}

function IdeWorkspace(props: { model: IdeModel; session: MountedSession; screen: SessionScreen }) {
  const ctx = useExtension<typeof definition>()
  const preferences = ctx.stores.preferences

  const [state, setState] = createStore<{
    tool: "explorer" | "search" | "git" | "debug" | "settings"
    bottom: "problems" | "output" | undefined
    query: string
    caseSensitive: boolean
    fileFilter: string
    searching: boolean
    matches: { path: string; line: number; text: string }[]
    truncated: boolean
    searched: boolean
    creating?: "file" | "folder" | "rename"
    source?: string
    path: string
    commit: string
    branch: string
    changes: readonly { path: string; index: string; worktree: string }[]
    diff?: { path: string; text: string }
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

  const refreshGit = async () => {
    const result = await props.model.client.git({ binding: props.model.binding }, props.model.options)

    if (!props.model.options.signal.aborted) setState({ branch: result.branch, changes: result.changes })
  }

  const reveal = async (path: string, line = 1, column = 1) => {
    const normalized = path.replaceAll("\\", "/")
    const root = props.model.root.replaceAll("\\", "/")

    const relative = normalized.toLowerCase().startsWith(root.toLowerCase() + "/")
      ? normalized.slice(root.length + 1)
      : normalized

    await props.model.open(relative, line, column)

    if (!props.model.options.signal.aborted) setState("reveal", { path: props.model.state.active, line, column })
  }

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
    await Promise.all(props.model.state.documents.filter((item) => item.language === language).map(props.model.sync))
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
    const current = props.model.current()
    const editor = widget.editor
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

  const active = () => props.model.current()

  const save = () =>
    props.model.run(async () => {
      await props.model.save()
      await refreshGit()
    })

  onMount(() => {
    const keydown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return
      const key = event.key.toLowerCase()

      if (!["s", "p", "w"].includes(key) && !(key === "f" && event.shiftKey)) return
      event.preventDefault()
      event.stopPropagation()

      if (key === "s") void (event.shiftKey ? props.model.run(props.model.saveAll) : save())

      if (key === "w" && active()) props.model.close(props.model.state.active)

      if (key === "p") {
        tool("explorer")
        queueMicrotask(() => widget.filter?.focus())
      }

      if (key === "f") tool("search")
    }

    widget.root?.addEventListener("keydown", keydown, { capture: true })
    onCleanup(() => widget.root?.removeEventListener("keydown", keydown, { capture: true }))
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
      <nav class="aai-ide-tools" aria-label={ctx.t("tools")}>
        <For each={["explorer", "search", "git", "debug", "settings"] as const}>
          {(item) => (
            <button aria-pressed={state.tool === item} onClick={() => tool(item)}>
              {ctx.t(item)}
            </button>
          )}
        </For>
      </nav>
      <div class="aai-ide-body">
        <aside class="aai-ide-sidebar" aria-label={ctx.t(state.tool)}>
          <Show when={state.tool === "explorer"}>
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
            </div>
            <input
              ref={(element) => {
                widget.filter = element
              }}
              aria-label={ctx.t("find")}
              placeholder={ctx.t("files")}
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
                    <Icon name={entry.directory ? "folder" : "code-slash"} size="small" />
                    <span>{entry.path.split("/").at(-1)}</span>
                  </button>
                )}
              </For>
            </div>
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
                    <button
                      onClick={() =>
                        void props.model.run(async () => {
                          const text = await props.model.client.diff(
                            { binding: props.model.binding, path: item.path },
                            props.model.options,
                          )

                          setState("diff", { path: item.path, text })
                        })
                      }
                    >
                      {ctx.t("diff")}
                    </button>
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
            <For each={props.model.state.documents}>
              {(item) => (
                <div class="aai-ide-tab">
                  <button
                    role="tab"
                    aria-selected={props.model.state.active === item.path}
                    title={item.path}
                    onClick={() => {
                      props.model.setState("active", item.path)
                      setState("diff", undefined)
                    }}
                  >
                    {item.path.split("/").at(-1)}
                    <Show when={item.text !== item.saved}>
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
          <div class="aai-ide-toolbar">
            <button disabled={!active() || props.model.state.saving} onClick={() => void save()}>
              {ctx.t("save")}
            </button>
            <button disabled={props.model.state.saving} onClick={() => void props.model.run(props.model.saveAll)}>
              {ctx.t("saveAll")}
            </button>
            <button disabled={!active()} onClick={attach}>
              {ctx.t("attach")}
            </button>
            <button onClick={() => ctx.layout.open("terminal:main", props.session)}>{ctx.t("terminal")}</button>
            <Show when={active()}>
              <details class="aai-ide-file-actions">
                <summary>{ctx.t("common.moreOptions")}</summary>
                <div>
                  <button onClick={() => void widget.editor?.getAction("editor.action.formatDocument")?.run()}>
                    {ctx.t("format")}
                  </button>
                  <button onClick={() => void widget.editor?.getAction("editor.action.revealDefinition")?.run()}>
                    {ctx.t("definition")}
                  </button>
                  <button onClick={() => void widget.editor?.getAction("editor.action.referenceSearch.trigger")?.run()}>
                    {ctx.t("references")}
                  </button>
                  <button onClick={() => void widget.editor?.getAction("editor.action.rename")?.run()}>
                    {ctx.t("rename")}
                  </button>
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
                        active()?.text === active()?.saved ||
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
              reveal={state.reveal}
              onReady={(value) => {
                widget.editor = value
              }}
              breakpoint={breakpoint}
            />
            <Show when={!active()}>
              <div class="aai-ide-empty">{ctx.t(props.model.state.loading ? "common.loading" : "empty")}</div>
            </Show>
            <Show when={state.diff}>
              {(diff) => (
                <div class="aai-ide-diff">
                  <div class="aai-ide-toolbar">
                    <span>{diff().path}</span>
                    <button onClick={() => setState("diff", undefined)}>{ctx.t("common.close")}</button>
                  </div>
                  <pre>{diff().text}</pre>
                </div>
              )}
            </Show>
          </div>
          <Show when={state.bottom}>
            <section class="aai-ide-bottom" aria-label={ctx.t(state.bottom ?? "output")}>
              <Show
                when={state.bottom === "problems"}
                fallback={<pre>{props.model.state.output || ctx.t("noOutput")}</pre>}
              >
                <Show
                  when={props.model.state.diagnostics.some((item) => item.items.length)}
                  fallback={<p>{ctx.t("noProblems")}</p>}
                >
                  <For each={props.model.state.diagnostics}>
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
            </section>
          </Show>
          <footer class="aai-ide-status">
            <button
              aria-pressed={state.bottom === "problems"}
              onClick={() => setState("bottom", state.bottom === "problems" ? undefined : "problems")}
            >
              {ctx.t("problems")}
            </button>
            <button
              aria-pressed={state.bottom === "output"}
              onClick={() => setState("bottom", state.bottom === "output" ? undefined : "output")}
            >
              {ctx.t("output")}
            </button>
            <span>{active()?.language}</span>
            <span>
              {ctx.t("lineColumn", { line: props.model.state.cursor.line, column: props.model.state.cursor.column })}
            </span>
            <span>{active()?.text !== active()?.saved ? ctx.t("dirty") : ctx.t("saved")}</span>
          </footer>
        </main>
      </div>
    </div>
  )
}
