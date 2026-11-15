import { expect, test } from "bun:test"
import type { UpdaterState } from "@opencode/plugin/gui/updater"
import { updaterAction } from "./action"

type Label = ReturnType<typeof updaterAction>["label"]

type Run = "check" | "install"

const cases: [UpdaterState | undefined, Label, Run | undefined][] = [
  [undefined, "action.checkNow", undefined],
  [{ status: "error", message: "offline" }, "action.retry", "check"],
  [{ status: "ready", version: "1.2.3" }, "action.installRestart", "install"],
  [{ status: "up-to-date" }, "action.checkNow", "check"],
]

test.each(cases)("offers one action for each updater state", (state, label, run) => {
  const action = updaterAction(state)

  expect(action.label).toBe(label)
  expect("run" in action ? action.run : undefined).toBe(run)
})
