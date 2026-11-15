import { createMemo, lazy, onCleanup, Show, Suspense } from "solid-js"
import { createStore } from "solid-js/store"
import { Command, createKeyed, SettingsPage, Slot, Style, type Plugin } from "@opencode/plugin/gui"
import { Changes } from "@opencode/plugin/gui/review"
import { showToast } from "@opencode/ui/toast"
import { IdeEditor } from "../ide/contract"
import { AgentTerminal } from "../terminal/contract"
import { activity } from "./activity"
import { Alphie, Mate, assets, type Action, type Pose, type Snapshot } from "./contract"
import AlphieMate from "./AlphieMate"
import type definition from "./index"
import css from "./styles.css?inline"

type Transient = {
  now: number
  interacted: number
  typingUntil: number
  native: boolean
  pose: Pose
  until: number
  task: { id: string; status: string; session: string }
}

const setup: Plugin.Setup<typeof definition> = (ctx) => {
  const preferences = ctx.stores.preferences
  const Settings = lazy(() => import("./settings"))
  const mate = ctx.use(Mate)
  const editor = ctx.use(IdeEditor)
  const terminal = ctx.use(AgentTerminal)
  const changes = ctx.use(Changes)

  const [state, setState] = createStore<Transient>({
    now: Date.now(),
    interacted: Date.now(),
    typingUntil: 0,
    native: false,
    pose: "idle",
    until: 0,
    task: { id: "", status: "", session: "" },
  })

  const enabled = () => preferences.value.features.alphieMate
  const current = () => ctx.sessions.current()

  const messages = () => {
    const session = current()

    return session ? session.server.data.session.message.list(session.id) : []
  }

  const work = createMemo(() => activity(messages()))

  const running = () => {
    const session = current()

    return (
      (state.task.status === "running" && state.task.session === session?.key) ||
      (!!session && (session.server.data.session.status(session.id) === "running" || session.background.length > 0))
    )
  }

  const touch = () => setState({ interacted: Date.now(), now: Date.now() })

  const emote = (pose: Pose, duration = 2500) => {
    touch()
    setState({ pose, until: Date.now() + duration })
  }

  const announce = () => {
    if (!enabled()) return
    emote("cheering", 2000)
    showToast({ variant: "success", title: "Alphie", description: ctx.t("success") })
  }

  const commandFailed = () => {
    const session = current()
    const started = session?.server.data.session.get(session.id)?.time.busy

    if (!session || started === undefined) return false

    const latest = session.server.data.shell
      .listBySession(session.id)
      .filter((shell) => shell.time.started >= started)
      .toSorted((a, b) => b.time.started - a.time.started)[0]

    return !!latest && latest.status !== "running" && (latest.status !== "exited" || latest.exit !== 0)
  }

  const snapshot = createMemo<Snapshot>(() => {
    const busy = running()
    const session = current()
    const waiting = !!session?.server.data.session.permission.list(session.id)?.length
    const disconnected = !!session && !session.server.connected

    const failed =
      !busy &&
      (session?.server.data.session.get(session.id)?.outcome === "failed" ||
        commandFailed() ||
        (state.task.status === "failed" && state.until > state.now && state.pose === "lifting"))

    const idle =
      !busy &&
      preferences.value.sleepSeconds > 0 &&
      state.now - state.interacted >= preferences.value.sleepSeconds * 1000

    const manual = state.until > state.now

    const pose: Pose =
      manual && (state.pose === "walk" || state.pose === "wave")
        ? state.pose
        : busy
          ? work().editing || work().responding
            ? "typing"
            : "lifting"
          : manual
            ? state.pose
            : state.typingUntil > state.now
              ? "typing"
              : idle
                ? state.now - state.interacted < preferences.value.sleepSeconds * 1000 + 900
                  ? "walk"
                  : "sleeping"
                : failed
                  ? "lifting"
                  : "idle"

    const label = disconnected
      ? "disconnected"
      : waiting
        ? "waiting"
        : busy
          ? work().editing
            ? "editing"
            : work().responding
              ? "typing"
              : work().shell || state.task.status === "running"
                ? "running"
                : "thinking"
          : failed
            ? "error"
            : pose === "cheering"
              ? "success"
              : pose === "idle" || pose === "typing"
                ? pose
                : `pose.${pose}`

    return {
      pose,
      busy,
      resting: idle && !manual,
      label: ctx.t(label),
      bubble: ctx.t(
        disconnected
          ? "bubble.disconnected"
          : waiting
            ? "bubble.waiting"
            : failed || (work().error && busy)
              ? "bubble.error"
              : `bubble.${pose}`,
      ),
    }
  })

  ctx.provide(Alphie, {
    enabled,
    snapshot,
    navigate: () => {
      if (enabled()) emote("walk", 650)
    },
    task: (task) => {
      const completed = state.task.id === task.id && state.task.status === "running" && task.status === "completed"
      const finished = state.task.id === task.id && state.task.status === "running" && task.status !== "running"
      setState("task", task)

      if (finished) touch()

      if (finished && task.status === "failed") emote("lifting", 8000)

      if (completed) announce()
    },
  })

  const act = (action: Action) => {
    touch()

    if (action === "quit") {
      void preferences.update((draft) => {
        draft.features.alphieMate = false
      })

      return
    }

    if (action === "chat") {
      ctx.screen.current()?.composer.focus()
      emote("wave")

      return
    }

    if (action === "settings") {
      ctx.layout.settings("alphie")

      return
    }

    if (action === "ide") {
      if (!ctx.commands.run("ide.open")) showToast({ title: "Alphie", description: ctx.t("unavailable") })

      return
    }

    emote(action, action === "sleeping" ? 86400000 : 2500)
  }

  createKeyed(mate, (service) => {
    service.on("action", act)
    onCleanup(() => void service.hide().catch(() => undefined))
  })

  const outcomes = new Map<string, number | undefined>()
  createKeyed(
    () =>
      ctx.sessions
        .list()
        .map((session) => session.key)
        .join("\n"),
    () => {
      const keys = new Set(ctx.sessions.list().map((session) => session.key))
      outcomes.forEach((_value, key) => {
        if (!keys.has(key)) outcomes.delete(key)
      })
    },
  )
  // The existing session outcome is the only completion authority; restored history never celebrates.
  createKeyed(
    () => {
      const session = current()
      const info = session?.server.data.session.get(session.id)

      return session && info ? { key: session.key, idle: info.time.idle, outcome: info.outcome } : undefined
    },
    (value) => {
      const seen = outcomes.has(value.key)
      const previous = outcomes.get(value.key)
      outcomes.set(value.key, value.idle)

      if (seen && value.idle !== previous) touch()

      if (seen && value.idle !== previous && (value.outcome === "failed" || commandFailed())) {
        emote("lifting", 8000)

        return
      }

      if (seen && value.idle !== previous && value.outcome === "interrupted") setState("until", 0)

      if (seen && value.idle !== previous && value.outcome === "succeeded" && !commandFailed()) announce()
    },
    { equals: (previous, next) => previous?.key === next?.key && previous?.idle === next?.idle },
  )

  const revealed = new Set<string>()
  // Runs UI navigation only for newly completed file mutations, never replayed history.
  createKeyed(
    () => current()?.key,
    () => {
      revealed.clear()
      const initial = new Set(work().files.map((file) => `${file.id}:${file.path}`))
      createKeyed(
        () => JSON.stringify(work().files),
        () => {
          const session = current()

          if (!session || !enabled()) return
          work().files.forEach((file) => {
            const id = `${session.key}:${file.id}:${file.path}`

            if (initial.has(`${file.id}:${file.path}`) || revealed.has(id)) return
            const bridge = editor()

            if (bridge.status !== "active") return
            revealed.add(id)
            bridge.value.reveal({ session: session.key, path: file.path, revision: file.id })
            const screen = ctx.screen.current()
            const review = changes()

            if (screen && review.status === "active") {
              const release = review.value.watch(screen, "files")
              onCleanup(release)
            }
          })
        },
      )
    },
  )
  createKeyed(
    () => {
      const tool = work().running
      const session = current()

      return enabled() && session && tool?.name === "shell" ? `${session.key}:${tool.id}` : undefined
    },
    () => {
      const session = current()
      const bridge = terminal()

      if (session && bridge.status === "active") bridge.value.open(session)
    },
  )

  const input = () => {
    touch()

    if (ctx.screen.current()?.composer.focused()) setState("typingUntil", Date.now() + 1800)
  }

  document.addEventListener("pointerdown", touch, { passive: true })
  document.addEventListener("keydown", input, { passive: true })
  document.addEventListener("input", input, { passive: true })
  const timer = setInterval(() => setState("now", Date.now()), 500)
  onCleanup(() => {
    clearInterval(timer)
    document.removeEventListener("pointerdown", touch)
    document.removeEventListener("keydown", input)
    document.removeEventListener("input", input)
  })

  const labels = createMemo(() =>
    Object.fromEntries(
      ["chat", "wave", "lifting", "cheering", "walk", "sleeping", "ide", "settings", "quit", "menu", "move"].map(
        (key) => [key, ctx.t(key)],
      ),
    ),
  )

  const floating = () => enabled() && preferences.value.floating && mate().status === "active" && state.native

  const appearance = () => {
    const style = getComputedStyle(document.body)

    return {
      background:
        style.getPropertyValue("--background-base").trim() ||
        (ctx.appearance.mode() === "dark" ? "#231b30" : "#fff4fc"),
      text: style.getPropertyValue("--text-base").trim() || style.color,
      muted: style.getPropertyValue("--text-weak").trim() || style.color,
      mode: ctx.appearance.mode(),
    }
  }

  // Sends the single renderer-owned snapshot to the native mirror; no tools run in that window.
  createKeyed(
    () =>
      JSON.stringify({
        snapshot: snapshot(),
        preferences: preferences.value,
        labels: labels(),
        active: mate().status,
        font: getComputedStyle(document.body).fontFamily,
        appearance: appearance(),
      }),
    () => {
      const service = mate()

      if (service.status !== "active") return
      const controller = new AbortController()
      onCleanup(() => controller.abort())
      void service.value
        .update(
          {
            snapshot: snapshot(),
            preferences: preferences.value,
            labels: labels(),
            font: getComputedStyle(document.body).fontFamily,
            appearance: appearance(),
          },
          { signal: controller.signal },
        )
        .then((visible) => {
          if (!controller.signal.aborted) setState("native", visible)
        })
        .catch((cause: unknown) => {
          if (controller.signal.aborted) return
          setState("native", false)

          if (!ctx.signal.aborted)
            showToast({
              title: "Alphie",
              description: cause instanceof Error ? cause.message : ctx.t("unavailable"),
              variant: "error",
            })
        })
    },
  )

  ctx.add(Style, css)
  ctx.add(Command, {
    id: "toggle",
    get title() {
      return ctx.t("command")
    },
    run: () =>
      void preferences.update((draft) => {
        draft.features.alphieMate = !draft.features.alphieMate
      }),
  })
  ctx.add(SettingsPage, {
    id: "alphie",
    icon: "status",
    get title() {
      return ctx.t("title")
    },
    get entries() {
      return [{ id: "alphie", title: ctx.t("title"), keywords: "mate companion avatar floating sleep size opacity" }]
    },
    render: () => (
      <Suspense>
        <Settings />
      </Suspense>
    ),
  })
  ctx.add(Slot, {
    at: "session.header",
    render: (input) => (
      <Show when={enabled() && input.active}>
        <span class="alphie-status" role="status">
          <img src={`./assets/alphie/${assets[snapshot().pose]}`} alt="" />
          <span>Alphie · {snapshot().label}</span>
          <Show when={work().files.at(-1)}>
            {(file) => (
              <button
                type="button"
                disabled={changes().status !== "active"}
                onClick={() => {
                  const review = changes()

                  if (review.status === "active")
                    review.value.focus(input.session, input.screen.file.resolve(file().path))
                }}
              >
                {ctx.t("changes")}
              </button>
            )}
          </Show>
        </span>
      </Show>
    ),
  })
  ctx.add(Slot, {
    at: "window.bottom",
    render: () => (
      <Show when={enabled() && !floating()}>
        <AlphieMate
          snapshot={snapshot()}
          size={preferences.value.size}
          opacity={preferences.value.opacity}
          labels={labels()}
          x={preferences.value.x}
          y={preferences.value.y}
          action={act}
          move={(x, y) =>
            void preferences.update((draft) => {
              draft.x = Math.max(0, Math.min(window.innerWidth - draft.size, x))
              draft.y = Math.max(0, Math.min(window.innerHeight - draft.size - 80, y))
            })
          }
        />
      </Show>
    ),
  })
}

export default setup
