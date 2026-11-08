import { Show, createSignal } from "solid-js"
import { createLatest, usePanel, usePlugin } from "@opencode/plugin/gui"
import { Button } from "@opencode/ui/button"
import { Loader } from "@opencode/ui/loader"
import { Merlin } from "./contract"
import type definition from "./index"

export default function MerlinPanel() {
  const ctx = usePlugin<typeof definition>()
  const panel = usePanel()
  const embeds = ctx.embeds
  const client = ctx.use(Merlin)
  const [busy, setBusy] = createSignal(false)
  const [failed, setFailed] = createSignal<boolean>()
  const opened = createLatest(client, async (service, signal) => {
    const page = await service.open({}, { signal })
    const close = () => void service.close({ binding: page.binding }).catch(() => undefined)
    if (signal.aborted) {
      close()
      signal.throwIfAborted()
    }
    signal.addEventListener("abort", close, { once: true })
    return { ...page, service }
  })
  const current = () => {
    const live = client()
    return live.status === "active" && opened.latest?.service === live.value ? opened.latest : undefined
  }
  const navigate = async (page: "chat" | "plans" | "reload") => {
    const target = current()
    if (!target || busy()) return
    setBusy(true)
    setFailed(false)
    const result = await target.service.navigate({ binding: target.binding, page }).catch(() => ({ failed: true }))
    setFailed(result.failed)
    setBusy(false)
  }
  const clear = async () => {
    const target = current()
    if (!target || busy()) return
    setBusy(true)
    setFailed(false)
    await target.service.clearSignIn({}).catch(() => setFailed(true))
    setBusy(false)
  }
  return (
    <div class="flex size-full min-h-0 flex-col">
      <div class="flex shrink-0 flex-wrap items-center gap-2 border-b border-v2-border-border-base p-2">
        <Button size="small" disabled={!current() || busy()} onClick={() => void navigate("chat")}>
          {ctx.t("chat")}
        </Button>
        <Button size="small" disabled={!current() || busy()} onClick={() => void navigate("plans")}>
          {ctx.t("plans")}
        </Button>
        <Button size="small" disabled={!current() || busy()} onClick={() => void navigate("reload")}>
          {ctx.t("reload")}
        </Button>
        <Button
          size="small"
          disabled={!current() || busy()}
          title={ctx.t("signOutDescription")}
          onClick={() => void clear()}
        >
          {ctx.t("signOut")}
        </Button>
        <Button
          size="small"
          disabled={!current()}
          onClick={() =>
            void current()
              ?.service.openBrowser({})
              .catch(() => setFailed(true))
          }
        >
          {ctx.t("browser")}
        </Button>
      </div>
      <p class="shrink-0 px-3 py-2 text-sm text-v2-text-text-muted">{ctx.t("description")}</p>
      <Show when={opened.loading || busy()}>
        <div class="flex items-center gap-2 px-3 py-2">
          <Loader />
          {ctx.t("loading")}
        </div>
      </Show>
      <Show when={opened.error || (failed() ?? current()?.failed)}>
        <p role="alert" class="px-3 py-2">
          {ctx.t("failed")}
        </p>
      </Show>
      <Show when={client().status === "active"} fallback={<p class="p-3">{ctx.t("unavailable")}</p>}>
        <embeds.View id={current()?.embed} visible={panel.visible() && !busy()} class="min-h-0 flex-1" />
      </Show>
    </div>
  )
}
