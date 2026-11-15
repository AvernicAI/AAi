import { contextBridge, ipcRenderer } from "electron"
import type { AlphieBridge, Mirror } from "@opencode/gui-plugins/alphie/contract"

// A utility-window-only MessagePort. It exposes no credentials, filesystem or general IPC access.
type Transport = { port?: MessagePort; value?: Mirror }

const state: Transport = {}

const listeners = new Set<(value: Mirror) => void>()

ipcRenderer.on("alphie:connect", (event) => {
  state.port?.close()
  state.port = event.ports[0]

  if (!state.port) return
  state.port.onmessage = (message) => {
    state.value = message.data
    listeners.forEach((listener) => listener(message.data))
  }

  state.port.start()
})

const bridge: AlphieBridge = {
  subscribe: (listener) => {
    listeners.add(listener)

    if (state.value !== undefined) listener(state.value)

    return () => listeners.delete(listener)
  },
  send: (message) => state.port?.postMessage(message),
}

contextBridge.exposeInMainWorld("electron", { alphie: bridge })
