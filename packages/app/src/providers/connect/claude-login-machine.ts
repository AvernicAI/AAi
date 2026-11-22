export type State = { status: "idle" | "disposed" } | { status: "opening" | "launched" | "failed"; attempt: string }

export type Event = { type: "dispose" } | { type: "open" | "launched" | "failed"; attempt: string }

export function transition(state: State, event: Event): State {
  if (event.type === "dispose") return { status: "disposed" }

  if (state.status === "disposed") return state

  if (event.type === "open") return state.status === "opening" ? state : { status: "opening", attempt: event.attempt }

  if (state.status !== "opening" || state.attempt !== event.attempt) return state

  return { status: event.type, attempt: event.attempt }
}
