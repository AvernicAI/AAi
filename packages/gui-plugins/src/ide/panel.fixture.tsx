import { Slot, type MountedSession, type SessionScreen, type SetupContext } from "@opencode/plugin/gui"
import { createComponent, onCleanup } from "solid-js"
import definition from "./index"
import WorkspacePanel from "./panel"
import type { WorkspaceClient } from "./model"
import type { BuiltinDesktop } from "@opencode/plugin/gui/builtin"
import type { Entry } from "@opencode/plugin/gui/host"
import type { TaskUpdate } from "./contract"
import css from "./styles.css?inline"

export function createIdeFixture() {
  const attached: string[] = []
  const runs: string[] = []
  const commands: string[] = []
  const terminal = { enabled: true }
  const listeners = new Set<(value: typeof TaskUpdate.Type & { binding: string }) => void>()

  const documents = new Map([
    ["src/main.ts", "export const answer = 42\n\nconsole.log(answer)\n"],
    ["README.md", "# Alpha workspace\n"],
  ])

  const unavailable = async () => {
    throw new Error("This fixture does not provide that OS action")
  }

  const client: WorkspaceClient = {
    open: async () => ({ binding: "workspace", root: "B:/alpha" }),
    close: async () => {},
    files: async () => ({ paths: [...documents.keys()], truncated: false }),
    list: async (input) =>
      input.path === "src"
        ? [{ path: "src/main.ts", directory: false }]
        : [
            { path: "src", directory: true },
            { path: "README.md", directory: false },
          ],
    read: async (input) => ({ path: input.path, text: documents.get(input.path) ?? "", version: "fixture" }),
    save: async (input) => {
      documents.set(input.path, input.text)

      return { path: input.path, text: input.text, version: "saved" }
    },
    git: async () => ({ branch: "dev", changes: [{ path: "src/main.ts", index: " ", worktree: "M" }] }),
    on: (name, callback) => {
      if (name !== "task") return () => {}

      // SAFETY: the checked event name fixes the callback's schema to TaskUpdate with its binding.
      const listener = callback as (value: typeof TaskUpdate.Type & { binding: string }) => void
      listeners.add(listener)

      return () => {
        listeners.delete(listener)
      }
    },
    state: () => undefined,
    readImage: unavailable,
    create: unavailable,
    renameFile: unavailable,
    trash: unavailable,
    search: async () => ({ matches: [], truncated: false }),
    diff: unavailable,
    compare: async (input) => ({
      before: "export const answer = 41\n",
      after: input.staged ? "export const answer = 43\n" : (documents.get(input.path) ?? ""),
    }),
    tasks: async () => [{ name: "test", command: "npm run test", script: "vitest run" }],
    taskRun: async (input) => {
      runs.push(documents.get("src/main.ts") ?? "")
      listeners.forEach((listener) =>
        listener({
          binding: "workspace",
          id: "task",
          command: input.command,
          status: "completed",
          code: 0,
          text: "Project checks passed\n",
        }),
      )

      return "task"
    },
    taskStop: async () => {},
    stage: unavailable,
    commit: unavailable,
    languageStart: unavailable,
    languageStop: unavailable,
    document: async () => {},
    complete: async () => [],
    hover: async () => "",
    locations: async () => [],
    format: async () => [],
    rename: async () => [],
    debugStart: unavailable,
    debugRequest: unavailable,
    debugStop: unavailable,
  }

  // SAFETY: WorkspacePanel reads this local server's id/local flag and workspace directory only.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- checked panel boundary above
  const session = { server: { id: "local", local: true }, directory: "B:/alpha" } as unknown as MountedSession

  // SAFETY: The editor only uses composer.attach, whose received file path is recorded here.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- checked composer boundary above
  const screen = {
    composer: { attach: (input: { path: string }) => attached.push(input.path) },
  } as unknown as SessionScreen

  const entry: Entry = {
    ...definition,
    id: "ide",
    windowEntry: async () => ({
      default: (ctx: SetupContext<typeof definition>) => {
        // This isolated host mounts contributions without the app's stylesheet renderer.
        const style = window.document.createElement("style")
        style.textContent = css
        window.document.head.append(style)
        onCleanup(() => style.remove())
        ctx.add(Slot, { at: "window.bottom", render: () => createComponent(WorkspacePanel, { session, screen }) })
      },
    }),
  }

  const desktop: BuiltinDesktop = {
    os: "windows",
    zoom: () => 1,
    forceFocus: async () => {},
    launch: unavailable,
    reveal: async () => false,
    installed: async () => false,
    pick: async () => [],
  }

  return {
    entry,
    desktop,
    client,
    attached,
    runs,
    commands: {
      run: (id: string) => {
        commands.push(id)

        return terminal.enabled && id === "terminal.toggle"
      },
    },
    invoked: () => commands,
    disableTerminal: () => {
      terminal.enabled = false
    },
    document: (path: string) => documents.get(path),
  }
}
