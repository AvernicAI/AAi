import { createSignal, lazy, Show, Suspense } from "solid-js"
import { usePlugin } from "@opencode/plugin/gui"
import { Button } from "@opencode/ui/button"
import Setup from "./setup"
import type definition from "./index"

const Workspace = lazy(() => import("./workspace"))

export default function AntigravityPanel(props: { visible: boolean }) {
  const ctx = usePlugin<typeof definition>()
  const [tab, setTab] = createSignal<"setup" | "web">("setup")

  return (
    <section class="flex h-full min-h-0 flex-col">
      <nav class="flex shrink-0 gap-2 border-b border-v2-border-border-base p-3">
        <Button size="small" variant={tab() === "setup" ? "neutral" : "ghost"} onClick={() => setTab("setup")}>
          {ctx.t("setup")}
        </Button>
        <Button size="small" variant={tab() === "web" ? "neutral" : "ghost"} onClick={() => setTab("web")}>
          {ctx.t("web")}
        </Button>
      </nav>
      <div class="min-h-0 flex-1 overflow-auto">
        <Show
          when={tab() === "setup"}
          fallback={
            <Suspense>
              <Workspace visible={props.visible} />
            </Suspense>
          }
        >
          <Setup />
        </Show>
      </div>
    </section>
  )
}
