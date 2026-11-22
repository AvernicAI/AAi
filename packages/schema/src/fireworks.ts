export * as Fireworks from "./fireworks.js"

import { Schema } from "effect"
import { Rpc } from "./rpc.js"

export const Account = Schema.String.check(Schema.isPattern(/^[a-zA-Z0-9_-]+$/))
export const Training = Schema.Struct({
  outputModel: Schema.String.check(Schema.isPattern(/^[a-z0-9][a-z0-9-]{0,62}$/)),
  dataset: Schema.NonEmptyString,
  baseModel: Schema.String.check(Schema.isPattern(/^accounts\/[a-zA-Z0-9_-]+\/models\/[a-zA-Z0-9._-]+$/)),
  tokenizer: Schema.NonEmptyString,
  renderer: Schema.String,
  epochs: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 })),
  batchSize: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 256 })),
  maxSeqLen: Schema.Int.check(Schema.isBetween({ minimum: 128, maximum: 262144 })),
  learningRate: Schema.Number.check(Schema.isBetween({ minimum: 0.0000001, maximum: 0.01 })),
  loraRank: Schema.Literals([8, 16, 32, 64]),
  allowPaid: Schema.Boolean,
})
export type Training = typeof Training.Type

/** Experimental Fireworks platform operations. Credentials stay on the server. */
export const Definition = Rpc.define({
  id: "experimental.fireworks",
  methods: {
    refresh: {
      input: Schema.toStandardSchemaV1(Schema.Struct({ account: Schema.optionalKey(Account) })),
      output: Schema.toStandardSchemaV1(Schema.Struct({ connected: Schema.Boolean, models: Schema.Int })),
      errors: { failed: Schema.toStandardSchemaV1(Schema.Struct({ message: Schema.String })) },
    },
    inventory: {
      input: Schema.toStandardSchemaV1(
        Schema.Struct({
          account: Account,
          resource: Schema.Literals(["models", "deployments", "datasets", "quotas"]),
          pageToken: Schema.String,
        }),
      ),
      output: Schema.toStandardSchemaV1(Schema.Json),
      errors: { failed: Schema.toStandardSchemaV1(Schema.Struct({ message: Schema.String })) },
    },
    train: {
      input: Schema.toStandardSchemaV1(
        Schema.Struct({ sessionID: Schema.String, training: Training, confirmed: Schema.Literal(true) }),
      ),
      output: Schema.toStandardSchemaV1(Schema.Struct({ shellID: Schema.String })),
      errors: { failed: Schema.toStandardSchemaV1(Schema.Struct({ message: Schema.String })) },
    },
  },
  events: {},
})
