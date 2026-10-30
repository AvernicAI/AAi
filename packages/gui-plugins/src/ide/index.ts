import { Schema } from "effect"
import { Plugin } from "@opencode/plugin/gui"
import { BuiltinStore, builtinCatalog } from "@opencode/plugin/gui/builtin"
import en from "./i18n/en"

export default Plugin.define({
  stores: {
    preferences: BuiltinStore.global(
      Schema.Struct({
        language: Schema.String,
        languageCommand: Schema.String,
        debugCommand: Schema.String,
        debugConfiguration: Schema.String,
      }),
      {
        language: "typescript",
        languageCommand: '["typescript-language-server", "--stdio"]',
        debugCommand: '["python", "-m", "debugpy.adapter"]',
        debugConfiguration:
          '{\n  "request": "launch",\n  "type": "python",\n  "program": "${file}",\n  "console": "internalConsole",\n  "stopOnEntry": true\n}',
      },
    ),
    drafts: BuiltinStore.global(
      Schema.Array(
        Schema.Struct({ root: Schema.String, path: Schema.String, text: Schema.String, version: Schema.String }),
      ),
      [],
    ),
  },
  i18n: builtinCatalog({ en }),
})
