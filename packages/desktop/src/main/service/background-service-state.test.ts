import { expect, test } from "bun:test"
import { Deferred, Effect, Fiber } from "effect"
import { BackgroundServiceState } from "./background-service-state"
import { ConnectFailed } from "./connect-retry"

const initial = { url: "http://127.0.0.1:4100", password: "first" }

test("new consumers receive the latest reconnected service", async () => {
  const replacement = { url: "http://127.0.0.1:4200", password: "second" }

  const service = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const state = yield* BackgroundServiceState.make({
          initial: Effect.succeed(initial),
          reconnect: () => Effect.succeed(replacement),
        })

        expect(yield* state.connection).toEqual(initial)
        expect(yield* state.reconnect).toEqual(replacement)

        return yield* state.connection
      }),
    ),
  )

  expect(service).toEqual(replacement)
})

test("the state is ready before the initial connect finishes and consumers wait for it", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const gate = yield* Deferred.make<void>()

        const state = yield* BackgroundServiceState.make({
          initial: Deferred.await(gate).pipe(Effect.as(initial)),
          reconnect: () => Effect.succeed(initial),
        })

        const consumer = yield* Effect.forkChild(state.connection)
        yield* Effect.sleep("10 millis")
        expect(consumer.pollUnsafe()).toBeUndefined()
        yield* Deferred.succeed(gate, undefined)
        expect(yield* Fiber.join(consumer)).toEqual(initial)
      }),
    ),
  )
})

test("a failed initial connect fails consumers and keeps the reason", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const state = yield* BackgroundServiceState.make({
          initial: Effect.fail(new ConnectFailed("cli-missing")),
          reconnect: () => Effect.succeed(initial),
        })

        expect((yield* state.connection.pipe(Effect.exit))._tag).toBe("Failure")
        expect(yield* state.failure).toBe("cli-missing")
        expect(yield* state.reconnect).toEqual(initial)
      }),
    ),
  )
})

test("two concurrent reconnects share one connect", async () => {
  let connects = 0

  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const state = yield* BackgroundServiceState.make({
          initial: Effect.succeed(initial),
          reconnect: () =>
            Effect.suspend(() => {
              connects += 1

              return Effect.sleep("20 millis").pipe(Effect.as({ url: "http://127.0.0.1:4300", password: "next" }))
            }),
        })

        yield* state.connection
        const first = yield* Effect.forkChild(state.reconnect)
        yield* Effect.sleep("5 millis")
        const second = yield* Effect.forkChild(state.reconnect)
        const [left, right] = yield* Effect.all([Fiber.join(first), Fiber.join(second)])

        expect(left).toEqual(right)
      }),
    ),
  )

  expect(connects).toBe(1)
})

test("a failed reconnect keeps the previous good service reachable", async () => {
  const failure = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const state = yield* BackgroundServiceState.make({
          initial: Effect.succeed(initial),
          reconnect: () => Effect.fail(new ConnectFailed("unknown")),
        })

        expect(yield* state.connection).toEqual(initial)
        expect(yield* Effect.flip(state.reconnect)).toBeInstanceOf(ConnectFailed)
        expect(yield* state.connection).toEqual(initial)

        return yield* state.failure
      }),
    ),
  )

  expect(failure).toBe("unknown")
})

test("a hung reconnect fails with a typed timeout", async () => {
  const result = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const state = yield* BackgroundServiceState.make({
          initial: Effect.succeed(initial),
          reconnect: () => Effect.never,
          timeout: "10 millis",
        })

        const error = yield* Effect.flip(state.reconnect)

        return { error, failure: yield* state.failure }
      }),
    ),
  )

  expect(result.error).toBeInstanceOf(ConnectFailed)
  expect(result.error.failure).toBe("timeout")
  expect(result.failure).toBe("timeout")
})
