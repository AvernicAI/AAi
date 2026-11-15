import { globalShortcut } from "electron"
import { parseAccelerator } from "./accelerator"

export type SummonRegistration =
  | { readonly ok: true; readonly accelerator: string | null }
  | { readonly ok: false; readonly problem: "shortcut-invalid" | "shortcut-conflict" | "shortcut-failed" }

let active: string | undefined

/**
 * Replaces the global shortcut. A failed change restores the previous registration, because the
 * user keeps a working summon key while the settings page reports the new one as unusable.
 */
export function registerSummonShortcut(accelerator: string | null, run: () => void): SummonRegistration {
  const previous = active
  release()

  if (accelerator === null) return { ok: true, accelerator: null }

  const parsed = parseAccelerator(accelerator)

  if (!parsed) return fail(previous, run, "shortcut-invalid")

  try {
    if (!globalShortcut.register(parsed, run)) return fail(previous, run, "shortcut-conflict")
  } catch {
    return fail(previous, run, "shortcut-failed")
  }

  active = parsed

  return { ok: true, accelerator: parsed }
}

export function unregisterSummonShortcut() {
  release()
}

function release() {
  if (active) globalShortcut.unregister(active)
  active = undefined
}

function fail(
  previous: string | undefined,
  run: () => void,
  problem: "shortcut-invalid" | "shortcut-conflict" | "shortcut-failed",
): SummonRegistration {
  if (previous) {
    active = previous
    globalShortcut.register(previous, run)
  }

  return { ok: false, problem }
}
