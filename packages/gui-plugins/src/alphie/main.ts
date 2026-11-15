import path from "node:path"
import { fileURLToPath } from "node:url"
import { BrowserWindow, MessageChannelMain, screen } from "electron"
import type { MessagePortMain } from "electron"
import type { Plugin } from "@opencode/plugin/gui/main"
import { Option, Schema } from "effect"
import { Action, Mate, type Mirror } from "./contract"

type MateWindow = { window: BrowserWindow; port?: MessagePortMain; latest: Mirror }

const Input = Schema.Union([
  Schema.Struct({ type: Schema.Literal("action"), action: Action }),
  Schema.Struct({ type: Schema.Literal("move"), x: Schema.Finite, y: Schema.Finite }),
])

const decode = Schema.decodeUnknownOption(Input)

/** A utility window in this Electron app. Only snapshots, UI actions and drag deltas cross its port. */
const setup: Plugin.MainSetup = (ctx) => {
  const windows = new Map<number, MateWindow>()

  const position = ctx.storage.store("position", {
    schema: Schema.Struct({ x: Schema.Number, y: Schema.Number }),
    initial: { x: -1, y: -1 },
  })

  const close = (owner: number) => {
    const mate = windows.get(owner)
    windows.delete(owner)
    mate?.port?.close()

    if (mate && !mate.window.isDestroyed()) mate.window.destroy()
  }

  ctx.windows.on("close", (window) => close(window.id))
  ctx.onCleanup(() => [...windows.keys()].forEach(close))

  const provider = ctx.provide(Mate, {
    hide: (_input, caller) => close(caller.window),
    update: async (input, caller) => {
      caller.signal.throwIfAborted()

      if (!input.preferences.features.alphieMate || !input.preferences.floating) {
        close(caller.window)

        return false
      }

      const owner = ctx.windows.get(caller.window)

      if (!owner || owner.isDestroyed()) return false
      const size = Math.round(Math.min(300, Math.max(100, input.preferences.size)))
      const height = Math.round(size * 2 + 120)
      const width = Math.max(240, size + 50)
      const existing = windows.get(caller.window)

      if (existing && !existing.window.isDestroyed()) {
        existing.latest = input
        existing.window.setAlwaysOnTop(input.preferences.alwaysOnTop)
        existing.window.setOpacity(Math.max(0.25, Math.min(1, input.preferences.opacity)))
        existing.window.setSize(width, height)

        if (input.snapshot.resting) {
          const area = screen.getDisplayMatching(existing.window.getBounds()).workArea
          existing.window.setPosition(area.x + area.width - width - 18, area.y + area.height - height - 18)
        }

        existing.port?.postMessage({ ...input, preferences: { ...input.preferences, size } })

        return true
      }

      const url = new URL("alphie.html", owner.webContents.getURL()).toString()
      const area = screen.getDisplayMatching(owner.getBounds()).workArea
      const saved = position.value

      const window = new BrowserWindow({
        width,
        height,
        x:
          saved.x < 0
            ? area.x + area.width - width - 18
            : Math.max(area.x, Math.min(area.x + area.width - width, saved.x)),
        y:
          saved.y < 0
            ? area.y + area.height - height - 18
            : Math.max(area.y, Math.min(area.y + area.height - height, saved.y)),
        show: false,
        frame: false,
        transparent: true,
        resizable: false,
        minimizable: false,
        maximizable: false,
        skipTaskbar: true,
        alwaysOnTop: input.preferences.alwaysOnTop,
        title: "Alphie",
        webPreferences: {
          preload: path.join(path.dirname(fileURLToPath(import.meta.url)), "../preload/alphie.cjs"),
          sandbox: true,
          nodeIntegration: false,
          contextIsolation: true,
          webSecurity: true,
          webviewTag: false,
        },
      })

      const record: MateWindow = { window, latest: input }
      windows.set(caller.window, record)
      window.webContents.setWindowOpenHandler(() => ({ action: "deny" }))
      window.webContents.on("will-navigate", (event, target) => {
        if (target !== url) event.preventDefault()
      })
      window.webContents.on("will-redirect", (event) => event.preventDefault())
      window.once("closed", () => {
        record.port?.close()

        if (windows.get(caller.window) === record) windows.delete(caller.window)
      })
      window.webContents.on("did-finish-load", () => {
        if (windows.get(caller.window) !== record || window.isDestroyed()) return
        record.port?.close()
        const channel = new MessageChannelMain()
        record.port = channel.port1
        channel.port1.on("message", (event) => {
          const parsed = decode(event.data)

          if (Option.isNone(parsed) || windows.get(caller.window) !== record || owner.isDestroyed()) return

          if (parsed.value.type === "move") {
            const bounds = window.getBounds()

            const work = screen.getDisplayNearestPoint({
              x: bounds.x + parsed.value.x,
              y: bounds.y + parsed.value.y,
            }).workArea

            const x = Math.round(
              Math.max(work.x, Math.min(work.x + work.width - bounds.width, bounds.x + parsed.value.x)),
            )

            const y = Math.round(
              Math.max(work.y, Math.min(work.y + work.height - bounds.height, bounds.y + parsed.value.y)),
            )

            window.setPosition(x, y)
            position.set({ x, y })

            return
          }

          const action = parsed.value.action

          if (["chat", "ide", "settings"].includes(action)) {
            owner.show()
            owner.focus()
          }

          provider.emit("action", action, caller.window)
        })
        channel.port1.start()
        window.webContents.postMessage("alphie:connect", null, [channel.port2])
        channel.port1.postMessage(record.latest)
        window.setOpacity(Math.max(0.25, Math.min(1, record.latest.preferences.opacity)))
        window.showInactive()
      })
      await window.loadURL(url).catch((cause: unknown) => {
        if (windows.get(caller.window) === record) close(caller.window)
        throw cause
      })

      return !window.isDestroyed()
    },
  })
}

export default setup
