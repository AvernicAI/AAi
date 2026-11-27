import { For, lazy, Suspense } from "solid-js"
import { Loader } from "@opencode/ui/loader"
import { Tabs } from "@opencode/ui/tabs"
import { usePlugin } from "@opencode/plugin/gui"
import { Section } from "./contract"
import type definition from "./index"

const Workspace = lazy(() => import("./workspace"))

const API = lazy(() => import("./api"))

const tabs = [...Section.literals, "api"] as const

export default function Panel(props: { visible: boolean; initialSection?: Section }) {
  const ctx = usePlugin<typeof definition>()

  return (
    <Tabs variant="line" defaultValue={props.initialSection ?? "chat"} activationMode="manual" class="min-h-0 min-w-0">
      <Tabs.List aria-label={ctx.t("title")} data-scrollable>
        <For each={tabs}>{(item) => <Tabs.Trigger value={item}>{ctx.t(item)}</Tabs.Trigger>}</For>
      </Tabs.List>
      <For each={tabs}>
        {(item) => (
          <Tabs.Content
            value={item}
            class="min-h-0 min-w-0"
            classList={{ "!overflow-hidden": item !== "api" }}
            data-scrollable={item === "api" ? "" : undefined}
          >
            <Suspense
              fallback={
                <p role="status" class="flex items-center gap-2 p-3 text-sm">
                  <Loader />
                  {ctx.t("loading")}
                </p>
              }
            >
              {item === "api" ? <API /> : <Workspace visible={props.visible} section={item} />}
            </Suspense>
          </Tabs.Content>
        )}
      </For>
    </Tabs>
  )
}
