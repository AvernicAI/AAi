export const home = "https://www.meta.ai/"

export const partition = "persist:aai-meta-ai"

export function webDestination(input: string) {
  if (input === "about:blank") return true
  const url = URL.parse(input)

  return !!url && url.protocol === "https:" && !url.username && !url.password
}

export function metaDestination(input: string) {
  const url = URL.parse(input)

  if (!url || !webDestination(input)) return false

  return ["meta.ai", "meta.com", "facebook.com", "instagram.com"].some(
    (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
  )
}
