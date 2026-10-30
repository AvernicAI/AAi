import { expect, test } from "bun:test"
import { createHash, generateKeyPairSync, sign, verify } from "node:crypto"
import { signRequest, verifyResponse } from "../../src/plugin/provider/vyce-code"
import { VyceCodePlugin, Device } from "../../src/plugin/provider/vyce-code"
import { Credential } from "@opencode/core/credential"
import { Integration } from "@opencode/core/integration"
import { Plugin } from "@opencode/core/plugin"
import { PluginHost } from "@opencode/core/plugin/host"
import { PluginHooks } from "@opencode/core/plugin/hooks"
import { Model } from "@opencode/core/model"
import { Provider } from "@opencode/core/provider"
import { Agent } from "@opencode/core/agent"
import { Session } from "@opencode/core/session"
import { Deferred, Effect, Schema, Schedule } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http"
import { testEffect } from "../lib/effect"
import { PluginTestLayer } from "./fixture"

const it = testEffect(PluginTestLayer)
const integrationID = Integration.ID.make("vyce-code")
const methodID = Integration.MethodID.make("browser")
const fixture = Effect.gen(function* () {
  const approval = yield* Deferred.make<void>()
  const server = generateKeyPairSync("ed25519")
  const state = {
    authURL: "https://www.vyce-code.com/auth/cli?code=public-code",
    status: "authorized",
    publicKey: "",
    version: "",
    build: "",
    catalog: "wrapped",
    models: ["fixture-model"],
    modelStatus: 200,
  }
  const http = HttpClient.make((request) =>
    Effect.gen(function* () {
      const web = yield* HttpClientRequest.toWeb(request).pipe(Effect.orDie)
      const url = new URL(web.url)
      if (url.pathname === "/api/keys")
        return HttpClientResponse.fromWeb(
          request,
          Response.json({
            algorithm: "ed25519",
            publicKey: server.publicKey.export({ type: "spki", format: "der" }).toString("base64"),
          }),
        )
      if (url.pathname === "/api/auth/cli/init") {
        const input = Schema.decodeUnknownSync(
          Schema.Struct({ devicePublicKey: Schema.String, version: Schema.String, build: Schema.String }),
        )(yield* Effect.promise(() => web.json()))
        Object.assign(state, { publicKey: input.devicePublicKey, version: input.version, build: input.build })
        return HttpClientResponse.fromWeb(
          request,
          Response.json({ code: "private-code", userCode: "public-code", authUrl: state.authURL, expiresIn: 900 }),
        )
      }
      if (url.pathname === "/api/auth/cli/poll") {
        expect(url.searchParams.get("code")).toBe("private-code")
        yield* Deferred.await(approval)
        return HttpClientResponse.fromWeb(
          request,
          Response.json({
            status: state.status,
            token: "fixture-token",
            deviceId: "fixture-device",
            email: "fixture@example.test",
          }),
        )
      }
      if (url.pathname === "/api/status")
        return HttpClientResponse.fromWeb(
          request,
          Response.json({ models: Object.fromEntries(state.models.map((id) => [id, "degraded"])) }),
        )
      if (url.pathname === "/v1/models") {
        const models = state.models.map((id) => ({ id, context_length: 64000 }))
        return HttpClientResponse.fromWeb(
          request,
          Response.json(
            state.modelStatus !== 200
              ? { error: "unavailable" }
              : state.catalog === "array"
                ? models
                : { data: models },
            { status: state.modelStatus },
          ),
        )
      }
      throw new Error(`Unexpected Vyce request ${web.url}`)
    }),
  )
  const plugin = yield* Plugin.Service
  const host = yield* PluginHost.make(plugin)
  yield* VyceCodePlugin.effect(host).pipe(Effect.provideService(HttpClient.HttpClient, http))
  const integrations = yield* Integration.Service
  const credentials = yield* Credential.Service
  const models = yield* Model.Service
  const modelIDs = () =>
    models
      .available()
      .pipe(
        Effect.map((items) => items.filter((item) => item.providerID === "vyce-code").map((item) => String(item.id))),
      )
  const settled = (expected: string[]) =>
    modelIDs().pipe(
      Effect.repeat({
        until: (items) => items.join() === expected.join(),
        schedule: Schedule.spaced("10 millis"),
        times: 300,
      }),
    )
  const complete = (attemptID: Integration.AttemptID) =>
    integrations.oauth.status({ integrationID, attemptID }).pipe(
      Effect.repeat({
        until: (value) => value.status !== "pending",
        schedule: Schedule.spaced("10 millis"),
        times: 300,
      }),
    )
  return { integrations, credentials, state, approval, complete, settled }
})

for (const catalog of ["wrapped", "array", "status"]) {
  it.live(`Vyce models become available after connecting with ${catalog} discovery`, () =>
    Effect.gen(function* () {
      const target = yield* fixture
      target.state.catalog = catalog
      target.state.modelStatus = catalog === "status" ? 404 : 200
      yield* target.integrations.connection.key({ integrationID, key: "fixture-key" })
      expect(yield* target.settled(["fixture-model"])).toEqual(["fixture-model"])
      const second = yield* target.credentials.create({
        integrationID,
        value: Credential.Key.make({ type: "key", key: "second-key" }),
        activate: false,
      })
      target.state.models = ["second-model"]
      yield* target.credentials.activate(second.id)
      expect(yield* target.settled(["second-model"])).toEqual(["second-model"])
      yield* target.credentials.remove(second.id)
      yield* Effect.forEach(yield* target.credentials.list(integrationID), (credential) =>
        target.credentials.remove(credential.id),
      )
      expect(yield* target.settled([])).toEqual([])
    }),
  )
}

it.live("a rejected Vyce build explains the provider restriction without consuming the error response", () =>
  Effect.gen(function* () {
    yield* fixture
    const hooks = yield* PluginHooks.Service
    const response = Response.json({ error: { code: "unsupported_build" } }, { status: 426 })
    const result = yield* hooks
      .trigger("session", "http.response", {
        sessionID: Session.ID.make("ses_vyce_build"),
        agent: Agent.ID.make("build"),
        model: Model.Ref.make({ providerID: Provider.ID.make("vyce-code"), id: Model.ID.make("fixture-model") }),
        kind: "primary",
        request: new Request("https://www.vyce-code.com/v1/chat/completions"),
        response,
      })
      .pipe(Effect.exit)
    expect(result._tag).toBe("Failure")
    expect(String(result)).toContain("Vyce must approve AAi")
    expect(response.bodyUsed).toBe(false)
  }),
)

it.live(
  "browser approval stores a unique AAi device credential and leaves the previous connection active until approval",
  () =>
    Effect.gen(function* () {
      const target = yield* fixture
      expect((yield* target.integrations.get(integrationID))?.methods[0]).toEqual({
        type: "oauth",
        id: methodID,
        label: "Sign in with Vyce Code",
      })
      yield* target.integrations.connection.key({ integrationID, key: "previous-key" })
      const previous = yield* target.integrations.connection.active(integrationID)
      const attempt = yield* target.integrations.oauth.connect({ integrationID, methodID })
      expect(attempt.url).toBe(target.state.authURL)
      expect(yield* target.integrations.connection.active(integrationID)).toEqual(previous)
      yield* Deferred.succeed(target.approval, undefined)
      expect((yield* target.complete(attempt.attemptID)).status).toBe("complete")
      const connection = yield* target.integrations.connection.active(integrationID)
      if (!connection) throw new Error("Missing authorized Vyce connection")
      const value = yield* target.integrations.connection.resolve(connection)
      if (value?.type !== "oauth") throw new Error("Expected an OAuth credential")
      expect(value.access).toBe("fixture-token")
      expect(yield* target.settled(["fixture-model"])).toEqual(["fixture-model"])
      const device = Schema.decodeUnknownSync(Device)(value.metadata)
      expect(device.deviceId).toBe("fixture-device")
      expect(device.build).toStartWith("aai-")
      const request = new Request("https://www.vyce-code.com/v1/chat/completions", { method: "POST" })
      signRequest(request, device, new Uint8Array(), 123456789)
      const canonical = [
        "VYCE1",
        "POST",
        "/v1/chat/completions",
        "123456789",
        request.headers.get("x-vyce-nonce"),
        createHash("sha256").update("").digest("hex"),
        "main",
        device.version,
        device.build,
      ].join("\n")
      expect(
        verify(
          null,
          Buffer.from(canonical),
          { key: Buffer.from(target.state.publicKey, "base64"), type: "spki", format: "der" },
          Buffer.from(request.headers.get("x-vyce-sig") ?? "", "base64url"),
        ),
      ).toBe(true)
    }),
)

it.live("declining browser approval does not store an OAuth credential", () =>
  Effect.gen(function* () {
    const target = yield* fixture
    target.state.status = "denied"
    const attempt = yield* target.integrations.oauth.connect({ integrationID, methodID })
    yield* Deferred.succeed(target.approval, undefined)
    expect((yield* target.complete(attempt.attemptID)).status).not.toBe("complete")
    expect(yield* target.credentials.list(integrationID)).toHaveLength(0)
  }),
)

it.live("rejects a browser approval URL outside the Vyce issuer", () =>
  Effect.gen(function* () {
    const target = yield* fixture
    target.state.authURL = "https://example.test/auth/cli"
    const result = yield* target.integrations.oauth.connect({ integrationID, methodID }).pipe(Effect.result)
    expect(result._tag).toBe("Failure")
    expect(yield* target.credentials.list(integrationID)).toHaveLength(0)
  }),
)

test("Vyce device signatures bind the method, path, body, nonce and AAi identity", () => {
  const keys = generateKeyPairSync("ed25519")
  const server = generateKeyPairSync("ed25519")
  const device = {
    deviceId: "device-fixture",
    privateKey: keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    machine: "fixture-machine",
    version: "2.2.2",
    build: "aai-2.2.2",
    serverKey: server.publicKey.export({ type: "spki", format: "der" }).toString("base64"),
  }
  const body = new TextEncoder().encode('{"model":"fixture","stream":true}')
  const request = new Request("https://www.vyce-code.com/v1/chat/completions", { method: "POST", body })
  signRequest(request, device, body, 123456789)
  const canonical = [
    "VYCE1",
    "POST",
    "/v1/chat/completions",
    "123456789",
    request.headers.get("x-vyce-nonce"),
    createHash("sha256").update(body).digest("hex"),
    "main",
    "2.2.2",
    "aai-2.2.2",
  ].join("\n")
  expect(request.headers.get("x-vyce-device")).toBe("device-fixture")
  expect(
    verify(
      null,
      Buffer.from(canonical),
      keys.publicKey,
      Buffer.from(request.headers.get("x-vyce-sig") ?? "", "base64url"),
    ),
  ).toBe(true)
  expect(
    verify(
      null,
      Buffer.from(canonical.replace("POST", "GET")),
      keys.publicKey,
      Buffer.from(request.headers.get("x-vyce-sig") ?? "", "base64url"),
    ),
  ).toBe(false)
  const next = new Request(request)
  signRequest(next, device, body, 123456789)
  expect(next.headers.get("x-vyce-nonce")).not.toBe(request.headers.get("x-vyce-nonce"))
})

test("Vyce response verification rejects another request's response, stale timestamps and missing signatures", () => {
  const server = generateKeyPairSync("ed25519")
  const key = server.publicKey.export({ type: "spki", format: "der" }).toString("base64")
  const request = new Request("https://www.vyce-code.com/v1/chat/completions", {
    headers: { "x-vyce-nonce": "nonce-fixture" },
  })
  const response = new Response("", {
    headers: {
      "x-vyce-server-ts": "1000000",
      "x-vyce-server-sig": sign(null, Buffer.from("VYCE1R\nnonce-fixture\n200\n1000000"), server.privateKey).toString(
        "base64url",
      ),
    },
  })
  expect(verifyResponse(request, response, key, 1000000)).toBe(true)
  expect(verifyResponse(request, response, key, 1500000)).toBe(false)
  expect(
    verifyResponse(new Request(request.url, { headers: { "x-vyce-nonce": "other-nonce" } }), response, key, 1000000),
  ).toBe(false)
  expect(verifyResponse(request, new Response(""), key, 1000000)).toBe(false)
})
