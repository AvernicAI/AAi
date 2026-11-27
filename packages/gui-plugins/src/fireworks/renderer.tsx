import { workspaceTitlebar } from "../workspace-titlebar"
import { lazy, Suspense } from "solid-js"
import { MenuItem, SettingsPage, TitlebarItem, usePanel, type Plugin } from "@opencode/plugin/gui"
import { BuiltinCommand, BuiltinPanel } from "@opencode/plugin/gui/builtin"
import type definition from "./index"

const setup: Plugin.Setup<typeof definition> = (ctx) => {
  const Workspace = lazy(() => import("./panel"))

  const open = () => {
    const session = ctx.sessions.current()

    if (session && ctx.desktop) return ctx.layout.open("fireworks:workspace", session, { tab: "select" })
    ctx.layout.settings("fireworks")
  }

  ctx.add(
    BuiltinCommand,
    (): BuiltinCommand => ({
      id: "open",
      title: ctx.t("open"),
      group: ctx.t("title"),
      keywords: "Fireworks AI serverless training deployments batch playground models sign in",
      featured: true,
      run: open,
    }),
  )
  ctx.add(
    TitlebarItem,
    (): TitlebarItem => ({ id: `${ctx.id}:open`, label: ctx.t("title"), group: workspaceTitlebar, run: open }),
  )
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
    layout: "fill",
    id: "fireworks",
    icon: "outline-globe",
    get title() {
      return ctx.t("title")
    },
    get entries() {
      return [
        {
          id: "fireworks",
          title: ctx.t("open"),
          keywords: "Fireworks AI serverless training deployments playground sign in",
        },
      ]
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
    width: 1280,
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
