// @refresh reload

import { createEffect, onMount } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { CUSTOM_THEMES_KEY, parsePaletteTheme, readPaletteThemes } from "./custom"
import { makeEventListener } from "@solid-primitives/event-listener"
import { createSimpleContext } from "../context/helper"
import oc2ThemeJson from "./themes/oc-2.json"
import { resolveThemeVariant, themeToCss } from "./resolve"
import { resolveThemeVariantV2, themeV2ToCss } from "./v2/resolve"
import type { DesktopTheme } from "./types"

export type ColorScheme = "light" | "dark" | "system"

const STORAGE_KEYS = {
  THEME_ID: "opencode-theme-id",
  COLOR_SCHEME: "opencode-color-scheme",
  THEME_CSS_LIGHT: "opencode-theme-css-light",
  THEME_CSS_DARK: "opencode-theme-css-dark",
} as const

const THEME_STYLE_ID = "oc-theme"

let files: Record<string, () => Promise<{ default: DesktopTheme }>> | undefined

let ids: string[] | undefined

let known: Set<string> | undefined

function getFiles() {
  if (files) return files
  files = import.meta.glob<{ default: DesktopTheme }>("./themes/*.json")

  return files
}

function themeIDs() {
  if (ids) return ids
  ids = Object.keys(getFiles())
    .map((path) => path.slice("./themes/".length, -".json".length))
    .sort()

  return ids
}

function knownThemes() {
  if (known) return known
  known = new Set(themeIDs())

  return known
}

const names = new Map(
  Object.entries({
    "oc-2": "AAi",
    "aai-obsidian": "AAi Obsidian",
    "aai-tidal": "AAi Tidal",
    "aai-nebula": "AAi Nebula",
    amoled: "AMOLED",
    aura: "Aura",
    ayu: "Ayu",
    carbonfox: "Carbonfox",
    catppuccin: "Catppuccin",
    "catppuccin-frappe": "Catppuccin Frappe",
    "catppuccin-macchiato": "Catppuccin Macchiato",
    cobalt2: "Cobalt2",
    cursor: "Cursor",
    dracula: "Dracula",
    everforest: "Everforest",
    flexoki: "Flexoki",
    github: "GitHub",
    gruvbox: "Gruvbox",
    kanagawa: "Kanagawa",
    "lucent-orng": "Lucent Orng",
    material: "Material",
    matrix: "Matrix",
    mercury: "Mercury",
    monokai: "Monokai",
    nightowl: "Night Owl",
    nord: "Nord",
    "one-dark": "One Dark",
    onedarkpro: "One Dark Pro",
    orng: "Orng",
    "osaka-jade": "Osaka Jade",
    palenight: "Palenight",
    rosepine: "Rose Pine",
    shadesofpurple: "Shades of Purple",
    solarized: "Solarized",
    synthwave84: "Synthwave '84",
    tokyonight: "Tokyonight",
    vercel: "Vercel",
    vesper: "Vesper",
    zenburn: "Zenburn",
  }),
)

// SAFETY: this bundled theme follows DesktopTheme; JSON imports widen its hex color literals to string.
const oc2Theme = oc2ThemeJson as DesktopTheme

type ThemeState = {
  themes: Record<string, DesktopTheme>
  themeId: string
  colorScheme: ColorScheme
  mode: "light" | "dark"
  previewThemeId: string | null
  previewScheme: ColorScheme | null
}

function colorScheme(value: string | null): ColorScheme {
  return value === "light" || value === "system" ? value : "dark"
}

function resolveStoredTheme(id: string | null | undefined, registered?: Record<string, DesktopTheme>) {
  if (id === "oc-2" || (id && (knownThemes().has(id) || registered?.[id]))) return id

  return "oc-2"
}

function read(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {}
}

function drop(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {}
}

function clear() {
  drop(STORAGE_KEYS.THEME_CSS_LIGHT)
  drop(STORAGE_KEYS.THEME_CSS_DARK)
}

function ensureThemeStyleElement(): HTMLStyleElement {
  const existing = document.querySelector<HTMLStyleElement>(`style#${THEME_STYLE_ID}`)

  if (existing) return existing
  const element = document.createElement("style")
  element.id = THEME_STYLE_ID
  document.head.appendChild(element)

  return element
}

function getSystemMode(): "light" | "dark" {
  // SSR has no browser global; this checks the environment before accessing its media-query API.
  // oxlint-disable-next-line anti-slop/no-runtime-typeof
  if (typeof window === "undefined") return "dark"

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function applyThemeCss(theme: DesktopTheme, themeId: string, mode: "light" | "dark", cache = true) {
  const isDark = mode === "dark"
  const variant = isDark ? theme.dark : theme.light
  const tokens = resolveThemeVariant(variant, isDark)
  const css = themeToCss(tokens)
  const v2 = themeV2ToCss(resolveThemeVariantV2(variant, isDark))

  if (cache && themeId !== "oc-2") {
    write(isDark ? STORAGE_KEYS.THEME_CSS_DARK : STORAGE_KEYS.THEME_CSS_LIGHT, `${css}\n  ${v2}`)
  }

  const fullCss = `:root {
  color-scheme: ${mode};
  --text-mix-blend-mode: ${isDark ? "plus-lighter" : "multiply"};
  ${css}
  ${v2}
}`

  document.getElementById("oc-theme-preload")?.remove()
  ensureThemeStyleElement().textContent = fullCss
  document.documentElement.dataset.theme = themeId
  document.documentElement.dataset.colorScheme = mode
  document.documentElement.style.backgroundColor = isDark ? "#080808" : "#fafafa"

  // Update theme-color meta tag to match light/dark mode
  const meta = document.querySelector('meta[name="theme-color"]')

  if (meta) meta.setAttribute("content", isDark ? "#080808" : "#fafafa")
}

function cacheThemeVariants(theme: DesktopTheme, themeId: string) {
  if (themeId === "oc-2") return

  for (const mode of ["light", "dark"] as const) {
    const isDark = mode === "dark"
    const variant = isDark ? theme.dark : theme.light
    const tokens = resolveThemeVariant(variant, isDark)
    const css = themeToCss(tokens)
    const v2 = themeV2ToCss(resolveThemeVariantV2(variant, isDark))
    write(isDark ? STORAGE_KEYS.THEME_CSS_DARK : STORAGE_KEYS.THEME_CSS_LIGHT, `${css}\n  ${v2}`)
  }
}

export const { use: useTheme, provider: ThemeProvider } = createSimpleContext({
  name: "Theme",
  init: (props: {
    defaultTheme?: string
    onThemeApplied?: (theme: DesktopTheme, mode: "light" | "dark", scheme: ColorScheme) => void
  }) => {
    const custom = new Map(readPaletteThemes(read(CUSTOM_THEMES_KEY)).map((theme) => [theme.id, theme]))
    const rawTheme = read(STORAGE_KEYS.THEME_ID) ?? props.defaultTheme
    const themeId = resolveStoredTheme(rawTheme, Object.fromEntries(custom))

    if (rawTheme && rawTheme !== themeId) {
      write(STORAGE_KEYS.THEME_ID, themeId)
      clear()
    }

    const scheme = colorScheme(read(STORAGE_KEYS.COLOR_SCHEME))
    const mode = scheme === "system" ? getSystemMode() : scheme

    const [store, setStore] = createStore<ThemeState>({
      themes: {
        ...Object.fromEntries(custom),
        "oc-2": oc2Theme,
      },
      themeId,
      colorScheme: scheme,
      mode,
      previewThemeId: null,
      previewScheme: null,
    })

    const loads = new Map<string, Promise<DesktopTheme | undefined>>()

    const load = (id: string) => {
      const next = id

      if (!next) return Promise.resolve(undefined)
      const hit = store.themes[next]

      if (hit) return Promise.resolve(hit)
      const pending = loads.get(next)

      if (pending) return pending
      const file = getFiles()[`./themes/${next}.json`]

      if (!file) return Promise.resolve(undefined)

      const task = file()
        .then((mod) => {
          const theme = mod.default
          setStore("themes", next, theme)

          return theme
        })
        .finally(() => {
          loads.delete(next)
        })

      loads.set(next, task)

      return task
    }

    const applyTheme = (
      theme: DesktopTheme,
      themeId: string,
      mode: "light" | "dark",
      scheme: ColorScheme,
      cache = true,
    ) => {
      applyThemeCss(theme, themeId, mode, cache)
      props.onThemeApplied?.(theme, mode, scheme)
    }

    const ids = () => {
      const extra = Object.keys(store.themes)
        .filter((id) => id !== "aai-editor-preview" && !knownThemes().has(id))
        .sort()

      const all = themeIDs()

      if (extra.length === 0) return all

      return [...all, ...extra]
    }

    const loadThemes = () => Promise.all(themeIDs().map(load)).then(() => store.themes)

    const onStorage = (e: StorageEvent) => {
      if (e.key === CUSTOM_THEMES_KEY) {
        const themes = readPaletteThemes(e.newValue)
        custom.clear()
        themes.forEach((theme) => custom.set(theme.id, theme))
        setStore(
          "themes",
          reconcile({
            ...Object.fromEntries(Object.entries(store.themes).filter(([id]) => !id.startsWith("aai-custom-"))),
            ...Object.fromEntries(custom),
          }),
        )

        if (store.themeId.startsWith("aai-custom-") && !custom.has(store.themeId)) setStore("themeId", "oc-2")
      }

      if (e.key === STORAGE_KEYS.THEME_ID && e.newValue) {
        const next = resolveStoredTheme(e.newValue, store.themes)

        if (next !== e.newValue) {
          write(STORAGE_KEYS.THEME_ID, next)
          clear()
        }

        setStore("themeId", next)

        if (next === "oc-2") {
          clear()

          return
        }

        void load(next).then((theme) => {
          if (!theme || store.themeId !== next) return
          cacheThemeVariants(theme, next)
        })
      }

      if (e.key === STORAGE_KEYS.COLOR_SCHEME && e.newValue) {
        const scheme = colorScheme(e.newValue)

        setStore("colorScheme", scheme)
        setStore("mode", scheme === "system" ? getSystemMode() : scheme)
      }
    }

    onMount(() => {
      makeEventListener(window, "storage", onStorage)

      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")

      const onMedia = () => {
        if (store.colorScheme !== "system") return
        setStore("mode", getSystemMode())
      }

      makeEventListener(mediaQuery, "change", onMedia)

      const rawTheme = read(STORAGE_KEYS.THEME_ID) ?? props.defaultTheme
      const savedTheme = resolveStoredTheme(rawTheme, store.themes)
      const savedScheme = colorScheme(read(STORAGE_KEYS.COLOR_SCHEME))

      if (rawTheme && rawTheme !== savedTheme) {
        write(STORAGE_KEYS.THEME_ID, savedTheme)
        clear()
      }

      if (savedTheme !== store.themeId) setStore("themeId", savedTheme)

      if (savedScheme !== store.colorScheme) setStore("colorScheme", savedScheme)
      setStore("mode", savedScheme === "system" ? getSystemMode() : savedScheme)
      void load(savedTheme).then((theme) => {
        if (!theme || store.themeId !== savedTheme) return
        cacheThemeVariants(theme, savedTheme)
      })
    })

    createEffect(() => {
      const theme = store.themes[store.themeId]

      if (!theme) return
      applyTheme(theme, store.themeId, store.mode, store.colorScheme)
    })

    const setTheme = (id: string) => {
      const next = id

      if (!next) {
        console.warn(`Theme "${id}" not found`)

        return
      }

      if (next !== "oc-2" && !knownThemes().has(next) && !store.themes[next]) {
        console.warn(`Theme "${id}" not found`)

        return
      }

      setStore("themeId", next)

      if (next === "oc-2") {
        write(STORAGE_KEYS.THEME_ID, next)
        clear()

        return
      }

      void load(next).then((theme) => {
        if (!theme || store.themeId !== next) return
        cacheThemeVariants(theme, next)
        write(STORAGE_KEYS.THEME_ID, next)
      })
    }

    const setColorScheme = (scheme: ColorScheme) => {
      setStore("colorScheme", scheme)
      write(STORAGE_KEYS.COLOR_SCHEME, scheme)
      setStore("mode", scheme === "system" ? getSystemMode() : scheme)
    }

    return {
      themeId: () => store.themeId,
      colorScheme: () => store.colorScheme,
      mode: () => store.mode,
      ids,
      name: (id: string) => store.themes[id]?.name ?? names.get(id) ?? id,
      loadThemes,
      loadTheme: load,
      themes: () => store.themes,
      setTheme,
      setColorScheme,
      registerTheme: (theme: DesktopTheme) => setStore("themes", theme.id, theme),
      saveTheme: (input: DesktopTheme) => {
        const theme = parsePaletteTheme(input)

        if (!theme.id.startsWith("aai-custom-")) throw new Error("Invalid custom theme ID")
        const next = new Map(custom).set(theme.id, theme)
        localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify([...next.values()]))
        custom.set(theme.id, theme)
        setStore("themes", theme.id, reconcile(theme))
        setTheme(theme.id)
      },
      removeTheme: (id: string) => {
        if (!custom.has(id)) return
        const next = [...custom.values()].filter((theme) => theme.id !== id)
        localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(next))
        custom.delete(id)

        if (store.themeId === id) setTheme("oc-2")
        setStore("themes", reconcile(Object.fromEntries(Object.entries(store.themes).filter(([key]) => key !== id))))
      },
      removePreviewTheme: () =>
        setStore(
          "themes",
          reconcile(Object.fromEntries(Object.entries(store.themes).filter(([id]) => id !== "aai-editor-preview"))),
        ),
      previewTheme: (id: string) => {
        const next = id

        if (!next) return

        if (next !== "oc-2" && !knownThemes().has(next) && !store.themes[next]) return
        setStore("previewThemeId", next)
        void load(next).then((theme) => {
          if (!theme || store.previewThemeId !== next) return

          const mode = store.previewScheme
            ? store.previewScheme === "system"
              ? getSystemMode()
              : store.previewScheme
            : store.mode

          applyTheme(theme, next, mode, store.previewScheme ?? store.colorScheme, false)
        })
      },
      previewColorScheme: (scheme: ColorScheme) => {
        setStore("previewScheme", scheme)
        const mode = scheme === "system" ? getSystemMode() : scheme
        const id = store.previewThemeId ?? store.themeId
        void load(id).then((theme) => {
          if (!theme) return

          if ((store.previewThemeId ?? store.themeId) !== id) return

          if (store.previewScheme !== scheme) return
          applyTheme(theme, id, mode, scheme, false)
        })
      },
      commitPreview: () => {
        if (store.previewThemeId) {
          setTheme(store.previewThemeId)
        }

        if (store.previewScheme) {
          setColorScheme(store.previewScheme)
        }

        setStore("previewThemeId", null)
        setStore("previewScheme", null)
      },
      cancelPreview: () => {
        setStore("previewThemeId", null)
        setStore("previewScheme", null)
        const id = store.themeId
        void load(id).then((theme) => {
          if (!theme || store.themeId !== id || store.previewThemeId) return
          applyTheme(theme, id, store.mode, store.colorScheme)
        })
      },
    }
  },
})
