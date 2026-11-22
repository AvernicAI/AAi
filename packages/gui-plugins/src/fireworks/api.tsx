import { createSignal, For, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { Exit, Schema } from "effect"
import { Fireworks } from "@opencode/schema/fireworks"
import { createKeyed, usePlugin } from "@opencode/plugin/gui"
import { Button } from "@opencode/ui/button"
import { Loader } from "@opencode/ui/loader"
import { uuid } from "@opencode/util/uuid"
import { AgentTerminal } from "../terminal/contract"
import { transition, type Event, type State } from "./api-machine"
import type definition from "./index"

export default function FireworksAPI() {
  const ctx = usePlugin<typeof definition>()
  const terminal = ctx.use(AgentTerminal)

  const [form, setForm] = createStore({
    account: "",
    resource: "models",
    pageToken: "",
    training: {
      outputModel: `aai-sft-${uuid().slice(0, 8)}`,
      dataset: "train.jsonl",
      baseModel: "accounts/fireworks/models/muse-glimmer-30b",
      tokenizer: "meta-models/Muse-Glimmer-30B",
      renderer: "muse_glimmer",
      epochs: 1,
      batchSize: 4,
      maxSeqLen: 2048,
      learningRate: 0.0001,
      loraRank: 8,
      allowPaid: false,
    },
  })

  const [state, setState] = createSignal<State>({ status: "idle" })
  const dispatch = (event: Event) => setState((current) => transition(current, event))
  const lifetime = new AbortController()
  onCleanup(() => {
    lifetime.abort()
    dispatch({ type: "dispose" })
  })
  const session = () => ctx.sessions.current()
  const server = () => session()?.server ?? ctx.servers.get(ctx.servers.list()[0] ?? "")
  createKeyed(
    () => `${server()?.id ?? ""}\n${session()?.key ?? ""}\n${session()?.directory ?? ""}`,
    () => dispatch({ type: "reset" }),
  )
  const busy = () => state().status === "working"

  const review = () => {
    const value = state()

    return value.status === "review" ? value : undefined
  }

  const result = () => {
    const value = state()

    return value.status === "ready" ? value.result : undefined
  }

  const failed = () => {
    const value = state()

    return value.status === "failed" ? value.message : undefined
  }

  const run = (operation: (signal: AbortSignal) => Promise<string>) => {
    if (busy()) return
    const attempt = uuid()
    dispatch({ type: "start", attempt })
    const signal = AbortSignal.any([lifetime.signal, AbortSignal.timeout(30_000)])
    const aborted = () => dispatch({ type: "failed", attempt, message: ctx.t("apiFailed") })
    signal.addEventListener("abort", aborted, { once: true })
    void operation(signal)
      .then(
        (result) => {
          if (!signal.aborted) dispatch({ type: "done", attempt, result })
        },
        () => dispatch({ type: "failed", attempt, message: ctx.t("apiFailed") }),
      )
      .finally(() => signal.removeEventListener("abort", aborted))
  }

  const refresh = () =>
    run(async (signal) => {
      const target = server()

      if (!target) throw new Error("unavailable")

      const result = await target.client.rpc(Fireworks.Definition).refresh(
        { account: form.account.trim() || "fireworks" },
        {
          signal,
          location: session() ? { directory: session()!.directory } : undefined,
        },
      )

      return ctx.t(result.connected ? "refreshed" : "disconnected")
    })

  const inventory = () =>
    run(async (signal) => {
      const target = server()

      if (!target) throw new Error("unavailable")

      return JSON.stringify(
        await target.client.rpc(Fireworks.Definition).inventory(
          {
            account: form.account.trim(),
            resource: Schema.decodeUnknownSync(Schema.Literals(["models", "deployments", "datasets", "quotas"]))(
              form.resource,
            ),
            pageToken: form.pageToken,
          },
          {
            signal,
            location: session() ? { directory: session()!.directory } : undefined,
          },
        ),
        null,
        2,
      )
    })

  const prepare = () => {
    const current = session()

    if (!current) return
    const training = Schema.decodeUnknownExit(Fireworks.Training)(form.training)

    if (Exit.isFailure(training)) {
      dispatch({ type: "start", attempt: "validation" })
      dispatch({
        type: "failed",
        attempt: "validation",
        message: ctx.t("validationFailed"),
      })

      return
    }

    dispatch({
      type: "review",
      session: `${current.key}\n${current.directory}`,
      training: training.value,
    })
  }

  const launch = () => {
    const plan = review()
    const current = session()

    if (!plan || !current || `${current.key}\n${current.directory}` !== plan.session) return dispatch({ type: "reset" })
    run(async (signal) => {
      const result = await current.server.client
        .rpc(Fireworks.Definition)
        .train(
          { sessionID: current.id, training: plan.training, confirmed: true },
          { signal, location: { directory: current.directory } },
        )

      const live = terminal()

      if (
        live.status === "active" &&
        !signal.aborted &&
        session()?.key === current.key &&
        session()?.directory === current.directory
      )
        live.value.open(current)

      return `${ctx.t("started")} (${result.shellID})`
    })
  }

  const input = "w-full rounded-md border border-v2-border-border-base bg-v2-background-bg-base p-2 text-sm"

  return (
    <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
      <p class="text-sm text-v2-text-text-muted">{ctx.t("limits")}</p>
      <Button variant="ghost" onClick={() => ctx.layout.settings("providers")}>
        {ctx.t("connect")}
      </Button>
      <Button disabled={busy() || !server()?.connected} onClick={refresh}>
        {ctx.t("refresh")}
      </Button>
      <fieldset disabled={busy()} class="flex flex-wrap gap-2">
        <label class="flex-1 text-sm">
          {ctx.t("account")}
          <input class={input} value={form.account} onInput={(e) => setForm("account", e.currentTarget.value)} />
        </label>
        <label class="text-sm">
          {ctx.t("inventory")}
          <select class={input} value={form.resource} onChange={(e) => setForm("resource", e.currentTarget.value)}>
            <For each={["models", "deployments", "datasets", "quotas"] as const}>
              {(kind) => <option value={kind}>{ctx.t(kind)}</option>}
            </For>
          </select>
        </label>
        <Button disabled={!form.account.trim() || !server()?.connected} onClick={inventory}>
          {ctx.t("inventory")}
        </Button>
        <label class="w-full text-sm">
          {ctx.t("next")}
          <input class={input} value={form.pageToken} onInput={(e) => setForm("pageToken", e.currentTarget.value)} />
        </label>
      </fieldset>
      <h3 class="font-medium">{ctx.t("trainTitle")}</h3>
      <p class="text-sm text-v2-text-text-muted">{ctx.t("trainHelp")}</p>
      <p class="text-sm">{ctx.t("install")}</p>
      <code class="select-text whitespace-pre-wrap break-all text-xs">
        python -m pip install "fireworks-ai[training]==1.2.31" "fireworks-training-cookbook==2026.11.5.1"
      </code>
      <p class="text-sm">{ctx.t("promotion")}</p>
      <Button
        variant="ghost"
        onClick={() => ctx.system.openExternal("https://docs.fireworks.ai/fine-tuning/finetuning-intro")}
      >
        {ctx.t("pricing")}
      </Button>
      <fieldset disabled={busy()} class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <For each={["dataset", "baseModel", "tokenizer", "renderer", "outputModel"] as const}>
          {(field) => (
            <label class="text-sm">
              {ctx.t(field)}
              <input
                class={input}
                value={form.training[field]}
                onInput={(e) => {
                  setForm("training", field, e.currentTarget.value)
                  dispatch({ type: "reset" })
                }}
              />
            </label>
          )}
        </For>
        <For each={["epochs", "batchSize", "maxSeqLen", "learningRate"] as const}>
          {(field) => (
            <label class="text-sm">
              {ctx.t(field)}
              <input
                class={input}
                type="number"
                step={field === "learningRate" ? "0.000001" : "1"}
                value={form.training[field]}
                onInput={(e) => {
                  setForm("training", field, e.currentTarget.valueAsNumber)
                  dispatch({ type: "reset" })
                }}
              />
            </label>
          )}
        </For>
        <label class="text-sm">
          {ctx.t("loraRank")}
          <select
            class={input}
            value={form.training.loraRank}
            onChange={(e) => {
              setForm("training", "loraRank", Number(e.currentTarget.value))
              dispatch({ type: "reset" })
            }}
          >
            <For each={[8, 16, 32, 64]}>{(rank) => <option value={rank}>{rank}</option>}</For>
          </select>
        </label>
        <label class="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.training.allowPaid}
            onChange={(e) => {
              setForm("training", "allowPaid", e.currentTarget.checked)
              dispatch({ type: "reset" })
            }}
          />
          {ctx.t("paid")}
        </label>
      </fieldset>
      <Show when={session()} fallback={<p class="text-sm">{ctx.t("sessionRequired")}</p>}>
        <Button disabled={busy() || !server()?.connected} onClick={prepare}>
          {ctx.t("review")}
        </Button>
      </Show>
      <Show when={review()}>
        {(plan) => (
          <section
            role="alertdialog"
            aria-label={ctx.t("review")}
            class="rounded-md border border-v2-border-border-base p-3"
          >
            <p class="text-sm">{ctx.t("reviewHelp")}</p>
            <pre class="my-3 select-text whitespace-pre-wrap break-all text-xs">
              {JSON.stringify(plan().training, null, 2)}
            </pre>
            <Button disabled={`${session()?.key}\n${session()?.directory}` !== plan().session} onClick={launch}>
              {ctx.t("launch")}
            </Button>
            <Button variant="ghost" onClick={() => dispatch({ type: "reset" })}>
              {ctx.t("cancel")}
            </Button>
          </section>
        )}
      </Show>
      <Show when={busy()}>
        <div role="status" class="flex items-center gap-2 text-sm">
          <Loader />
          {ctx.t("busy")}
        </div>
      </Show>
      <Show when={failed()}>
        {(message) => (
          <p role="alert" class="text-sm">
            {message()}
          </p>
        )}
      </Show>
      <Show when={result()}>
        {(result) => (
          <pre class="max-h-80 select-text overflow-auto whitespace-pre-wrap break-all rounded-md border border-v2-border-border-base p-3 text-xs">
            {result()}
          </pre>
        )}
      </Show>
      <p class="text-sm text-v2-text-text-muted">{ctx.t("batchPaused")}</p>
      <Button
        variant="ghost"
        onClick={() => ctx.system.openExternal("https://docs.fireworks.ai/guides/batch-inference")}
      >
        {ctx.t("batchGuide")}
      </Button>
    </div>
  )
}
