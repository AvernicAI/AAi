import type { Antigravity } from "@opencode/schema/antigravity"

export type State =
  | { status: "idle" }
  | { status: "working"; attempt: string }
  | { status: "ready"; catalog: Antigravity.Catalog }
  | { status: "failed"; message: string }
  | { status: "disposed" }

export type Event =
  | { type: "start"; attempt: string }
  | { type: "done"; attempt: string; catalog: Antigravity.Catalog }
  | { type: "failed"; attempt: string; message: string }
  | { type: "reset" }
  | { type: "dispose" }

export function transition(state: State, event: Event): State {
  if (event.type === "dispose") return { status: "disposed" }

  if (state.status === "disposed") return state

  if (event.type === "reset") return { status: "idle" }

  if (event.type === "start") return state.status === "working" ? state : { status: "working", attempt: event.attempt }

  if (state.status !== "working" || state.attempt !== event.attempt) return state

  if (event.type === "failed") return { status: "failed", message: event.message }

  return { status: "ready", catalog: event.catalog }
}
