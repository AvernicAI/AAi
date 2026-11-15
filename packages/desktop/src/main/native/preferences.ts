import { CLOSE_BEHAVIOR_KEY, LAUNCH_AT_LOGIN_KEY, SUMMON_SHORTCUT_KEY } from "../storage/keys"
import { getStore } from "../storage/store"
import { decodeDesktopPreferences } from "./preference-values"

export type StoredDesktopPreferences = ReturnType<typeof decodeDesktopPreferences>

const listeners = new Set<() => void>()

export function readDesktopPreferences(): StoredDesktopPreferences {
  const store = getStore()

  return decodeDesktopPreferences((key) => store.get(key))
}

export function writeDesktopPreferences(next: StoredDesktopPreferences) {
  const store = getStore()
  store.set(LAUNCH_AT_LOGIN_KEY, next.launchAtLogin)
  store.set(CLOSE_BEHAVIOR_KEY, next.closeBehavior)

  if (next.summonShortcut === null) store.delete(SUMMON_SHORTCUT_KEY)
  else store.set(SUMMON_SHORTCUT_KEY, next.summonShortcut)

  listeners.forEach((listener) => listener())
}

/** Runs after main writes a preference, including a write made from the tray menu. */
export function onDesktopPreferencesChanged(listener: () => void) {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}
