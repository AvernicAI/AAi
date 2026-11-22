import { createSignal, For, onCleanup, Show } from "solid-js"
import { Antigravity } from "@opencode/schema/antigravity"
import { createKeyed, usePlugin } from "@opencode/plugin/gui"
import { Button } from "@opencode/ui/button"
import { showToast } from "@opencode/ui/toast"
import { uuid } from "@opencode/util/uuid"
import { AntigravityWorkspace } from "./contract"
import { transition, type State } from "./setup-machine"
import type definition from "./index"

export default function Setup() {
  const ctx = usePlugin<typeof definition>()
  const main = ctx.use(AntigravityWorkspace)
  const [state, setState] = createSignal<State>({ status: "idle" })
  const lifetime = new AbortController()
  onCleanup(() => {
    lifetime.abort()
    setState({ status: "disposed" })
  })
  const session = () => ctx.sessions.current()
  const server = () => session()?.server ?? ctx.servers.get(ctx.servers.list()[0] ?? "")
  createKeyed(
    () => `${server()?.id ?? ""}\n${session()?.directory ?? ""}`,
    () => setState((state) => transition(state, { type: "reset" })),
  )

  const catalog = () => {
    const value = state()

    return value.status === "ready" ? value.catalog : undefined
  }

  const failure = () => {
    const value = state()

    return value.status === "failed" ? value.message : undefined
  }

  const refresh = () => {
    const target = server()

    if (!target || state().status === "working") return
    const attempt = uuid()
    setState((state) => transition(state, { type: "start", attempt }))
    const signal = AbortSignal.any([lifetime.signal, AbortSignal.timeout(50_000)])
    void target.client
      .rpc(Antigravity.Definition)
      .refresh({}, { signal, location: session() ? { directory: session()!.directory } : undefined })
      .then(
        (catalog) => {
          if (!signal.aborted) setState((state) => transition(state, { type: "done", attempt, catalog }))
        },
        (error) =>
          setState((state) =>
            transition(state, {
              type: "failed",
              attempt,
              message: error instanceof Error ? error.message : ctx.t("failed"),
            }),
          ),
      )
  }

  const login = async () => {
    const value = main()

    if (value.status !== "active") return
    const launched = await value.value.login().catch(() => false)
    showToast({ title: ctx.t(launched ? "loginStarted" : "loginFailed"), description: ctx.t("loginHint") })
  }

  const openCLI = async () => {
    const value = main()

    if (value.status !== "active" || !(await value.value.cli().catch(() => false)))
      showToast({ title: ctx.t("cliFailed") })
  }

  return (
    <div class="flex flex-col gap-4 p-6">
      <h3 class="text-lg font-medium">{ctx.t("setup")}</h3>
      <p class="text-sm text-v2-text-text-muted">{ctx.t("nativeDescription")}</p>
      <div class="flex flex-wrap gap-2">
        <Button onClick={() => void login()} disabled={!ctx.desktop}>
          {ctx.t("login")}
        </Button>
        <Button onClick={() => void openCLI()} disabled={!ctx.desktop}>
          {ctx.t("cli")}
        </Button>
        <Button onClick={refresh} disabled={!server() || state().status === "working"}>
          {ctx.t(state().status === "working" ? "refreshing" : "refreshModels")}
        </Button>
        <Button variant="ghost" onClick={() => ctx.layout.settings("providers")}>
          {ctx.t("providers")}
        </Button>
        <Button variant="ghost" onClick={() => ctx.system.openExternal("https://antigravity.google/docs/install/")}>
          {ctx.t("install")}
        </Button>
      </div>
      <p class="text-sm">{ctx.t("loginHint")}</p>
      <code class="rounded border border-v2-border-border-base p-3">agy acp --login</code>
      <Show when={failure()}>{(message) => <p role="alert">{message()}</p>}</Show>
      <Show when={catalog()}>
        {(value) => (
          <>
            <p role="status">{value().message}</p>
            <p class="text-sm">
              {ctx.t("version")}: {value().version || "-"} / {value().models.length} {ctx.t("models")}
            </p>
            <ul class="grid gap-2">
              <For each={value().models}>
                {(model) => (
                  <li class="rounded border border-v2-border-border-base p-3">
                    <div>{model.name}</div>
                    <code class="text-xs text-v2-text-text-muted">{model.id}</code>
                  </li>
                )}
              </For>
            </ul>
          </>
        )}
      </Show>
      <p class="text-sm text-v2-text-text-muted">{ctx.t("compatibility")}</p>
    </div>
  )
}
