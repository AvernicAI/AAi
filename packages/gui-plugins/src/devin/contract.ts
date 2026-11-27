import { Schema } from "effect"
import { Ipc } from "@opencode/plugin/gui"

export const Section = Schema.Literals(["chat", "bots", "automations", "security", "wiki"])

export type Section = typeof Section.Type

export const Action = Schema.Literals([...Section.literals, "signIn", "reload"])

export type Action = typeof Action.Type

export const DevinWorkspace = Ipc.define({
  id: "devin.workspace",
  methods: {
    open: {
      output: Schema.Struct({ binding: Schema.String, embed: Schema.String }),
    },
    navigate: {
      input: Schema.Struct({ binding: Schema.String, action: Action }),
    },
    close: { input: Schema.Struct({ binding: Schema.String }) },
    clearSignIn: { input: Schema.Struct({ binding: Schema.String }) },
    openBrowser: { input: Schema.Struct({ section: Section }) },
    models: { output: Schema.String },
    cli: { input: Schema.Struct({ mode: Schema.Literals(["local", "cloud", "signIn"]) }), output: Schema.Boolean },
  },
})
