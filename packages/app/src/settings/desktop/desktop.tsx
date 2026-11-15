import { Component, createEffect, createMemo, createResource, createSignal, onCleanup, Show } from "solid-js"
import { Select } from "@opencode/ui/select"
import { Switch } from "@opencode/ui/switch"
import { useLanguage } from "@/runtime/i18n/language"
import {
  usePlatform,
  type DesktopCloseBehavior,
  type DesktopPreferenceProblem,
  type DesktopPreferencesPatch,
} from "@/runtime/platform/platform"
import { SettingsList } from "@/settings/list"
import { SettingsRow } from "@/settings/row"
import "@/settings/settings.css"

type Label = Parameters<ReturnType<typeof useLanguage>["t"]>[0]

const problemLabels = {
  "shortcut-invalid": "settings.desktop.problem.shortcutInvalid",
  "shortcut-conflict": "settings.desktop.problem.shortcutConflict",
  "shortcut-failed": "settings.desktop.problem.shortcutFailed",
  "login-item-failed": "settings.desktop.problem.loginItemFailed",
} as const satisfies Record<DesktopPreferenceProblem, Label>

const shortcutModifiers = new Map([
  ["CommandOrControl", "Ctrl"],
  ["Command", "⌘"],
  ["Control", "Ctrl"],
  ["Alt", "Alt"],
  ["Shift", "Shift"],
  ["Super", "Meta"],
])

const namedShortcutKeys = new Map([
  ["Space", "Space"],
  ["Tab", "Tab"],
  ["Enter", "Enter"],
  ["Escape", "Escape"],
  ["Backspace", "Backspace"],
  ["Delete", "Delete"],
  ["ArrowUp", "Up"],
  ["ArrowDown", "Down"],
  ["ArrowLeft", "Left"],
  ["ArrowRight", "Right"],
  ["Home", "Home"],
  ["End", "End"],
  ["PageUp", "PageUp"],
  ["PageDown", "PageDown"],
  ["Comma", "Comma"],
  ["Period", "Period"],
  ["Slash", "Slash"],
  ["Backslash", "Backslash"],
  ["Semicolon", "Semicolon"],
  ["Quote", "Quote"],
  ["Backquote", "Backquote"],
  ["BracketLeft", "BracketLeft"],
  ["BracketRight", "BracketRight"],
  ["Minus", "Minus"],
])

type ShortcutInput = {
  code: string
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
}

/** Records a global-shortcut accelerator, requiring a modifier so a plain key cannot capture typing. */
export function acceleratorFromShortcut(input: ShortcutInput) {
  const key = shortcutKey(input)

  if (!key) return

  const modifiers = [
    input.ctrlKey ? "Control" : undefined,
    input.metaKey ? "Command" : undefined,
    input.altKey ? "Alt" : undefined,
    input.shiftKey ? "Shift" : undefined,
  ].filter((modifier): modifier is string => modifier !== undefined)

  if (!modifiers.length) return

  return [...modifiers, key].join("+")
}

export function formatAccelerator(accelerator: string) {
  return accelerator
    .split("+")
    .map((part) => shortcutModifiers.get(part) ?? part)
    .join("+")
}

function shortcutKey(input: ShortcutInput) {
  const named = namedShortcutKeys.get(input.code)

  if (named) return named

  if (/^Key[A-Z]$/.test(input.code)) return input.code.slice(3)

  if (/^Digit[0-9]$/.test(input.code)) return input.code.slice(5)

  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(input.key)) return input.key.toUpperCase()
}

export const SettingsDesktop: Component = () => {
  const language = useLanguage()
  const platform = usePlatform()

  const [preferences, { mutate }] = createResource(
    () => platform.platform === "desktop" && platform.getDesktopPreferences !== undefined,
    () => platform.getDesktopPreferences?.() ?? Promise.resolve(undefined),
  )

  const [problem, setProblem] = createSignal<DesktopPreferenceProblem>()
  const [recording, setRecording] = createSignal(false)

  createEffect(() => {
    const unsubscribe = platform.onDesktopPreferencesChanged?.(mutate)

    if (unsubscribe) onCleanup(unsubscribe)
  })

  // A change made anywhere else, such as from the tray menu, refreshes the visible controls.
  createEffect(() => {
    if (!recording()) return

    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopPropagation()

      if (event.key === "Escape") {
        setRecording(false)

        return
      }

      const accelerator = acceleratorFromShortcut(event)

      if (!accelerator) return

      setRecording(false)
      update({ summonShortcut: accelerator })
    }

    window.addEventListener("keydown", onKeyDown, true)
    onCleanup(() => window.removeEventListener("keydown", onKeyDown, true))
  })

  const update = (patch: DesktopPreferencesPatch) => {
    const request = platform.setDesktopPreferences?.(patch)

    if (!request) return

    void request.then((result) => {
      mutate(result.preferences)
      setProblem(result.problem)
    })
  }

  const closeBehaviors = createMemo((): { value: DesktopCloseBehavior; label: string }[] => [
    { value: "quit", label: language.t("settings.desktop.closeBehavior.quit") },
    { value: "background", label: language.t("settings.desktop.closeBehavior.background") },
  ])

  return (
    <>
      <div class="settings-tab-header">
        <div class="settings-tab-header-row">
          <div class="flex flex-col gap-1">
            <h2 class="settings-tab-title">{language.t("settings.tab.desktop")}</h2>
            <span class="text-11-regular text-v2-text-text-muted">{language.t("settings.desktop.description")}</span>
          </div>
        </div>
      </div>
      <div class="settings-tab-body settings-tab-body--sectioned">
        <Show
          when={preferences()}
          fallback={
            <p class="text-11-regular text-v2-text-text-muted">{language.t("settings.desktop.unavailable")}</p>
          }
        >
          {(value) => (
            <>
              <section class="settings-section" aria-label={language.t("settings.desktop.section.startup")}>
                <h3 class="settings-section-title">{language.t("settings.desktop.section.startup")}</h3>
                <SettingsList>
                  <SettingsRow
                    title={language.t("settings.desktop.launchAtLogin.title")}
                    description={
                      value().launchAtLoginSupported
                        ? language.t("settings.desktop.launchAtLogin.description")
                        : language.t("settings.desktop.launchAtLogin.unsupported")
                    }
                  >
                    <div data-action="settings-launch-at-login">
                      <Switch
                        checked={value().launchAtLogin}
                        disabled={!value().launchAtLoginSupported}
                        onChange={(checked) => update({ launchAtLogin: checked })}
                      />
                    </div>
                  </SettingsRow>
                </SettingsList>
              </section>

              <section class="settings-section" aria-label={language.t("settings.desktop.section.windows")}>
                <h3 class="settings-section-title">{language.t("settings.desktop.section.windows")}</h3>
                <SettingsList>
                  <SettingsRow
                    title={language.t("settings.desktop.closeBehavior.title")}
                    description={language.t("settings.desktop.closeBehavior.description")}
                  >
                    <Select
                      data-action="settings-close-behavior"
                      options={closeBehaviors()}
                      current={closeBehaviors().find((option) => option.value === value().closeBehavior)}
                      value={(option) => option.value}
                      label={(option) => option.label}
                      placement="bottom-end"
                      gutter={6}
                      onSelect={(option) => option && update({ closeBehavior: option.value })}
                    />
                  </SettingsRow>
                </SettingsList>
              </section>

              <section class="settings-section" aria-label={language.t("settings.desktop.section.shortcut")}>
                <h3 class="settings-section-title">{language.t("settings.desktop.section.shortcut")}</h3>
                <SettingsList>
                  <SettingsRow
                    title={language.t("settings.desktop.summonShortcut.title")}
                    description={language.t("settings.desktop.summonShortcut.description")}
                  >
                    <div data-action="settings-summon-shortcut" class="flex items-center gap-2">
                      <Show
                        when={value().summonShortcut}
                        fallback={
                          <span class="text-11-regular text-v2-text-text-muted">
                            {language.t("settings.desktop.summonShortcut.none")}
                          </span>
                        }
                      >
                        {(shortcut) => (
                          <kbd class="rounded border border-v2-border-border-base px-1.5 py-0.5 text-11-medium">
                            {formatAccelerator(shortcut())}
                          </kbd>
                        )}
                      </Show>
                      <button
                        type="button"
                        class="rounded border border-v2-border-border-base px-2 py-1 text-11-medium"
                        aria-pressed={recording()}
                        onClick={() => setRecording(true)}
                      >
                        {recording()
                          ? language.t("settings.desktop.summonShortcut.recording")
                          : language.t("settings.desktop.summonShortcut.record")}
                      </button>
                      <Show when={value().summonShortcut}>
                        <button
                          type="button"
                          class="rounded px-2 py-1 text-11-medium text-v2-text-text-muted"
                          onClick={() => update({ summonShortcut: null })}
                        >
                          {language.t("settings.desktop.summonShortcut.clear")}
                        </button>
                      </Show>
                    </div>
                  </SettingsRow>
                </SettingsList>
              </section>

              <Show when={problem()}>
                {(code) => (
                  <p class="text-11-regular text-v2-text-text-danger" role="alert">
                    {language.t(problemLabels[code()])}
                  </p>
                )}
              </Show>
            </>
          )}
        </Show>
      </div>
    </>
  )
}
