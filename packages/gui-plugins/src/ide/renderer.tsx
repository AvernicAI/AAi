import { lazy, onCleanup, Suspense } from "solid-js"
import { showToast } from "@opencode/ui/toast"
import { MenuItem, createKeyed, type Plugin } from "@opencode/plugin/gui"
import { BuiltinCommand, BuiltinPanel, onIdle } from "@opencode/plugin/gui/builtin"
import { Ide } from "./contract"
import type definition from "./index"

const setup: Plugin.Setup<typeof definition> = (ctx) => {
  const Workspace = lazy(() => import("./panel"))
  onCleanup(onIdle(() => void Workspace.preload()))

  const open = () => {
    const session = ctx.sessions.current()

    if (session) return ctx.layout.open("ide:workspace", session, { tab: "select" })

    showToast({ title: ctx.t("open"), description: ctx.t("sessionRequired") })
  }

  createKeyed(ctx.use(Ide), (client) => void client.on("open", open))

  ctx.add(
    BuiltinCommand,
    (): BuiltinCommand => ({
      id: "open",
      title: ctx.t("open"),
      group: ctx.t("title"),
      bind: "mod+shift+i",
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
    icon: "code-slash",
    keybind: "ide.open",
    run: open,
  })

  const tab = {
    id: "workspace",
    get title() {
      return ctx.t("title")
    },
    fallback: true,
  }

  ctx.add(BuiltinPanel, {
    id: "workspace",
    region: "side",
    wide: true,
    mobile: {
      get title() {
        return ctx.t("title")
      },
      order: 25,
      kind: "menu",
      icon: "code-slash",
    },
    list: (input) => (input.open.includes("workspace") ? [tab] : []),
    render: (props) => (
      <Suspense>
        <Workspace session={props.session} screen={props.screen} />
      </Suspense>
    ),
  })
}

export default setup
