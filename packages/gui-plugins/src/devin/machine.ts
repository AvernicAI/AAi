import type { Action, Section } from "./contract"

type Page = { binding: string; embed: string }

export type State =
  | { status: "idle" }
  | { status: "opening"; attempt: string }
  | { status: "ready"; attempt: string; page: Page }
  | { status: "confirming"; attempt: string; page: Page }
  | { status: "working"; attempt: string; page: Page; action: Action | "clear" }
  | { status: "failed"; attempt: string; page?: Page }
  | { status: "disposed" }

export type Event =
  | { type: "open"; attempt: string }
  | { type: "opened"; attempt: string; page: Page; section: Section }
  | { type: "run"; attempt: string; action: Action | "clear" }
  | { type: "confirm" }
  | { type: "cancel" }
  | { type: "done"; attempt: string }
  | { type: "failed"; attempt: string }
  | { type: "dispose" }

export function transition(state: State, event: Event): State {
  if (event.type === "dispose") return { status: "disposed" }

  if (state.status === "disposed") return state

  if (event.type === "open") return { status: "opening", attempt: event.attempt }

  if (state.status === "idle") return state

  if (event.type === "confirm") {
    if ((state.status !== "ready" && state.status !== "failed") || !state.page) return state

    return { status: "confirming", attempt: state.attempt, page: state.page }
  }

  if (event.type === "cancel") return state.status === "confirming" ? { ...state, status: "ready" } : state

  if (event.type === "opened") {
    if (state.status !== "opening" || state.attempt !== event.attempt) return state

    return { status: "working", attempt: event.attempt, page: event.page, action: event.section }
  }

  if (event.type === "run") {
    if ((state.status !== "ready" && state.status !== "failed" && state.status !== "confirming") || !state.page)
      return state

    return { status: "working", attempt: event.attempt, page: state.page, action: event.action }
  }

  if (state.attempt !== event.attempt) return state

  if (event.type === "failed")
    return { status: "failed", attempt: state.attempt, page: "page" in state ? state.page : undefined }

  if (event.type === "done" && state.status === "working")
    return { status: "ready", attempt: state.attempt, page: state.page }

  return state
}

export function view(state: State) {
  return {
    busy: state.status === "opening" || state.status === "working",
    failed: state.status === "failed",
    confirming: state.status === "confirming",
    page: "page" in state ? state.page : undefined,
  }
}
