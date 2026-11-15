import { For } from "solid-js"
import { usePlugin } from "@opencode/plugin/gui"
import type definition from "./index"

export default function AlphieSettings() {
  const ctx = usePlugin<typeof definition>()
  const preferences = ctx.stores.preferences

  return (
    <>
      <div class="settings-tab-header">
        <h2 class="settings-tab-title">{ctx.t("title")}</h2>
        <p>{ctx.t("description")}</p>
      </div>
      <div class="settings-tab-body alphie-settings">
        <label class="alphie-setting">
          {ctx.t("enabled")}
          <input
            type="checkbox"
            checked={preferences.value.features.alphieMate}
            onChange={(event) => {
              const checked = event.currentTarget.checked
              void preferences.update((draft) => {
                draft.features.alphieMate = checked
              })
            }}
          />
        </label>
        <For each={["floating", "alwaysOnTop"] as const}>
          {(key) => (
            <label class="alphie-setting">
              {ctx.t(key)}
              <input
                type="checkbox"
                checked={preferences.value[key]}
                disabled={!ctx.desktop}
                onChange={(event) => {
                  const checked = event.currentTarget.checked
                  void preferences.update((draft) => {
                    draft[key] = checked
                  })
                }}
              />
            </label>
          )}
        </For>
        <label class="alphie-setting">
          {ctx.t("size")}
          <input
            type="range"
            min="100"
            max="300"
            step="10"
            value={preferences.value.size}
            onInput={(event) => {
              const value = event.currentTarget.valueAsNumber
              void preferences.update((draft) => {
                draft.size = value
              })
            }}
          />
        </label>
        <label class="alphie-setting">
          {ctx.t("opacity")}
          <input
            type="range"
            min="0.25"
            max="1"
            step="0.05"
            value={preferences.value.opacity}
            onInput={(event) => {
              const value = event.currentTarget.valueAsNumber
              void preferences.update((draft) => {
                draft.opacity = value
              })
            }}
          />
        </label>
        <label class="alphie-setting">
          {ctx.t("sleepSeconds")}
          <input
            type="number"
            min="0"
            max="86400"
            value={preferences.value.sleepSeconds}
            onChange={(event) => {
              const value = Math.max(0, Math.min(86400, event.currentTarget.valueAsNumber || 0))
              void preferences.update((draft) => {
                draft.sleepSeconds = value
              })
            }}
          />
        </label>
      </div>
    </>
  )
}
