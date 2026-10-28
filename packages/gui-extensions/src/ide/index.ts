import { Schema } from "effect"
import { Extension, Ipc, Store } from "../sdk"
import type { Ide } from "./contract"
import en from "./i18n/en"

export default Extension.define({
  id: "ide",
  provides: { workspace: Ipc.ref<Ide>("ide.workspace") },
  stores: {
    preferences: Store.global(
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
    drafts: Store.global(
      Schema.Array(
        Schema.Struct({ root: Schema.String, path: Schema.String, text: Schema.String, version: Schema.String }),
      ),
      [],
    ),
  },
  i18n: { en },
})
