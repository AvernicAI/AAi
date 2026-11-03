import { For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { usePlugin } from "@opencode/plugin/gui"
import type definition from "./index"
import LibraryPage from "./page"
import PackagesPage from "./plugins"
import RecipesPage from "./recipes"

export default function LibraryHub() {
  const ctx = usePlugin<typeof definition>()
  const [state, setState] = createStore<{ tab: "plugins" | "skills" | "recipes" | "saved" }>({ tab: "plugins" })

  return (
    <div class="aai-library-hub" data-prevent-autofocus>
      <div class="aai-library-hero">
        <span class="aai-library-monogram" aria-hidden="true">
          AAi
        </span>
        <div>
          <h3>{ctx.t("hub.headline")}</h3>
          <p>{ctx.t("hub.description")}</p>
        </div>
      </div>
      <div class="aai-skill-tabs" role="tablist" aria-label={ctx.t("title")}>
        <For each={["plugins", "skills", "recipes", "saved"] as const}>
          {(tab) => (
            <button role="tab" aria-selected={state.tab === tab} onClick={() => setState("tab", tab)}>
              {ctx.t(`hub.${tab}`)}
            </button>
          )}
        </For>
      </div>
      <Show when={state.tab === "plugins" || state.tab === "saved"}>
        <PackagesPage savedOnly={state.tab === "saved"} />
      </Show>
      <Show when={state.tab === "skills"}>
        <LibraryPage />
      </Show>
      <Show when={state.tab === "recipes"}>
        <RecipesPage />
      </Show>
    </div>
  )
}
