import { For, Show, createSignal } from "solid-js"
import { createKeyed, createLatest, usePlugin } from "@opencode/plugin/gui"
import type definition from "./index"
import type { IdeModel } from "./model"

type TaskHost = { output?: HTMLPreElement }

export default function ProjectTasks(props: { model: IdeModel }) {
  const ctx = usePlugin<typeof definition>()
  const host: TaskHost = {}
  const [command, setCommand] = createSignal("")
  const [saving, setSaving] = createSignal(true)
  const [starting, setStarting] = createSignal(false)
  const [stopping, setStopping] = createSignal(false)
  const [follow, setFollow] = createSignal(true)
  const [refresh, setRefresh] = createSignal(0)

  const scripts = createLatest(
    () => ({ model: props.model, refresh: refresh() }),
    (value, signal) => value.model.client.tasks({ binding: value.model.binding }, { signal }),
  )

  const running = () => props.model.state.task?.status === "running"
  createKeyed(
    () => props.model.state.task?.text,
    () => {
      if (follow() && host.output) host.output.scrollTop = host.output.scrollHeight
    },
  )

  const run = () =>
    props.model.run(async () => {
      const value = command()
      setStarting(true)
      await Promise.try(async () => {
        if (saving()) await props.model.saveAll()

        if (props.model.options.signal.aborted) return
        await props.model.client.taskRun({ binding: props.model.binding, command: value }, props.model.options)
      }).finally(() => {
        if (!props.model.options.signal.aborted) setStarting(false)
      })
    })

  const stop = () =>
    props.model.run(async () => {
      setStopping(true)
      await props.model.client.taskStop({ binding: props.model.binding }, props.model.options).finally(() => {
        if (!props.model.options.signal.aborted) setStopping(false)
      })
    })

  return (
    <section class="aai-ide-task-panel" aria-label={ctx.t("taskRunner")}>
      <form
        class="aai-ide-task-form"
        onSubmit={(event) => {
          event.preventDefault()
          void run()
        }}
      >
        <select
          aria-label={ctx.t("projectScript")}
          value=""
          onChange={(event) => setCommand(event.currentTarget.value)}
        >
          <option value="">{ctx.t("chooseScript")}</option>
          <For each={scripts.latest ?? []}>
            {(script) => (
              <option value={script.command}>
                {script.name} — {script.script}
              </option>
            )}
          </For>
        </select>
        <button type="button" onClick={() => setRefresh((value) => value + 1)}>
          {ctx.t("refreshScripts")}
        </button>
        <input
          aria-label={ctx.t("taskCommand")}
          placeholder={ctx.t("taskCommandHint")}
          value={command()}
          onInput={(event) => setCommand(event.currentTarget.value)}
        />
        <button disabled={!command().trim() || running() || starting()}>{ctx.t("runTask")}</button>
        <button type="button" disabled={!running() || stopping()} onClick={() => void stop()}>
          {ctx.t("stopTask")}
        </button>
        <label class="aai-ide-check">
          <input type="checkbox" checked={saving()} onChange={(event) => setSaving(event.currentTarget.checked)} />
          {ctx.t("saveBeforeRun")}
        </label>
        <label class="aai-ide-check">
          <input type="checkbox" checked={follow()} onChange={(event) => setFollow(event.currentTarget.checked)} />
          {ctx.t("followOutput")}
        </label>
      </form>
      <Show when={scripts.error}>
        <p role="alert">{ctx.t("error", { message: String(scripts.error) })}</p>
      </Show>
      <div class="aai-ide-task-summary">
        <span title={props.model.root}>{props.model.root}</span>
        <Show when={props.model.state.task}>
          {(task) => (
            <span role="status">
              {ctx.t(`task.${task().status}`)}
              <Show when={task().code !== null}> · {ctx.t("exitCode", { code: task().code ?? 0 })}</Show>
            </span>
          )}
        </Show>
      </div>
      <Show when={props.model.state.task} fallback={<p>{ctx.t("taskHelp")}</p>}>
        {(task) => (
          <>
            <div class="aai-ide-task-command">$ {task().command}</div>
          <pre
            style={{ "font-family": ctx.appearance.font("mono") }}
              ref={(element) => {
                host.output = element
              }}
              role="log"
              aria-label={ctx.t("taskOutput")}
              aria-live="off"
            >
              {task().text || ctx.t(running() ? "taskWaiting" : "taskEmpty")}
            </pre>
          </>
        )}
      </Show>
    </section>
  )
}
