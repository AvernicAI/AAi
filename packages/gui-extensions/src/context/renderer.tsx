import { lazy, onCleanup, Show, Suspense } from "solid-js"
import { onIdle, Panel, PromptContext, SettingsPage, Slot, Style, usePanel, type PanelTab, type Setup } from "../sdk"
import type definition from "./index"
import { SessionContextUsage } from "./indicator"
import css from "./settings.css?inline"

const setup: Setup<typeof definition> = (ctx) => {
  const SessionContextTab = lazy(() => import("./tab"))
  const ContextSettings = lazy(() => import("./settings"))

  const ContextControl = lazy(async () => {
    const module = await import("./settings")

    return { default: module.ContextControl }
  })

  ctx.add(Style, css)
  onCleanup(
    onIdle(() => {
      void ContextSettings.preload()
      void ContextControl.preload()
    }),
  )
  ctx.add(SettingsPage, {
    id: "context-configuration",
    icon: "status",
    get title() {
      return ctx.t("settings.title")
    },
    get entries() {
      return [
        {
          id: "context-configuration",
          title: ctx.t("settings.title"),
          keywords: "instructions background tokens context compaction memory",
        },
      ]
    },
    render: () => (
      <>
        <div class="settings-tab-header">
          <h2 class="settings-tab-title">{ctx.t("settings.title")}</h2>
        </div>
        <div class="settings-tab-body">
          <Suspense>
            <ContextSettings />
          </Suspense>
        </div>
      </>
    ),
  })
  ctx.add(PromptContext, {
    id: "saved",
    get title() {
      return ctx.t("settings.title")
    },
    text: () =>
      ctx.stores.preferences.value.enabled
        ? [ctx.stores.preferences.value.instructions.trim(), ctx.stores.preferences.value.background.trim()]
            .filter(Boolean)
            .join("\n\n")
        : "",
    render: () => (
      <Suspense>
        <ContextControl />
      </Suspense>
    ),
  })
  // Compile the tab while the app idles, so the first open renders at once.
  onCleanup(onIdle(() => void SessionContextTab.preload()))

  // One tab object for every session, so neither strip updates nor a session switch remount its trigger; the label
  // reads the routed session from its state.
  const tab: PanelTab = {
    id: "main",
    get title() {
      return ctx.t("tab.title")
    },
    draggable: false,
    closable: "compact",
    first: true,
    fallback: true,
    label: (state) => (
      <div class="flex items-center gap-2">
        <SessionContextUsage session={state.session} variant="indicator" />
        <div>{ctx.t("tab.title")}</div>
      </div>
    ),
  }

  ctx.add(Slot, {
    at: "session.header",
    order: 10,
    render: (input) => <SessionContextUsage session={input.session} placement="bottom" />,
  })

  ctx.add(
    Panel,
    (): Panel => ({
      id: "main",
      region: "side",
      // Stored before extensions as "context", then under the extension's earlier id `usage`.
      legacy: { context: "main", "usage:context": "main" },
      mobile: { title: ctx.t("mobile.title"), order: 40, kind: "menu", icon: "status" },
      list: (input) => (input.open.includes("main") ? [tab] : []),
      render: (props) => {
        const panel = usePanel()

        return (
          <Show
            when={panel.placement() !== "mobile"}
            fallback={
              <Suspense>
                <SessionContextTab session={props.session} />
              </Suspense>
            }
          >
            <div class="relative pt-2 flex-1 min-h-0 overflow-hidden">
              <Suspense>
                <SessionContextTab session={props.session} />
              </Suspense>
            </div>
          </Show>
        )
      },
    }),
  )
}

export default setup
