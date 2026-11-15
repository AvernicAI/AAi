import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"

export const desktopCloseBehaviors = ["quit", "background"] as const

export const desktopPreferenceProblems = [
  "shortcut-invalid",
  "shortcut-conflict",
  "shortcut-failed",
  "login-item-failed",
] as const

export const DesktopPreferencesSchema = Schema.Struct({
  /** Whether the app should start when the user signs in, as the user asked. */
  launchAtLogin: Schema.Boolean,
  /** False in an unpackaged build, which the OS cannot register as a login item. */
  launchAtLoginSupported: Schema.Boolean,
  closeBehavior: Schema.Literals(desktopCloseBehaviors),
  /** The canonical accelerator to register globally, or null when the user cleared it. */
  summonShortcut: Schema.NullOr(Schema.String),
  summonShortcutSupported: Schema.Boolean,
})

export const DesktopPreferencePatchFields = {
  launchAtLogin: Schema.optionalKey(Schema.Boolean),
  closeBehavior: Schema.optionalKey(Schema.Literals(desktopCloseBehaviors)),
  summonShortcut: Schema.optionalKey(Schema.NullOr(Schema.String)),
} as const

export const DesktopPreferencePatchSchema = Schema.Struct(DesktopPreferencePatchFields)

export const DesktopPreferenceProblemSchema = Schema.Literals(desktopPreferenceProblems)

export const DesktopPreferencesResultSchema = Schema.Struct({
  preferences: DesktopPreferencesSchema,
  /** Set when part of the patch could not be applied; `preferences` holds what did apply. */
  problem: Schema.optionalKey(DesktopPreferenceProblemSchema),
})

export type DesktopCloseBehavior = Schema.Schema.Type<typeof DesktopPreferencesSchema>["closeBehavior"]

export type DesktopPreferences = Schema.Schema.Type<typeof DesktopPreferencesSchema>

export type DesktopPreferencePatch = Schema.Schema.Type<typeof DesktopPreferencePatchSchema>

export type DesktopPreferenceProblem = Schema.Schema.Type<typeof DesktopPreferenceProblemSchema>

export type DesktopPreferencesResult = Schema.Schema.Type<typeof DesktopPreferencesResultSchema>

export const DesktopPreferencesGet = Rpc.make("DesktopPreferencesGet", { success: DesktopPreferencesSchema })

export const DesktopPreferencesSet = Rpc.make("DesktopPreferencesSet", {
  payload: DesktopPreferencePatchFields,
  success: DesktopPreferencesResultSchema,
})

export const DesktopSettingsRpcs = RpcGroup.make(DesktopPreferencesGet, DesktopPreferencesSet)
