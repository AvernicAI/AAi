export * as Devin from "./devin.js"

import { Schema } from "effect"
import { Rpc } from "./rpc.js"

const Org = Schema.String.check(Schema.isPattern(/^org-[a-zA-Z0-9-]+$/))
const Session = Schema.String.check(Schema.isPattern(/^devin-[a-zA-Z0-9-]+$/))
export const Resource = Schema.Literals(["sessions", "playbooks", "knowledge", "repositories", "automations", "usage"])
export type Resource = typeof Resource.Type
export const Request = Schema.Union([
  Schema.Struct({
    action: Schema.Literal("list"),
    org: Org,
    resource: Resource,
    after: Schema.optionalKey(Schema.String),
  }),
  Schema.Struct({
    action: Schema.Literals(["session", "messages", "sleep", "archive", "unarchive"]),
    org: Org,
    session: Session,
  }),
  Schema.Struct({ action: Schema.Literal("message"), org: Org, session: Session, text: Schema.NonEmptyString }),
  Schema.Struct({
    action: Schema.Literal("create"),
    org: Org,
    text: Schema.NonEmptyString,
    maxACU: Schema.Int.check(Schema.isGreaterThan(0)),
    playbook: Schema.optionalKey(Schema.String),
  }),
])
export type Request = typeof Request.Type

export const Definition = Rpc.define({
  id: "experimental.devin",
  methods: {
    request: {
      input: Schema.toStandardSchemaV1(Request),
      output: Schema.toStandardSchemaV1(Schema.Json),
      errors: { failed: Schema.toStandardSchemaV1(Schema.Struct({ message: Schema.String })) },
    },
  },
  events: {},
})
