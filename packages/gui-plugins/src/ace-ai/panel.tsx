import { createMemo, createSignal, For, onCleanup, Show } from "solid-js"
import { createKeyed, usePlugin } from "@opencode/plugin/gui"
import { Button } from "@opencode/ui/button"
import { Loader } from "@opencode/ui/loader"
import { showToast } from "@opencode/ui/toast"
import { uuid } from "@opencode/util/uuid"
import { AceWorkspace, type Action } from "./contract"
import { transition, view, type Event, type State } from "./machine"
import type definition from "./index"

export default function AceWorkspacePanel(props: { visible: boolean }) {
  const ctx = usePlugin<typeof definition>()
  const client = ctx.use(AceWorkspace)
  const embeds = ctx.embeds
  const [state, setState] = createSignal<State>({ status: "idle" })
  const screen = createMemo(() => view(state()))
  const dispatch = (event: Event) => setState((current) => transition(current, event))
  const lifetime = new AbortController()
  onCleanup(() => {
    lifetime.abort()
    dispatch({ type: "dispose" })
  })

  createKeyed(client, (service) => {
    const controller = new AbortController()
    const attempt = uuid()
    const signal = AbortSignal.any([controller.signal, lifetime.signal, AbortSignal.timeout(35_000)])
    dispatch({ type: "open", attempt })
    onCleanup(() => controller.abort())
    void service
      .open({ signal })
      .then(async (page) => {
        const close = () => void service.close({ binding: page.binding }).catch(() => undefined)

        if (controller.signal.aborted || lifetime.signal.aborted || signal.aborted) {
          close()

          return
        }

        controller.signal.addEventListener("abort", close, { once: true })
        dispatch({ type: "opened", attempt, page })
        await service.navigate({ binding: page.binding, action: "chat" }, { signal })
        dispatch({ type: "done", attempt })
      })
      .catch(() => dispatch({ type: "failed", attempt }))
  })

  const run = (action: Action | "clear") => {
    const live = client()
    const page = screen().page

    if (live.status !== "active" || !page || screen().busy) return
    const attempt = uuid()
    dispatch({ type: "run", attempt, action })
    const signal = AbortSignal.any([lifetime.signal, AbortSignal.timeout(35_000)])

    const operation =
      action === "clear"
        ? live.value.clearSignIn({ binding: page.binding }, { signal })
        : live.value.navigate({ binding: page.binding, action }, { signal })

    void operation.then(
      () => {
        dispatch({ type: "done", attempt })

        if (action === "clear" && state().status === "ready") showToast({ variant: "success", title: ctx.t("cleared") })
      },
      () => dispatch({ type: "failed", attempt }),
    )
  }

  const browser = () => {
    const live = client()

    if (live.status !== "active") return ctx.system.openExternal("https://app.ace.ai/chat_ai")
    void live.value.openBrowser().catch(() => showToast({ title: ctx.t("title"), description: ctx.t("failed") }))
  }

  return (
    <section class="flex size-full min-h-0 min-w-0 flex-col overflow-hidden" aria-label={ctx.t("open")}>
      <header class="flex shrink-0 flex-wrap items-center gap-2 border-b border-v2-border-border-base p-3">
        <span class="me-auto text-sm font-medium">{ctx.t("capabilities")}</span>
        <Button size="small" disabled={!screen().page || screen().busy} onClick={() => run("signIn")}>
          {ctx.t("signIn")}
        </Button>
        <Button size="small" onClick={browser}>
          {ctx.t("browser")}
        </Button>
      </header>
      <nav class="flex shrink-0 flex-wrap gap-2 px-3 py-2" aria-label={ctx.t("title")}>
        <For each={["chat", "reload"] as const}>
          {(action) => (
            <Button size="small" variant="ghost" disabled={!screen().page || screen().busy} onClick={() => run(action)}>
              {ctx.t(action)}
            </Button>
          )}
        </For>
        <Button
          size="small"
          variant="ghost"
          title={ctx.t("signOutDescription")}
          disabled={!screen().page || screen().busy}
          onClick={() => dispatch({ type: "confirm" })}
        >
          {ctx.t("signOut")}
        </Button>
      </nav>
      <p class="shrink-0 px-3 pb-2 text-sm text-v2-text-text-muted">{ctx.t("limits")}</p>
      <Show when={screen().confirming}>
        <div
          role="alertdialog"
          aria-label={ctx.t("confirm")}
          class="flex shrink-0 flex-wrap items-center gap-2 border-y border-v2-border-border-base p-3"
        >
          <p class="flex-1 text-sm">{ctx.t("signOutDescription")}</p>
          <Button size="small" onClick={() => run("clear")}>
            {ctx.t("confirm")}
          </Button>
          <Button size="small" variant="ghost" onClick={() => dispatch({ type: "cancel" })}>
            {ctx.t("cancel")}
          </Button>
        </div>
      </Show>
      <Show when={screen().busy}>
        <div role="status" class="flex shrink-0 items-center gap-2 px-3 py-2 text-sm">
          <Loader />
          {ctx.t("loading")}
        </div>
      </Show>
      <Show when={screen().failed}>
        <p role="alert" class="shrink-0 px-3 py-2 text-sm">
          {ctx.t("failed")}
        </p>
      </Show>
      <Show when={client().status === "active"} fallback={<p class="p-3 text-sm">{ctx.t("unavailable")}</p>}>
        <embeds.View
          id={screen().page?.embed}
          visible={props.visible && !screen().busy && !screen().confirming}
          class="min-h-0 flex-1"
        />
      </Show>
    </section>
  )
}
