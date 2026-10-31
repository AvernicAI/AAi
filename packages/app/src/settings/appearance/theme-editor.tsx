import { For, Show, onCleanup } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { Button } from "@opencode/ui/button"
import { TextInput } from "@opencode/ui/text-input"
import { useTheme } from "@opencode/ui/theme"
import { paletteKeys, parsePaletteTheme, type PaletteTheme } from "@opencode/ui/theme/custom"
import { useLanguage } from "@/runtime/i18n/language"

export function ThemeEditor() {
  const theme = useTheme()
  const language = useLanguage()
  const lifetime = new AbortController()

  const [store, setStore] = createStore<{ draft?: PaletteTheme; mode: "light" | "dark"; error: string; busy: boolean }>(
    { mode: theme.mode(), error: "", busy: false },
  )

  const stop = () => {
    theme.cancelPreview()
    theme.removePreviewTheme()
    setStore("draft", undefined)
  }

  onCleanup(() => {
    lifetime.abort()
    theme.cancelPreview()
    theme.removePreviewTheme()
  })

  const preview = (draft: PaletteTheme, mode = store.mode) => {
    theme.registerTheme({ ...draft, id: "aai-editor-preview" })
    theme.previewTheme("aai-editor-preview")
    theme.previewColorScheme(mode)
  }

  const start = async () => {
    setStore({ error: "", busy: true })

    try {
      const source = await theme.loadTheme(theme.themeId())

      if (lifetime.signal.aborted) return

      if (!source) throw new Error("Missing theme")

      const draft = parsePaletteTheme({
        id: source.id.startsWith("aai-custom-") ? source.id : `aai-custom-${crypto.randomUUID()}`,
        name: source.id.startsWith("aai-custom-")
          ? source.name
          : language.t("settings.themeEditor.copyName", { name: source.name }),
        light: { palette: source.light.palette ?? { ...source.light.seeds, ink: "#202020" } },
        dark: { palette: source.dark.palette ?? { ...source.dark.seeds, ink: "#eeeeee" } },
      })

      setStore({ draft, mode: theme.mode() })
      preview(draft, theme.mode())
    } catch {
      if (!lifetime.signal.aborted) setStore("error", language.t("settings.themeEditor.failed"))
    } finally {
      if (!lifetime.signal.aborted) setStore("busy", false)
    }
  }

  const save = (copy: boolean) => {
    if (!store.draft) return

    try {
      const draft = parsePaletteTheme({
        ...store.draft,
        id: copy ? `aai-custom-${crypto.randomUUID()}` : store.draft.id,
      })

      theme.saveTheme(draft)
      stop()
      setStore("error", "")
    } catch {
      setStore("error", language.t("settings.themeEditor.failed"))
    }
  }

  const change = (key: (typeof paletteKeys)[number], value: string) => {
    if (!store.draft) return
    const name = store.draft.name

    const draft = parsePaletteTheme({
      ...store.draft,
      name: name.trim() || "AAi",
      [store.mode]: { palette: { ...store.draft[store.mode].palette, [key]: value } },
    })

    setStore("draft", reconcile({ ...draft, name }))
    setStore("error", "")
    preview(draft)
  }

  const imported = async (file: File | undefined) => {
    if (!file) return

    try {
      const input: unknown = JSON.parse(await file.text())

      if (lifetime.signal.aborted) return
      const draft = { ...parsePaletteTheme(input), id: `aai-custom-${crypto.randomUUID()}` }
      setStore({ draft, error: "" })
      preview(draft)
    } catch {
      if (!lifetime.signal.aborted) setStore("error", language.t("settings.themeEditor.invalid"))
    }
  }

  const exported = () => {
    if (!store.draft) return
    const url = URL.createObjectURL(new Blob([JSON.stringify(store.draft, null, 2)], { type: "application/json" }))
    const link = document.createElement("a")
    link.href = url
    link.download = `${store.draft.id}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const remove = () => {
    try {
      theme.removeTheme(theme.themeId())
    } catch {
      setStore("error", language.t("settings.themeEditor.failed"))
    }
  }

  return (
    <section class="settings-section" aria-label={language.t("settings.themeEditor.title")}>
      <h3 class="settings-section-title">{language.t("settings.themeEditor.title")}</h3>
      <p class="mb-4 text-sm text-v2-text-text-muted">{language.t("settings.themeEditor.description")}</p>
      <Show when={store.error}>
        <p role="alert">{store.error}</p>
      </Show>
      <Show when={!store.draft}>
        <div class="flex flex-wrap gap-3">
          <Button disabled={store.busy} onClick={() => void start()}>
            {language.t("settings.themeEditor.customize")}
          </Button>
          <Show when={theme.themeId().startsWith("aai-custom-")}>
            <Button variant="neutral" onClick={remove}>
              {language.t("settings.themeEditor.delete")}
            </Button>
          </Show>
        </div>
      </Show>
      <label class="my-4 flex flex-col gap-2 text-sm">
        {language.t("settings.themeEditor.import")}
        <input
          type="file"
          accept="application/json,.json"
          aria-label={language.t("settings.themeEditor.import")}
          onChange={(event) => void imported(event.currentTarget.files?.[0])}
        />
      </label>
      <Show when={store.draft}>
        {(draft) => (
          <div class="flex flex-col gap-4">
            <label class="flex flex-col gap-2 text-sm">
              {language.t("settings.themeEditor.name")}
              <TextInput
                aria-label={language.t("settings.themeEditor.name")}
                value={draft().name}
                onInput={(event) => {
                  setStore("draft", "name", event.currentTarget.value)
                  setStore("error", "")
                }}
              />
            </label>
            <div class="flex gap-2">
              <For each={["dark", "light"] as const}>
                {(mode) => (
                  <Button
                    variant="neutral"
                    aria-pressed={store.mode === mode}
                    onClick={() => {
                      setStore("mode", mode)
                      preview(draft(), mode)
                    }}
                  >
                    {language.t(`settings.themeEditor.${mode}`)}
                  </Button>
                )}
              </For>
            </div>
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <For each={paletteKeys}>
                {(key) => (
                  <label class="flex items-center justify-between gap-3 rounded-md border border-v2-border-border-base p-3 text-sm">
                    <span>{language.t(`settings.themeEditor.color.${key}`)}</span>
                    <div class="flex items-center gap-2">
                      <TextInput
                        class="w-28"
                        aria-label={language.t("settings.themeEditor.hex", {
                          color: language.t(`settings.themeEditor.color.${key}`),
                        })}
                        value={draft()[store.mode].palette[key]}
                        onChange={(event) => {
                          try {
                            change(key, event.currentTarget.value)
                          } catch {
                            event.currentTarget.value = draft()[store.mode].palette[key]
                            setStore("error", language.t("settings.themeEditor.invalidColor"))
                          }
                        }}
                      />
                      <input
                        type="color"
                        class="h-9 w-12 cursor-pointer rounded"
                        aria-label={language.t(`settings.themeEditor.color.${key}`)}
                        value={draft()[store.mode].palette[key]}
                        onInput={(event) => change(key, event.currentTarget.value)}
                      />
                    </div>
                  </label>
                )}
              </For>
            </div>
            <div class="flex flex-wrap gap-2">
              <Button disabled={!!store.error} onClick={() => save(false)}>
                {language.t("settings.themeEditor.save")}
              </Button>
              <Button disabled={!!store.error} variant="neutral" onClick={() => save(true)}>
                {language.t("settings.themeEditor.copy")}
              </Button>
              <Button variant="neutral" onClick={exported}>
                {language.t("settings.themeEditor.export")}
              </Button>
              <Button variant="neutral" onClick={stop}>
                {language.t("common.cancel")}
              </Button>
            </div>
          </div>
        )}
      </Show>
    </section>
  )
}
