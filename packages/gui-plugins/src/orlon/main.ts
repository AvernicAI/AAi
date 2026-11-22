import { BrowserWindow, WebContentsView, dialog, session, shell, type WebContents } from "electron"
import type { Embed, Plugin } from "@opencode/plugin/gui/main"
import { Orlon, type Action } from "./contract"
import { home, orlonDestination, partition, webDestination } from "./policy"

import { BrowserAccount } from "../browser/contract"

type Page = { window: number; view: WebContentsView; embed: Embed }

const setup: Plugin.MainSetup = (ctx) => {
  ctx.add(BrowserAccount, { id: ctx.id, title: "Orlon", url: home, partition })
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
  isolated.setPermissionCheckHandler(
    (_contents, permission, origin, details) =>
      permission === "media" &&
      details.mediaType === "audio" &&
      ["https://orlon.org"].includes(URL.parse(origin)?.origin ?? ""),
  )
  isolated.setPermissionRequestHandler((contents, permission, callback, details) => {
    const page = [...pages.values()].find((page) => page.view.webContents === contents)
    const window = page ? ctx.windows.get(page.window) : ctx.windows.focused()

    if (
      permission !== "media" ||
      !window ||
      window.isDestroyed() ||
      !["https://orlon.org"].includes(URL.parse(details.requestingUrl)?.origin ?? "") ||
      !("mediaTypes" in details) ||
      !details.mediaTypes?.length ||
      details.mediaTypes.some((type) => type !== "audio")
    )
      return callback(false)

    void dialog
      .showMessageBox(window, {
        type: "question",
        title: "Orlon voice access",
        message: "Allow Orlon to use your microphone?",
        detail: "Audio is sent directly to Orlon.",
        buttons: ["Cancel", "Allow microphone"],
        defaultId: 0,
        cancelId: 0,
      })
      .then(
        (result) => callback(result.response === 1 && !contents.isDestroyed()),
        () => callback(false),
      )
  })

  // Keep native Save As for images and GLB/OBJ/STL downloads, including Orlon's blob exports.
  const download = (_event: Electron.Event, item: Electron.DownloadItem, source: WebContents) => {
    if ([...pages.values()].some((page) => page.view.webContents === source)) item.setSaveDialogOptions({})
  }

  isolated.on("will-download", download)

  const guard = (contents: WebContents, window: BrowserWindow, popup = false) => {
    const navigation = (event: Electron.Event, url: string) => {
      if (!(popup ? webDestination(url) : orlonDestination(url))) event.preventDefault()
    }

    contents.on("will-navigate", navigation)
    contents.on("will-redirect", navigation)
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

    if (!page || page.window !== window || page.view.webContents.isDestroyed()) throw new Error("orlon.binding")

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
      deadline.reject(new Error("orlon.timeout"))
    }, 30_000)

    const run = async () => {
      if (action === "reload" || !orlonDestination(contents.getURL())) await contents.loadURL(home)
      signal.throwIfAborted()

      if (contents.isDestroyed() || !orlonDestination(contents.getURL())) throw new Error("orlon.origin")

      if (action === "reload") return

      // Only fixed, user-selected navigation controls run in the remote page; no credentials or AAi data cross over.
      const selectors = {
        chat: "#tab-chat",
        models: "#model-open",
        images: '[data-desktop-tool="image"]',
        three: "#tab-create3d",
        gallery: "#tab-gallery",
        signIn: "#sidebar-login-open",
      }

      await contents.executeJavaScript(`(() => {
        if (location.origin !== 'https://orlon.org') throw new Error('orlon.origin');
        const action = ${JSON.stringify(action)};
        if (action === 'images' || action === 'models') document.querySelector('#tab-chat')?.click();
        const target = document.querySelector(${JSON.stringify(selectors[action])});
        if (!(target instanceof HTMLElement)) throw new Error('orlon.control.unavailable');
        target.click();
      })()`)
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
  ctx.provide(Orlon, {
    open: (_input, caller) => {
      caller.signal.throwIfAborted()
      const window = ctx.windows.get(caller.window)

      if (!window || window.isDestroyed()) throw new Error("orlon.window")
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
