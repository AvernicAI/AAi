import { Effect } from "effect"
import { DesktopSettingsRpcs } from "../../shared/ipc-rpc/desktop"
import { applyDesktopPreferences, readDesktopPreferencesInfo } from "../native/desktop-preferences"

export const desktopHandlers = DesktopSettingsRpcs.toLayer(
  Effect.sync(() =>
    DesktopSettingsRpcs.of({
      DesktopPreferencesGet: () => Effect.sync(readDesktopPreferencesInfo),
      DesktopPreferencesSet: (patch) => Effect.sync(() => applyDesktopPreferences(patch)),
    }),
  ),
)
