import { Registry } from "@opencode/plugin/gui"

/** A desktop account session offered to the agent browser by its owning integration. */
export type BrowserAccount = {
  readonly id: string
  readonly title: string
  readonly url: string
  readonly partition: string
}

/** Account integrations contribute here; the browser reads the live list on each request. */
export const BrowserAccount = Registry.define<BrowserAccount>("browser.accounts")
