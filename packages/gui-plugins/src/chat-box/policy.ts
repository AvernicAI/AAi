export const home = "https://chat-box.ai/app"

export const partition = "persist:aai-chat-box"

export function webDestination(input: string) {
  if (input === "about:blank") return true
  const url = URL.parse(input)

  return !!url && url.protocol === "https:" && !url.username && !url.password
}

export function accountDestination(input: string) {
  const url = URL.parse(input)

  if (!url || !webDestination(input)) return false

  return ["chat-box.ai", "www.chat-box.ai", "admin.chat-box.ai", "accounts.google.com", "appleid.apple.com"].includes(
    url.hostname,
  )
}
