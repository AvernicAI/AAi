import { Context } from "effect"

const opencodeOrigin = /^https:\/\/([a-z0-9-]+\.)*opencode\.ai$/

export type CorsOptions = { readonly cors?: ReadonlyArray<string> }

export const CorsConfig = Context.Reference<CorsOptions | undefined>("@opencode/ServerCorsConfig", {
  defaultValue: () => undefined,
})

export function isAllowedCorsOrigin(input: string | undefined, opts?: CorsOptions) {
  if (!input) return true
  const url = parseOrigin(input)
  return !!url && allowedOrigin(url, input, opts)
}

export function isAllowedRequestOrigin(input: string | undefined, host: string | undefined, opts?: CorsOptions) {
  if (!input) return true
  const url = parseOrigin(input)
  if (!url) return false
  if (host && (url.protocol === "http:" || url.protocol === "https:") && url.host === host) return true
  return allowedOrigin(url, input, opts)
}

function parseOrigin(input: string) {
  const url = URL.parse(input)
  if (!url || url.username || url.password || url.search || url.hash || (url.pathname && url.pathname !== "/")) return
  return url
}

function allowedOrigin(url: URL, input: string, opts?: CorsOptions) {
  if (url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")) return true
  if (url.protocol === "oc:" && url.host === "renderer") return true
  if (input === "tauri://localhost" || input === "http://tauri.localhost" || input === "https://tauri.localhost")
    return true
  if (opencodeOrigin.test(input)) return true
  return opts?.cors?.includes(input) ?? false
}
