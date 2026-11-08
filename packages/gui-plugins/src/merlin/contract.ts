import { Schema } from "effect"
import { Ipc } from "@opencode/plugin/gui"

export const Merlin = Ipc.define({
  id: "merlin.workspace",
  methods: {
    open: {
      input: Schema.Struct({}),
      output: Schema.Struct({ binding: Schema.String, embed: Schema.String, failed: Schema.Boolean }),
    },
    navigate: {
      input: Schema.Struct({ binding: Schema.String, page: Schema.Literals(["chat", "plans", "reload"]) }),
      output: Schema.Struct({ failed: Schema.Boolean }),
    },
    close: { input: Schema.Struct({ binding: Schema.String }) },
    clearSignIn: { input: Schema.Struct({}) },
    openBrowser: { input: Schema.Struct({}) },
  },
})
