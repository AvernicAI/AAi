import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { homedir } from "node:os"
import { launchAgentTerminal } from "../native-agent-terminal"
import { BrowserWindow, WebContentsView, session, shell, type WebContents } from "electron"
import type { Embed, Plugin } from "@opencode/plugin/gui/main"
import { guardWorkspaceNavigation } from "../workspace-navigation"
import { DevinWorkspace, type Action, type Section } from "./contract"
import {
  home,
  accountDestination,
  isAccountCallback,
  isSection,
  navigationTarget,
  partition,
  sectionReturn,
  sections,
  webDestination,
  type SectionReturn,
} from "./policy"

import { BrowserAccount } from "../browser/contract"

type Page = { window: number; view: WebContentsView; embed: Embed; section: Section; auth: SectionReturn }

type PopupReturn = { current: SectionReturn; callback: boolean }

const setup: Plugin.MainSetup = (ctx) => {
  ctx.add(BrowserAccount, { id: ctx.id, title: "Devin", url: home, partition })
  const pages = new Map<string, Page>()
  const popups = new Map<BrowserWindow, Page>()

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

  const guard = (contents: WebContents, window: BrowserWindow, page: Page, popup = false) => {
    guardWorkspaceNavigation(contents, popup ? webDestination : accountDestination, webDestination)
    const popupReturn: PopupReturn = { current: "idle", callback: false }

    const restore = () => {
      const parent = page.view.webContents

      if (page.section === "chat" || parent.isDestroyed()) return

      page.auth = "restored"
      // The destination is fixed. OAuth parameters stay in the provider's page.
      void parent.loadURL(sections[page.section]).catch(() => undefined)
    }

    const observeReturn = () => {
      const parent = page.view.webContents

      if (page.section === "chat" || parent.isDestroyed()) return

      const state = popup ? popupReturn.current : page.auth
      const url = contents.getURL()
      const next = sectionReturn(state, url)

      if (next === state) return

      if (popup) popupReturn.current = next

      if (!popup || next === "restored") page.auth = next

      if (next !== "restored" || (!popup && isSection(page.section, url))) return

      restore()
    }

    contents.on("did-finish-load", observeReturn)
    contents.on("did-navigate-in-page", (_event, _url, mainFrame) => {
      if (mainFrame) observeReturn()
    })

    if (popup) {
      contents.on("did-navigate", (_event, url) => {
        if ((popupReturn.current === "waiting" || page.auth === "waiting") && isAccountCallback(url))
          popupReturn.callback = true
      })
      contents.once("destroyed", () => {
        // Some providers close the callback window as soon as the opener has been notified.
        if (popupReturn.callback && popupReturn.current !== "restored" && page.auth !== "restored") restore()
      })
    }

    contents.setWindowOpenHandler(({ url }) =>
      webDestination(url)
        ? { action: "allow", overrideBrowserWindowOptions: { parent: window, webPreferences: preferences } }
        : { action: "deny" },
    )
    contents.on("did-create-window", (child) => {
      popups.set(child, page)
      guard(child.webContents, window, page, true)
      child.once("closed", () => popups.delete(child))
    })
  }

  const close = (binding: string) => {
    const page = pages.get(binding)

    if (!page) return
    pages.delete(binding)
    page.embed.dispose()

    if (!page.view.webContents.isDestroyed()) page.view.webContents.close({ waitForBeforeUnload: false })
    popups.forEach((owner, popup) => {
      if (owner === page && !popup.isDestroyed()) popup.destroy()
    })
  }

  const get = (binding: string, window: number) => {
    const page = pages.get(binding)

    if (!page || page.window !== window || page.view.webContents.isDestroyed()) throw new Error("devin.binding")

    return page
  }

  const navigate = async (page: Page, action: Action, signal: AbortSignal) => {
    const contents = page.view.webContents
    signal.throwIfAborted()

    if (action === "signIn") page.auth = page.section === "chat" ? "idle" : "waiting"

    if (action !== "signIn" && action !== "reload") {
      page.section = action
      page.auth = "idle"
    }

    const target = navigationTarget(action, page.section, contents.getURL())

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
      await contents.loadURL(target)
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
  })
  ctx.onCleanup(() => {
    isolated.off("will-download", download)
    pages.forEach((_page, binding) => close(binding))
  })
  ctx.provide(DevinWorkspace, {
    open: (_input, caller) => {
      caller.signal.throwIfAborted()
      const window = ctx.windows.get(caller.window)

      if (!window || window.isDestroyed()) throw new Error("devin.window")
      const binding = crypto.randomUUID()
      const view = new WebContentsView({ webPreferences: preferences })
      const embed = ctx.embeds.create(view, window)
      const page: Page = { window: caller.window, view, embed, section: "chat", auth: "idle" }
      guard(view.webContents, window, page)
      embed.show(true)
      pages.set(binding, page)

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
      await Promise.all([...pages.values()].map((page) => navigate(page, page.section, caller.signal)))
    },
    openBrowser: (input) => shell.openExternal(sections[input.section]),
    models: async (_input, caller) => {
      const result = await promisify(execFile)(executable(), ["models", "list", "--format", "json"], {
        cwd: homedir(),
        windowsHide: true,
        maxBuffer: 1024 * 1024,
        signal: AbortSignal.any([caller.signal, AbortSignal.timeout(20_000)]),
      })

      return result.stdout
    },
    cli: (input) =>
      launchAgentTerminal(executable(), { local: [], cloud: ["--cloud"], signIn: ["auth", "login"] }[input.mode]),
  })
}

export default setup

const executable = () => process.env.OPENCODE_DEVIN_PATH || "devin"
