export * as BackgroundServiceState from "./background-service-state"

import { Deferred, Duration, Effect, Exit, Option, Ref } from "effect"
import type { ConnectFailure } from "../../shared/ipc-rpc/connect"
import type { SidecarCredentials } from "./sidecar-credentials"
import { ConnectFailed } from "./connect-retry"

// The initial connect runs in the background: windows are created as soon as the main process
// is up, and the renderer loads its bundle while the CLI service is being resolved. Consumers
// await the first outcome through `connection`, so nothing observes the service before it exists.
export const make = Effect.fn("BackgroundServiceState.make")(function* (options: {
  readonly initial: Effect.Effect<SidecarCredentials.Data, ConnectFailed>
  readonly reconnect: () => Effect.Effect<SidecarCredentials.Data, ConnectFailed>
  /** Production is 30 seconds; a shorter one lets tests cover a hung connect. */
  readonly timeout?: Duration.Input
}) {
  const timeout = options.timeout ?? "30 seconds"
  // Every Exit is an Effect, so the latest resolution replays directly for each consumer.
  const current = yield* Ref.make<Exit.Exit<SidecarCredentials.Data, ConnectFailed> | undefined>(undefined)
  const failure = yield* Ref.make<ConnectFailure | undefined>(undefined)
  const first = yield* Deferred.make<void>()
  // The deferred a reconnect in flight resolves for every caller that joined it.
  const inFlight = yield* Ref.make<Option.Option<Deferred.Deferred<SidecarCredentials.Data, ConnectFailed>>>(
    Option.none(),
  )

  yield* options.initial.pipe(
    Effect.tapError((error) => Ref.set(failure, error.failure)),
    Effect.exit,
    Effect.flatMap((exit) => Ref.set(current, exit)),
    Effect.ensuring(Deferred.succeed(first, undefined)),
    Effect.forkScoped,
  )

  const reconnect = Effect.gen(function* () {
    const running = yield* Ref.get(inFlight)

    if (Option.isSome(running)) return yield* Deferred.await(running.value)
    const deferred = yield* Deferred.make<SidecarCredentials.Data, ConnectFailed>()
    yield* Ref.set(inFlight, Option.some(deferred))
    let settled = false

    // The first caller owns the connect; everyone who joined waits on its deferred instead of
    // starting a second CLI. Running it inline also keeps the effect free of a scoped fiber.
    const result = yield* options.reconnect().pipe(
      Effect.timeoutOrElse({
        duration: timeout,
        orElse: () => Effect.fail(new ConnectFailed("timeout")),
      }),
      // A failed reconnect keeps the previous success reachable while it is still healthy.
      Effect.tap((next) =>
        Effect.all([Ref.set(current, Exit.succeed(next)), Ref.set(failure, undefined)]),
      ),
      Effect.tapError((error) => Ref.set(failure, error.failure)),
      Effect.exit,
      Effect.tap(() =>
        Effect.sync(() => {
          settled = true
        }),
      ),
      // If that caller is interrupted, waiters must fail instead of waiting on a dead connect.
      Effect.ensuring(
        Effect.suspend(() =>
          settled
            ? Effect.void
            : Ref.set(inFlight, Option.none()).pipe(
                Effect.flatMap(() => Deferred.fail(deferred, new ConnectFailed("unknown"))),
              ),
        ),
      ),
    )

    yield* Deferred.done(deferred, result)
    yield* Ref.set(inFlight, Option.none())

    return yield* result
  })

  return {
    connection: Deferred.await(first).pipe(
      Effect.flatMap(() => Ref.get(current)),
      Effect.flatMap((exit) => exit ?? Exit.die(new Error("background service connect did not resolve"))),
    ),
    reconnect,
    failure: Ref.get(failure),
  }
})
