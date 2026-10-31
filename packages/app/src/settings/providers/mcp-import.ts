import { Schema } from "effect"
import { Mcp } from "@opencode/schema/mcp"

const common = {
  name: Schema.optional(Schema.String),
  disabled: Schema.optional(Schema.Boolean),
  codemode: Schema.optional(Schema.Boolean),
  timeout: Schema.optional(Mcp.TimeoutConfig),
  protocol: Schema.optional(Mcp.Protocol),
}

const Definition = Schema.Union([
  Schema.Struct({
    ...common,
    type: Schema.optional(Schema.Literals(["local", "stdio"])),
    command: Schema.Union([Schema.String, Schema.Array(Schema.String)]),
    args: Schema.optional(Schema.Array(Schema.String)),
    cwd: Schema.optional(Schema.String),
    env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
    environment: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  }),
  Schema.Struct({
    ...common,
    type: Schema.optional(Schema.Literals(["remote", "http", "sse", "streamable-http"])),
    url: Schema.String,
    headers: Schema.optional(Schema.Record(Schema.String, Schema.String)),
    oauth: Schema.optional(Schema.Union([Mcp.OAuthConfig, Schema.Literal(false)])),
  }),
])

const Servers = Schema.Record(Schema.String, Definition)

const decode = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Union([
      Schema.Struct({ mcpServers: Servers }),
      Schema.Struct({ mcp: Schema.Struct({ servers: Servers }) }),
      Definition,
    ]),
  ),
)

export function parseMcpImport(text: string, fallback: string) {
  const value = decode(text)

  const servers =
    "mcpServers" in value
      ? value.mcpServers
      : "mcp" in value
        ? value.mcp.servers
        : { [value.name?.trim() || fallback.trim()]: value }

  if (!Object.keys(servers).length) throw new Error("No MCP servers")

  return Object.fromEntries(
    Object.entries(servers).map(([name, server]) => {
      if (!name.trim() || /[\u0000-\u001f\u007f]/.test(name)) throw new Error("Invalid MCP server name")
      const shared = { disabled: true, codemode: server.codemode, timeout: server.timeout, protocol: server.protocol }

      if ("url" in server) {
        const url = URL.canParse(server.url) ? new URL(server.url) : undefined

        if (!url || !["http:", "https:"].includes(url.protocol) || url.username || url.password)
          throw new Error("Invalid MCP URL")

        return [
          name,
          Schema.decodeUnknownSync(Schema.fromJsonString(Mcp.ServerConfig))(
            JSON.stringify({
              ...shared,
              type: "remote",
              url: url.href,
              headers: server.headers,
              oauth: server.oauth,
            }),
          ),
        ]
      }

      const command = [...(Array.isArray(server.command) ? server.command : [server.command]), ...(server.args ?? [])]

      if (!command.length || !command[0].trim()) throw new Error("Missing MCP command")

      return [
        name,
        Schema.decodeUnknownSync(Schema.fromJsonString(Mcp.ServerConfig))(
          JSON.stringify({
            ...shared,
            type: "local",
            command,
            cwd: server.cwd,
            environment: { ...server.env, ...server.environment },
          }),
        ),
      ]
    }),
  )
}
