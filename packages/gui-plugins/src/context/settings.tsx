import { For, Show, createMemo, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { Button } from "@opencode/ui/button"
import { Switch } from "@opencode/ui/switch"
import { Dialog, DialogBody, DialogHeader, DialogTitle } from "@opencode/ui/dialog"
import { showToast } from "@opencode/ui/toast"
import { createLatest, usePlugin, type ServerRef } from "@opencode/plugin/gui"
import type definition from "./index"

export function ContextControl() {
  const ctx = usePlugin<typeof definition>()

  return (
    <div class="flex items-center gap-1" data-prevent-autofocus>
      <Switch
        hideLabel
        checked={ctx.stores.preferences.value.enabled}
        onChange={(enabled) =>
          ctx.stores.preferences.update((draft) => {
            draft.enabled = enabled
          })
        }
      >
        {ctx.t("settings.enabled")}
      </Switch>
      <Button
        variant="ghost-muted"
        size="normal"
        aria-label={ctx.t("settings.title")}
        onClick={() =>
          ctx.dialogs.open(() => (
            <Dialog size="large">
              <DialogHeader>
                <DialogTitle>{ctx.t("settings.title")}</DialogTitle>
              </DialogHeader>
              <DialogBody>
                <ContextSettings />
              </DialogBody>
            </Dialog>
          ))
        }
      >
        {ctx.t(ctx.stores.preferences.value.enabled ? "settings.active" : "settings.prompt")}
      </Button>
    </div>
  )
}

export default function ContextSettings() {
  const ctx = usePlugin<typeof definition>()

  const [state, setState] = createStore({
    ...ctx.stores.preferences.value,
    server: ctx.sessions.current()?.server.id ?? ctx.servers.list()[0] ?? "",
    refresh: 0,
  })

  const target = createMemo(() => {
    const server = ctx.servers.get(state.server)

    return server?.connected ? { server, client: server.client, refresh: state.refresh } : undefined
  })

  const configuration = createLatest(target, async (input, signal) => {
    const entries = await input.client.config.get({}, { signal })
    const boundary = entries.findIndex((entry) => entry.type === "directory")
    const globals = boundary < 0 ? entries : entries.slice(0, boundary)

    const value = globals.reduce<{ auto?: boolean; buffer?: number; keep?: { tokens?: number } }>(
      (value, entry) =>
        entry.type === "document"
          ? Object.assign(value, entry.info.compaction, {
              keep: { ...value.keep, ...entry.info.compaction?.keep },
            })
          : value,
      {},
    )

    return { server: input.server, client: input.client, value }
  })

  const save = () => {
    ctx.stores.preferences.set({
      enabled: state.enabled,
      instructions: state.instructions.trim(),
      background: state.background.trim(),
    })
    showToast({ title: ctx.t("settings.saved") })
  }

  return (
    <div class="aai-context-settings" data-prevent-autofocus>
      <p>{ctx.t("settings.description")}</p>
      <p>{ctx.t("settings.scope")}</p>
      <Switch checked={state.enabled} onChange={(enabled) => setState("enabled", enabled)}>
        {ctx.t("settings.enabled")}
      </Switch>
      <label>
        <span>{ctx.t("settings.instructions")}</span>
        <textarea
          rows={5}
          value={state.instructions}
          placeholder={ctx.t("settings.instructions.placeholder")}
          onInput={(event) => setState("instructions", event.currentTarget.value)}
        />
      </label>
      <label>
        <span>{ctx.t("settings.background")}</span>
        <textarea
          rows={5}
          value={state.background}
          placeholder={ctx.t("settings.background.placeholder")}
          onInput={(event) => setState("background", event.currentTarget.value)}
        />
      </label>
      <div class="aai-context-actions">
        <Button onClick={save}>{ctx.t("settings.save")}</Button>
        <Button
          variant="ghost-muted"
          onClick={() => {
            setState({ enabled: false, instructions: "", background: "" })
            save()
          }}
        >
          {ctx.t("settings.reset")}
        </Button>
      </div>
      <h3>{ctx.t("settings.compaction")}</h3>
      <p>{ctx.t("settings.capacity")}</p>
      <p>{ctx.t("settings.serverScope")}</p>
      <label>
        <span>{ctx.t("settings.server")}</span>
        <select value={state.server} onChange={(event) => setState("server", event.currentTarget.value)}>
          <For each={ctx.servers.list()}>{(id) => <option value={id}>{ctx.servers.get(id)?.name ?? id}</option>}</For>
        </select>
      </label>
      <Show when={target()} fallback={<p>{ctx.t("settings.unavailable")}</p>}>
        <Show when={configuration.error}>
          <p role="alert">{ctx.t("settings.failed")}</p>
          <Button onClick={() => setState("refresh", (value) => value + 1)}>{ctx.t("settings.retry")}</Button>
        </Show>
        <Show
          when={
            configuration.latest?.server.id === state.server && !configuration.loading
              ? configuration.latest
              : undefined
          }
          keyed
          fallback={
            <Show when={!configuration.error}>
              <p role="status">{ctx.t("settings.loading")}</p>
            </Show>
          }
        >
          {(loaded) => (
            <CompactionSettings
              server={loaded.server}
              value={loaded.value}
              refresh={() => setState("refresh", (value) => value + 1)}
            />
          )}
        </Show>
      </Show>
    </div>
  )
}

function CompactionSettings(props: {
  server: ServerRef
  value: { auto?: boolean; buffer?: number; keep?: { tokens?: number } }
  refresh: () => void
}) {
  const ctx = usePlugin<typeof definition>()
  const controller = new AbortController()
  onCleanup(() => controller.abort())

  const [state, setState] = createStore({
    auto: props.value.auto === undefined ? "default" : props.value.auto ? "on" : "off",
    buffer: props.value.buffer?.toString() ?? "",
    keep: props.value.keep?.tokens?.toString() ?? "",
    saving: false,
    error: "",
  })

  const valid = () =>
    [state.buffer, state.keep].every(
      (value) => !value.trim() || (/^\d+$/.test(value.trim()) && Number(value) <= 2147483647),
    )

  const save = async (reset = false) => {
    if (!reset && !valid()) return setState("error", ctx.t("settings.invalid"))
    setState({ saving: true, error: "" })
    await props.server.client.config
      .update(
        {
          compaction: reset
            ? null
            : {
                auto: state.auto === "default" ? undefined : state.auto === "on",
                buffer: state.buffer.trim() ? Number(state.buffer) : undefined,
                keep: state.keep.trim() ? { tokens: Number(state.keep) } : undefined,
              },
        },
        { signal: controller.signal },
      )
      .then(
        () => {
          if (controller.signal.aborted) return
          showToast({ title: ctx.t("settings.saved") })
          props.refresh()
        },
        (error: Error) => {
          if (!controller.signal.aborted) setState("error", error.message)
        },
      )
      .finally(() => {
        if (!controller.signal.aborted) setState("saving", false)
      })
  }

  return (
    <>
      <label>
        <span>{ctx.t("settings.auto")}</span>
        <select value={state.auto} onChange={(event) => setState("auto", event.currentTarget.value)}>
          <option value="default">{ctx.t("settings.default")}</option>
          <option value="on">{ctx.t("settings.on")}</option>
          <option value="off">{ctx.t("settings.off")}</option>
        </select>
      </label>
      <label>
        <span>{ctx.t("settings.buffer")}</span>
        <input
          type="number"
          min="0"
          max="2147483647"
          step="1"
          value={state.buffer}
          placeholder={ctx.t("settings.default")}
          onInput={(event) => setState("buffer", event.currentTarget.value)}
        />
        <small>{ctx.t("settings.buffer.description")}</small>
      </label>
      <label>
        <span>{ctx.t("settings.keep")}</span>
        <input
          type="number"
          min="0"
          max="2147483647"
          step="1"
          value={state.keep}
          placeholder={ctx.t("settings.default")}
          onInput={(event) => setState("keep", event.currentTarget.value)}
        />
        <small>{ctx.t("settings.keep.description")}</small>
      </label>
      <Show when={state.error}>
        <p role="alert">{state.error}</p>
      </Show>
      <div class="aai-context-actions">
        <Button disabled={state.saving || !props.server.connected} onClick={() => void save()}>
          {ctx.t("settings.compaction.save")}
        </Button>
        <Button
          variant="ghost-muted"
          disabled={state.saving || !props.server.connected}
          onClick={() => void save(true)}
        >
          {ctx.t("settings.compaction.reset")}
        </Button>
      </div>
    </>
  )
}
