import { BrowserWindow, WebContentsView, session, shell, type WebContents } from "electron"
import type { Embed, Plugin } from "@opencode/plugin/gui/main"
import { guardWorkspaceNavigation } from "../workspace-navigation"
import { FireworksWorkspace, type Action } from "./contract"
import { destination, home, fireworksDestination, partition, webDestination } from "./policy"

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

  const isolated = session.fromPartition(partition)
  isolated.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  isolated.setPermissionCheckHandler(() => false)
  // Keep native Save As for downloads initiated on Fireworks AI.
  const download = (_event: Electron.Event, item: Electron.DownloadItem) => item.setSaveDialogOptions({})
  isolated.on("will-download", download)

  const guard = (contents: WebContents, window: BrowserWindow, popup = false) => {
    guardWorkspaceNavigation(contents, popup ? webDestination : fireworksDestination, webDestination)
    contents.setWindowOpenHandler(({ url }) =>
      webDestination(url)
        ? { action: "allow", overrideBrowserWindowOptions: { parent: window, webPreferences: preferences } }
        : { action: "deny" },
    )
    contents.on("did-create-window", (child) => {
      popups.set(child, window.id)
      guard(child.webContents, window, true)
      child.once("closed", () => popups.delete(child))
    })
  }

  const close = (binding: string) => {
    const page = pages.get(binding)

    if (!page) return
    pages.delete(binding)
    page.embed.dispose()

    if (!page.view.webContents.isDestroyed()) page.view.webContents.close({ waitForBeforeUnload: false })
  }

  const get = (binding: string, window: number) => {
    const page = pages.get(binding)

    if (!page || page.window !== window || page.view.webContents.isDestroyed()) throw new Error("fireworks.binding")

    return page
  }

  const navigate = async (page: Page, action: Action, signal: AbortSignal) => {
    const contents = page.view.webContents
    signal.throwIfAborted()

    const abort = () => {
      if (!contents.isDestroyed()) contents.stop()
    }

    signal.addEventListener("abort", abort, { once: true })
    const deadline = Promise.withResolvers<never>()

    const timer = setTimeout(() => {
      abort()
      deadline.reject(new Error("fireworks.timeout"))
    }, 30_000)

    const run = async () => {
      await contents.loadURL(
        action === "reload" && fireworksDestination(contents.getURL()) ? contents.getURL() : destination(action),
      )
      signal.throwIfAborted()

      if (contents.isDestroyed() || !fireworksDestination(contents.getURL())) throw new Error("fireworks.origin")
    }

    await Promise.race([run(), deadline.promise]).finally(() => {
      clearTimeout(timer)
      signal.removeEventListener("abort", abort)
    })
    signal.throwIfAborted()
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
    isolated.off("will-download", download)
    pages.forEach((_page, binding) => close(binding))
    popups.forEach((_owner, popup) => {
      if (!popup.isDestroyed()) popup.close()
    })
  })
  ctx.provide(FireworksWorkspace, {
    open: (_input, caller) => {
      caller.signal.throwIfAborted()
      const window = ctx.windows.get(caller.window)

      if (!window || window.isDestroyed()) throw new Error("fireworks.window")
      const binding = crypto.randomUUID()
      const view = new WebContentsView({ webPreferences: preferences })
      guard(view.webContents, window)
      const embed = ctx.embeds.create(view, window)
      embed.show(true)
      pages.set(binding, { window: caller.window, view, embed })

      return { binding, embed: embed.id }
    },
    navigate: (input, caller) => navigate(get(input.binding, caller.window), input.action, caller.signal),
    close: (input, caller) => {
      get(input.binding, caller.window)
      close(input.binding)
    },
    clearSignIn: async (input, caller) => {
      get(input.binding, caller.window)
      popups.forEach((_owner, popup) => {
        if (!popup.isDestroyed()) popup.close()
      })
      pages.forEach((page) => page.view.webContents.stop())
      await isolated.closeAllConnections()
      await isolated.clearStorageData()
      await isolated.clearCache()
      await Promise.all([...pages.values()].map((page) => navigate(page, "reload", caller.signal)))
    },
    openBrowser: () => shell.openExternal(home),
  })
}

export default setup
