import { Show, createSignal, onCleanup, onMount } from "solid-js"
import { editor, Uri } from "monaco-editor"
import { createKeyed, createLatest, usePlugin } from "@opencode/plugin/gui"
import { languageOf, type IdeModel } from "./model"
import type definition from "./index"

type ComparisonHost = { element?: HTMLDivElement }

export default function FileComparison(props: { model: IdeModel; path: string; close: () => void }) {
  const ctx = usePlugin<typeof definition>()
  const [staged, setStaged] = createSignal(false)

  const compared = createLatest(
    () => ({ path: props.path, staged: staged() }),
    async (value, signal) => ({
      ...(await props.model.client.compare({ binding: props.model.binding, ...value }, { signal })),
      staged: value.staged,
    }),
  )

  return (
    <section class="aai-ide-diff" aria-label={ctx.t("diffTitle", { path: props.path })}>
      <div class="aai-ide-toolbar">
        <strong>{props.path}</strong>
        <button aria-pressed={!staged()} onClick={() => setStaged(false)}>
          {ctx.t("workingChanges")}
        </button>
        <button aria-pressed={staged()} onClick={() => setStaged(true)}>
          {ctx.t("stagedChanges")}
        </button>
        <button onClick={props.close}>{ctx.t("common.close")}</button>
      </div>
      <div class="aai-ide-diff-labels">
        <span>HEAD</span>
        <span>{ctx.t(staged() ? "stagedChanges" : "workingChanges")}</span>
      </div>
      <Show when={compared.error}>
        <p role="alert">{ctx.t("error", { message: String(compared.error) })}</p>
      </Show>
      <Show
        when={compared.latest && compared.latest.staged === staged() ? compared.latest : undefined}
        fallback={<p role="status">{ctx.t("common.loading")}</p>}
      >
        {(value) => <ComparisonEditor before={value().before} after={value().after} path={props.path} />}
      </Show>
    </section>
  )
}

function ComparisonEditor(props: { before: string; after: string; path: string }) {
  const ctx = usePlugin<typeof definition>()
  const host: ComparisonHost = {}
  onMount(() => {
    if (!host.element) return

    const widget = editor.createDiffEditor(host.element, {
      automaticLayout: true,
      readOnly: true,
      originalEditable: false,
      renderSideBySide: true,
      useInlineViewWhenSpaceIsLimited: true,
      minimap: { enabled: false },
      fontSize: ctx.stores.preferences.value.fontSize ?? 13,
      fontFamily: "var(--font-family-mono, monospace)",
      scrollBeyondLastLine: false,
    })

    createKeyed(
      () => ({ before: props.before, after: props.after, path: props.path }),
      (value) => {
        const id = crypto.randomUUID()

        const original = editor.createModel(
          value.before,
          languageOf(value.path),
          Uri.parse(`inmemory://aai-diff/${id}/before`),
        )

        const modified = editor.createModel(
          value.after,
          languageOf(value.path),
          Uri.parse(`inmemory://aai-diff/${id}/after`),
        )

        widget.setModel({ original, modified })
        onCleanup(() => {
          widget.setModel(null)
          original.dispose()
          modified.dispose()
        })
      },
    )
    onCleanup(() => widget.dispose())
  })

  return (
    <div
      class="aai-ide-comparison"
      ref={(element) => {
        host.element = element
      }}
    />
  )
}
