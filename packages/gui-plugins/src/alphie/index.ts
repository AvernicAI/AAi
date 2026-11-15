import { Plugin } from "@opencode/plugin/gui"
import { BuiltinStore, builtinCatalog } from "@opencode/plugin/gui/builtin"
import { Preferences } from "./contract"
import en from "./i18n/en"

export default Plugin.define({
  stores: {
    preferences: BuiltinStore.global(Preferences, {
      features: { alphieMate: true },
      size: 180,
      opacity: 1,
      floating: true,
      alwaysOnTop: true,
      sleepSeconds: 60,
      x: -1,
      y: -1,
    }),
  },
  i18n: builtinCatalog({ en }),
})
