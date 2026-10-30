import { createMemo, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { Button } from "@opencode/ui/button"
import { createLatest, usePlugin } from "@opencode/plugin/gui"
import { SkillLibrary, type Catalog, type Installed } from "./contract"
import type definition from "./index"

type State = {
  tab: "explore" | "installed" | "catalogs"
  catalog: string
  query: string
  search: string
  page: number
  slug: string
  server: string
  refresh: number
  busy: boolean
  error: string
  name: string
  url: string
  kind: "skillmd" | "index"
}

export default function LibraryPage() {
  const ctx = usePlugin<typeof definition>()
  const client = ctx.use(SkillLibrary)

  const [state, setState] = createStore<State>({
    tab: "explore",
    catalog: ctx.stores.catalogs.value[0]?.id ?? "",
    query: "",
    search: "",
    page: 0,
    slug: "",
    server: "",
    refresh: 0,
    busy: false,
    error: "",
    name: "",
    url: "",
    kind: "skillmd",
  })

  const catalogs = () => ctx.stores.catalogs.value
  const catalog = createMemo(() => catalogs().find((item) => item.id === state.catalog) ?? catalogs()[0])

  const server = () =>
    ctx.servers.get(state.server) ?? ctx.sessions.current()?.server ?? ctx.servers.get(ctx.servers.list()[0] ?? "")

  const local = () => !!server()?.local

  const available = createMemo(() => {
    const service = client()

    return service.status === "active" ? { service: service.value, refresh: state.refresh } : undefined
  })

  const installed = createLatest(available, (input) => input.service.list())

  const search = createLatest(
    createMemo(() => {
      const service = available()
      const selected = catalog()

      return service && selected && state.tab === "explore"
        ? { ...service, catalog: selected, query: state.search, page: state.page }
        : undefined
    }),
    async (input) => ({
      catalog: input.catalog.id,
      query: input.query,
      page: input.page,
      items: await input.service.search({ catalog: input.catalog, query: input.query, page: input.page }),
    }),
  )

  const items = () =>
    search.latest?.catalog === catalog()?.id &&
    search.latest.query === state.search &&
    search.latest.page === state.page
      ? search.latest.items
      : []

  const preview = createLatest(
    createMemo(() => {
      const service = available()
      const selected = catalog()

      return service && selected && state.slug ? { ...service, catalog: selected, slug: state.slug } : undefined
    }),
    async (input) => ({
      catalog: input.catalog.id,
      slug: input.slug,
      detail: await input.service.preview({ catalog: input.catalog, slug: input.slug }),
    }),
  )

  const detail = () =>
    preview.latest?.catalog === catalog()?.id && preview.latest.slug === state.slug ? preview.latest.detail : undefined

  const isInstalled = () =>
    installed.latest?.some((item) => item.catalog === catalog()?.url && item.slug === state.slug) ?? false

  const run = (operation: () => Promise<readonly Installed[]>) => {
    setState({ busy: true, error: "" })
    void operation()
      .then(
        () => setState("refresh", (value) => value + 1),
        (error) => setState("error", String(error)),
      )
      .finally(() => setState("busy", false))
  }

  const addCatalog = () => {
    const value = state.url.trim()
    const url = URL.canParse(value) ? new URL(value) : undefined

    if (
      !url ||
      (url.protocol !== "https:" &&
        !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) ||
      url.username ||
      url.password
    ) {
      setState("error", ctx.t("invalidURL"))

      return
    }

    const next: Catalog = {
      id: crypto.randomUUID(),
      name: state.name.trim() || url.hostname,
      url: url.href.replace(/\/$/, ""),
      kind: state.kind,
    }

    void ctx.stores.catalogs.update((items) => {
      items.push(next)
    })
    setState({ name: "", url: "", error: "", catalog: next.id, slug: "", page: 0, tab: "explore" })
  }

  return (
    <div class="aai-skill-library" data-prevent-autofocus>
      <div class="aai-skill-tabs" role="tablist" aria-label={ctx.t("title")}>
        <For each={["explore", "installed", "catalogs"] as const}>
          {(tab) => (
            <button role="tab" aria-selected={state.tab === tab} onClick={() => setState("tab", tab)}>
              {ctx.t(tab)}
            </button>
          )}
        </For>
      </div>
      <Show when={state.error}>
        <p role="alert" class="aai-skill-error">
          {state.error}
        </p>
      </Show>
      <Show when={!available()}>
        <p>{ctx.t("loading")}</p>
      </Show>
      <Show when={state.tab !== "catalogs"}>
        <label class="aai-skill-field">
          <span>{ctx.t("server")}</span>
          <select
            aria-label={ctx.t("server")}
            value={server()?.id ?? ""}
            onChange={(event) => setState("server", event.currentTarget.value)}
          >
            <For each={ctx.servers.list()}>{(id) => <option value={id}>{ctx.servers.get(id)?.name ?? id}</option>}</For>
          </select>
        </label>
        <Show when={!local()}>
          <p>{ctx.t("local")}</p>
        </Show>
      </Show>
      <Show when={state.tab === "explore"}>
        <form
          class="aai-skill-search"
          onSubmit={(event) => {
            event.preventDefault()
            setState({ search: state.query, page: 0, slug: "" })
          }}
        >
          <select
            aria-label={ctx.t("catalogs")}
            value={catalog()?.id ?? ""}
            onChange={(event) => setState({ catalog: event.currentTarget.value, page: 0, slug: "" })}
          >
            <For each={catalogs()}>{(item) => <option value={item.id}>{item.name}</option>}</For>
          </select>
          <input
            aria-label={ctx.t("search")}
            placeholder={ctx.t("query")}
            value={state.query}
            onInput={(event) => setState("query", event.currentTarget.value)}
          />
          <Button type="submit" disabled={!catalog() || search.loading}>
            {ctx.t("search")}
          </Button>
        </form>
        <Show when={search.error}>
          <p role="alert" class="aai-skill-error">
            {String(search.error)}
          </p>
        </Show>
        <div class="aai-skill-columns">
          <div class="aai-skill-results" aria-label={ctx.t("explore")}>
            <Show when={search.loading}>
              <p>{ctx.t("loading")}</p>
            </Show>
            <Show when={!search.loading && !items().length}>
              <p>{ctx.t("empty")}</p>
            </Show>
            <For each={items()}>
              {(item) => (
                <button
                  class="aai-skill-result"
                  aria-pressed={state.slug === item.slug}
                  onClick={() => setState("slug", item.slug)}
                >
                  <strong>{item.title}</strong>
                  <span class="aai-skill-slug">{item.slug}</span>
                  <p>{item.description}</p>
                  <span>{ctx.t(item.verified ? "verified" : "community")}</span>
                </button>
              )}
            </For>
            <div class="aai-skill-paging">
              <Button
                disabled={state.page === 0 || search.loading}
                onClick={() => setState({ page: state.page - 1, slug: "" })}
              >
                {ctx.t("previous")}
              </Button>
              <Button
                disabled={items().length < 24 || search.loading}
                onClick={() => setState({ page: state.page + 1, slug: "" })}
              >
                {ctx.t("next")}
              </Button>
            </div>
          </div>
          <div class="aai-skill-preview" aria-label={ctx.t("preview")}>
            <Show when={preview.loading}>
              <p>{ctx.t("loading")}</p>
            </Show>
            <Show when={preview.error}>
              <p role="alert" class="aai-skill-error">
                {String(preview.error)}
              </p>
            </Show>
            <Show when={detail()} fallback={<p>{ctx.t("select")}</p>}>
              {(selected) => (
                <>
                  <h3>{selected().title}</h3>
                  <p>{selected().description}</p>
                  <p>
                    {ctx.t("license")}: {selected().license || ctx.t("noLicense")}
                  </p>
                  <a href={selected().url} target="_blank" rel="noopener noreferrer">
                    {ctx.t("source")}
                  </a>
                  <h4>{ctx.t("files")}</h4>
                  <ul>
                    <For each={selected().files}>{(file) => <li>{file}</li>}</For>
                  </ul>
                  <Button
                    disabled={state.busy || !local() || isInstalled()}
                    onClick={() => {
                      const service = available()
                      const selected = catalog()
                      const target = server()

                      if (service && selected && target)
                        run(() => service.service.install({ catalog: selected, slug: state.slug, server: target.id }))
                    }}
                  >
                    {ctx.t(state.busy ? "pending" : isInstalled() ? "installed" : "install")}
                  </Button>
                  <pre>{selected().content}</pre>
                </>
              )}
            </Show>
          </div>
        </div>
      </Show>
      <Show when={state.tab === "installed"}>
        <Show when={installed.error}>
          <p role="alert" class="aai-skill-error">
            {String(installed.error)}
          </p>
        </Show>
        <Show when={!installed.latest?.length}>
          <p>{ctx.t("installedEmpty")}</p>
        </Show>
        <For each={installed.latest ?? []}>
          {(item) => (
            <div class="aai-skill-installed">
              <div>
                <strong>{item.name}</strong>
                <p>{item.description}</p>
                <small>
                  {item.slug} · {ctx.t(item.enabled ? "enabled" : "disabled")}
                </small>
              </div>
              <Button
                disabled={state.busy || !local()}
                onClick={() => {
                  const service = available()
                  const target = server()

                  if (service && target)
                    run(() => service.service.enable({ id: item.id, enabled: !item.enabled, server: target.id }))
                }}
              >
                {ctx.t(item.enabled ? "disable" : "enable")}
              </Button>
            </div>
          )}
        </For>
      </Show>
      <Show when={state.tab === "catalogs"}>
        <p>{ctx.t("catalogHelp")}</p>
        <For each={catalogs()}>
          {(item) => (
            <div class="aai-skill-installed">
              <div>
                <strong>{item.name}</strong>
                <p>{item.url}</p>
              </div>
              <Button
                variant="ghost"
                onClick={() =>
                  void ctx.stores.catalogs.update((items) => {
                    const index = items.findIndex((value) => value.id === item.id)

                    if (index >= 0) items.splice(index, 1)
                  })
                }
              >
                {ctx.t("remove")}
              </Button>
            </div>
          )}
        </For>
        <form
          class="aai-skill-catalog-form"
          onSubmit={(event) => {
            event.preventDefault()
            addCatalog()
          }}
        >
          <label class="aai-skill-field">
            <span>{ctx.t("name")}</span>
            <input value={state.name} onInput={(event) => setState("name", event.currentTarget.value)} />
          </label>
          <label class="aai-skill-field">
            <span>{ctx.t("url")}</span>
            <input
              required
              type="url"
              value={state.url}
              onInput={(event) => setState("url", event.currentTarget.value)}
            />
          </label>
          <label class="aai-skill-field">
            <span>{ctx.t("kind")}</span>
            <select
              aria-label={ctx.t("kind")}
              value={state.kind}
              onChange={(event) => setState("kind", event.currentTarget.value === "index" ? "index" : "skillmd")}
            >
              <option value="skillmd">{ctx.t("skillmd")}</option>
              <option value="index">{ctx.t("index")}</option>
            </select>
          </label>
          <Button type="submit">{ctx.t("add")}</Button>
        </form>
        <Button
          variant="neutral"
          onClick={() =>
            void ctx.stores.catalogs.update((items) => {
              if (!items.some((item) => item.id === "skillmd"))
                items.push({ id: "skillmd", name: "SkillMD", url: "https://api.skillmd.com", kind: "skillmd" })
            })
          }
        >
          {ctx.t("restore")}
        </Button>
      </Show>
    </div>
  )
}
