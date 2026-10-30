import { expect, test } from "bun:test"
import { fileURLToPath } from "node:url"
import { startAdapter } from "./dap"

test("DAP correlates concurrent replies, decodes UTF-8 frames and settles requests when its process exits", async () => {
  const controller = new AbortController()

  const adapter = startAdapter({
    command: [process.execPath, fileURLToPath(new URL("./dap.fixture.ts", import.meta.url))],
    directory: process.cwd(),
    signal: controller.signal,
    event: () => undefined,
    output: () => undefined,
  })

  try {
    expect(
      await Promise.all([adapter.request("echo", { text: "é😊" }), adapter.request("echo", { number: 2 })]),
    ).toEqual([{ text: "é😊" }, { number: 2 }])
    expect(await adapter.request("fail").catch((error: Error) => error.message)).toBe("rejected")
    expect(await adapter.request("crash").catch((error: Error) => error.message)).toBe("ide.debug.closed")
    expect(await adapter.request("after-exit").catch((error: Error) => error.message)).toBe("ide.debug.closed")
  } finally {
    controller.abort()
    adapter.close()
  }
})
