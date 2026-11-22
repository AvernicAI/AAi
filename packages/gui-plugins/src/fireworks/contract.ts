import { Schema } from "effect"
import { Ipc } from "@opencode/plugin/gui"

export const Action = Schema.Literals([
  "chat",
  "playground",
  "models",
  "serverless",
  "training",
  "deployments",
  "batch",
  "keys",
  "signIn",
  "reload",
])

export type Action = typeof Action.Type

export const FireworksWorkspace = Ipc.define({
  id: "fireworks.workspace",
  methods: {
    open: {
      output: Schema.Struct({ binding: Schema.String, embed: Schema.String }),
    },
    navigate: {
      input: Schema.Struct({ binding: Schema.String, action: Action }),
    },
    close: { input: Schema.Struct({ binding: Schema.String }) },
    clearSignIn: { input: Schema.Struct({ binding: Schema.String }) },
    openBrowser: {},
  },
})
