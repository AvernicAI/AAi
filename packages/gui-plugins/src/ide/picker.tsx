import { For, Show, createMemo, createSignal, createUniqueId, onCleanup, onMount } from "solid-js"
import fuzzysort from "fuzzysort"
import { Icon } from "@opencode/ui/icon"
import { createLatest, usePlugin } from "@opencode/plugin/gui"
import type definition from "./index"
import type { IdeModel } from "./model"

export type IdeAction = { id: string; title: string; shortcut?: string; disabled?: boolean; run: () => void }

type PickerHost = { dialog?: HTMLDialogElement; input?: HTMLInputElement }

export default function WorkspacePicker(props: {
  mode: "files" | "commands"
  model: IdeModel
  actions: readonly IdeAction[]
  open: (path: string, line?: number, column?: number) => void
  close: () => void
}) {
  const ctx = usePlugin<typeof definition>()
  const host: PickerHost = {}
  const id = createUniqueId()
  const [query, setQuery] = createSignal("")
  const [selected, setSelected] = createSignal(0)

  const indexed = createLatest(
    () => props.mode === "files",
    (_, signal) => props.model.client.files({ binding: props.model.binding }, { signal }),
  )

  const location = () => /:(\d+)(?::(\d+))?$/.exec(query())

  const choices = createMemo(() => {
    const actions: { id: string; title: string; action?: IdeAction }[] =
      props.mode === "commands"
        ? props.actions
            .filter((action) => !action.disabled)
            .map((action) => ({ id: action.id, title: action.title, action }))
        : [...new Set([...props.model.state.files.map((file) => file.path), ...(indexed.latest?.paths ?? [])])].map(
            (path) => ({ id: path, title: path, action: undefined }),
          )

    const text = props.mode === "files" ? query().replace(/:(\d+)(?::(\d+))?$/, "") : query().replace(/^>/, "")

    return text.trim()
      ? fuzzysort.go(text, actions, { key: "title", limit: 100 }).map((item) => item.obj)
      : actions.slice(0, 100)
  })

  const choose = (index: number) => {
    const item = choices()[index]

    if (!item) return
    const at = location()
    props.close()

    if (item.action) return item.action.run()
    props.open(item.id, at ? Number(at[1]) : undefined, at?.[2] ? Number(at[2]) : undefined)
  }

  onMount(() => {
    host.dialog?.showModal()
    host.input?.focus()
  })
  onCleanup(() => host.dialog?.close())

  return (
    <dialog
      ref={(element) => {
        host.dialog = element
      }}
      class="aai-ide-picker"
      aria-label={ctx.t(props.mode === "files" ? "quickOpen" : "commandPalette")}
      onCancel={(event) => {
        event.preventDefault()
        props.close()
      }}
      onClick={(event) => {
        if (event.target === host.dialog) props.close()
      }}
    >
      <div class="aai-ide-picker-content">
        <div class="aai-ide-picker-input">
          <Icon name={props.mode === "files" ? "magnifying-glass" : "code-slash"} />
          <input
            ref={(element) => {
              host.input = element
            }}
            role="combobox"
            aria-expanded="true"
            aria-autocomplete="list"
            aria-controls={id}
            aria-activedescendant={choices()[selected()] ? `${id}-${selected()}` : undefined}
            aria-label={ctx.t(props.mode === "files" ? "quickOpen" : "commandPalette")}
            placeholder={ctx.t(props.mode === "files" ? "quickOpenHint" : "commandHint")}
            value={query()}
            onInput={(event) => {
              setQuery(event.currentTarget.value)
              setSelected(0)
            }}
            onKeyDown={(event) => {
              if (!["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) return
              event.preventDefault()

              if (event.key === "Enter") return choose(selected())
              setSelected((value) =>
                Math.max(0, Math.min(choices().length - 1, value + (event.key === "ArrowDown" ? 1 : -1))),
              )
              host.dialog?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" })
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <div class="aai-ide-picker-results" role="listbox" id={id} aria-label={ctx.t("results")}>
          <For each={choices()}>
            {(item, index) => (
              <button
                id={`${id}-${index()}`}
                role="option"
                aria-selected={selected() === index()}
                tabindex="-1"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(index())}
              >
                <Icon name={item.action ? "code-slash" : "file-document"} size="small" />
                <span>{item.title}</span>
                <Show when={item.action?.shortcut}>{(shortcut) => <kbd>{shortcut()}</kbd>}</Show>
              </button>
            )}
          </For>
        </div>
        <Show when={!choices().length}>
          <p role="status">
            {indexed.error
              ? ctx.t("error", { message: String(indexed.error) })
              : ctx.t(indexed.latest || props.mode === "commands" ? "noResults" : "loading")}
          </p>
        </Show>
        <div class="aai-ide-picker-help">
          {ctx.t(props.mode === "files" ? "pickerFileHelp" : "pickerCommandHelp")}
          <Show when={indexed.latest?.truncated}>
            <span>{ctx.t("fileIndexLimit")}</span>
          </Show>
        </div>
      </div>
    </dialog>
  )
}
