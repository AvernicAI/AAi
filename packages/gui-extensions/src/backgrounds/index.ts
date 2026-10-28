import { Schema } from "effect"
import { Extension, Store } from "../sdk"
import en from "./i18n/en"

export default Extension.define({
  id: "backgrounds",
  stores: {
    preferences: Store.global(
      Schema.Struct({ design: Schema.Literals(["default", "aurora", "ember", "blueprint"]) }),
      { design: "default" },
    ),
  },
  i18n: { en },
})
