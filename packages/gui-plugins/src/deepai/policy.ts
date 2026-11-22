export const home = "https://deepai.org/"

export const partition = "persist:aai-deepai"

const destinations = {
  chat: `${home}chat`,
  images: `${home}machine-learning-model/text2img`,
  video: `${home}video`,
  music: `${home}music`,
  voice: `${home}voice`,
  editor: `${home}machine-learning-model/image-editor`,
  tools: home,
  account: `${home}profile/api`,
  pricing: `${home}pricing`,
  api: `${home}docs`,
  signIn: `${home}chat`,
  reload: home,
} as const

export function destination(action: keyof typeof destinations) {
  return destinations[action]
}

export function webDestination(input: string) {
  if (input === "about:blank") return true
  const url = URL.parse(input)

  return !!url && url.protocol === "https:" && !url.username && !url.password
}

export function deepaiDestination(input: string) {
  const url = URL.parse(input)

  if (!url || !webDestination(input)) return false

  return [
    "deepai.org",
    "www.deepai.org",
    "deep.ai",
    "www.deep.ai",
    "accounts.google.com",
    "appleid.apple.com",
  ].includes(url.hostname)
}
