import { createSignal, Show } from "solid-js"
import { Button } from "@opencode/ui/button"
import { useLanguage } from "@/runtime/i18n/language"
import { SettingsRow } from "@/settings/row"

const key = "aai.background.image"
const enabledKey = "aai.background.enabled"
const [enabled, setEnabled] = createSignal(true)
const fitKey = "aai.background.fit"
const [fit, setFit] = createSignal<"cover" | "contain">("cover")
const opacityKey = "aai.background.opacity"
const imageTypes = ["image/png", "image/jpeg", "image/webp"]
const [image, setImage] = createSignal<string>()
const [opacity, setOpacity] = createSignal(12)

export function CustomBackground() {
  setEnabled(localStorage.getItem(enabledKey) !== "false")
  setFit(localStorage.getItem(fitKey) === "contain" ? "contain" : "cover")
  const saved = localStorage.getItem(key)
  if (saved && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(saved)) setImage(saved)
  const value = Number(localStorage.getItem(opacityKey) ?? 12)
  if (Number.isFinite(value)) setOpacity(Math.min(30, Math.max(0, value)))
  return (
    <Show when={enabled() && image()}>
      <img
        aria-hidden="true"
        alt=""
        src={image()}
        style={{
          position: "fixed",
          inset: "0",
          width: "100%",
          height: "100%",
          "object-fit": fit(),
          "pointer-events": "none",
          "z-index": "1",
          opacity: opacity() / 100,
        }}
      />
    </Show>
  )
}

export function BackgroundSettings() {
  const language = useLanguage()
  const [failed, setFailed] = createSignal(false)
  let picker!: HTMLInputElement

  return (
    <SettingsRow
      title={language.t("settings.appearance.background.title")}
      description={language.t("settings.appearance.background.description")}
    >
      <div class="flex flex-wrap items-center gap-2">
        <input
          ref={picker}
          hidden
          type="file"
          accept={imageTypes.join(",")}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0]
            event.currentTarget.value = ""
            if (!file) return
            setFailed(false)
            if (!imageTypes.includes(file.type) || file.size > 2_000_000) return setFailed(true)
            const reader = new FileReader()
            reader.onerror = () => setFailed(true)
            reader.onload = () => {
              const url = reader.result
              if (typeof url !== "string") return setFailed(true)
              try {
                localStorage.setItem(key, url)
                setImage(url)
              } catch {
                setFailed(true)
              }
            }
            reader.readAsDataURL(file)
          }}
        />
        <Button onClick={() => picker.click()}>{language.t("settings.appearance.background.choose")}</Button>
        <Show when={image()}>
          <label class="flex items-center gap-1">
            <input
              type="checkbox"
              checked={enabled()}
              onChange={(event) => {
                const value = event.currentTarget.checked
                localStorage.setItem(enabledKey, String(value))
                setEnabled(value)
              }}
            />
            {language.t("settings.appearance.background.enabled")}
          </label>
          <select
            value={fit()}
            aria-label={language.t("settings.appearance.background.fit")}
            onChange={(event) => {
              const value = event.currentTarget.value === "contain" ? "contain" : "cover"
              localStorage.setItem(fitKey, value)
              setFit(value)
            }}
          >
            <option value="cover">{language.t("settings.appearance.background.fill")}</option>
            <option value="contain">{language.t("settings.appearance.background.contain")}</option>
          </select>
          <input
            type="range"
            min="0"
            max="30"
            value={opacity()}
            aria-label={language.t("settings.appearance.background.opacity")}
            onInput={(event) => {
              const value = event.currentTarget.valueAsNumber
              localStorage.setItem(opacityKey, String(value))
              setOpacity(value)
            }}
          />
          <Button onClick={() => {
            localStorage.removeItem(key)
            setImage(undefined)
            setFailed(false)
          }}>{language.t("settings.appearance.background.remove")}</Button>
        </Show>
        <Show when={failed()}>
          <span role="alert">{language.t("settings.appearance.background.error")}</span>
        </Show>
      </div>
    </SettingsRow>
  )
}
