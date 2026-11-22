import { createSignal, For, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { usePlugin } from "@opencode/plugin/gui"
import { Devin } from "@opencode/schema/devin"
import { Button } from "@opencode/ui/button"
import { showToast } from "@opencode/ui/toast"
import { DevinWorkspace } from "./contract"
import type definition from "./index"

export default function API() {
  const ctx = usePlugin<typeof definition>()
  const native = ctx.use(DevinWorkspace)
  const [form, setForm] = createStore({ org: "", session: "", text: "", playbook: "", cap: "1", after: "" })
  const [resource, setResource] = createSignal<Devin.Resource>("sessions")

  const [state, setState] = createSignal<{ status: "idle" | "working" | "ready" | "failed"; text?: string }>({
    status: "idle",
  })

  const [pending, setPending] = createSignal<Devin.Request>()
  const lifetime = new AbortController()
  onCleanup(() => lifetime.abort())

  const run = async (request: Devin.Request) => {
    const active = ctx.sessions.current()
    const server = active?.server ?? ctx.servers.get(ctx.servers.list()[0] ?? "")

    if (!server || state().status === "working") return

    setPending(undefined)
    setState({ status: "working" })
    const signal = AbortSignal.any([lifetime.signal, AbortSignal.timeout(30_000)])
    await server.client
      .rpc(Devin.Definition)
      .request(request, {
        signal,
        location: active ? { directory: active.directory } : undefined,
      })
      .then(
        (result) => {
          if (!lifetime.signal.aborted) setState({ status: "ready", text: JSON.stringify(result, null, 2) })
        },
        (error) => {
          if (!lifetime.signal.aborted)
            setState({ status: "failed", text: error instanceof Error ? error.message : ctx.t("apiFailed") })
        },
      )
  }

  const terminal = async (mode: "local" | "cloud") => {
    const handle = native()

    if (handle.status !== "active" || !(await handle.value.cli({ mode }).catch(() => false)))
      showToast({ title: ctx.t("cliFailed") })
  }

  const models = async () => {
    const handle = native()

    if (handle.status !== "active" || state().status === "working") return

    setState({ status: "working" })
    await handle.value.models({ signal: lifetime.signal }).then(
      (text) => {
        if (!lifetime.signal.aborted) setState({ status: "ready", text })
      },
      () => {
        if (!lifetime.signal.aborted) setState({ status: "failed", text: ctx.t("modelsFailed") })
      },
    )
  }

  const org = () => form.org.trim()
  const session = () => form.session.trim()
  const cap = () => Number(form.cap)
  const enabled = () => /^org-[a-zA-Z0-9-]+$/.test(org()) && state().status !== "working" && !pending()
  const sessionEnabled = () => enabled() && /^devin-[a-zA-Z0-9-]+$/.test(session())
  const fields = ["org", "session", "after", "playbook", "cap"] as const
  const actions = ["sleep", "archive", "unarchive"] as const
  const reads = ["session", "messages"] as const

  return (
    <div class="flex flex-col gap-4 p-6">
      <p class="text-sm">{ctx.t("cliHelp")}</p>
      <div class="flex flex-wrap gap-2">
        <Button disabled={!ctx.desktop} onClick={() => void terminal("local")}>
          {ctx.t("localCLI")}
        </Button>
        <Button disabled={!ctx.desktop || state().status === "working" || !!pending()} onClick={() => void models()}>
          {ctx.t("models")}
        </Button>
        <Button disabled={!ctx.desktop} onClick={() => void terminal("cloud")}>
          {ctx.t("cloudCLI")}
        </Button>
        <Button variant="ghost" onClick={() => ctx.system.openExternal("https://docs.devin.ai/cli/reference/commands")}>
          {ctx.t("cliDocs")}
        </Button>
      </div>
      <p class="text-sm">{ctx.t("apiHelp")}</p>
      <div class="flex flex-wrap gap-2">
        <Button onClick={() => ctx.layout.settings("providers")}>{ctx.t("connect")}</Button>
        <Button variant="ghost" onClick={() => ctx.system.openExternal("https://docs.devin.ai/api-reference/overview")}>
          {ctx.t("apiDocs")}
        </Button>
        <Button
          variant="ghost"
          onClick={() => ctx.system.openExternal("https://docs.devin.ai/work-with-devin/devin-mcp")}
        >
          {ctx.t("mcp")}
        </Button>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <For each={fields}>
          {(field) => (
            <label class="flex flex-col gap-1 text-sm">
              {ctx.t(field)}
              <input
                class="rounded border border-v2-border-border-base bg-transparent p-2"
                type={field === "cap" ? "number" : "text"}
                value={form[field]}
                onInput={(event) => setForm(field, event.currentTarget.value)}
              />
            </label>
          )}
        </For>
        <label class="flex flex-col gap-1 text-sm">
          {ctx.t("resource")}
          <select
            class="rounded border border-v2-border-border-base p-2"
            value={resource()}
            onChange={(event) => {
              const value = Devin.Resource.literals.find((item) => item === event.currentTarget.value)

              if (value) {
                setResource(value)
                setForm("after", "")
              }
            }}
          >
            <For each={Devin.Resource.literals}>{(item) => <option value={item}>{ctx.t(item)}</option>}</For>
          </select>
        </label>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button
          disabled={!enabled()}
          onClick={() =>
            void run({ action: "list", org: org(), resource: resource(), after: form.after.trim() || undefined })
          }
        >
          {ctx.t("load")}
        </Button>
        <For each={reads}>
          {(action) => (
            <Button disabled={!sessionEnabled()} onClick={() => void run({ action, org: org(), session: session() })}>
              {ctx.t(action === "session" ? "details" : action)}
            </Button>
          )}
        </For>
        <For each={actions}>
          {(action) => (
            <Button disabled={!sessionEnabled()} onClick={() => setPending({ action, org: org(), session: session() })}>
              {ctx.t(action)}
            </Button>
          )}
        </For>
      </div>
      <label class="flex flex-col gap-1 text-sm">
        {ctx.t("prompt")}
        <textarea
          rows={4}
          class="rounded border border-v2-border-border-base bg-transparent p-2"
          value={form.text}
          onInput={(event) => setForm("text", event.currentTarget.value)}
        />
      </label>
      <div class="flex flex-wrap gap-2">
        <Button
          disabled={!enabled() || !form.text.trim() || !Number.isSafeInteger(cap()) || cap() < 1}
          onClick={() =>
            setPending({
              action: "create",
              org: org(),
              text: form.text.trim(),
              maxACU: cap(),
              playbook: form.playbook.trim() || undefined,
            })
          }
        >
          {ctx.t("create")}
        </Button>
        <Button
          disabled={!sessionEnabled() || !form.text.trim()}
          onClick={() => setPending({ action: "message", org: org(), session: session(), text: form.text.trim() })}
        >
          {ctx.t("message")}
        </Button>
      </div>
      <Show when={pending()}>
        {(request) => (
          <div
            role="group"
            aria-label={ctx.t("review")}
            class="flex flex-col gap-2 rounded border border-v2-border-border-base p-3"
          >
            <p>{ctx.t("review")}</p>
            <pre class="max-h-52 overflow-auto whitespace-pre-wrap break-all text-xs">
              {JSON.stringify(request(), null, 2)}
            </pre>
            <div class="flex gap-2">
              <Button onClick={() => void run(request())}>{ctx.t("submit")}</Button>
              <Button variant="ghost" onClick={() => setPending(undefined)}>
                {ctx.t("cancel")}
              </Button>
            </div>
          </div>
        )}
      </Show>
      <Show when={state().status === "working"}>
        <p role="status">{ctx.t("waiting")}</p>
      </Show>
      <Show when={state().text}>
        {(value) => (
          <pre
            role={state().status === "failed" ? "alert" : "region"}
            aria-label={ctx.t("response")}
            class="max-h-96 overflow-auto whitespace-pre-wrap break-all rounded border border-v2-border-border-base p-3 text-xs"
          >
            {value()}
          </pre>
        )}
      </Show>
    </div>
  )
}
