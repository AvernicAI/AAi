export * as Antigravity from "./antigravity.js"

import { Schema } from "effect"
import { Rpc } from "./rpc.js"

export const Catalog = Schema.Struct({
  installed: Schema.Boolean,
  connected: Schema.Boolean,
  version: Schema.String,
  message: Schema.String,
  models: Schema.Array(Schema.Struct({ id: Schema.String, name: Schema.String })),
})
export type Catalog = typeof Catalog.Type

/** Experimental official Antigravity CLI discovery. Native credentials remain with Google tooling. */
export const Definition = Rpc.define({
  id: "experimental.antigravity",
  methods: {
    refresh: {
      input: Schema.toStandardSchemaV1(Schema.Struct({})),
      output: Schema.toStandardSchemaV1(Catalog),
      errors: { failed: Schema.toStandardSchemaV1(Schema.Struct({ message: Schema.String })) },
    },
  },
  events: {},
})
