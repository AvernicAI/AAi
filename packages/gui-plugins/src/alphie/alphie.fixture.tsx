import { createStore } from "solid-js/store"
import type { SessionInfo, SessionMessageInfo, ShellInfo } from "@opencode/client/promise"
import { Slot, createKeyed, type MountedSession, type SessionScreen, type SetupContext } from "@opencode/plugin/gui"
import type { Data } from "@opencode/client/solid"
import type { Entry } from "@opencode/plugin/gui/host"
import { Alphie } from "./contract"
import definition from "./index"
import renderer from "./renderer"
import { IdeEditor } from "../ide/contract"
import { AgentTerminal } from "../terminal/contract"
import css from "./styles.css?inline"

export function createAlphieFixture() {
  const [store, setStore] = createStore<{
    busy: boolean
    messages: SessionMessageInfo[]
    info: SessionInfo
    shells: ShellInfo[]
  }>({
    busy: false,
    messages: [],
    shells: [],
    info: {
      id: "ses_alphie",
      projectID: "project",
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      time: { created: 1, updated: 1 },
      location: { directory: "B:/alpha" },
    },
  })

  const revealed: string[] = []
  const opened: string[] = []

  const data = {
    shell: { listBySession: () => store.shells },
    session: {
      status: () => (store.busy ? "running" : "idle"),
      get: () => store.info,
      message: { list: () => store.messages },
      permission: { list: () => [] },
    },
  }

  // SAFETY: Alphie reads precisely the Data methods above; this fixture never calls the server client.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- checked fixture boundary described above
  const serverData = data as unknown as Data
  // SAFETY: no fixture action invokes server APIs; navigation is captured by the IDE and terminal contracts below.
  const server = { id: "local", connected: true, local: true, data: serverData } as MountedSession["server"]

  const session: MountedSession = {
    key: "local\nses_alphie",
    id: "ses_alphie",
    tab: "ses_alphie",
    server,
    pending: false,
    location: { directory: "B:/alpha" },
    visit: {},
    directory: "B:/alpha",
    project: undefined,
    listedProject: undefined,
    local: true,
    background: [],
  }

  // SAFETY: only composer.focus/focused are called by the production companion in this fixture.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- checked fixture boundary described above
  const screen = {
    composer: {
      focus: () => {
        opened.push("chat")
      },
      focused: () => document.activeElement?.getAttribute("aria-label") === "Chat input",
    },
  } as unknown as SessionScreen

  const entries: Entry[] = [
    { id: "alphie", ...definition, windowEntry: async () => ({ default: renderer }) },
    {
      id: "ide",
      windowEntry: async () => ({
        default: (ctx: SetupContext<typeof definition>) => {
          ctx.provide(IdeEditor, {
            reveal: (request) => {
              revealed.push(request.path)
            },
            pending: () => undefined,
          })
        },
      }),
    },
    {
      id: "terminal",
      windowEntry: async () => ({
        default: (ctx: SetupContext<typeof definition>) => {
          ctx.provide(AgentTerminal, {
            open: () => {
              opened.push("terminal")
            },
          })
        },
      }),
    },
    {
      id: "probe",
      windowEntry: async () => ({
        default: (ctx: SetupContext<typeof definition>) => {
          const alphie = ctx.use(Alphie)
          createKeyed(alphie, () => {
            const style = document.createElement("style")
            style.textContent = css
            document.head.append(style)
            ctx.signal.addEventListener("abort", () => style.remove(), { once: true })
          })
          ctx.add(Slot, {
            at: "window.bottom",
            render: () => {
              const value = () => {
                const service = alphie()

                return service.status === "active" ? service.value.snapshot() : undefined
              }

              return (
                <>
                  <output data-testid="shared-state">{value()?.pose}</output>
                  <input aria-label="Chat input" />
                </>
              )
            },
          })
        },
      }),
    },
  ]

  return {
    entries,
    sessions: { current: () => session, list: () => [session] },
    screen: { current: () => screen },
    revealed,
    opened,
    run(name: string, status: "running" | "completed" = "running") {
      setStore("info", "time", "busy", Date.now())
      setStore("busy", true)
      setStore("messages", [
        {
          id: "message",
          type: "assistant",
          agent: "build",
          model: { providerID: "test", id: "test" },
          time: { created: 2 },
          content: [
            {
              type: "tool",
              id: name,
              name,
              time: { created: 2 },
              state:
                status === "running"
                  ? { status, input: { path: "hello.js", command: "node hello.js" }, metadata: {} }
                  : { status, input: { path: "hello.js" }, content: [{ type: "text", text: "Written" }] },
            },
          ],
        },
      ])
    },
    nested(name: string, status: "running" | "completed" = "running") {
      setStore("busy", true)
      setStore("messages", [
        {
          id: "nested-message",
          type: "assistant",
          agent: "build",
          model: { providerID: "test", id: "test" },
          time: { created: 3 },
          content: [
            {
              type: "tool",
              id: "execute",
              name: "execute",
              time: { created: 3 },
              state: {
                status: "running",
                input: { code: "await tools.write(...)" },
                metadata: {
                  toolCalls: [{ tool: name, status, input: { path: "nested.js", command: "node nested.js" } }],
                },
              },
            },
          ],
        },
      ])
    },
    failedCommand() {
      setStore("shells", [
        {
          id: "shell-failed",
          status: "exited",
          command: "node missing.js",
          cwd: "B:/alpha",
          shell: "powershell",
          file: "output",
          exit: 1,
          metadata: {},
          time: { started: store.info.time.busy ?? 0, completed: Date.now() },
        },
      ])
    },
    finish(outcome: "succeeded" | "failed" | "interrupted") {
      setStore("busy", false)
      setStore("info", { outcome, time: { ...store.info.time, idle: Date.now() } })
    },
  }
}
