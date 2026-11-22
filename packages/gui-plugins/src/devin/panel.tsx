import { createSignal, lazy, Show, Suspense } from "solid-js"
import { Button } from "@opencode/ui/button"
import { usePlugin } from "@opencode/plugin/gui"
import type definition from "./index"

const Workspace = lazy(() => import("./workspace"))

const API = lazy(() => import("./api"))

export default function Panel(props: { visible: boolean }) {
  const ctx = usePlugin<typeof definition>()
  const [api, setAPI] = createSignal(false)

  return (
    <section class="flex h-full min-h-0 flex-col">
      <nav class="flex gap-2 border-b border-v2-border-border-base p-3">
        <Button variant={api() ? "ghost" : "neutral"} onClick={() => setAPI(false)}>
          {ctx.t("chat")}
        </Button>
        <Button variant={api() ? "neutral" : "ghost"} onClick={() => setAPI(true)}>
          {ctx.t("api")}
        </Button>
      </nav>
      <div class="min-h-0 flex-1 overflow-auto">
        <Suspense>
          <Show when={api()} fallback={<Workspace visible={props.visible} />}>
            <API />
          </Show>
        </Suspense>
      </div>
    </section>
  )
}
