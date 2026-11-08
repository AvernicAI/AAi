import { lazy, onCleanup, Suspense } from "solid-js"
import { MenuItem, type Plugin } from "@opencode/plugin/gui"
import { BuiltinCommand, BuiltinPanel, onIdle } from "@opencode/plugin/gui/builtin"
import { showToast } from "@opencode/ui/toast"
import type definition from "./index"

const setup: Plugin.Setup<typeof definition> = (ctx) => {
  if (ctx.app.platform !== "desktop") return
  const Workspace = lazy(() => import("./panel"))
  onCleanup(onIdle(() => void Workspace.preload()))
  const open = () => {
    const session = ctx.sessions.current()
    if (session) return ctx.layout.open("merlin:workspace", session, { tab: "select" })
    showToast({ title: ctx.t("open"), description: ctx.t("sessionRequired") })
  }
  ctx.add(
    BuiltinCommand,
    (): BuiltinCommand => ({
      id: "open",
      title: ctx.t("open"),
      group: ctx.t("title"),
      keywords: "merlin chat free paid models",
      featured: true,
      run: open,
    }),
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
  const tab = {
    id: "workspace",
    get title() {
      return ctx.t("title")
    },
  }
  ctx.add(BuiltinPanel, {
    id: "workspace",
    region: "side",
    wide: true,
    mobile: {
      get title() {
        return ctx.t("title")
      },
      order: 26,
      kind: "menu",
      icon: "outline-globe",
    },
    list: (input) => (input.open.includes("workspace") ? [tab] : []),
    render: () => (
      <Suspense>
        <Workspace />
      </Suspense>
    ),
  })
}

export default setup
