import { describe, expect, test } from "bun:test"
import type { IntegrationInfo } from "@opencode/client"
import {
  connectionSummary,
  connectMethods,
  credentialConnections,
  integrationOptions,
} from "../../../../src/component/dialog-integration"

const integration = (value: Partial<IntegrationInfo> & Pick<IntegrationInfo, "id" | "name">): IntegrationInfo => ({
  methods: [],
  connections: [],
  ...value,
})

describe("integrationOptions", () => {
  test("keeps free access, temporary offers, paid, and unverified distinct", () => {
    expect(
      integrationOptions([
        integration({ id: "unknown", name: "Unknown" }),
        integration({ id: "mistral", name: "Mistral" }),
        integration({ id: "cerebras", name: "Cerebras" }),
        integration({ id: "simplellm", name: "SimpleLLM" }),
        integration({ id: "aai-compatible-free-openrouter", name: "Router preset" }),
        integration({ id: "sambanova", name: "SambaNova" }),
      ]).map((item) => item.id),
    ).toEqual(["aai-compatible-free-openrouter", "simplellm", "cerebras", "mistral", "sambanova", "unknown"])
  })

  test("orders pricing groups before priority and name", () => {
    expect(
      integrationOptions([
        integration({ id: "mistral", name: "Mistral" }),
        integration({ id: "openai", name: "OpenAI" }),
        integration({ id: "custom-z", name: "Zebra" }),
        integration({ id: "anthropic", name: "Anthropic" }),
        integration({ id: "opencode", name: "OpenCode Zen" }),
        integration({
          id: "opencode-go",
          name: "OpenCode Go",
          connections: [{ type: "credential", id: "go", label: "Go", method: "key" }],
        }),
      ]).map((item) => item.id),
    ).toEqual(["openai", "anthropic", "mistral", "opencode", "opencode-go", "custom-z"])
  })

  test("keeps MCP integrations above popular integrations without relying on their IDs", () => {
    expect(
      integrationOptions([
        integration({ id: "openai", name: "OpenAI" }),
        integration({ id: "linear", name: "Linear", metadata: { source: "mcp" } }),
        integration({ id: "github", name: "GitHub", metadata: { source: "mcp" } }),
        integration({ id: "opencode", name: "OpenCode Zen" }),
        integration({ id: "opencode-go", name: "OpenCode Go" }),
      ]).map((item) => item.id),
    ).toEqual(["github", "linear", "openai", "opencode", "opencode-go"])
  })

  test("hides OpenCode Go until a Go key is saved", () => {
    expect(
      integrationOptions([
        integration({ id: "opencode", name: "OpenCode Zen" }),
        integration({
          id: "opencode-go",
          name: "OpenCode Go",
          connections: [{ type: "env", name: "OPENCODE_API_KEY" }],
        }),
      ]).map((item) => item.id),
    ).toEqual(["opencode"])
  })
})

describe("connectMethods", () => {
  test("offers key and OAuth methods but not environment discovery", () => {
    expect(
      connectMethods(
        integration({
          id: "example",
          name: "Example",
          methods: [
            { type: "env", names: ["EXAMPLE_KEY"] },
            { type: "key", label: "API key" },
            { type: "oauth", id: "account", label: "Account" },
          ],
        }),
      ).map((method) => method.type),
    ).toEqual(["oauth", "key"])
  })
})

describe("credentialConnections", () => {
  test("returns removable credential connections only", () => {
    expect(
      credentialConnections(
        integration({
          id: "example",
          name: "Example",
          connections: [
            { type: "env", name: "EXAMPLE_KEY" },
            { type: "credential", method: "key", id: "cred_1", label: "Work" },
          ],
        }),
      ),
    ).toEqual([{ type: "credential", method: "key", id: "cred_1", label: "Work" }])
  })
})

describe("connectionSummary", () => {
  test("counts several connections", () => {
    expect(
      connectionSummary(
        integration({
          id: "example",
          name: "Example",
          connections: [
            { type: "credential", method: "key", id: "cred_1", label: "Work" },
            { type: "env", name: "EXAMPLE_KEY" },
          ],
        }),
      ),
    ).toBe("2 connections")
  })
})
