import { Schema } from "effect"
import { Recipe } from "./contract"

const Collection = Schema.Struct({
  version: Schema.Literal(1),
  recipes: Schema.Array(Recipe).check(Schema.isMaxLength(100)),
})

export function importRecipes(text: string) {
  if (text.length > 1024 * 1024) throw new Error("recipes.invalid")

  return Schema.decodeUnknownSync(Schema.fromJsonString(Collection))(text).recipes
}

export function exportRecipes(recipes: readonly Recipe[]) {
  return JSON.stringify({ version: 1, recipes }, null, 2) + "\n"
}
