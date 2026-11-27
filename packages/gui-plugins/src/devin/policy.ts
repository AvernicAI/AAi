import type { Action, Section } from "./contract"

export const home = "https://app.devin.ai/"

export const bots = "https://app.devin.ai/bots"

export const signIn = "https://app.devin.ai/auth/login"

export const templates = "https://devin.ai/bots/templates"

export const partition = "persist:aai-devin"

export const sections: Record<Section, string> = {
  chat: home,
  bots,
  automations: "https://app.devin.ai/automations",
  security: "https://app.devin.ai/security",
  wiki: "https://app.devin.ai/wiki",
}

export type SectionReturn = "idle" | "waiting" | "restored"

export function sectionReturn(state: SectionReturn, input: string): SectionReturn {
  if (state === "restored" || !accountDestination(input)) return state

  const url = new URL(input)
  const auth = /^\/(?:api\/auth|auth|login|oauth|sso)(?:\/|$)/.test(url.pathname)

  if (url.origin !== new URL(home).origin || auth) return "waiting"

  if (url.searchParams.has("code") || url.searchParams.has("state") || url.searchParams.has("error")) return state

  return state === "waiting" ? "restored" : state
}

export function isSection(section: Section, input: string) {
  const url = URL.parse(input)
  const target = new URL(sections[section])

  return (
    url?.origin === target.origin &&
    (url.pathname === target.pathname || url.pathname.startsWith(`${target.pathname}/`))
  )
}

export function isAccountCallback(input: string) {
  if (!accountDestination(input)) return false

  const url = new URL(input)

  return (
    url.origin === new URL(home).origin &&
    !url.searchParams.has("error") &&
    (/^\/(?:api\/)?(?:auth|oauth)\/callback(?:\/|$)/.test(url.pathname) ||
      (url.searchParams.has("code") && url.searchParams.has("state")))
  )
}

export function navigationTarget(action: Action, section: Section, current: string) {
  if (action === "reload") return accountDestination(current) ? current : sections[section]

  if (action === "signIn") return signIn

  return sections[action]
}

export function webDestination(input: string) {
  if (input === "about:blank") return true
  const url = URL.parse(input)

  return !!url && url.protocol === "https:" && !url.username && !url.password
}

export function accountDestination(input: string) {
  const url = URL.parse(input)

  if (!url || !webDestination(input)) return false

  return ["https://app.devin.ai", "https://accounts.google.com", "https://github.com"].includes(url.origin)
}
