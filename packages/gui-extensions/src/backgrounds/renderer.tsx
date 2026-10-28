import { For, Show } from "solid-js"
import { Button } from "@opencode/ui/button"
import { Command, SettingsPage, Slot, Style, type Setup } from "../sdk"
import type definition from "./index"
import css from "./styles.css?inline"

const setup: Setup<typeof definition> = (ctx) => {
  const preferences = ctx.stores.preferences
  const designs = ["default", "aurora", "ember", "blueprint"] as const

  const select = (design: (typeof designs)[number]) =>
    preferences.update((draft) => {
      draft.design = design
    })

  ctx.add(Style, css)
  ctx.add(Slot, {
    at: "window.bottom",
    render: () => (
      <Show when={preferences.value.design !== "default"}>
        <div class="aai-background-layer" data-design={preferences.value.design} aria-hidden="true" />
      </Show>
    ),
  })
  ctx.add(Command, {
    id: "choose",
    get title() {
      return ctx.t("title")
    },
    run: () => ctx.layout.settings("backgrounds"),
  })
  ctx.add(SettingsPage, {
    id: "backgrounds",
    icon: "photo",
    get title() {
      return ctx.t("title")
    },
    get entries() {
      return [{ id: "backgrounds", title: ctx.t("title"), keywords: "AAi AvernicAi wallpaper appearance background" }]
    },
    render: () => (
      <>
        <div class="settings-tab-header">
          <h2 class="settings-tab-title">{ctx.t("title")}</h2>
          <p class="aai-background-description">{ctx.t("description")}</p>
        </div>
        <div class="settings-tab-body">
          <div class="aai-background-choices" role="group" aria-label={ctx.t("title")}>
            <For each={designs}>
              {(design) => (
                <button
                  type="button"
                  class="aai-background-choice"
                  aria-pressed={preferences.value.design === design}
                  onClick={() => void select(design)}
                >
                  <span class="aai-background-preview" data-design={design} aria-hidden="true" />
                  <span class="aai-background-name">{ctx.t(design)}</span>
                  <span class="aai-background-description">{ctx.t(`${design}.description`)}</span>
                  <span class="aai-background-selected">
                    <Show when={preferences.value.design === design}>{ctx.t("selected")}</Show>
                  </span>
                </button>
              )}
            </For>
          </div>
          <Button variant="neutral" onClick={() => void select("default")}>
            {ctx.t("reset")}
          </Button>
        </div>
      </>
    ),
  })
}

export default setup
