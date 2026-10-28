#!/usr/bin/env bun
import { $ } from "bun"
import { copyFile } from "node:fs/promises"

import { copyBuiltCliToResources, downloadCliToResources, resolveChannel, windowsify } from "./utils"

const channel = resolveChannel()

if (channel === "prod" && !Bun.env.OPENCODE_CLI_DIST) {
  throw new Error("OPENCODE_CLI_DIST is required for production desktop builds")
}

await $`bun ./scripts/copy-icons.ts ${channel}`

await $`bun ./scripts/copy-metainfo.ts ${channel}`

if (Bun.env.OPENCODE_CLI_DIST) {
  await copyBuiltCliToResources(Bun.env.OPENCODE_CLI_DIST)
}

if (channel === "dev" && !Bun.env.OPENCODE_CLI_DIST) await downloadCliToResources()

if (channel === "beta" && !Bun.env.OPENCODE_CLI_DIST) await downloadCliToResources("beta")

if (channel === "dev") await copyFile(windowsify("resources/opencode-cli"), windowsify("resources/opencode-cli-dev"))
