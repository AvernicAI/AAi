import { Schema } from "effect"
import { Ipc } from "@opencode/plugin/gui"

export const Catalog = Schema.Struct({
  id: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  url: Schema.NonEmptyString,
  kind: Schema.Literals(["skillmd", "index"]),
})

export type Catalog = typeof Catalog.Type

export const Item = Schema.Struct({
  slug: Schema.NonEmptyString,
  title: Schema.String,
  description: Schema.String,
  verified: Schema.Boolean,
  url: Schema.String,
  rawURL: Schema.String,
  bundleURL: Schema.optional(Schema.String),
})

export type Item = typeof Item.Type

export const Detail = Schema.Struct({
  ...Item.fields,
  content: Schema.String,
  license: Schema.String,
  files: Schema.Array(Schema.String),
})

export type Detail = typeof Detail.Type

export const Installed = Schema.Struct({
  id: Schema.String,
  folder: Schema.String.check(Schema.isPattern(/^aai-library-[a-f0-9]{24}$/)),
  catalog: Schema.String,
  slug: Schema.String,
  name: Schema.String,
  description: Schema.String,
  enabled: Schema.Boolean,
  files: Schema.Array(Schema.String),
})

export type Installed = typeof Installed.Type

const target = { catalog: Catalog, slug: Schema.NonEmptyString }

export const SkillLibrary = Ipc.define({
  id: "skills.library",
  methods: {
    search: {
      input: Schema.Struct({
        catalog: Catalog,
        query: Schema.String,
        page: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
      }),
      output: Schema.Array(Item),
    },
    preview: { input: Schema.Struct(target), output: Detail },
    list: { output: Schema.Array(Installed) },
    install: { input: Schema.Struct({ ...target, server: Schema.String }), output: Schema.Array(Installed) },
    enable: {
      input: Schema.Struct({ id: Schema.String, enabled: Schema.Boolean, server: Schema.String }),
      output: Schema.Array(Installed),
    },
  },
})
