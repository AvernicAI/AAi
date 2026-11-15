export * as SessionRunnerModel from "./model.js"

import { makeLocationNode } from "@opencode/util/effect/app-node"
import { LanguageModel } from "@opencode/ai/effect"
import { Model } from "@opencode/schema/model"
import { Provider } from "@opencode/schema/provider"
import { Clock, Context, Effect, Layer, Schema } from "effect"
import { Agent } from "../../agent.js"
import { ModelResolver } from "../../model-resolver.js"
import { ProviderRouter } from "../../provider-router.js"
import { SessionSchema } from "../schema.js"

export class ModelNotSelectedError extends Schema.TaggedError<ModelNotSelectedError>()(
  "SessionRunnerModel.ModelNotSelectedError",
  { sessionID: SessionSchema.ID },
) {
  override get message() {
    return `No model is available for session ${this.sessionID}`
  }
}

export class ModelUnavailableError extends Schema.TaggedError<ModelUnavailableError>()(
  "SessionRunnerModel.ModelUnavailableError",
  { providerID: Provider.ID, modelID: Model.ID },
) {
  override get message() {
    if (this.providerID === "azure-cognitive-services")
      return `Model unavailable: ${this.providerID}/${this.modelID}. This provider has been deprecated; use azure/${this.modelID} instead.`
    if (this.providerID === "google-vertex-anthropic")
      return `Model unavailable: ${this.providerID}/${this.modelID}. This provider has been deprecated; use google-vertex/${this.modelID} instead.`
    return `Model unavailable: ${this.providerID}/${this.modelID}`
  }
}
export type Error = ModelNotSelectedError | ModelUnavailableError | ModelResolver.Error
export type Resolved = ModelResolver.Resolved

export interface Interface {
  /** Availability is sampled lazily for each explicitly selected model resolution. */
  readonly resolve: (
    session: SessionSchema.Info,
    available: () => Effect.Effect<ReadonlyArray<Model.Info>>,
  ) => Effect.Effect<Resolved, Error>
  /** Cools a route that ran out of usage and reports whether a same-model route remains. */
  readonly exhaust?: (
    ref: Model.Ref,
    available: () => Effect.Effect<ReadonlyArray<Model.Info>>,
    cooldown: number,
  ) => Effect.Effect<boolean>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SessionRunnerModel") {}

/** Builds a Resolved whose catalog identity mirrors the route model. Test or embedding seam. */
export const resolved = (
  model: LanguageModel,
  options: {
    readonly capabilities: Model.Capabilities
    readonly variant?: Model.VariantID
    readonly cost: Model.Info["cost"]
    readonly limit: Model.Info["limit"]
    readonly compaction?: Provider.Compaction
    readonly transport?: Provider.Transport
  },
): Resolved => ({
  model,
  ref: Model.Ref.make({
    id: Model.ID.make(model.id),
    providerID: Provider.ID.make(model.provider),
    ...(options.variant === undefined ? {} : { variant: options.variant }),
  }),
  capabilities: options.capabilities,
  cost: options.cost,
  limit: options.limit,
  compaction: options.compaction,
  transport: options.transport,
})

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const resolver = yield* ModelResolver.Service
    const agents = yield* Agent.Service
    const cooldowns: ProviderRouter.Cooldowns = new Map()
    return Service.of({
      resolve: Effect.fn("SessionRunnerModel.resolve")(function* (session, available) {
        // Location plugins populate and filter the catalog asynchronously during layer startup.
        if (!session.model) {
          const agent = (yield* agents.select(session.agent)).info?.model
          const all = yield* available()
          const preferred = agent && all.find((model) => model.providerID === agent.providerID && model.id === agent.id)
          const now = yield* Clock.currentTimeMillis
          const selected = preferred && ProviderRouter.pick(preferred, all, cooldowns, now)
          const resolved = selected
            ? yield* resolver.resolveModel(selected, selected === preferred ? agent?.variant : undefined)
            : yield* resolver.resolve()
          if (resolved) return resolved
          return yield* new ModelNotSelectedError({ sessionID: session.id })
        }
        const all = yield* available()
        const selected = all.find(
          (model) => model.providerID === session.model?.providerID && model.id === session.model.id,
        )
        if (!selected)
          return yield* new ModelUnavailableError({
            providerID: session.model.providerID,
            modelID: session.model.id,
          })
        const now = yield* Clock.currentTimeMillis
        const routed = ProviderRouter.pick(selected, all, cooldowns, now)
        return yield* resolver.resolveModel(
          routed,
          routed.providerID === selected.providerID && routed.id === selected.id ? session.model.variant : undefined,
        )
      }),
      exhaust: Effect.fn("SessionRunnerModel.exhaust")(function* (ref, available, cooldown) {
        const now = yield* Clock.currentTimeMillis
        const all = yield* available()
        const selected = all.find((model) => model.providerID === ref.providerID && model.id === ref.id)
        if (!selected) return false
        ProviderRouter.mark(cooldowns, selected, now + cooldown)
        return ProviderRouter.candidates(selected, all, cooldowns, now).length > 0
      }),
    })
  }),
)

export const node = makeLocationNode({ service: Service, layer, deps: [ModelResolver.node, Agent.node] })
