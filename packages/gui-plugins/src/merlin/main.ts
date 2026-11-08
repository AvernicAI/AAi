import { BrowserWindow, WebContentsView, session, shell, type WebContents } from "electron"
import type { Embed, Plugin } from "@opencode/plugin/gui/main"
import { Merlin } from "./contract"

const partition = "persist:aai-merlin"
const chat = "https://www.getmerlin.in/chat"
const plans = "https://www.getmerlin.in/pricing"

type Page = { window: number; view: WebContentsView; embed: Embed }

const setup: Plugin.MainSetup = (ctx) => {
  const pages = new Map<string, Page>()
  const popups = new Map<BrowserWindow, number>()
  const preferences = {
    partition,
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
    webviewTag: false,
  }

  const guard = (contents: WebContents, window: BrowserWindow) => {
    const navigation = (event: Electron.Event, url: string) => {
      if (!webDestination(url)) event.preventDefault()
    }
    contents.on("will-navigate", navigation)
    contents.on("will-redirect", navigation)
    contents.setWindowOpenHandler(({ url }) =>
      webDestination(url)
        ? { action: "allow", overrideBrowserWindowOptions: { parent: window, webPreferences: preferences } }
        : { action: "deny" },
    )
    contents.on("did-create-window", (popup) => {
      popups.set(popup, window.id)
      guard(popup.webContents, window)
      popup.once("closed", () => popups.delete(popup))
    })
  }

  const close = (binding: string) => {
    const page = pages.get(binding)
    if (!page) return
    pages.delete(binding)
    const contents = page.view.webContents
    page.embed.dispose()
    if (!contents.isDestroyed()) contents.close({ waitForBeforeUnload: false })
  }

  const get = (binding: string, window: number) => {
    const page = pages.get(binding)
    if (!page || page.window !== window || page.view.webContents.isDestroyed()) throw new Error("merlin.binding")
    return page
  }

  ctx.windows.on("close", (window) => {
    pages.forEach((page, binding) => {
      if (page.window === window.id) close(binding)
    })
    popups.forEach((owner, popup) => {
      if (owner === window.id && !popup.isDestroyed()) popup.close()
    })
  })
  ctx.onCleanup(() => {
    pages.forEach((_page, binding) => close(binding))
    popups.forEach((_owner, popup) => {
      if (!popup.isDestroyed()) popup.close()
    })
  })

  ctx.provide(Merlin, {
    open: async (_input, caller) => {
      caller.signal.throwIfAborted()
      const window = ctx.windows.get(caller.window)
      if (!window || window.isDestroyed()) throw new Error("merlin.window")
      const binding = crypto.randomUUID()
      const view = new WebContentsView({ webPreferences: preferences })
      guard(view.webContents, window)
      const embed = ctx.embeds.create(view, window)
      embed.show(true)
      pages.set(binding, { window: caller.window, view, embed })
      const abort = () => close(binding)
      caller.signal.addEventListener("abort", abort, { once: true })
      const failed = await view.webContents.loadURL(chat).then(
        () => false,
        () => true,
      )
      caller.signal.removeEventListener("abort", abort)
      if (caller.signal.aborted) {
        close(binding)
        caller.signal.throwIfAborted()
      }
      if (!pages.has(binding)) throw new Error("merlin.closed")
      return { binding, embed: embed.id, failed }
    },
    navigate: async (input, caller) => {
      const contents = get(input.binding, caller.window).view.webContents
      const url = input.page === "chat" ? chat : input.page === "plans" ? plans : contents.getURL() || chat
      return {
        failed: await contents.loadURL(url).then(
          () => false,
          () => true,
        ),
      }
    },
    close: (input, caller) => {
      get(input.binding, caller.window)
      close(input.binding)
    },
    clearSignIn: async () => {
      popups.forEach((_owner, popup) => {
        if (!popup.isDestroyed()) popup.close()
      })
      await session.fromPartition(partition).clearStorageData()
      await Promise.all(
        [...pages.values()].map((page) =>
          page.view.webContents.isDestroyed() ? undefined : page.view.webContents.loadURL(chat).catch(() => undefined),
        ),
      )
    },
    openBrowser: () => shell.openExternal(chat),
  })
}

function webDestination(input: string) {
  if (input === "about:blank") return true
  const url = URL.parse(input)
  return !!url && url.protocol === "https:" && !url.username && !url.password
}

export default setup
