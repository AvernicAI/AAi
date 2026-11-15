import { For, Show, createMemo, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { createKeyed, usePanel, usePlugin, type MountedSession } from "@opencode/plugin/gui"
import { Button } from "@opencode/ui/button"
import { showToast } from "@opencode/ui/toast"
import { Option, Schema } from "effect"

const ShellCall = Schema.Struct({ command: Schema.String })

const ShellMetadata = Schema.Struct({ shellID: Schema.optional(Schema.String), status: Schema.optional(Schema.String) })

const decodeCall = Schema.decodeUnknownOption(ShellCall)

const decodeMetadata = Schema.decodeUnknownOption(ShellMetadata)

type RefreshTimer = { value?: ReturnType<typeof setTimeout> }

/** A view of existing shell executions, not a second shell or another command runner. */
export default function AgentCommands(props: { session: MountedSession }) {
  const ctx = usePlugin()
  const panel = usePanel()

  const history = createMemo(() =>
    props.session.server.data.session.message
      .list(props.session.id)
      .flatMap((message) => {
        if (message.type === "shell")
          return [
            {
              id: message.shellID,
              shell: message.shellID,
              command: message.command,
              running: message.status === "running",
              output: message.output?.output ?? "",
            },
          ]

        if (message.type !== "assistant") return []

        return message.content.flatMap((part) => {
          if (part.type !== "tool" || part.name !== "shell" || part.state.status === "streaming") return []
          const decoded = decodeCall(part.state.input)

          if (Option.isNone(decoded)) return []
          const metadata = decodeMetadata(part.state.metadata ?? {})
          const shell = Option.isSome(metadata) ? metadata.value.shellID : undefined
          const execution = shell ? props.session.server.data.shell.get(shell) : undefined

          const output =
            part.state.status === "completed" || part.state.status === "error"
              ? (part.state.content?.flatMap((item) => (item.type === "text" ? [item.text] : [])).join("\n") ?? "")
              : ""

          return [
            {
              id: shell ?? part.id,
              shell,
              command: decoded.value.command,
              running: execution
                ? execution.status === "running"
                : part.state.status === "running" || part.state.metadata?.status === "running",
              output,
            },
          ]
        })
      })
      .slice(-30),
  )

  const [store, setStore] = createStore<{ output: Record<string, string>; error: string }>({ output: {}, error: "" })

  const commands = createMemo(() => {
    const shells = props.session.server.data.shell
      .listBySession(props.session.id)
      .map((execution) => ({
        id: execution.id,
        shell: execution.id,
        command: execution.command,
        running: execution.status === "running",
        output: "",
      }))

    const ids = new Set(shells.map((execution) => execution.id))

    return [...history().filter((execution) => !ids.has(execution.id)), ...shells].slice(-30)
  })

  createKeyed(
    () => (panel.visible() ? props.session.key : undefined),
    () => {
      void props.session.server.data.shell
        .sync({ directory: props.session.directory })
        .catch((cause: unknown) =>
          showToast({
            title: ctx.t("agent.title"),
            variant: "error",
            description: cause instanceof Error ? cause.message : String(cause),
          }),
        )
    },
  )

  // While visible, reads the same server-owned output file. It never starts or replays a command.
  createKeyed(
    () =>
      panel.visible()
        ? `${props.session.key}:${commands()
            .filter((command) => command.shell)
            .map((command) => `${command.id}:${command.running}`)
            .join(",")}`
        : undefined,
    () => {
      const controller = new AbortController()
      const session = props.session
      const active = commands().filter((command) => command.shell)

      const poll = async () => {
        await Promise.all(
          active.map(async (command) => {
            if (!("shell" in command) || !command.shell) return
            await session.server.client.shell
              .output(
                { id: command.shell, location: { directory: session.directory }, limit: 65536 },
                { signal: controller.signal },
              )
              .then(
                (result) => {
                  if (!controller.signal.aborted) setStore("output", command.id, result.data.output)
                },
                (cause: unknown) => {
                  if (!controller.signal.aborted)
                    setStore("error", cause instanceof Error ? cause.message : String(cause))
                },
              )
          }),
        )

        if (!controller.signal.aborted && active.some((command) => command.running))
          timer.value = setTimeout(() => void poll(), 1000)
      }

      const timer: RefreshTimer = {}
      void poll()
      onCleanup(() => {
        controller.abort()
        clearTimeout(timer.value)
      })
    },
  )

  return (
    <section class="flex flex-col h-full min-h-0 p-3 gap-3" aria-label={ctx.t("agent.title")}>
      <div class="flex items-center justify-between">
        <strong>{ctx.t("agent.title")}</strong>
        <Button size="small" variant="ghost" onClick={() => ctx.commands.run("terminal.toggle")}>
          {ctx.t("agent.interactive")}
        </Button>
      </div>
      <Show when={store.error}>
        <p role="alert">{store.error}</p>
      </Show>
      <div class="overflow-auto flex-1 min-h-0" style={{ "font-family": ctx.appearance.font("mono") }}>
        <For each={commands()} fallback={<p>{ctx.t("agent.empty")}</p>}>
          {(command) => (
            <article class="mb-4">
              <div class="flex items-center gap-2">
                <code>$ {command.command}</code>
                <Show when={command.running}>
                  <span role="status">{ctx.t("agent.running")}</span>
                </Show>
              </div>
              <pre class="whitespace-pre-wrap break-words text-12-regular leading-5 select-text">
                {store.output[command.id] || command.output || ""}
              </pre>
              <Show when={"shell" in command && command.shell && command.running}>
                <Button
                  size="small"
                  variant="ghost"
                  onClick={() => {
                    if (!("shell" in command) || !command.shell) return
                    void props.session.server.client.shell
                      .remove({ id: command.shell, location: { directory: props.session.directory } })
                      .catch((cause: unknown) =>
                        showToast({
                          title: ctx.t("agent.title"),
                          variant: "error",
                          description: cause instanceof Error ? cause.message : String(cause),
                        }),
                      )
                  }}
                >
                  {ctx.t("agent.stop")}
                </Button>
              </Show>
            </article>
          )}
        </For>
      </div>
    </section>
  )
}
