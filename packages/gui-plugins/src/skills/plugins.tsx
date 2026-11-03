import { createMemo, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { Button } from "@opencode/ui/button"
import { Loader } from "@opencode/ui/loader"
import { Switch } from "@opencode/ui/switch"
import { createLatest, usePlugin } from "@opencode/plugin/gui"
import { SkillLibrary, type PackageInstall } from "./contract"
import type definition from "./index"

export default function PackagesPage(props: { savedOnly: boolean }) {
  const ctx = usePlugin<typeof definition>()
  const client = ctx.use(SkillLibrary)

  const [state, setState] = createStore({
    query: "",
    search: "",
    page: 0,
    selected: "",
    accepted: false,
    busy: false,
    refresh: 0,
    error: "",
    message: "",
  })

  const service = createMemo(() => {
    const current = client()

    return current.status === "active" ? current.value : undefined
  })

  const available = createMemo(() => {
    const current = service()

    return current ? { service: current, refresh: state.refresh } : undefined
  })

  const installed = createLatest(available, (input) => input.service.pluginList())

  const server = () =>
    ctx.servers
      .list()
      .map((id) => ctx.servers.get(id))
      .find((server) => server?.builtin && server.connected)

  const search = createLatest(
    createMemo(() => {
      const current = service()

      return current && !props.savedOnly ? { service: current, query: state.search, page: state.page } : undefined
    }),
    async (input) => ({
      query: input.query,
      page: input.page,
      items: await input.service.packages({ query: input.query, page: input.page }),
    }),
  )

  const items = () =>
    search.latest?.query === state.search && search.latest.page === state.page ? search.latest.items : []

  const selected = createLatest(
    createMemo(() => {
      const current = service()
      const split = state.selected.lastIndexOf("@")

      return current && split > 0
        ? {
            service: current,
            key: state.selected,
            name: state.selected.slice(0, split),
            version: state.selected.slice(split + 1),
          }
        : undefined
    }),
    async (input) => ({
      key: input.key,
      detail: await input.service.package({ name: input.name, version: input.version }),
    }),
  )

  const detail = () => (selected.latest?.key === state.selected ? selected.latest.detail : undefined)
  const saved = () => ctx.stores.savedPackages.value
  const isInstalled = () => installed.latest?.some((item) => item.name === detail()?.name) ?? false
  const select = (key: string) => setState({ selected: key, accepted: false, message: "", error: "" })

  const bookmark = (key: string) =>
    void ctx.stores.savedPackages.update((items) => {
      const index = items.indexOf(key)

      if (index >= 0) items.splice(index, 1)

      if (index < 0) items.push(key)
    })

  const run = async (operation: () => Promise<readonly PackageInstall[]>) => {
    if (state.busy) return
    setState({ busy: true, error: "", message: "" })

    try {
      await operation()

      if (ctx.signal.aborted) return
      setState({ refresh: state.refresh + 1, accepted: false, message: ctx.t("packages.saved") })
    } catch {
      if (!ctx.signal.aborted) setState("error", ctx.t("packages.failed"))
    } finally {
      if (!ctx.signal.aborted) setState("busy", false)
    }
  }

  return (
    <div class="aai-skill-library">
      <p>{ctx.t("packages.description")}</p>
      <Show when={state.error}>
        <p role="alert" class="aai-skill-error">
          {state.error}
        </p>
      </Show>
      <Show when={state.message}>
        <p role="status">{state.message}</p>
      </Show>
      <Show when={!service()}>
        <Loader />
      </Show>
      <Show when={!props.savedOnly}>
        <form
          class="aai-skill-search"
          onSubmit={(event) => {
            event.preventDefault()
            setState({ search: state.query.trim(), page: 0, selected: "", accepted: false })
          }}
        >
          <input
            aria-label={ctx.t("packages.search")}
            placeholder={ctx.t("packages.query")}
            value={state.query}
            onInput={(event) => setState("query", event.currentTarget.value)}
          />
          <Button type="submit" disabled={!service() || search.loading}>
            {ctx.t("packages.search")}
          </Button>
        </form>
      </Show>
      <div class="aai-skill-columns">
        <div class="aai-skill-results" data-scrollable>
          <Show when={!props.savedOnly && search.loading}>
            <Loader />
          </Show>
          <Show when={!props.savedOnly && search.error}>
            <p role="alert">{ctx.t("packages.unavailable")}</p>
          </Show>
          <Show when={props.savedOnly && !saved().length}>
            <p>{ctx.t("packages.savedEmpty")}</p>
          </Show>
          <Show when={!props.savedOnly && !search.loading && !search.error && !items().length}>
            <p>{ctx.t("packages.empty")}</p>
          </Show>
          <For each={props.savedOnly ? [] : items()}>
            {(item) => (
              <button
                class="aai-skill-result"
                aria-pressed={state.selected === `${item.name}@${item.version}`}
                onClick={() => select(`${item.name}@${item.version}`)}
              >
                <strong>{item.name}</strong>
                <span class="aai-skill-slug">{item.version}</span>
                <p>{item.description}</p>
                <span>{ctx.t("packages.community")}</span>
              </button>
            )}
          </For>
          <Show when={props.savedOnly}>
            <For each={saved()}>
              {(key) => (
                <button class="aai-skill-result" aria-pressed={state.selected === key} onClick={() => select(key)}>
                  <strong>{key}</strong>
                </button>
              )}
            </For>
          </Show>
          <Show when={!props.savedOnly}>
            <div class="aai-skill-paging">
              <Button
                disabled={!state.page || search.loading}
                onClick={() => setState({ page: state.page - 1, selected: "", accepted: false })}
              >
                {ctx.t("previous")}
              </Button>
              <Button
                disabled={items().length < 24 || search.loading}
                onClick={() => setState({ page: state.page + 1, selected: "", accepted: false })}
              >
                {ctx.t("next")}
              </Button>
            </div>
          </Show>
        </div>
        <section class="aai-skill-preview" data-scrollable aria-label={ctx.t("packages.review")}>
          <Show when={selected.loading}>
            <Loader />
          </Show>
          <Show when={selected.error}>
            <p role="alert">{ctx.t("packages.unavailable")}</p>
          </Show>
          <Show when={detail()} fallback={<p>{ctx.t("packages.select")}</p>}>
            {(item) => (
              <>
                <h3>{item().name}</h3>
                <p>{item().description}</p>
                <code>
                  {item().name}@{item().version}
                </code>
                <dl class="aai-library-details">
                  <dt>{ctx.t("packages.publisher")}</dt>
                  <dd>{item().publisher || ctx.t("noLicense")}</dd>
                  <dt>{ctx.t("license")}</dt>
                  <dd>{item().license || ctx.t("noLicense")}</dd>
                  <dt>{ctx.t("packages.parts")}</dt>
                  <dd>
                    {item()
                      .parts.map((part) => ctx.t(`packages.part.${part}`))
                      .join(", ") || ctx.t("packages.unknownParts")}
                  </dd>
                </dl>
                <a href={item().url} target="_blank" rel="noopener noreferrer">
                  {ctx.t("packages.source")}
                </a>
                <Button variant="neutral" onClick={() => bookmark(state.selected)}>
                  {ctx.t(saved().includes(state.selected) ? "packages.unsave" : "packages.save")}
                </Button>
                <Show when={item().dependencies.length}>
                  <details>
                    <summary>{ctx.t("packages.dependencies")}</summary>
                    <ul>
                      <For each={item().dependencies}>
                        {(dependency) => (
                          <li>
                            <code>{dependency}</code>
                          </li>
                        )}
                      </For>
                    </ul>
                  </details>
                </Show>
                <Show when={item().scripts.length}>
                  <p>{ctx.t("packages.scripts", { scripts: item().scripts.join(", ") })}</p>
                </Show>
                <Show when={item().deprecated}>
                  <p role="alert" class="aai-skill-error">
                    {item().deprecated}
                  </p>
                </Show>
                <p>{ctx.t("packages.trust")}</p>
                <Switch checked={state.accepted} onChange={(accepted) => setState("accepted", accepted)}>
                  {ctx.t("packages.accept")}
                </Switch>
                <Show when={!server()}>
                  <p>{ctx.t("packages.local")}</p>
                </Show>
                <Button
                  disabled={
                    !service() ||
                    !server() ||
                    !state.accepted ||
                    isInstalled() ||
                    state.busy ||
                    !!item().deprecated ||
                    !item().parts.length
                  }
                  onClick={() => {
                    const target = server()
                    const current = service()

                    if (target && current)
                      void run(() =>
                        current.pluginInstall({ name: item().name, version: item().version, server: target.id }),
                      )
                  }}
                >
                  {ctx.t(state.busy ? "pending" : isInstalled() ? "installed" : "packages.install")}
                </Button>
              </>
            )}
          </Show>
        </section>
      </div>
      <h3>{ctx.t("packages.installed")}</h3>
      <p>{ctx.t("packages.runtime")}</p>
      <Button variant="ghost" onClick={() => ctx.layout.settings("extensions")}>
        {ctx.t("packages.manageRuntime")}
      </Button>
      <Show when={installed.error}>
        <p role="alert">{ctx.t("packages.failed")}</p>
      </Show>
      <Show when={!installed.loading && !installed.latest?.length}>
        <p>{ctx.t("packages.installedEmpty")}</p>
      </Show>
      <For each={installed.latest ?? []}>
        {(item) => (
          <div class="aai-skill-installed">
            <div>
              <strong>{item.name}</strong>
              <p>
                {item.version} · {ctx.t(item.enabled ? "enabled" : "disabled")}
              </p>
            </div>
            <div class="aai-library-actions">
              <Button
                disabled={state.busy || !server()}
                onClick={() => {
                  const target = server()
                  const current = service()

                  if (target && current)
                    void run(() => current.pluginEnable({ name: item.name, enabled: !item.enabled, server: target.id }))
                }}
              >
                {ctx.t(item.enabled ? "packages.disable" : "packages.enable")}
              </Button>
              <Button
                variant="ghost"
                disabled={state.busy || !server()}
                onClick={() => {
                  const target = server()
                  const current = service()

                  if (target && current) void run(() => current.pluginRemove({ name: item.name, server: target.id }))
                }}
              >
                {ctx.t("packages.remove")}
              </Button>
            </div>
          </div>
        )}
      </For>
    </div>
  )
}
