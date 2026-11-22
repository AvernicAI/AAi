export const home = "https://app.devin.ai/"

export const partition = "persist:aai-devin"

export function webDestination(input: string) {
  if (input === "about:blank") return true
  const url = URL.parse(input)

  return !!url && url.protocol === "https:" && !url.username && !url.password
}

export function accountDestination(input: string) {
  const url = URL.parse(input)

  if (!url || !webDestination(input)) return false

  return ["app.devin.ai", "accounts.google.com", "github.com"].includes(url.hostname)
}
