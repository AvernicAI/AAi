export * as VyceCode from "./vyce-code.js"

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  sign,
  verify,
} from "node:crypto"
import os from "node:os"
import { define } from "@opencode/plugin/effect/plugin"
import { Effect, Option, Schedule, Schema, Stream } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http"
import { Bus } from "../../bus.js"
import { Credential } from "../../credential.js"
import { Integration } from "../../integration.js"
import { Model } from "../../model.js"
import { Provider } from "../../provider.js"

export const origin = "https://www.vyce-code.com"
const providerID = Provider.ID.make("vyce-code")
const integrationID = Integration.ID.make("vyce-code")
const methodID = Integration.MethodID.make("browser")
const Init = Schema.Struct({
  code: Schema.NonEmptyString,
  userCode: Schema.optional(Schema.String),
  authUrl: Schema.NonEmptyString,
  expiresIn: Schema.optional(Schema.Finite),
})
const Poll = Schema.Struct({
  status: Schema.Literals(["pending", "authorized", "denied", "expired", "invalid"]),
  token: Schema.optional(Schema.String),
  deviceId: Schema.optional(Schema.String),
  email: Schema.optional(Schema.String),
})
export const Device = Schema.Struct({
  deviceId: Schema.NonEmptyString,
  privateKey: Schema.NonEmptyString,
  machine: Schema.NonEmptyString,
  version: Schema.NonEmptyString,
  build: Schema.NonEmptyString,
  serverKey: Schema.NonEmptyString,
  email: Schema.optional(Schema.String),
})
export type Device = typeof Device.Type
const Keys = Schema.Struct({ algorithm: Schema.Literal("ed25519"), publicKey: Schema.NonEmptyString })
const RemoteModel = Schema.Struct({
  id: Schema.NonEmptyString,
  name: Schema.optional(Schema.String),
  context_length: Schema.optional(Schema.Finite),
  max_output_tokens: Schema.optional(Schema.Finite),
})
const Models = Schema.Union([Schema.Struct({ data: Schema.Array(RemoteModel) }), Schema.Array(RemoteModel)])
const Status = Schema.Struct({ models: Schema.Record(Schema.String, Schema.String) })
const UnsupportedBuild = Schema.Struct({ error: Schema.Struct({ code: Schema.Literal("unsupported_build") }) })

export const VyceCodePlugin = define({
  id: "aai.provider.vyce-code",
  effect: Effect.fn(function* (ctx) {
    const http = yield* HttpClient.HttpClient
    const bus = yield* Bus.Service
    const loaded: { credential?: Credential.OAuth; device?: Device; models: Model.Info[]; clock: number } = {
      models: [],
      clock: 0,
    }
    const json = <S extends Schema.Top>(request: HttpClientRequest.HttpClientRequest, schema: S) =>
      HttpClient.filterStatusOk(http)
        .execute(request)
        .pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(schema)), Effect.timeout("20 seconds"))

    yield* ctx.integration.transform((editor) => {
      editor.update(integrationID, (item) => {
        item.name = "Vyce Code"
      })
      editor.method.update({
        integrationID,
        method: { type: "oauth", id: methodID, label: "Sign in with Vyce Code" },
        refresh: (value) =>
          Date.now() < value.expires
            ? Effect.succeed(value)
            : Effect.fail(new Error("Vyce Code login expired. Sign in again.")),
        authorize: () =>
          Effect.gen(function* () {
            const keys = generateKeyPairSync("ed25519")
            const version = ctx.app.version
            const build = `aai-${version}`
            const server = yield* json(HttpClientRequest.get(`${origin}/api/keys`), Keys)
            const request = yield* HttpClientRequest.bodyJson(HttpClientRequest.post(`${origin}/api/auth/cli/init`), {
              devicePublicKey: keys.publicKey.export({ type: "spki", format: "der" }).toString("base64"),
              platform: process.platform,
              version,
              build,
            })
            const init = yield* json(request, Init)
            const authorization = new URL(init.authUrl, origin)
            if (authorization.origin !== origin || !authorization.pathname.startsWith("/auth/cli"))
              return yield* Effect.fail(new Error("Vyce returned an unexpected browser approval URL"))
            return {
              mode: "auto" as const,
              url: authorization.href,
              instructions: `Sign in and approve AAi in your browser.${init.userCode ? ` Code: ${init.userCode}.` : ""}`,
              callback: Effect.gen(function* () {
                const deadline = Date.now() + Math.min(Math.max(init.expiresIn ?? 900, 1), 900) * 1000
                while (Date.now() < deadline) {
                  const poll = yield* json(
                    HttpClientRequest.get(`${origin}/api/auth/cli/poll`).pipe(
                      HttpClientRequest.setUrlParam("code", init.code),
                    ),
                    Poll,
                  )
                  if (poll.status === "authorized") {
                    if (!poll.token || !poll.deviceId)
                      return yield* Effect.fail(new Error("Vyce authorization omitted its token or device identity"))
                    return Credential.OAuth.make({
                      type: "oauth",
                      methodID,
                      access: poll.token,
                      refresh: "",
                      expires: 8_640_000_000_000_000,
                      metadata: {
                        deviceId: poll.deviceId,
                        privateKey: keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
                        machine: hash(`AAi|${os.hostname()}|${os.homedir()}|${process.platform}|${process.arch}`).slice(
                          0,
                          32,
                        ),
                        version,
                        build,
                        serverKey: server.publicKey,
                        ...(poll.email ? { email: poll.email } : {}),
                      },
                    })
                  }
                  if (poll.status !== "pending")
                    return yield* Effect.fail(new Error(`Vyce Code authorization ${poll.status}`))
                  yield* Effect.sleep("1500 millis")
                }
                return yield* Effect.fail(new Error("Vyce Code authorization expired. Start sign-in again."))
              }),
            }
          }),
      })
    })

    yield* ctx.integration.transform((editor) => {
      editor.method.update({ integrationID, method: { type: "key", label: "Paste Vyce Code API key" } })
      editor.method.update({ integrationID, method: { type: "env", names: ["VYCE_CODE_API_KEY", "VYCE_API_KEY"] } })
    })
    yield* ctx.provider.transform((editor) =>
      editor.add({
        info: {
          id: providerID,
          name: "Vyce Code",
          activation: "auto",
          integrationID,
          package: "@opencode/ai/providers/openai-compatible",
          settings: { baseURL: `${origin}/v1`, provider: "vyce-code", transport: "http", encoding: "none" },
        },
        models: loaded.models,
      }),
    )

    const load = Effect.fn("VyceCode.load")(function* () {
      const connection = yield* ctx.integration.connection.active(integrationID)
      const value = connection
        ? yield* ctx.integration.connection.resolve(connection).pipe(Effect.orElseSucceed(() => undefined))
        : undefined
      loaded.credential = value?.type === "oauth" ? value : undefined
      loaded.device = Option.getOrUndefined(Schema.decodeUnknownOption(Device)(loaded.credential?.metadata))
      if (!value) {
        loaded.models = []
        yield* ctx.provider.reload()
        return
      }
      const token = value.type === "key" ? value.key : value.type === "oauth" ? value.access : undefined
      if (!token) return
      const request = new Request(`${origin}/v1/models`, { headers: { authorization: `Bearer ${token}` } })
      if (loaded.device) signRequest(request, loaded.device, new Uint8Array(), Date.now() + loaded.clock)
      const result = yield* http
        .execute(
          HttpClientRequest.get(request.url).pipe(HttpClientRequest.setHeaders(Object.fromEntries(request.headers))),
        )
        .pipe(
          Effect.flatMap((response) => {
            // Vyce currently returns 404 for /v1/models; its public status is the advertised model inventory.
            if (response.status === 404 || response.status === 405)
              return json(HttpClientRequest.get(`${origin}/api/status`), Status).pipe(
                Effect.map((status) =>
                  Object.keys(status.models)
                    .filter((id) => id.trim())
                    .map((id): typeof RemoteModel.Type => ({ id })),
                ),
              )
            return HttpClientResponse.filterStatusOk(response).pipe(
              Effect.flatMap(HttpClientResponse.schemaBodyJson(Models)),
              Effect.map((catalog) => ("data" in catalog ? catalog.data : catalog)),
            )
          }),
          Effect.timeout("20 seconds"),
          Effect.catch(() =>
            Effect.logWarning("Vyce Code model discovery failed; the catalog or service may be unavailable").pipe(
              Effect.as(undefined),
            ),
          ),
        )
      loaded.models = (result ?? []).map((item) => ({
        ...Model.Info.default(providerID, Model.ID.make(item.id)),
        name: item.name ?? item.id,
        capabilities: { tools: true, input: ["text"], output: ["text"] },
        limit: {
          context: Math.max(item.context_length ?? 128000, 1),
          output: Math.max(item.max_output_tokens ?? 16384, 1),
        },
      }))
      yield* ctx.provider.reload()
    })
    yield* ctx.session.hook(
      "http.request",
      (event) =>
        Effect.gen(function* () {
          if (!loaded.device) return
          if (new URL(event.request.url).origin !== origin)
            return yield* Effect.die(new Error("Vyce device credentials cannot be sent to a different origin"))
          const body = yield* Effect.promise(() => event.request.clone().arrayBuffer())
          signRequest(event.request, loaded.device, new Uint8Array(body), Date.now() + loaded.clock)
        }),
      { providerID },
    )
    yield* ctx.session.hook(
      "http.response",
      (event) =>
        Effect.gen(function* () {
          if (event.response.status === 426) {
            const body = yield* Effect.tryPromise(() => event.response.clone().json()).pipe(
              Effect.orElseSucceed(() => undefined),
            )
            if (Option.isSome(Schema.decodeUnknownOption(UnsupportedBuild)(body)))
              return yield* Effect.die(
                new Error(
                  "Vyce Code rejected this AAi build (unsupported_build). Sign-in succeeded, but Vyce must approve AAi or provide a supported API access method before this account can run models.",
                ),
              )
          }
          if (!loaded.device) return
          const time = Number(
            event.response.headers.get("x-vyce-server-time") ?? event.response.headers.get("x-vyce-server-ts"),
          )
          if (Number.isFinite(time) && time > 0) loaded.clock = time - Date.now()
          if (!event.response.ok) return
          if (!verifyResponse(event.request, event.response, loaded.device.serverKey, Date.now() + loaded.clock))
            return yield* Effect.die(
              new Error("Vyce Code response signature was not valid. Reconnect the provider before retrying."),
            )
        }),
      { providerID },
    )
    yield* bus.subscribe([Credential.Event.Updated, Credential.Event.Switched]).pipe(
      Stream.runForEach(() => load()),
      Effect.forkScoped({ startImmediately: true }),
    )
    yield* load().pipe(Effect.repeat(Schedule.spaced("10 minutes")), Effect.forkScoped)
  }),
})

export function signRequest(request: Request, device: Device, body: Uint8Array, now: number) {
  const time = String(now)
  const nonce = randomBytes(16).toString("base64url")
  const url = new URL(request.url)
  const canonical = [
    "VYCE1",
    request.method.toUpperCase(),
    url.pathname + url.search,
    time,
    nonce,
    hash(body),
    "main",
    device.version,
    device.build,
  ].join("\n")
  const signature = sign(null, Buffer.from(canonical), createPrivateKey(device.privateKey)).toString("base64url")
  Object.entries({
    "X-Vyce-Device": device.deviceId,
    "X-Vyce-Ts": time,
    "X-Vyce-Nonce": nonce,
    "X-Vyce-Agent": "main",
    "X-Vyce-Version": device.version,
    "X-Vyce-Build": device.build,
    "X-Vyce-Machine": device.machine,
    "X-Vyce-Sig": signature,
  }).forEach(([key, value]) => request.headers.set(key, value))
}

export function verifyResponse(request: Request, response: Response, serverKey: string, now: number) {
  const nonce = request.headers.get("x-vyce-nonce")
  const time = response.headers.get("x-vyce-server-ts")
  const signature = response.headers.get("x-vyce-server-sig")
  if (!nonce || !time || !signature || !Number.isFinite(Number(time)) || Math.abs(now - Number(time)) > 300000)
    return false
  return verify(
    null,
    Buffer.from(["VYCE1R", nonce, response.status, time].join("\n")),
    createPublicKey({ key: Buffer.from(serverKey, "base64"), format: "der", type: "spki" }),
    Buffer.from(signature, "base64url"),
  )
}

function hash(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex")
}
