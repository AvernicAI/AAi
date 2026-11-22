export const home = "https://antigravity.google.com/"

export const partition = "persist:aai-antigravity"

export function webDestination(input: string) {
  if (input === "about:blank") return true
  const url = URL.parse(input)

  return !!url && url.protocol === "https:" && !url.username && !url.password
}

export function accountDestination(input: string) {
  const url = URL.parse(input)

  if (!url || !webDestination(input)) return false

  return ["antigravity.google.com", "antigravity.google", "accounts.google.com"].includes(url.hostname)
}
