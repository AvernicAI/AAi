import { expect, test } from "bun:test"
import { parseMcpImport } from "./mcp-import"

test("imports conventional MCP blocks without shell splitting or starting their servers", () => {
  const servers = parseMcpImport(
    JSON.stringify({
      mcpServers: {
        Blender: {
          command: "C:\\Program Files\\Runtime\\runtime.exe",
          args: ["server.js", "a project with spaces"],
          env: { TOKEN: "value=with=equals" },
        },
        remote: { url: "https://example.com/mcp", headers: { Authorization: "Bearer example" }, disabled: false },
      },
    }),
    "",
  )

  expect(servers.Blender).toMatchObject({
    type: "local",
    command: ["C:\\Program Files\\Runtime\\runtime.exe", "server.js", "a project with spaces"],
    environment: { TOKEN: "value=with=equals" },
    disabled: true,
  })
  expect(servers.remote).toMatchObject({
    type: "remote",
    url: "https://example.com/mcp",
    headers: { Authorization: "Bearer example" },
    disabled: true,
  })
})

test("imports native AAi and unnamed single entries while preserving advanced MCP options", () => {
  expect(
    parseMcpImport(
      JSON.stringify({
        mcp: {
          servers: {
            native: {
              type: "local",
              command: ["uvx", "package"],
              codemode: false,
              timeout: { startup: 5000 },
              protocol: "auto",
            },
          },
        },
      }),
      "",
    ).native,
  ).toMatchObject({
    command: ["uvx", "package"],
    codemode: false,
    timeout: { startup: 5000 },
    protocol: "auto",
    disabled: true,
  })
  expect(
    parseMcpImport('{"url":"http://localhost:3000/mcp","oauth":false}', "local-endpoint")["local-endpoint"],
  ).toMatchObject({ type: "remote", oauth: false, disabled: true })
})

test("rejects malformed imports, missing names, unsupported URLs and empty commands", () => {
  for (const text of [
    "not JSON",
    '{"mcpServers":{}}',
    '{"url":"file:///secret"}',
    '{"command":[]}',
    '{"mcpServers":{" ":{"command":"npx"}}}',
  ]) {
    expect(() => parseMcpImport(text, "")).toThrow()
  }
})
