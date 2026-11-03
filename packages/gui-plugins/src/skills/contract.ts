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

export const Package = Schema.Struct({
  name: Schema.NonEmptyString,
  version: Schema.NonEmptyString,
  description: Schema.String,
  publisher: Schema.String,
  url: Schema.String,
})

export type Package = typeof Package.Type

export const PackageDetail = Schema.Struct({
  ...Package.fields,
  license: Schema.String,
  dependencies: Schema.Array(Schema.String),
  scripts: Schema.Array(Schema.String),
  parts: Schema.Array(Schema.String),
  deprecated: Schema.String,
})

export const PackageInstall = Schema.Struct({
  name: Schema.String,
  version: Schema.String,
  enabled: Schema.Boolean,
})

export type PackageInstall = typeof PackageInstall.Type

export const Recipe = Schema.Struct({
  id: Schema.NonEmptyString,
  title: Schema.NonEmptyString.check(Schema.isMaxLength(160)),
  description: Schema.String.check(Schema.isMaxLength(1000)),
  prompt: Schema.NonEmptyString.check(Schema.isMaxLength(100000)),
})

export type Recipe = typeof Recipe.Type

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
    remove: { input: Schema.Struct({ id: Schema.String, server: Schema.String }), output: Schema.Array(Installed) },
    packages: {
      input: Schema.Struct({ query: Schema.String, page: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)) }),
      output: Schema.Array(Package),
    },
    package: { input: Schema.Struct({ name: Schema.String, version: Schema.String }), output: PackageDetail },
    pluginList: { output: Schema.Array(PackageInstall) },
    pluginInstall: {
      input: Schema.Struct({ name: Schema.String, version: Schema.String, server: Schema.String }),
      output: Schema.Array(PackageInstall),
    },
    pluginEnable: {
      input: Schema.Struct({ name: Schema.String, enabled: Schema.Boolean, server: Schema.String }),
      output: Schema.Array(PackageInstall),
    },
    pluginRemove: {
      input: Schema.Struct({ name: Schema.String, server: Schema.String }),
      output: Schema.Array(PackageInstall),
    },
  },
})
