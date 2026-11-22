export const home = "https://orlon.org/"

export const partition = "persist:aai-orlon"

export function webDestination(input: string) {
  if (input === "about:blank") return true
  const url = URL.parse(input)

  return !!url && url.protocol === "https:" && !url.username && !url.password
}

export function orlonDestination(input: string) {
  const url = URL.parse(input)

  return webDestination(input) && url?.origin === "https://orlon.org"
}
