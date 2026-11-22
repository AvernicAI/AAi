export const home = "https://gemini.google.com/app"

export const partition = "persist:aai-gemini"

export function webDestination(input: string) {
  if (input === "about:blank") return true
  const url = URL.parse(input)

  return !!url && url.protocol === "https:" && !url.username && !url.password
}

export function geminiDestination(input: string) {
  const url = URL.parse(input)

  if (!url || !webDestination(input)) return false

  return [
    "gemini.google.com",
    "accounts.google.com",
    "accounts.youtube.com",
    "consent.google.com",
    "myaccount.google.com",
    "myactivity.google.com",
    "one.google.com",
    "support.google.com",
    "www.google.com",
  ].includes(url.hostname)
}
