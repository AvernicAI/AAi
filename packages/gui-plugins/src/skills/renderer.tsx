import { lazy, onCleanup, Show, Suspense } from "solid-js"
import { Command, SettingsPage, Style, type Plugin } from "@opencode/plugin/gui"
import { onIdle } from "@opencode/plugin/gui/builtin"
import type definition from "./index"
import css from "./styles.css?inline"

const setup: Plugin.Setup<typeof definition> = (ctx) => {
  const Library = lazy(() => import("./page"))

  onCleanup(onIdle(() => void Library.preload()))
  ctx.add(Style, css)
  ctx.add(Command, () => ({ id: "explore", title: ctx.t("title"), run: () => ctx.layout.settings("library") }))
  ctx.add(SettingsPage, {
    id: "library",
    icon: "code-slash",
    get title() {
      return ctx.t("title")
    },
    get entries() {
      return [
        {
          id: "library",
          title: ctx.t("title"),
          keywords: "skills SkillMD catalog explore download install enable disable",
        },
      ]
    },
    render: () => (
      <>
        <div class="settings-tab-header">
          <h2 class="settings-tab-title">{ctx.t("title")}</h2>
        </div>
        <div class="settings-tab-body">
          <p>{ctx.t("description")}</p>
          <Show when={ctx.app.platform === "desktop"} fallback={<p>{ctx.t("desktop")}</p>}>
            <Suspense>
              <Library />
            </Suspense>
          </Show>
        </div>
      </>
    ),
  })
}

export default setup
