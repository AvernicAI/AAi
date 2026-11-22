import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { homedir } from "node:os"
import { launchAgentTerminal } from "../native-agent-terminal"
import { BrowserWindow, WebContentsView, session, shell, type WebContents } from "electron"
import type { Embed, Plugin } from "@opencode/plugin/gui/main"
import { DevinWorkspace, type Action } from "./contract"
import { home, accountDestination, partition, webDestination } from "./policy"

import { BrowserAccount } from "../browser/contract"

type Page = { window: number; view: WebContentsView; embed: Embed }

const setup: Plugin.MainSetup = (ctx) => {
  ctx.add(BrowserAccount, { id: ctx.id, title: "Devin", url: home, partition })
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
  isolated.setPermissionCheckHandler(() => false)
  isolated.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))

  // Keep native Save As for downloads initiated on Devin.
  const download = (_event: Electron.Event, item: Electron.DownloadItem, source: WebContents) => {
    if ([...pages.values()].some((page) => page.view.webContents === source)) item.setSaveDialogOptions({})
  }

  isolated.on("will-download", download)

  const guard = (contents: WebContents, window: BrowserWindow, popup = false) => {
    const navigation = (event: Electron.Event, url: string) => {
      if (!(popup ? webDestination(url) : accountDestination(url))) event.preventDefault()
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

    if (!page || page.window !== window || page.view.webContents.isDestroyed()) throw new Error("devin.binding")

    return page
  }

  const navigate = async (page: Page, _action: Action, signal: AbortSignal) => {
    const contents = page.view.webContents
    signal.throwIfAborted()

    const abort = () => {
      if (!contents.isDestroyed()) contents.stop()
    }

    signal.addEventListener("abort", abort, { once: true })
    const deadline = Promise.withResolvers<never>()

    const timer = setTimeout(() => {
      abort()
      deadline.reject(new Error("devin.timeout"))
    }, 30_000)

    const run = async () => {
      await contents.loadURL(home)
      signal.throwIfAborted()

      if (contents.isDestroyed() || !accountDestination(contents.getURL())) throw new Error("devin.origin")
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
  ctx.provide(DevinWorkspace, {
    open: (_input, caller) => {
      caller.signal.throwIfAborted()
      const window = ctx.windows.get(caller.window)

      if (!window || window.isDestroyed()) throw new Error("devin.window")
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
    models: async (_input, caller) => {
      const result = await promisify(execFile)(executable(), ["models", "list", "--format", "json"], {
        cwd: homedir(),
        windowsHide: true,
        maxBuffer: 1024 * 1024,
        signal: AbortSignal.any([caller.signal, AbortSignal.timeout(20_000)]),
      })

      return result.stdout
    },
    cli: (input) => launchAgentTerminal(executable(), input.mode === "cloud" ? ["--cloud"] : []),
  })
}

export default setup

const executable = () => process.env.OPENCODE_DEVIN_PATH || "devin"
