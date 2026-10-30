import { For, Show, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { Schema } from "effect"
import { usePlugin } from "@opencode/plugin/gui"
import type definition from "./index"
import type { IdeModel } from "./model"

const Frame = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  line: Schema.Number,
  column: Schema.Number,
  source: Schema.optional(Schema.Struct({ path: Schema.optional(Schema.String) })),
})

const Variable = Schema.Struct({
  name: Schema.String,
  value: Schema.String,
  type: Schema.optional(Schema.String),
  variablesReference: Schema.Number,
})

const Stopped = Schema.Struct({ threadId: Schema.optional(Schema.Number) })

const Threads = Schema.Struct({ threads: Schema.Array(Schema.Struct({ id: Schema.Number, name: Schema.String })) })

const Stack = Schema.Struct({ stackFrames: Schema.Array(Frame) })

const Scopes = Schema.Struct({
  scopes: Schema.Array(Schema.Struct({ name: Schema.String, variablesReference: Schema.Number })),
})

const Variables = Schema.Struct({ variables: Schema.Array(Variable) })

const Output = Schema.Struct({ output: Schema.String })

const Evaluation = Schema.Struct({ result: Schema.String, variablesReference: Schema.Number })

const JsonObject = Schema.fromJsonString(Schema.JsonObject)

const JsonCommand = Schema.fromJsonString(Schema.Array(Schema.String))

export function parseCommand(value: string) {
  const command = Schema.decodeUnknownSync(JsonCommand)(value)

  if (!command[0]) throw new Error("ide.command")

  return command
}

export default function Debugger(props: {
  model: IdeModel
  reveal: (path: string, line?: number, column?: number) => Promise<void>
}) {
  const ctx = usePlugin<typeof definition>()
  const preferences = ctx.stores.preferences

  const [state, setState] = createStore<{
    stage: "idle" | "starting" | "running" | "paused"
    thread?: number
    frame?: number
    frames: readonly (typeof Frame.Type)[]
    variables: readonly (typeof Variable.Type)[]
    expression: string
    output: string
  }>({ stage: "idle", frames: [], variables: [], expression: "", output: "" })

  const request = (command: string, args: Schema.JsonObject = {}) =>
    props.model.client.debugRequest({ binding: props.model.binding, command, arguments: args }, props.model.options)

  const output = (text: string) => setState("output", (value) => (value + text).slice(-200000))

  const variables = async (reference: number) => {
    const result = Schema.decodeUnknownSync(Variables)(await request("variables", { variablesReference: reference }))

    if (!props.model.options.signal.aborted) setState("variables", result.variables)
  }

  const frame = async (item: typeof Frame.Type) => {
    setState("frame", item.id)

    if (item.source?.path) await props.reveal(item.source.path, item.line, item.column)
    const result = Schema.decodeUnknownSync(Scopes)(await request("scopes", { frameId: item.id }))
    const first = result.scopes[0]

    if (first) await variables(first.variablesReference)
  }

  const pause = async (thread?: number) => {
    const id = thread ?? Schema.decodeUnknownSync(Threads)(await request("threads")).threads[0]?.id

    if (id === undefined || props.model.options.signal.aborted) return
    setState({ stage: "paused", thread: id })
    const result = Schema.decodeUnknownSync(Stack)(await request("stackTrace", { threadId: id }))

    if (props.model.options.signal.aborted) return
    setState("frames", result.stackFrames)

    if (result.stackFrames[0]) await frame(result.stackFrames[0])
  }

  const configure = async () => {
    await Promise.all(
      props.model.state.breakpoints.map((item) =>
        request("setBreakpoints", {
          source: { path: props.model.root + "/" + item.path },
          breakpoints: item.lines.map((line) => ({ line })),
        }),
      ),
    )
    await request("configurationDone")
  }

  const off = props.model.client.on("debug", (event) => {
    if (event.binding !== props.model.binding || props.model.options.signal.aborted) return

    if (event.event === "initialized") void props.model.run(configure)

    if (event.event === "stopped")
      void props.model.run(() => pause(Schema.decodeUnknownSync(Stopped)(event.body).threadId))

    if (event.event === "continued") setState("stage", "running")

    if (event.event === "terminated" || event.event === "exited")
      setState({ stage: "idle", frames: [], variables: [], thread: undefined, frame: undefined })

    if (event.event === "output")
      void props.model.run(async () => output(Schema.decodeUnknownSync(Output)(event.body).output))
  })

  onCleanup(off)

  const start = () =>
    props.model.run(async () => {
      await props.model.saveAll()

      const configuration = Schema.decodeUnknownSync(JsonObject)(
        preferences.value.debugConfiguration
          .replaceAll("${workspaceFolder}", props.model.root.replaceAll("\\", "/"))
          .replaceAll("${file}", (props.model.root + "/" + props.model.state.active).replaceAll("\\", "/")),
      )

      setState({ stage: "starting", output: "", frames: [], variables: [] })
      await props.model.client
        .debugStart(
          { binding: props.model.binding, command: parseCommand(preferences.value.debugCommand), configuration },
          props.model.options,
        )
        .catch((error: Error) => {
          setState("stage", "idle")
          throw error
        })

      if (state.stage === "starting") setState("stage", "running")
    })

  const control = (command: string) =>
    props.model.run(async () => {
      const threadId = state.thread ?? Schema.decodeUnknownSync(Threads)(await request("threads")).threads[0]?.id

      if (threadId === undefined) return
      await request(command, { threadId })

      if (command !== "pause") setState("stage", "running")
    })

  const status = () => {
    if (state.stage === "paused") return ctx.t("paused")

    if (state.stage === "idle") return ctx.t("idle")

    return ctx.t("running")
  }

  return (
    <div class="aai-ide-debug">
      <div class="aai-ide-toolbar">
        <Show
          when={state.stage === "idle"}
          fallback={
            <button
              onClick={() =>
                void props.model.run(() =>
                  props.model.client.debugStop({ binding: props.model.binding }, props.model.options),
                )
              }
            >
              {ctx.t("stop")}
            </button>
          }
        >
          <button disabled={!props.model.state.active} onClick={() => void start()}>
            {ctx.t("start")}
          </button>
        </Show>
        <Show
          when={state.stage === "paused"}
          fallback={
            <button disabled={state.stage !== "running"} onClick={() => void control("pause")}>
              {ctx.t("pause")}
            </button>
          }
        >
          <button onClick={() => void control("continue")}>{ctx.t("continue")}</button>
          <button onClick={() => void control("next")}>{ctx.t("stepOver")}</button>
          <button onClick={() => void control("stepIn")}>{ctx.t("stepInto")}</button>
          <button onClick={() => void control("stepOut")}>{ctx.t("stepOut")}</button>
        </Show>
        <span role="status">{status()}</span>
      </div>
      <details open={state.stage === "idle"}>
        <summary>{ctx.t("launchConfiguration")}</summary>
        <label>
          {ctx.t("adapterCommand")}
          <input
            value={preferences.value.debugCommand}
            onInput={(event) => {
              const value = event.currentTarget.value
              void preferences.update((draft) => {
                draft.debugCommand = value
              })
            }}
          />
        </label>
        <label>
          {ctx.t("launchConfiguration")}
          <textarea
            rows={8}
            value={preferences.value.debugConfiguration}
            onInput={(event) => {
              const value = event.currentTarget.value
              void preferences.update((draft) => {
                draft.debugConfiguration = value
              })
            }}
          />
        </label>
        <p>{ctx.t("debugHelp")}</p>
      </details>
      <h3>{ctx.t("breakpoints")}</h3>
      <For each={props.model.state.breakpoints}>
        {(item) => (
          <For each={item.lines}>
            {(line) => (
              <button class="aai-ide-row" onClick={() => void props.reveal(item.path, line)}>
                {item.path}:{line}
              </button>
            )}
          </For>
        )}
      </For>
      <h3>{ctx.t("callStack")}</h3>
      <For each={state.frames}>
        {(item) => (
          <button
            class="aai-ide-row"
            aria-pressed={state.frame === item.id}
            onClick={() => void props.model.run(() => frame(item))}
          >
            {item.name}{" "}
            <span>
              {item.line}:{item.column}
            </span>
          </button>
        )}
      </For>
      <h3>{ctx.t("variables")}</h3>
      <For each={state.variables}>
        {(item) => (
          <button
            class="aai-ide-row"
            disabled={item.variablesReference === 0}
            onClick={() => void props.model.run(() => variables(item.variablesReference))}
            title={item.type}
          >
            {item.name}: {item.value}
          </button>
        )}
      </For>
      <h3>{ctx.t("console")}</h3>
      <pre class="aai-ide-console" aria-live="polite">
        {state.output}
      </pre>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void props.model.run(async () => {
            const value = Schema.decodeUnknownSync(Evaluation)(
              await request(
                "evaluate",
                state.frame === undefined
                  ? { expression: state.expression, context: "repl" }
                  : { expression: state.expression, frameId: state.frame, context: "repl" },
              ),
            )

            output(`> ${state.expression}\n${value.result}\n`)
            setState("expression", "")
          })
        }}
      >
        <input
          aria-label={ctx.t("evaluate")}
          placeholder={ctx.t("evaluatePlaceholder")}
          value={state.expression}
          onInput={(event) => setState("expression", event.currentTarget.value)}
        />
        <button disabled={state.stage === "idle" || !state.expression.trim()}>{ctx.t("evaluate")}</button>
      </form>
    </div>
  )
}
