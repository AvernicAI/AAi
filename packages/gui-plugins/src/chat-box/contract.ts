import { Schema } from "effect"
import { Ipc } from "@opencode/plugin/gui"

export const Action = Schema.Literals(["chat", "signIn", "reload"])

export type Action = typeof Action.Type

export const ChatBoxWorkspace = Ipc.define({
  id: "chat-box.workspace",
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
