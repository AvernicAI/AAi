import { Schema } from "effect"
import { Ipc } from "@opencode/plugin/gui"

export const Action = Schema.Literals(["chat", "models", "images", "three", "gallery", "signIn", "reload"])

export type Action = typeof Action.Type

export const Orlon = Ipc.define({
  id: "orlon.workspace",
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
