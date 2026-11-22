export const home = "https://app.fireworks.ai/"

export const partition = "persist:aai-fireworks"

const destinations = {
  chat: home,
  playground: `${home}playground`,
  models: `${home}models`,
  serverless: `${home}dashboard/serverless`,
  training: `${home}dashboard/fine-tuning`,
  deployments: `${home}dashboard/deployments`,
  batch: `${home}dashboard/batch-inference`,
  keys: `${home}settings/users/api-keys`,
  signIn: `${home}login`,
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

export function fireworksDestination(input: string) {
  const url = URL.parse(input)

  if (!url || !webDestination(input)) return false

  return ["app.fireworks.ai", "auth.fireworks.ai", "accounts.google.com", "github.com", "www.linkedin.com"].includes(
    url.hostname,
  )
}
