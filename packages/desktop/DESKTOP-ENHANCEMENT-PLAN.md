# Desktop enhancement plan

Three separately reviewable changes to `@opencode/desktop`:

| PR | Branch | Title | Goal |
| --- | --- | --- | --- |
| A | `desktop-os-integration` | `feat(desktop): native OS integration` | Launch at login, a global summon shortcut, keep-running-in-tray close behavior, and a Desktop settings page |
| C | `fix-desktop-reliability` | `fix(desktop): harden startup and reconnect` | Retry and classify sidecar startup failures, single-flight reconnects, health-driven recovery, crash-loop guard |
| B | `desktop-startup-perf` | `perf(desktop): reduce cold-start time` | Measured startup work, with numbers from the existing bench |

Land them in the order A, C, B. B last: it must be measured against a tree that already contains A and C so the baseline is the shipping behavior.

Every PR targets `dev`, is diffed against `origin/dev`, and must pass `bun run check` from the repo root plus the package tests named in each section.

---

## 0. Ground truth about this package

Read this before writing code. It is what the rest of the plan assumes, verified in the current tree.

### 0.1 Entry and startup order

`src/main/index.ts` is deliberately tiny. On `app.whenReady()` it:

1. records `marks.ready`
2. `registerStorageSnapshotHandler()`
3. `createEarlyWindow()` (`src/main/windows/early.ts`) — creates and shows the first restored window before the rest of the main process loads, then records `marks.window`
4. `startSidecarProbe()` (`src/main/service/sidecar-probe.ts`) — packaged builds only; probes for a compatible service without starting one
5. waits for the renderer's asset burst with `rendererAssetsServed({ quietMs: 40, capMs: 400 })`, records `marks.served`
6. `import("./desktop")`, which evaluates the layers, IPC server, and menu

`src/main/lifecycle/marks.ts` holds `entry/ready/window/served/bundle/onboarding/logging/storage/init/layers`, reported as `app starting` / `layers ready` log lines and consumed by the startup bench.

### 0.2 Typed IPC pipeline

Adding an IPC capability is a five-file change, in this order:

1. `src/shared/ipc-rpc/<group>.ts` — `Rpc.make` definitions and an `RpcGroup`
2. `src/shared/ipc-rpc.ts` — merge the group into `DesktopRpcs` (and export it)
3. `src/main/ipc-handlers/<group>.ts` — `<Group>Rpcs.toLayer(Effect.gen(...))`
4. `src/main/ipc.ts` — add the handler layer to `handlers`
5. `src/renderer/api-types.ts` + `src/renderer/api.ts` — add the method to `ElectronAPI` and implement it with `invoke("<RpcName>", payload)`

Consumers then reach it through `src/renderer/platform/index.ts` (`createDesktopPlatform`), which builds the app-side `Platform` type declared in `packages/app/src/runtime/platform/platform.tsx`.

The renderer never imports Effect; `src/renderer/ipc-client.ts` speaks the RPC wire format over the `MessagePort` handed over by the preload. Payloads must stay JSON-native or `Uint8Array`.

Main-process events go the other way: `src/shared/ipc-rpc/events.ts` defines the tagged union, `emitIpcEvent(win.webContents, new Tagged(...))` sends, and `src/renderer/api.ts` subscribes with `listen("<Tag>", ...)`.

### 0.3 Persistence

`src/main/storage/store.ts` exposes `getStore()` (synchronous reads, 250 ms write-behind) over the `state` table. Desktop-owned values live in the `SETTINGS_STORE` namespace, and their keys are declared in `src/main/storage/keys.ts` (`PINCH_ZOOM_ENABLED_KEY`, `ZOOM_LEVEL_KEY`, `BACKGROUND_COLOR_KEY`, `COLOR_SCHEME_KEY`, …). Values are strings; the callers encode/decode.

`src/main/windows/early.ts` reads that store synchronously before any layer exists. Anything a new preference needs at window-creation time must therefore be readable this way — no Effect service, no async, no filesystem.

### 0.4 Windows and quit

- `src/main/windows/index.ts`: `mainWindows()` returns `{ create, restore }`. `create()` builds the `BrowserWindow`, adopts the early window, wires recovery/fullscreen/focus/zoom, and calls `register(win, id)`.
- `src/main/windows/registry.ts`: `createWindowRegistry` tracks windows, `lastFocusedID`, and a `quitting` flag. `closed(id)` deletes the window and returns whether its persisted id should be forgotten; it returns `false` when quitting or when it was the last window, so the id survives for restore. It does **not** expose the flag, which this plan adds.
- `src/main/windows/early.ts` reads `WINDOW_IDS_KEY` and the per-window state file to place the first window.
- `src/main/lifecycle/index.ts` owns `before-quit`, `will-quit`, `window-all-closed`, `activate`, `second-instance`, `open-url`, and the shutdown timeout. `relaunch()` calls `setAppQuitting()` first.
- `windowAllClosed()` today quits on every platform except macOS: `if (quitRequested || process.platform !== "darwin") app.quit()`.
- `src/main/windows/recovery.ts` shows a native message box on renderer crash/unresponsive with Relaunch / Export Logs / Keep Waiting / Quit, guarded by a `showing` flag.

### 0.5 Native strings and i18n

Two catalogs, two rules:

- **Renderer copy** — `packages/app/src/runtime/i18n/en.ts` is the English source; other locale files are partial (en has ~1420 keys, de ~800) and fall back to English. Adding a key to `en.ts` is enough to ship.
- **Native copy** — `packages/app/src/runtime/i18n/desktop-native.ts` declares `DESKTOP_NATIVE_ENGLISH` and validates bundles strictly in `parseDesktopNativeBundle` (exact key set, string values). The bundle is built in `language.tsx` as `createDesktopNativeBundle(locale, (key) => current[key] ?? DESKTOP_NATIVE_ENGLISH[key])`, so **a locale that lacks a key silently uses the English value** and the bundle stays valid.

Consequence: to add a tray label you add one key to `DESKTOP_NATIVE_ENGLISH` and read it through `nativeT(key)` from `src/main/native/translations.ts`. Translations for the other 64 locales are a follow-up work item, not a blocker, and must follow the translation rules in `packages/desktop/AGENTS.md` (CLDR, platform style guides, at least two corpora for developer terms).

Do not reuse a key for a different meaning (`desktop.recovery.action.quit` is a recovery button, not a tray Quit).

### 0.6 Menus

`src/main/native/menu.ts` builds the macOS application menu from `DESKTOP_MENU` (`packages/app/src/shell/commands/desktop-menu.ts`) and returns immediately on non-Darwin. Windows has an in-app menubar (`packages/app/src/shell/titlebar/windows-menu.tsx`). Menu actions either carry a `role`, an `action` (handled in `src/main/native/menu-actions.ts` or the renderer's `createDesktopMenuAction`), or a `command` id emitted to the focused window as `MenuCommandTriggered`.

### 0.7 Settings UI

- Tabs are typed by `SettingsRootTab` in `packages/app/src/settings/route.ts` (plus the `rootTabs` record used by the parser).
- `packages/app/src/settings/pages.ts` maps each root tab to an icon name (`IconProps["name"]`, e.g. `"monitor"`, `"keyboard"`) and an i18n label key.
- `packages/app/src/settings/shell.tsx` renders one `<Tabs.Content value="<tab>">` per page and builds the nav groups.
- Page bodies use `SettingsRow` (`settings/row.tsx`), `SettingsList` (`settings/list.tsx`), and `@opencode/ui/switch` / `@opencode/ui/select`.
- Search indexing lives in `settings/search-index.ts` / `search-catalog.ts`; a new page without entries is invisible to settings search.

### 0.8 Startup bench

`packages/desktop/script/bench-startup.ts`, run as `bun run bench:startup -- [flags]` from `packages/desktop`. It runs a packaged executable in an isolated home, strips `OPENCODE_*`/`OTEL_*`, and reports main-log milestones, renderer paint timings, DOM readiness, and (on Windows) screen-sampled `screenPainted`/`screenSettled`. Useful flags: `--runs`, `--warmup`, `--service cold|warm`, `--fresh`, `--offline`, `--compare <exe>`, `--profile-main`, `--profile-renderer`, `--trace`, `--out`, `--window-at`.

---

## 1. Rules that will fail review

- No literal user-visible English in production code. Renderer copy → `en.ts` keys; native copy → `DESKTOP_NATIVE_ENGLISH` + `nativeT`.
- Never rewrite existing English copy to make translation easier.
- No test-only parameters or exports in production modules. Use `setSystemTime` from `bun:test` when time matters.
- Tests are table-driven, one contract per file, and must be able to fail. No source-grep or tombstone tests.
- IPC behaviour is tested through the raw message shape the renderer sends, not a mock client.
- Persistence is SQLite through `getStore()`. The only justified file write in this plan is the Linux XDG autostart entry, because the OS dictates the file.
- No `any`, no import aliases, no star imports, no `try`/`catch` for control flow, early returns over `else`.
- `bun typecheck` does not cover tests. After touching a test file, run `bun test <file>` in its package.
- Tests cannot run from the repo root; they fail by design there.
- Conventional commits and PR titles (`feat(desktop): …`). User-facing PRs need the small animated SVG under `### Visual` described in `AGENTS.md`: 240×72, `currentColor` + opacity, CSS or SMIL only, under 8 KB, good still frame.

---

## 2. PR A — native OS integration

### A.0 Shared preference foundation (do this first; A and the tray both need it)

**New file `src/shared/ipc-rpc/desktop.ts`**

```ts
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"

export const DesktopCloseBehavior = Schema.Literals(["quit", "background"])

export const DesktopPreferenceProblem = Schema.Literals([
  "shortcut-invalid",
  "shortcut-conflict",
  "shortcut-unsupported",
  "login-item-unsupported",
  "login-item-failed",
])

export const DesktopPreferences = Schema.Struct({
  launchAtLogin: Schema.Boolean,
  closeBehavior: DesktopCloseBehavior,
  summonShortcut: Schema.NullOr(Schema.String),
  availability: Schema.Struct({
    launchAtLogin: Schema.Boolean,
    summonShortcut: Schema.Boolean,
  }),
})

export const DesktopPreferencesGet = Rpc.make("DesktopPreferencesGet", { success: DesktopPreferences })

export const DesktopPreferencesSet = Rpc.make("DesktopPreferencesSet", {
  payload: Schema.Struct({
    launchAtLogin: Schema.optionalKey(Schema.Boolean),
    closeBehavior: Schema.optionalKey(DesktopCloseBehavior),
    summonShortcut: Schema.optionalKey(Schema.NullOr(Schema.String)),
  }),
  success: Schema.Struct({
    preferences: DesktopPreferences,
    problem: Schema.optionalKey(DesktopPreferenceProblem),
  }),
})

export const DesktopRpcs = RpcGroup.make(DesktopPreferencesGet, DesktopPreferencesSet)
```

Export `DesktopPreferences`/`problem` types for `api-types.ts`. `problem` is a closed enum, never an English sentence: the renderer maps it to an i18n key.

**Merge into `src/shared/ipc-rpc.ts`**: import `DesktopRpcs as DesktopPreferencesRpcs` — no, avoid aliases; name the group export `DesktopSettingsRpcs` in `ipc-rpc/desktop.ts` and merge that. Update the `DesktopRpcs` merge call and the re-exports.

**New event** in `src/shared/ipc-rpc/events.ts`:

```ts
export const DesktopPreferencesChanged = Schema.Struct({ preferences: DesktopPreferences })
```

Add it to the event union so the tray can keep an open Settings page in sync.

**New file `src/main/storage/keys.ts` additions**

```ts
export const LAUNCH_AT_LOGIN_KEY = "launchAtLogin"
export const CLOSE_BEHAVIOR_KEY = "closeBehavior"
export const SUMMON_SHORTCUT_KEY = "summonShortcut"
```

All three live in `SETTINGS_STORE`, encoded as JSON (`"true"`, `"\"background\""`, `"null"`).

**New file `src/main/native/preferences.ts`** — split pure policy from Electron calls so it is testable without a running app:

```ts
export type Preferences = {
  launchAtLogin: boolean
  closeBehavior: "quit" | "background"
  summonShortcut: string | null
}

export const defaults: Preferences = { launchAtLogin: false, closeBehavior: "quit", summonShortcut: null }

export function decodePreferences(read: (key: string) => string | null): Preferences
export function encodePreference<K extends keyof Preferences>(key: K, value: Preferences[K]): string
export function readPreferences(): Preferences            // getStore().get(SETTINGS_STORE, …)
export function writePreference<K extends keyof Preferences>(key: K, value: Preferences[K]): void
export const onChange: (listener: () => void) => () => void
export function closeBehavior(): Preferences["closeBehavior"]   // hot path used by window close
```

Rules:

- `decodePreferences` is total: a corrupt value falls back to the default for that key only, and logs once through `scoped("preferences", Effect.logWarning(...))`.
- `writePreference` notifies listeners synchronously so the tray and shortcut registration react before the write-behind flush.
- No Effect service: this module is read from `windows/early.ts` and from a `close` handler where a synchronous answer is required.

**Handler `src/main/ipc-handlers/desktop.ts`**

```ts
export const desktopHandlers = DesktopSettingsRpcs.toLayer(
  Effect.gen(function* () {
    const lifecycle = yield* ApplicationLifecycle.Service
    return DesktopSettingsRpcs.of({
      DesktopPreferencesGet: () => Effect.sync(readDesktopPreferences),
      DesktopPreferencesSet: ({ launchAtLogin, closeBehavior, summonShortcut }) =>
        Effect.sync(() => applyDesktopPreferences({ launchAtLogin, closeBehavior, summonShortcut })),
    })
  }),
)
```

`applyDesktopPreferences` (new, `src/main/native/desktop-preferences.ts`) is the single writer. It validates the accelerator, applies the login item, re-registers the shortcut, persists only what succeeded, and returns `{ preferences, problem? }`. Order matters: apply side effects first, persist second, so a rejected shortcut is not stored.

Add the layer to `handlers` in `src/main/ipc.ts`.

**Renderer plumbing**: add `desktopPreferences()` and `setDesktopPreferences(patch)` to `ElectronAPI` (`src/renderer/api-types.ts`) and implement in `src/renderer/api.ts` with `invoke("DesktopPreferencesGet")` / `invoke("DesktopPreferencesSet", patch)`. Subscribe with `listen("DesktopPreferencesChanged", …)` behind a new `onDesktopPreferencesChanged(cb)` in `ElectronAPI`.

**Platform type** (`packages/app/src/runtime/platform/platform.tsx`), optional methods so the web build stays valid:

```ts
desktopPreferences?(): Promise<DesktopPreferencesInfo>
setDesktopPreferences?(patch: DesktopPreferencesPatch): Promise<DesktopPreferencesResult>
onDesktopPreferencesChanged?(cb: (preferences: DesktopPreferencesInfo) => void): () => void
```

Implement them in `src/renderer/platform/index.ts` by delegating to `api`.

### A.1 Launch at login

**New file `src/main/native/login-item.ts`**

```ts
export type LoginItem = { supported: boolean; enabled: boolean }
export function readLoginItem(): LoginItem
export function writeLoginItem(enabled: boolean): "ok" | "unsupported" | "failed"
```

Platform behavior, all of it documented in the module header:

- **Unpackaged (`!app.isPackaged`)**: `supported: false`. Never register `electron.exe` in the real login items; this also keeps the dev loop clean.
- **macOS**: `app.getLoginItemSettings()` / `app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: false })`. Signing is required for the login item to survive; an unsigned local build may report success and do nothing, so the Settings row must show the read-back value, not the requested one.
- **Windows**: same API with `{ openAtLogin: enabled, path: process.execPath, args: [] }`. Known caveat: Windows can disable the entry through `Explorer\StartupApproved\Run` while `getLoginItemSettings().openAtLogin` still reports `true`. Treat the API value as advisory and note it in the row description; do not read the registry.
- **Linux**: Electron's `setLoginItemSettings` is macOS/Windows only, so write an XDG autostart entry instead. Pure helper for the file contents:

```ts
export function autostartEntry(input: { exec: string; name: string }): string
// [Desktop Entry]
// Type=Application
// Name=AAi
// Exec="<exec>"
// X-GNOME-Autostart-enabled=true
```

Path: `path.join(process.env.XDG_CONFIG_HOME ?? path.join(app.getPath("home"), ".config"), "autostart", `${autostartFile(appId)}.desktop`)`. `appId` comes from the same channel table as `electron-builder.config.ts` (`ai.opencode.desktop`, `.beta`, `.dev`); put that mapping in `src/main/constants.ts` so builder and runtime cannot drift. `Exec` must be quoted and must not contain `#`.

Reconciliation at startup (`src/main/lifecycle/desktop-initialization.ts` or the existing initialize path): if the stored intent is `true` and the read-back is `false`, re-apply once. Never clear the intent when the OS reports false — the user may have disabled it externally, and clearing hides the drift.

**Tests (`src/main/native/login-item.test.ts`)**

| Contract | Cases |
| --- | --- |
| `autostartEntry` is a valid XDG entry for a path with spaces | plain path; path with spaces; channel suffix in filename |
| Intent reconciliation never destroys user intent | stored true + read false → one write; stored false + read true → no write, reports enabled; unsupported platform → no write, `problem: "login-item-unsupported"` |

### A.2 Global summon shortcut

**New file `src/main/native/summon-shortcut.ts`**

```ts
export type SummonResult = "ok" | "invalid" | "conflict" | "unsupported"
export function applySummonShortcut(accelerator: string | null, run: () => void): SummonResult
export function disposeSummonShortcut(): void
```

Behavior:

- `null` → unregister the current accelerator, return `"ok"`.
- Validate with a pure `parseAccelerator` (below) before touching Electron.
- `globalShortcut.register(accelerator, run)`; on `false` return `"conflict"` (another app owns it). Keep the previously working accelerator registered in that case — a failed change must not silently disable a working shortcut.
- After `app.whenReady()`; on `will-quit` call `disposeSummonShortcut()`.
- Linux/Wayland: registration may fail because the compositor does not expose global shortcuts. Report `"unsupported"` when `globalShortcut.register` returns false on Linux and no conflict is plausible (documented limitation, mirrored in the row description).

**Pure validator** `parseAccelerator(value: string): { ok: true; normalized: string } | { ok: false }`:

| Input | Result |
| --- | --- |
| `CommandOrControl+Shift+Space` | ok |
| `Alt+F2` | ok |
| `F9` | ok (function keys alone are allowed) |
| `Shift` | invalid (modifier only) |
| `Space` | invalid (no modifier) |
| `Command+Command+Space` | invalid (duplicate modifier) |
| `CommandOrControl+Shift+` | invalid (empty key) |
| `Control+Alt+Windows+B` | invalid (`Windows` is not an Electron modifier; `Super` is) |

Normalization lowercases the key token, keeps modifier order canonical (`CommandOrControl`, `Command`, `Control`, `Alt`, `Shift`, `Super`), and rejects unknown modifiers.

**Callback**: new lifecycle method `focusOrRestore()`:

```ts
const focusOrRestore = () => {
  const win = getLastFocusedWindow()
  if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); win.moveTop(); return }
  const restored = restoreWindows()
  restored.at(-1)?.focus()
}
```

Add it to `ApplicationLifecycle.Interface`, implement in `runtime`, and pass it to `applySummonShortcut`. This is the same behavior as `second-instance`, so factor the existing `focusWindow` helper rather than duplicating it.

**Tests (`src/main/native/summon-shortcut.test.ts`)**: the validator table above, plus a registration table driven by a fake `globalShortcut` injected through the module's Electron adapter (see §5 for the adapter pattern).

### A.3 Keep running: close behavior and tray

**Registry**: add `isQuitting()` to `createWindowRegistry` and a case in `src/main/windows/registry.test.ts` (`setQuitting()` flips it; default false).

**Close guard** in `register()` (`src/main/windows/index.ts`), after `win.on("focus", …)`:

```ts
win.on("close", (event) => {
  if (registry.isQuitting() || preferences.closeBehavior() === "quit") return
  event.preventDefault()
  win.hide()
})
```

Hide, not destroy: hidden windows keep their renderer, tabs, drafts, and terminal panes alive, which is the whole point of "keep running". The cost is memory per hidden window; document it in the settings row description and in the tray tooltip. Destroying and later restoring would drop `windowDataFile(id)` state because `registry.closed(id)` clears it for a non-quitting close of the last window.

**Lifecycle** (`windowAllClosed`): today it quits on every platform except macOS.

```ts
const windowAllClosed = () => {
  if (quitRequested) return app.quit()
  if (preferences.closeBehavior() === "quit") return app.quit()
  if (process.platform !== "darwin") return
  // macOS keeps running with no windows, as before.
}
```

Read that as: quit when the user asked for it or when the preference is `quit`; on macOS and under `background` the app stays alive. Keep the early returns so the function reads top-down.

**New file `src/main/native/tray.ts`**

```ts
export type TrayDeps = {
  showLastWindow: () => void
  newWindow: () => void
  openSettings: () => void
  quit: () => void
}
export function createTray(deps: TrayDeps): void
export function destroyTray(): void
export function refreshTray(): void   // rebuilds labels/checked state
export function trayVisible(): boolean
```

- Icon: `nativeImage.createFromPath(trayIconPath())`. Dev → `paths.developmentResourcesRoot/icons`, packaged → `process.resourcesPath/icons`. **This path must be verified in a packaged build**: `resources/**/*` is packed into the asar today while `appearance.ts` reads `process.resourcesPath/icons`, so add the tray assets to `extraResources` in `electron-builder.config.ts` (for example `{ from: "resources/icons", to: "icons", filter: ["tray*"] }`) and keep the runtime resolver tolerant (`nativeImage.isEmpty()` → log and skip the tray rather than throw).
- Assets: `resources/icons/trayTemplate.png` (16×16) and `trayTemplate@2x.png` (32×32), monochrome black with alpha, from the existing app mark; `setTemplateImage(true)` on macOS only. Windows/Linux use the existing `32x32.png` colour icon.
- Menu, built from `nativeT` keys only:

| Item | Behavior |
| --- | --- |
| Show AAi / Hide AAi | dynamic label from the last focused window's visibility; toggles show/hide |
| New Window | `desktop.menu.newWindow`, calls `lifecycle.createWindow` |
| Settings | `desktop.menu.settings`, emits `MenuCommandTriggered` with command `settings.open` (the id `DESKTOP_MENU` already uses) to the last focused window |
| Keep Running After Closing Windows | checkbox bound to `closeBehavior`; writes through `applyDesktopPreferences` |
| Launch at Login | checkbox bound to `launchAtLogin`; disabled when `availability.launchAtLogin` is false |
| Quit | `desktop.tray.quit`, `setAppQuitting()` then `app.quit()` |

- New native keys in `DESKTOP_NATIVE_ENGLISH`: `desktop.tray.tooltip`, `desktop.tray.show`, `desktop.tray.hide`, `desktop.tray.quit`, `desktop.tray.keepRunning`, `desktop.tray.launchAtLogin`. Reuse `desktop.menu.newWindow` and `desktop.menu.settings`; do not add duplicates.
- Creation policy: create when `closeBehavior === "background"`; destroy when it flips back to `quit`. Reconcile on startup from the persisted preference. Clicking the tray icon on Windows/Linux toggles the last window; on macOS it opens the menu.
- `refreshTray()` on: preference change, window show/hide/focus, and native translation change (`src/main/native/translations.ts` already fires listeners; `app.ts` rebuilds the app menu there — do the same for the tray).

**Wiring** in `src/main/desktop.ts` (or wherever the lifecycle layer is composed): after the lifecycle service exists, call `createTray` when needed and register a preferences listener that applies the tray and shortcut. Quit from the tray must set `setAppQuitting()` before `app.quit()`.

**Tests (`src/main/native/tray.test.ts`)**: menu template built from a fake `nativeT` and fake deps — table of `{ closeBehavior, launchAtLogin, lastWindowVisible }` → expected label, checked states, and enabled flags. No Electron window needed: build the template with the pure `trayMenuItems(state)` helper the module exports for tests through its production path (the helper receives state; it is not a test-only branch).

### A.4 Desktop settings page

**`packages/app/src/settings/route.ts`**: add `"desktop"` to `SettingsRootTab` and to `rootTabs`.
**`packages/app/src/settings/pages.ts`**: `desktop: "monitor"` and `desktop: "settings.desktop.title"` (both names exist: `monitor` is declared in `packages/ui/src/icons/new-icons.ts`).
**`packages/app/src/settings/shell.tsx`**: import `SettingsDesktop` and add `<Tabs.Content value="desktop">` next to `appearance`. The sidebar is built from the module-level `rootClientTabs` array, so add `{ value: "desktop", icon: pageIcons.desktop, label: pageLabels.desktop }` there and hide the tab in the browser build by deriving the list from `platform.platform === "desktop"` inside the `groups()` memo rather than editing the const in place.
**New `packages/app/src/settings/desktop/desktop.tsx`**, following `settings/notifications/notifications.tsx` for structure and `settings/general/controllers.ts` for controller shape:

| Row | Control | Notes |
| --- | --- | --- |
| Launch at login | `Switch` | disabled + explanation when `availability.launchAtLogin` is false; shows the read-back value |
| Keep running after closing windows | `Switch` | description names the tray icon and the memory tradeoff |
| Summon shortcut | recorder button + clear | records `keydown` on a focused button, formats per OS, validates before saving; shows `shortcut-conflict` / `shortcut-invalid` / `shortcut-unsupported` inline |

i18n keys to add to `en.ts` (English copy is the designer's call; these are the required key names):

```
settings.desktop.title
settings.desktop.description
settings.desktop.launchAtLogin.title
settings.desktop.launchAtLogin.description
settings.desktop.launchAtLogin.unavailable
settings.desktop.keepRunning.title
settings.desktop.keepRunning.description
settings.desktop.summon.title
settings.desktop.summon.description
settings.desktop.summon.record
settings.desktop.summon.clear
settings.desktop.summon.problem.invalid
settings.desktop.summon.problem.conflict
settings.desktop.summon.problem.unsupported
settings.desktop.summon.unavailable
```

Add the same keys to the settings search catalog so the page is discoverable.

Recorder details: capture on `keydown`, ignore modifier-only presses, ignore keys while `event.isComposing`, produce `CommandOrControl+Shift+Space`-style values, show the platform label (`⌘⇧Space` on macOS) with `formatShortcut`-style helpers already used by keybinds if they fit; otherwise a small local formatter. Do not store an invalid accelerator — the main process rejects it anyway, and the UI must not pretend otherwise.

### A.5 Acceptance for PR A

- Fresh install, keep-running off: behavior identical to today (close quits on Windows/Linux, stays on macOS). No tray.
- Keep-running on: closing the last window hides it; tray appears; tray Show restores; Quit exits; relaunch restores the same windows.
- Launch at login: packaged Windows and macOS register and survive a reboot; Linux writes `~/.config/autostart/<appId>.desktop` and removes it when turned off; unpackaged builds report unavailable.
- Shortcut: registers, survives relaunch, reports conflict when a second app owns the combo, and does nothing when invalid.
- Settings page reflects tray changes live (event, not polling).
- `bun run check` passes; new tests pass; manual matrix in §6 recorded in the PR body.

---

## 3. PR C — reliability

Goal: a failed or slow sidecar start produces a recoverable UI state instead of a dead window, and a transient network blip reconnects without a restart.

### C.1 Classify and retry sidecar startup

Today `BackgroundServiceState.make` runs `initial` once, stores the `Exit`, and `connection` dies with it. `connect()` already retries one specific case (`shouldRetryEnsure`: version mismatch) and otherwise fails hard.

**New file `src/main/service/connect-retry.ts`** with pure policy:

```ts
export type ConnectFailure =
  | "cli-missing"        // ENOENT resolving the bundled CLI
  | "spawn-failed"       // EACCES, EPERM, exec format
  | "port-conflict"      // EADDRINUSE
  | "auth-mismatch"      // service started without basic auth
  | "version-mismatch"   // handled by shouldRetryEnsure
  | "timeout"
  | "unknown"

export function classifyConnectFailure(error: unknown): ConnectFailure
export function retryableConnectFailure(failure: ConnectFailure): boolean
export const connectRetrySchedule: Schedule.Schedule<unknown>  // 250ms, 1s, 3s then stop
```

Rules: retry `timeout`, `port-conflict`, `spawn-failed` (a second attempt often wins after AV scans), and `unknown` once; never retry `cli-missing` or `auth-mismatch`, which need a different fix. Apply in `background-service.ts`:

```ts
const runEnsure = () =>
  ensure().catch((error) => {
    if (!shouldRetryEnsure(version, message(error))) throw error
    return ensure(cli.version)
  })
```

becomes a single `Effect.tryPromise(runEnsure)` wrapped in `Effect.retry` with the schedule above and a `catchIf` on `retryableConnectFailure(classifyConnectFailure(error))`.

Surface the classification: extend `BackgroundServiceState` to keep the last failure, and make `AppAwaitInitialization` fail with a typed reason rather than `orDie`. The renderer's `initializationData` currently throws `markLocalServerStartup(error)`; add the reason to that error so the shell error screen can pick a specific message and offer Retry, which calls `AppReconnectService`.

### C.2 Single-flight reconnect

`reconnect: connect("reconnect").pipe(Effect.orDie)` means two windows retrying at once spawn two connects, and a hung connect hangs every caller.

- Add a `Ref<Option<Effect<...>>>` (or `Deferred` gate) in `background-service-state.ts`: the first caller starts the connect, later callers join it.
- Wrap with `Effect.timeoutOrElse({ duration: "30 seconds", orElse: ... })` and treat a timeout as `connect failure `timeout``.
- Keep `lastGoodEndpoint`; if a reconnect fails, leave `current` at the previous success while it is still healthy, and only replace it on success.

Tests in `src/main/service/background-service-state.test.ts`: two concurrent `reconnect` calls run one connect (counter in the fake), a failure keeps the previous success, a timeout returns the typed failure.

### C.3 Health-driven reconnect

`packages/app/src/runtime/server/health.ts` already polls every 10 s (`pollMs`), retries with `retryCount`/`retryDelayMs`, and exposes `retry()`. `client.tsx` wires `server.reconnect` for sidecar transports.

- In `client.tsx`, when a **sidecar** server reports unhealthy for 2 consecutive polls, call its `reconnect` once, then re-probe immediately.
- Backoff: 5 s, 15 s, 45 s, capped at 60 s, maximum 5 attempts per 10 minutes, reset on success. Keep the policy in a pure function `nextReconnectDelay(attempt)` with a unit test.
- Never auto-reconnect contributed (`plugin`) servers; they own their lifecycle. Never auto-reconnect when the health result is `unauthorized` (repeated auth attempts lock accounts).
- The existing manual Retry action stays the escape hatch; a failed automatic attempt must be visible in the connection status, not silent.

### C.4 Crash-loop guard

`windows/recovery.ts` shows the same dialog on every crash, so a renderer that crashes on boot produces an endless loop of dialogs.

**New pure module `src/main/windows/crash-loop.ts`**:

```ts
export function nextCrashState(previous: number[], now: number): { crashes: number[]; loop: boolean }
// keep crashes within 60s, loop at >= 3
```

Persist the timestamps per window id in `SETTINGS_STORE` (`crashTimestamps:<id>` JSON array) so a relaunch loop is broken too, and reset on a clean `did-finish-load` that survived 30 s.

Dialog variant when `loop`: message `desktop.recovery.crashLoop`, detail with the last error, buttons Export Logs and Relaunch only (no Keep Waiting). New native keys: `desktop.recovery.crashLoop`, `desktop.recovery.crashLoop.detail`.

Tests (`windows/crash-loop.test.ts`): window expiry, threshold at exactly 3, reset after a clean load, and a persisted-array parse table (valid, corrupt, wrong types).

### C.5 Updater error visibility (audit only)

`packages/gui-plugins/src/updater/machine.ts` already transitions to `{ status: "error", message }` and rolls a failed install back to `ready`. Verify the UI (`actions.tsx`, `section.tsx`, `renderer.tsx`) offers a retry from `error` and that the message is not a raw stack. Add the retry affordance if it is missing; do not restructure the machine.

### C.6 Acceptance for PR C

- Kill the sidecar while the app is idle → health detects it, one reconnect, UI returns without a restart, and the log shows one connect (not two).
- Make the bundled CLI unlaunchable (rename for a packaged build) → the window shows a typed failure with Retry, no endless spinner, and `cli-missing` in the log.
- Force a renderer crash three times within a minute → crash-loop dialog, no infinite reload, Export Logs works.
- Deny network during startup → typed `timeout` failure, retry succeeds when network returns.
- Offline launch after a previous success: the app starts, reports the sidecar unavailable, and reconnects automatically when it appears.

---

## 4. PR B — performance, measured

No change in this PR ships without before/after numbers from `bun run bench:startup` on the same machine, same build type, `--runs 7 --warmup 2`.

### B.1 Baseline protocol

```bash
cd packages/desktop
bun run package:win                  # or package:mac / package:linux
bun run bench:startup -- --runs 7 --warmup 2 --service cold --out dist/bench-startup/baseline
```

Store the JSON and the summary table in the PR body. Record: machine, OS build, disk, Electron version, commit, flag line.

For each candidate change, rebuild and run the same command with `--compare <baseline exe>` so drift affects both, plus one `--profile-main` and one `--profile-renderer` run for attribution. `--trace` only when the profile does not explain a gap.

### B.2 Milestones to read

| Milestone | Source | What it means |
| --- | --- | --- |
| `entry` | `marks.entry` | Electron handed control to our entry |
| `ready` | `marks.ready` | `app.whenReady()` fired |
| `window` | `marks.window` | early window created and shown |
| `served` | `marks.served` | renderer asset burst answered |
| `bundle` | `marks.bundle` | main bundle evaluated |
| `storage`/`logging`/`init`/`layers` | layers | main-process work after the bundle |
| `firstPaint`/`screenPainted` | renderer / screen | something is on screen |
| `screenSettled` | screen | the interface stopped changing — the number users feel |

### B.3 Candidate work, in expected-payoff order

Each item is its own commit with its own before/after row.

1. **Defer non-critical layers past first paint.** Inspect what `src/main/desktop.ts` evaluates: plugin manager, updater support, skills, MCP host. Move anything not needed for the first window behind `marks.layers` measurement — dynamic `import()` inside the layer that needs it, or a fork after `app.whenReady()` resolves the first window. Hypothesis: `layers` drops; `screenSettled` unchanged or better. Verify with `--profile-main`.
2. **Preload snapshot payload.** `src/preload/index.ts` awaits `WindowSnapshotChannel` before the page runs, for both storage and plugins. Measure the serialized size per window; if `plugins` dominates, split it into a lazy second invoke that the shell requests after first paint. Hypothesis: `firstPaint` improves; nothing else regresses.
3. **Asset burst cap.** `rendererAssetsServed({ quietMs: 40, capMs: 400 })` blocks the main bundle. Add a log when the cap is hit (one line, `served cap reached`), run the bench, and if it is common, preload the entry chunk or reduce the work the protocol handler does per request. Do not raise the cap blindly.
4. **Renderer module graph.** Using `--profile-renderer`, find what `desktop-app.tsx` pulls synchronously (`AppBaseProviders`, theme, UI kit). Move heavy leaf components behind the existing `lazy()` pattern. Hypothesis: `firstPaint` improves.
5. **asar payload.** Extend the `files` exclusions in `electron-builder.config.ts` (docs, tests, examples, `.map`, locale data Electron does not use) and re-measure `entry`. Keep the existing rule that nothing executes declarations or source maps.
6. **Storage and migrations.** `marks.storage`/`marks.init`: confirm migrations do not run on every launch and that `PRAGMA journal_mode` is set once. If the profile shows synchronous reads in the preload path, batch them.
7. **Service handoff.** If `screenSettled` is gated by the first data response rather than layout, warm the session list earlier via `sidecarProbe` adoption (packaged only) instead of spawning earlier.

### B.4 Acceptance

- Median `screenSettled` improves by at least 10% across 7 runs with no `screenPainted` regression, **or** the item is reverted with the numbers recorded.
- `entry`/`ready` never regress by more than noise (±5%).
- `--offline` and `--fresh` runs behave the same as before (no new first-run blocking work).
- No new synchronous filesystem reads on the startup path (`windows/early.ts` stays dependency-light; no Effect service added to it).

---

## 5. Test plan

Add these files; keep one contract per file and import production modules only.

| File | Contract | Cases |
| --- | --- | --- |
| `src/main/native/preferences.test.ts` | decode/encode round-trip and corrupt-value fallback | each key valid; corrupt JSON; wrong type; unknown value for closeBehavior; defaults complete |
| `src/main/native/login-item.test.ts` | autostart entry text and reconciliation | see §A.1 table |
| `src/main/native/summon-shortcut.test.ts` | accelerator validation and registration outcomes | see §A.2 table, plus register-false → conflict, previous accelerator preserved |
| `src/main/native/tray.test.ts` | tray menu state → items | `closeBehavior` × `launchAtLogin` × visible → shown/hidden label, checked flags, quit present |
| `src/main/native/desktop-preferences.test.ts` | apply order and persistence | invalid shortcut persists nothing; conflict keeps previous; login item failure reports `login-item-failed` and stores the intent |
| `src/main/windows/registry.test.ts` (extend) | `isQuitting()` | default false; after `setQuitting()` true |
| `src/main/windows/crash-loop.test.ts` | crash tracking | see §C.4 |
| `src/main/service/connect-retry.test.ts` | failure classification and schedule | ENOENT→cli-missing; EACCES→spawn-failed; EADDRINUSE→port-conflict; message with "did not provide authentication"→auth-mismatch; retryable set matches §C.1 |
| `src/main/service/background-service-state.test.ts` (extend) | single-flight, timeout, last-good | two callers one connect; failure keeps previous; timeout typed |
| `packages/app/src/settings/route.test.ts` (extend) | new root tab parses and round-trips its URL | `desktop` accepted; unknown tab still rejected |
| `packages/app/src/settings/desktop/desktop.test.ts` | controller mapping | problem enum → i18n key; unavailable capabilities disable controls |

IPC tests: add a case to `src/main/ipc-transport.test.ts` style coverage for `DesktopPreferencesSet` using the raw message the renderer sends; assert an invalid close behavior is rejected by the schema, not by a handler branch.

Electron adapter pattern for `login-item.ts`, `summon-shortcut.ts`, and `tray.ts`: keep Electron calls behind a small injected object with a default that reads `electron` (for example `{ app, image, shortcut }` passed into a factory). Production constructs it once; tests pass fakes. This is a production seam, not a test-only parameter.

Run after touching each file:

```bash
cd packages/desktop && bun test src/main/native/tray.test.ts
cd packages/app && bun test src/settings/desktop/desktop.test.ts
```

---

## 6. Manual verification matrix

| Scenario | Windows | macOS | Linux X11 | Linux Wayland |
| --- | --- | --- | --- | --- |
| Launch at login registers and persists | login item in Task Manager → Startup | Login Items in System Settings | `~/.config/autostart/*.desktop` | same |
| Launch at login on unpackaged build | unavailable, no registry write | unavailable | unavailable | unavailable |
| Keep running: close last window | hides, tray remains | hides, tray remains | hides, tray remains | hides, tray remains |
| Keep running off: close last window | quits | app stays (dock) | quits | quits |
| Tray Show/Hide | toggle works, label flips | menu item works | works (AppIndicator present) | may require an indicator extension — document |
| Tray Quit | exits without a shutdown timeout | exits | exits | exits |
| Summon shortcut | focuses from another app | focuses, respects Spaces | works | may report unsupported |
| Shortcut conflict | second app wins → conflict message | same | same | same |
| Settings page | reflects tray toggles live | same | same | same |

Record the OS/version and tick results in the PR body. Do not claim a platform you did not run.

---

## 7. Verification commands

```bash
# from a package directory, never the repo root
cd packages/desktop && bun run typecheck && bun test src/main/native/tray.test.ts
cd packages/app && bun run typecheck && bun test src/settings/desktop/desktop.test.ts
cd packages/gui-plugins && bun run typecheck     # only if C.5 touched it

# canonical, from the repo root
bun run check
git diff --check
```

Bench (PR B only):

```bash
cd packages/desktop
bun run bench:startup -- --runs 7 --warmup 2 --service cold --out dist/bench-startup/base
bun run bench:startup -- --runs 7 --warmup 2 --service cold --compare <baseline exe> --out dist/bench-startup/cmp
bun run bench:startup -- --runs 1 --service cold --profile-main --profile-renderer --out dist/bench-startup/profile
```

Notes:

- `bun test` from the repo root fails by design; always run inside the package.
- `bun typecheck` does not include test files; a green typecheck does not prove the tests compile.
- The bench needs a packaged build and a quiet machine. A single run is not a measurement.

---

## 8. Risk register

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Signing requirement for macOS login item | Setting appears to succeed but does nothing | Show read-back, row description states the requirement, test on a signed build before release |
| Windows StartupApproved can disable the entry | Reports enabled while disabled | Description notes it; no registry reads |
| Wayland lacks global shortcuts | Summon shortcut fails | Return `shortcut-unsupported`, disable the row on that session, document |
| Tray icons packaged by asar vs `process.resourcesPath` | Empty tray icon | `extraResources` entry plus `isEmpty()` guard and a packaged-build check |
| Hidden windows keep memory | Higher idle RAM with keep-running | Row description, tray tooltip, keep off by default |
| Shortcut conflicts with other apps | Silent no-op | `register` returns false → `shortcut-conflict`, previous shortcut preserved |
| Retry loops in reconnect | Battery/CPU burn, log spam | Capped attempts, exponential backoff, reset on success, never retry unauthorized |
| Crash timestamps in SQLite | Stale entries after a window id is reused | Key per window id, parse table, expire after 60 s |
| Bench noise on a busy machine | False regressions | `--compare`, ≥7 runs, medians, revert on doubt |

---

## 9. Out of scope

- New windows or panels, command-palette work, changes to browser/terminal/IDE plugins.
- Server, protocol, SDK, or provider changes.
- Defaults that change today's behavior: keep-running is off, launch at login is off, the shortcut is unset.
- Telemetry for any new preference.
- Translating the new native keys into the other 64 locales; that is a separate i18n pass, and the English fallback keeps the UI coherent until it lands.
