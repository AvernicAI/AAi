export const home = "https://app.ace.ai/chat_ai"

export const partition = "persist:aai-ace-ai"

export function webDestination(input: string) {
  if (input === "about:blank") return true
  const url = URL.parse(input)

  return !!url && url.protocol === "https:" && !url.username && !url.password
}

export function accountDestination(input: string) {
  const url = URL.parse(input)

  if (!url || !webDestination(input)) return false

  return ["app.ace.ai", "ace.ai", "www.ace.ai", "accounts.google.com"].includes(url.hostname)
}
