import { onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import type { editor } from "monaco-editor"
import type { IpcClient, SetupContext } from "@opencode/plugin/gui"
import { artifactKind } from "@opencode/util/artifact"
import type definition from "./index"
import type { Diagnostic, Entry, Ide } from "./contract"

export type WorkspaceClient = IpcClient<Ide["spec"]>

type OpenDocument = { kind: "text"; path: string; text: string; saved: string; version: string; language: string }

type OpenImage = { kind: "image"; path: string; src: string }
type OpenFile = OpenDocument | OpenImage

type IdeState = {
  files: OpenFile[]
  active: string
  entries: (typeof Entry.Type)[]
  expanded: string[]
  loading: boolean
  saving: boolean
  error: string
  output: string
  diagnostics: { path: string; items: readonly (typeof Diagnostic.Type)[] }[]
  languages: string[]
  cursor: { line: number; column: number }
  breakpoints: { path: string; lines: number[] }[]
}

export function createIdeModel(input: {
  ctx: SetupContext<typeof definition>
  client: WorkspaceClient
  binding: string
  root: string
}) {
  const controller = new AbortController()
  onCleanup(() => controller.abort())
  const models = new Map<string, editor.ITextModel>()
  const viewStates = new Map<string, editor.ICodeEditorViewState>()

  const [state, setState] = createStore<IdeState>({
    files: [],
    active: "",
    entries: [],
    expanded: [],
    loading: false,
    saving: false,
    error: "",
    output: "",
    diagnostics: [],
    languages: [],
    cursor: { line: 1, column: 1 },
    breakpoints: [],
  })

  const alive = () => !controller.signal.aborted
  const options = { signal: controller.signal }
  const documents = () => state.files.filter((item) => item.kind === "text")
  const activeFile = () => state.files.find((item) => item.path === state.active)
  const current = () => {
    const file = activeFile()
    return file?.kind === "text" ? file : undefined
  }
  let openRequest = 0

  const report = (error: Error) => {
    if (!alive()) return
    setState(
      "error",
      String(error).includes("ide.conflict")
        ? input.ctx.t("conflict")
        : input.ctx.t("error", { message: error instanceof Error ? error.message : String(error) }),
    )
  }

  const run = <T>(action: () => Promise<T>) =>
    Promise.try(action).catch((error: Error) => {
      report(error)

      return undefined
    })

  const append = (text: string) => {
    if (alive()) setState("output", (value) => (value + text + "\n").slice(-200000))
  }

  const draft = (document: OpenDocument) => {
    void input.ctx.stores.drafts.update((items) => {
      const index = items.findIndex((item) => item.root === input.root && item.path === document.path)

      if (index >= 0) items.splice(index, 1)

      if (document.text !== document.saved)
        items.push({ root: input.root, path: document.path, text: document.text, version: document.version })
    })
  }

  const sync = (document: OpenDocument) => {
    const model = models.get(document.path)

    if (!model || !state.languages.includes(document.language)) return Promise.resolve()

    return input.client.document(
      {
        binding: input.binding,
        path: document.path,
        language: document.language,
        text: model.getValue(),
        version: model.getVersionId(),
      },
      options,
    )
  }

  const update = (path: string, text: string) => {
    const index = state.files.findIndex((item) => item.path === path)
    const document = state.files[index]
    if (document?.kind !== "text") return
    const updated = { ...document, text }
    setState("files", index, updated)
    draft(updated)
  }

  const readImage = async (path: string): Promise<OpenImage> => {
    const value = await input.client.readImage({ binding: input.binding, path }, options)
    return { kind: "image", path: value.path, src: `data:${value.mime};base64,${value.base64}` }
  }

  const open = async (path: string, line?: number, column?: number) => {
    const request = ++openRequest
    if (state.files.some((item) => item.path === path)) {
      setState({ active: path, loading: false, error: "" })
      return { line, column }
    }

    setState({ loading: true, error: "" })

    const read =
      artifactKind(path) === "image"
        ? readImage(path)
        : input.client.read({ binding: input.binding, path }, options).then((value): OpenDocument => {
            const recovered = input.ctx.stores.drafts.value.find(
              (item) => item.root === input.root && item.path === value.path,
            )
            return {
              ...value,
              kind: "text",
              text: recovered?.text ?? value.text,
              saved: value.text,
              version: recovered?.version ?? value.version,
              language: languageOf(path),
            }
          })

    return read.then(
      (value) => {
        if (!alive() || request !== openRequest) return
        if (!state.files.some((item) => item.path === value.path)) setState("files", (items) => [...items, value])
        setState({ active: value.path, loading: false })

        return { line, column }
      },
      (error: Error) => {
        if (!alive() || request !== openRequest) return
        setState("loading", false)
        report(error)
        return undefined
      },
    )
  }

  const save = async (path = state.active) => {
    const document = documents().find((item) => item.path === path)

    if (!document || document.text === document.saved || state.saving) return
    const text = document.text
    setState({ saving: true, error: "" })
    await input.client
      .save({ binding: input.binding, path, text, version: document.version }, options)
      .then((value) => {
        if (!alive()) return
        const index = state.files.findIndex((item) => item.path === path)
        const current = state.files[index]
        if (current?.kind !== "text") return
        const saved = { ...current, saved: value.text, version: value.version }
        setState("files", index, saved)
        draft(saved)
      })
      .finally(() => {
        if (alive()) setState("saving", false)
      })
  }

  const refresh = async () => {
    const folders = ["", ...state.expanded]

    const entries = await Promise.all(
      folders.map((path) => input.client.list({ binding: input.binding, path }, options)),
    )

    if (alive()) setState("entries", entries.flat())
  }

  const expand = async (path: string) => {
    if (state.expanded.includes(path)) {
      setState("expanded", (items) => items.filter((item) => item !== path))

      return
    }

    const entries = await input.client.list({ binding: input.binding, path }, options)

    if (!alive()) return
    setState("expanded", (items) => [...items, path])
    setState("entries", (items) => [...items.filter((item) => !item.path.startsWith(path + "/")), ...entries])
  }

  const reload = async () => {
    const file = activeFile()
    if (!file) return
    const path = file.path
    if (file.kind === "image") {
      const value = await readImage(path)
      if (!alive()) return
      const index = state.files.findIndex((item) => item === file)
      if (index >= 0) setState("files", index, value)
      return
    }

    const value = await input.client.read({ binding: input.binding, path }, options)
    if (!alive()) return
    const index = state.files.findIndex((item) => item === file)
    if (index < 0) return
    const reloaded = { ...file, text: value.text, saved: value.text, version: value.version }
    setState("files", index, reloaded)
    models.get(path)?.setValue(value.text)
    draft(reloaded)
  }

  input.client.on("diagnostics", (event) => {
    if (event.binding !== input.binding || !alive()) return
    setState("diagnostics", (items) => [
      ...items.filter((item) => item.path !== event.path),
      { path: event.path, items: event.diagnostics },
    ])
  })
  input.client.on("status", (event) => {
    if (event.binding === input.binding) append(`[${event.service}] ${event.message}`)
  })
  onCleanup(() => {
    models.forEach((model) => model.dispose())
    models.clear()
  })
  void run(refresh)

  return {
    state,
    setState,
    models,
    viewStates,
    options,
    report,
    run,
    append,
    update,
    open,
    save,
    refresh,
    expand,
    reload,
    sync,
    client: input.client,
    binding: input.binding,
    root: input.root,
    documents,
    activeFile,
    current,
    close(path: string) {
      const item = documents().find((item) => item.path === path)

      if (item) draft(item)
      const next = state.files.filter((item) => item.path !== path)
      setState("files", next)

      if (state.active === path) setState("active", next.at(-1)?.path ?? "")
    },
    async saveAll() {
      for (const item of documents()) await save(item.path)

      if (documents().some((item) => item.text !== item.saved)) throw new Error("ide.unsaved")
    },
  }
}

export function languageOf(path: string) {
  const extension = path.split(".").at(-1)?.toLowerCase()

  const language = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    json: "json",
    jsonc: "json",
    css: "css",
    scss: "scss",
    html: "html",
    vue: "html",
    md: "markdown",
    mdx: "markdown",
    py: "python",
    rs: "rust",
    go: "go",
    java: "java",
    c: "c",
    h: "c",
    cpp: "cpp",
    cs: "csharp",
    sh: "shell",
    ps1: "powershell",
    yml: "yaml",
    yaml: "yaml",
    toml: "ini",
    sql: "sql",
    kt: "kotlin",
    xml: "xml",
    svg: "xml",
    rb: "ruby",
    php: "php",
    swift: "swift",
    dockerfile: "dockerfile",
  }

  return Object.entries(language).find(([key]) => key === extension)?.[1] ?? "plaintext"
}

export type IdeModel = ReturnType<typeof createIdeModel>
