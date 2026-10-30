import os from "node:os"
import path from "node:path"
import { Schema } from "effect"
import type { Plugin } from "@opencode/plugin/gui/main"
import { Installed, SkillLibrary } from "./contract"

const setup: Plugin.MainSetup = (ctx) => {
  const installed = ctx.storage.store("installed", { schema: Schema.Array(Installed), initial: [] })

  const root = path.resolve(
    process.env.OPENCODE_CONFIG_DIR ??
      path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"), "opencode"),
  )

  const check = (server: string) => {
    if (!ctx.serverEndpoints.get(server)?.sameMachine)
      throw new Error("Skill installation requires a local server on this computer")
  }

  ctx.provide(SkillLibrary, {
    search: async (input) => {
      const { searchCatalog } = await import("./library")

      return searchCatalog(input.catalog, input.query, input.page)
    },
    preview: async (input) => {
      const { previewSkill } = await import("./library")

      return previewSkill(input.catalog, input.slug)
    },
    list: () => [...installed.value],
    install: async (input) => {
      check(input.server)

      if (installed.value.some((item) => item.slug === input.slug && item.catalog === input.catalog.url))
        throw new Error("This skill is already installed")
      const { installSkill } = await import("./library")
      const item = await installSkill(root, input.catalog, input.slug)
      await installed.update((items) => {
        items.push({ ...item, files: [...item.files] })
      })

      return [...installed.value]
    },
    enable: async (input) => {
      check(input.server)
      const item = installed.value.find((item) => item.id === input.id)

      if (!item) throw new Error("Installed skill was not found")
      const { toggleSkill } = await import("./library")
      await toggleSkill(root, item, input.enabled)
      await installed.update((items) => {
        const item = items.find((item) => item.id === input.id)

        if (item) item.enabled = input.enabled
      })

      return [...installed.value]
    },
  })
}

export default setup
