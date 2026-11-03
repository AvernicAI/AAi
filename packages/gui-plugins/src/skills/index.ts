import { Schema } from "effect"
import { Plugin } from "@opencode/plugin/gui"
import { BuiltinStore, builtinCatalog } from "@opencode/plugin/gui/builtin"
import { Catalog, Recipe } from "./contract"
import en from "./i18n/en"

export default Plugin.define({
  stores: {
    savedPackages: BuiltinStore.global(Schema.Array(Schema.String), []),
    recipes: BuiltinStore.global(Schema.Array(Recipe), []),
    catalogs: BuiltinStore.global(Schema.Array(Catalog), [
      { id: "skillmd", name: "SkillMD", url: "https://api.skillmd.com", kind: "skillmd" },
    ]),
  },
  i18n: builtinCatalog({ en }),
})
