import { Schema } from "effect"
import { Plugin } from "@opencode/plugin/gui"
import { BuiltinStore, builtinCatalog } from "@opencode/plugin/gui/builtin"
import en from "./i18n/en"

export default Plugin.define({
  stores: {
    preferences: BuiltinStore.global(
      Schema.Struct({
        design: Schema.Literals(["default", "aurora", "ember", "blueprint", "obsidian", "tidal", "nebula"]),
      }),
      { design: "ember" },
    ),
  },
  i18n: builtinCatalog({ en }),
})
