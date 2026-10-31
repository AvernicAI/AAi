import { define } from "@opencode/plugin/effect/plugin"
import { Effect } from "effect"
import { Provider } from "../../provider.js"

export const OpenAICompatibilityPlugin = define({
  id: "aai.provider.openai-compatibility",
  effect: Effect.fn(function* (ctx) {
    const providers = yield* Provider.Service
    yield* ctx.session.hook("http.request", (event) =>
      Effect.gen(function* () {
        if (!event.model.providerID.startsWith("aai-compatible-")) return
        const provider = yield* providers.get(event.model.providerID)
        // A local, keyless connection still participates in the normal credential/account lifecycle.
        if (provider?.settings?.aaiNoAuth === true) event.request.headers.delete("authorization")
      }),
    )
  }),
})
