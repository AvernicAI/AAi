import os from "node:os"
import path from "node:path"
import { Schema } from "effect"
import type { Plugin } from "@opencode/plugin/gui/main"
import { Installed, PackageInstall, SkillLibrary } from "./contract"

const setup: Plugin.MainSetup = (ctx) => {
  const installed = ctx.storage.store("installed", { schema: Schema.Array(Installed), initial: [] })
  const plugins = ctx.storage.store("packages", { schema: Schema.Array(PackageInstall), initial: [] })

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
    remove: async (input) => {
      check(input.server)
      const item = installed.value.find((item) => item.id === input.id)

      if (!item) throw new Error("Installed skill was not found")
      const { removeSkill } = await import("./library")
      await removeSkill(root, item)
      await installed.update((items) => {
        const index = items.findIndex((item) => item.id === input.id)

        if (index >= 0) items.splice(index, 1)
      })

      return [...installed.value]
    },
    packages: async (input) => {
      const { searchPackages } = await import("./packages")

      return searchPackages(input.query, input.page)
    },
    package: async (input) => {
      const { previewPackage } = await import("./packages")

      return previewPackage(input.name, input.version)
    },
    pluginList: () => [...plugins.value],
    pluginInstall: async (input) => {
      check(input.server)

      if (plugins.value.some((item) => item.name === input.name)) throw new Error("packages.duplicate")
      const { previewPackage, configurePlugin } = await import("./packages")
      const detail = await previewPackage(input.name, input.version)

      if (detail.deprecated || !detail.parts.length) throw new Error("packages.unsupported")

      if (ctx.signal.aborted) throw new Error("packages.cancelled")
      const item = { name: detail.name, version: detail.version, enabled: true }
      await configurePlugin(root, item, true)
      await plugins.update((items) => {
        items.push(item)
      })

      return [...plugins.value]
    },
    pluginEnable: async (input) => {
      check(input.server)
      const item = plugins.value.find((item) => item.name === input.name)

      if (!item) throw new Error("packages.missing")
      const { configurePlugin } = await import("./packages")
      await configurePlugin(root, item, input.enabled)
      await plugins.update((items) => {
        const item = items.find((item) => item.name === input.name)

        if (item) item.enabled = input.enabled
      })

      return [...plugins.value]
    },
    pluginRemove: async (input) => {
      check(input.server)
      const item = plugins.value.find((item) => item.name === input.name)

      if (!item) throw new Error("packages.missing")
      const { configurePlugin } = await import("./packages")
      await configurePlugin(root, item, false)
      await plugins.update((items) => {
        const index = items.findIndex((item) => item.name === input.name)

        if (index >= 0) items.splice(index, 1)
      })

      return [...plugins.value]
    },
  })
}

export default setup
