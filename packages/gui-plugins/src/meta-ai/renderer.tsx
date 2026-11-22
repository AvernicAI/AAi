import { workspaceTitlebar } from "../workspace-titlebar"
import { lazy, Suspense } from "solid-js"
import { MenuItem, SettingsPage, TitlebarItem, usePanel, type Plugin } from "@opencode/plugin/gui"
import { BuiltinCommand, BuiltinPanel } from "@opencode/plugin/gui/builtin"
import type definition from "./index"

const setup: Plugin.Setup<typeof definition> = (ctx) => {
  const Workspace = lazy(() => import("./panel"))

  const open = () => {
    const session = ctx.sessions.current()

    if (session && ctx.desktop) return ctx.layout.open("meta-ai:workspace", session, { tab: "select" })
    ctx.layout.settings("meta-ai")
  }

  ctx.add(
    BuiltinCommand,
    (): BuiltinCommand => ({
      id: "open",
      title: ctx.t("open"),
      group: ctx.t("title"),
      keywords: "Meta AI Facebook Instagram account web sign in",
      featured: true,
      run: open,
    }),
  )
  ctx.add(TitlebarItem, (): TitlebarItem => ({ id: `${ctx.id}:open`, label: ctx.t("title"), group: workspaceTitlebar, run: open }))
  ctx.add(MenuItem, {
    id: "open",
    menu: "session.panel",
    get title() {
      return ctx.t("open")
    },
    icon: "outline-globe",
    run: open,
  })
  ctx.add(SettingsPage, {
    id: "meta-ai",
    icon: "outline-globe",
    get title() {
      return ctx.t("title")
    },
    get entries() {
      return [{ id: "meta-ai", title: ctx.t("open"), keywords: "Meta AI Facebook Instagram account sign in" }]
    },
    render: () => (
      <div class="flex size-full min-h-0 flex-col">
        <div class="settings-tab-header">
          <h2 class="settings-tab-title">{ctx.t("title")}</h2>
        </div>
        <p class="shrink-0 px-6 pb-3 text-sm text-v2-text-text-muted">{ctx.t("description")}</p>
        <div class="min-h-0 flex-1">
          <Suspense>
            <Workspace visible />
          </Suspense>
        </div>
      </div>
    ),
  })

  const tab = {
    id: "workspace",
    get title() {
      return ctx.t("title")
    },
  }

  const Panel = () => {
    const panel = usePanel()

    return (
      <Suspense>
        <Workspace visible={panel.visible()} />
      </Suspense>
    )
  }

  ctx.add(BuiltinPanel, {
    id: "workspace",
    region: "side",
    wide: true,
    mobile: {
      get title() {
        return ctx.t("title")
      },
      order: 28,
      kind: "menu",
      icon: "outline-globe",
    },
    list: (input) => (input.open.includes("workspace") ? [tab] : []),
    render: () => <Panel />,
  })
}

export default setup
