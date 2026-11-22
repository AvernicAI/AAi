import type { Fireworks } from "@opencode/schema/fireworks"

export type State =
  | { status: "idle" }
  | { status: "review"; session: string; training: Fireworks.Training }
  | { status: "working"; attempt: string }
  | { status: "ready"; result: string }
  | { status: "failed"; message: string }
  | { status: "disposed" }

export type Event =
  | { type: "review"; session: string; training: Fireworks.Training }
  | { type: "start"; attempt: string }
  | { type: "done"; attempt: string; result: string }
  | { type: "failed"; attempt: string; message: string }
  | { type: "reset" }
  | { type: "dispose" }

export function transition(state: State, event: Event): State {
  if (event.type === "dispose") return { status: "disposed" }

  if (state.status === "disposed") return state

  if (event.type === "reset") return { status: "idle" }

  if (event.type === "review")
    return state.status === "working" ? state : { status: "review", session: event.session, training: event.training }

  if (event.type === "start") return state.status === "working" ? state : { status: "working", attempt: event.attempt }

  if (state.status !== "working" || state.attempt !== event.attempt) return state

  if (event.type === "failed") return { status: "failed", message: event.message }

  return { status: "ready", result: event.result }
}
