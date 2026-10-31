import { For, Show, createResource, onCleanup, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { Schema } from "effect"
import { Mcp } from "@opencode/schema/mcp"
import { Button } from "@opencode/ui/button"
import { TextInput } from "@opencode/ui/text-input"
import { useServerSDK } from "@/runtime/server/client"
import { useData } from "@/runtime/server/current"
import { useLanguage } from "@/runtime/i18n/language"
import { parseMcpImport } from "./mcp-import"

export function McpSettings(props: {
  directory?: string
  names: string[]
  children: (configuration: {
    editable: (name: string) => boolean
    edit: (name: string) => void
    remove: (name: string) => void
    busy: () => boolean
  }) => JSX.Element
}) {
  const sdk = useServerSDK()
  const data = useData()
  const language = useLanguage()
  const lifetime = new AbortController()
  onCleanup(() => lifetime.abort())

  const [store, setStore] = createStore<{
    open: boolean
    name: string
    original: string
    type: "local" | "remote"
    command: string
    args: string
    cwd: string
    environment: string
    url: string
    headers: string
    enabled: boolean
    codemode: boolean
    oauth: boolean
    timeout: string
    busy: boolean
    error: string
    paste: boolean
    json: string
    importName: string
    imports?: Record<string, Mcp.ServerConfig>
  }>({
    open: false,
    name: "",
    original: "",
    type: "local",
    command: "",
    args: "",
    cwd: "",
    environment: "",
    url: "",
    headers: "",
    enabled: true,
    codemode: true,
    oauth: true,
    timeout: "",
    busy: false,
    error: "",
    paste: false,
    json: "",
    importName: "",
  })

  const [config, actions] = createResource(
    () => sdk.scope,
    async (scope) => ({ scope, entries: await sdk.api.config.get() }),
  )

  const servers = () => {
    if (config.state !== "ready" && config.state !== "refreshing") return new Map<string, Mcp.ServerConfig>()
    const value = config.latest

    if (!value || value.scope !== sdk.scope) return new Map<string, Mcp.ServerConfig>()
    const boundary = value.entries.findIndex((entry) => entry.type === "directory")

    return new Map(
      (boundary === -1 ? value.entries : value.entries.slice(0, boundary)).flatMap((entry) =>
        entry.type === "document" ? Object.entries(entry.info.mcp?.servers ?? {}) : [],
      ),
    )
  }

  const refresh = async () => {
    const ref = props.directory ? { directory: props.directory } : data.location.default()
    await Promise.all([
      actions.refetch(),
      data.location.mcp.server.sync(data.location.default()),
      data.location.mcp.server.sync(ref),
      data.location.integration.sync(ref),
    ])
  }

  const close = () => setStore({ open: false, imports: undefined, json: "", error: "" })

  const edit = (name = "") => {
    const server = servers().get(name)
    setStore({
      open: true,
      original: name,
      name,
      type: server?.type ?? "local",
      error: "",
      paste: false,
      command: server?.type === "local" ? (server.command[0] ?? "") : "",
      args: server?.type === "local" ? server.command.slice(1).join("\n") : "",
      cwd: server?.type === "local" ? (server.cwd ?? "") : "",
      environment: server?.type === "local" ? pairsText(server.environment) : "",
      url: server?.type === "remote" ? server.url : "",
      headers: server?.type === "remote" ? pairsText(server.headers) : "",
      oauth: server?.type !== "remote" || server.oauth !== false,
      enabled: !server?.disabled,
      codemode: server?.codemode !== false,
      timeout: server?.timeout?.startup?.toString() ?? "",
      imports: undefined,
      json: "",
      importName: "",
    })
  }

  const persist = async (entries: Record<string, Mcp.ServerConfig | null>) => {
    if (store.busy) return
    const api = sdk.api
    const scope = sdk.scope
    setStore({ busy: true, error: "" })

    try {
      await api.experimental.config.update({ mcp: { servers: entries } })

      if (lifetime.signal.aborted || sdk.scope !== scope) return
      close()
      await refresh()
    } catch {
      if (!lifetime.signal.aborted && sdk.scope === scope) setStore("error", language.t("settings.mcp.failed"))
    } finally {
      if (!lifetime.signal.aborted) setStore("busy", false)
    }
  }

  const save = (event: SubmitEvent) => {
    event.preventDefault()
    const name = store.name.trim()

    if (!name || /[\u0000-\u001f\u007f]/.test(name)) return setStore("error", language.t("settings.mcp.invalid"))

    if (!store.original && (servers().has(name) || props.names.includes(name)))
      return setStore("error", language.t("settings.mcp.conflict"))
    const previous = servers().get(store.original)

    try {
      const shared = {
        disabled: !store.enabled,
        codemode: store.codemode,
        timeout: { ...previous?.timeout, startup: store.timeout.trim() ? Number(store.timeout) : undefined },
      }

      const server =
        store.type === "local"
          ? {
              ...(previous?.type === "local" ? previous : undefined),
              ...shared,
              type: "local",
              command: [store.command.trim(), ...store.args.split(/\r?\n/).filter((arg) => arg.length > 0)],
              cwd: store.cwd.trim() || undefined,
              environment: parsePairs(store.environment),
            }
          : {
              ...(previous?.type === "remote" ? previous : undefined),
              ...shared,
              type: "remote",
              url: store.url.trim(),
              headers: Object.fromEntries(new Headers(parsePairs(store.headers))),
              oauth: store.oauth
                ? previous?.type === "remote" && previous.oauth !== false
                  ? previous.oauth
                  : undefined
                : false,
            }

      if (store.type === "local" && !store.command.trim()) throw new Error("Missing executable")

      if (store.type === "remote") {
        const url = URL.canParse(store.url.trim()) ? new URL(store.url.trim()) : undefined

        if (!url || !["http:", "https:"].includes(url.protocol) || url.username || url.password)
          throw new Error("Invalid URL")
      }

      void persist({
        [name]: Schema.decodeUnknownSync(Schema.fromJsonString(Mcp.ServerConfig))(JSON.stringify(server)),
      })
    } catch {
      setStore("error", language.t("settings.mcp.invalid"))
    }
  }

  const review = () => {
    try {
      const imports = parseMcpImport(store.json, store.importName)

      if (Object.keys(imports).some((name) => servers().has(name) || props.names.includes(name)))
        return setStore("error", language.t("settings.mcp.conflict"))
      setStore({ imports, error: "" })
    } catch {
      setStore("error", language.t("settings.mcp.invalidImport"))
    }
  }

  return (
    <section aria-label={language.t("settings.mcp.configuration")} class="flex flex-col gap-4">
      <div class="flex flex-wrap gap-2">
        <Button
          disabled={store.busy || config.state === "pending" || config.state === "unresolved"}
          onClick={() => edit()}
        >
          {language.t("settings.mcp.add")}
        </Button>
        <Button
          variant="neutral"
          disabled={store.busy}
          onClick={() => void refresh().catch(() => setStore("error", language.t("settings.mcp.failed")))}
        >
          {language.t("settings.mcp.refresh")}
        </Button>
      </div>
      <p class="text-sm text-v2-text-text-muted">{language.t("settings.mcp.description")}</p>
      <Show when={store.error}>
        <p role="alert">{store.error}</p>
      </Show>
      <Show when={store.open}>
        <div class="rounded-md border border-v2-border-border-base p-4">
          <Show when={!store.original}>
            <div class="mb-4 flex gap-2">
              <For each={[false, true]}>
                {(paste) => (
                  <Button
                    variant="neutral"
                    disabled={store.busy}
                    aria-pressed={store.paste === paste}
                    onClick={() => setStore({ paste, error: "", imports: undefined })}
                  >
                    {language.t(paste ? "settings.mcp.paste" : "settings.mcp.manual")}
                  </Button>
                )}
              </For>
            </div>
          </Show>
          <Show
            when={store.paste}
            fallback={
              <form onSubmit={save}>
                <fieldset disabled={store.busy} class="flex flex-col gap-4">
                  <label class="flex flex-col gap-2">
                    {language.t("settings.mcp.name")}
                    <TextInput
                      aria-label={language.t("settings.mcp.name")}
                      required
                      readOnly={!!store.original}
                      value={store.name}
                      onInput={(event) => setStore("name", event.currentTarget.value)}
                    />
                  </label>
                  <label class="flex flex-col gap-2">
                    {language.t("settings.mcp.type")}
                    <select
                      class="rounded border bg-v2-background-bg-base p-2"
                      aria-label={language.t("settings.mcp.type")}
                      value={store.type}
                      onChange={(event) =>
                        setStore("type", event.currentTarget.value === "remote" ? "remote" : "local")
                      }
                    >
                      <option value="local">{language.t("settings.mcp.local")}</option>
                      <option value="remote">{language.t("settings.mcp.remote")}</option>
                    </select>
                  </label>
                  <Show
                    when={store.type === "local"}
                    fallback={
                      <>
                        <label class="flex flex-col gap-2">
                          {language.t("settings.mcp.url")}
                          <TextInput
                            type="url"
                            required
                            aria-label={language.t("settings.mcp.url")}
                            value={store.url}
                            onInput={(event) => setStore("url", event.currentTarget.value)}
                          />
                        </label>
                        <label class="flex flex-col gap-2">
                          {language.t("settings.mcp.headers")}
                          <textarea
                            class="rounded border bg-v2-background-bg-base p-3 font-mono"
                            rows={3}
                            aria-label={language.t("settings.mcp.headers")}
                            value={store.headers}
                            onInput={(event) => setStore("headers", event.currentTarget.value)}
                          />
                          <span class="text-xs text-v2-text-text-muted">{language.t("settings.mcp.pairsHelp")}</span>
                        </label>
                        <label class="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={store.oauth}
                            onChange={(event) => setStore("oauth", event.currentTarget.checked)}
                          />
                          {language.t("settings.mcp.oauth")}
                        </label>
                      </>
                    }
                  >
                    <label class="flex flex-col gap-2">
                      {language.t("settings.mcp.command")}
                      <TextInput
                        required
                        aria-label={language.t("settings.mcp.command")}
                        value={store.command}
                        onInput={(event) => setStore("command", event.currentTarget.value)}
                      />
                      <span class="text-xs text-v2-text-text-muted">{language.t("settings.mcp.commandHelp")}</span>
                    </label>
                    <label class="flex flex-col gap-2">
                      {language.t("settings.mcp.args")}
                      <textarea
                        class="rounded border bg-v2-background-bg-base p-3 font-mono"
                        rows={3}
                        aria-label={language.t("settings.mcp.args")}
                        value={store.args}
                        onInput={(event) => setStore("args", event.currentTarget.value)}
                      />
                      <span class="text-xs text-v2-text-text-muted">{language.t("settings.mcp.argsHelp")}</span>
                    </label>
                    <label class="flex flex-col gap-2">
                      {language.t("settings.mcp.cwd")}
                      <TextInput
                        aria-label={language.t("settings.mcp.cwd")}
                        value={store.cwd}
                        onInput={(event) => setStore("cwd", event.currentTarget.value)}
                      />
                    </label>
                    <label class="flex flex-col gap-2">
                      {language.t("settings.mcp.env")}
                      <textarea
                        class="rounded border bg-v2-background-bg-base p-3 font-mono"
                        rows={3}
                        aria-label={language.t("settings.mcp.env")}
                        value={store.environment}
                        onInput={(event) => setStore("environment", event.currentTarget.value)}
                      />
                      <span class="text-xs text-v2-text-text-muted">{language.t("settings.mcp.pairsHelp")}</span>
                    </label>
                  </Show>
                  <label class="flex flex-col gap-2">
                    {language.t("settings.mcp.timeout")}
                    <TextInput
                      type="number"
                      min="1"
                      aria-label={language.t("settings.mcp.timeout")}
                      value={store.timeout}
                      onInput={(event) => setStore("timeout", event.currentTarget.value)}
                    />
                  </label>
                  <label class="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={store.enabled}
                      onChange={(event) => setStore("enabled", event.currentTarget.checked)}
                    />
                    {language.t("settings.mcp.enabled")}
                  </label>
                  <label class="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={store.codemode}
                      onChange={(event) => setStore("codemode", event.currentTarget.checked)}
                    />
                    {language.t("settings.mcp.codemode")}
                  </label>
                  <div class="flex gap-2">
                    <Button type="submit">{language.t("settings.mcp.save")}</Button>
                    <Button variant="neutral" onClick={close}>
                      {language.t("common.cancel")}
                    </Button>
                  </div>
                </fieldset>
              </form>
            }
          >
            <fieldset disabled={store.busy} class="flex flex-col gap-4">
              <p class="text-sm text-v2-text-text-muted">{language.t("settings.mcp.pasteHelp")}</p>
              <label class="flex flex-col gap-2">
                {language.t("settings.mcp.json")}
                <textarea
                  class="rounded border bg-v2-background-bg-base p-3 font-mono"
                  rows={9}
                  aria-label={language.t("settings.mcp.json")}
                  placeholder={language.t("settings.mcp.jsonExample")}
                  value={store.json}
                  onInput={(event) => setStore({ json: event.currentTarget.value, imports: undefined })}
                />
              </label>
              <label class="flex flex-col gap-2">
                {language.t("settings.mcp.importName")}
                <TextInput
                  aria-label={language.t("settings.mcp.importName")}
                  value={store.importName}
                  onInput={(event) => setStore({ importName: event.currentTarget.value, imports: undefined })}
                />
              </label>
              <Show when={store.imports}>
                {(imports) => (
                  <div class="flex flex-col gap-3" aria-label={language.t("settings.mcp.review")}>
                    <For each={Object.entries(imports())}>
                      {([name, server]) => (
                        <div class="rounded border border-v2-border-border-base p-3">
                          <p class="font-medium">{name}</p>
                          <code class="block break-all text-sm">
                            {server.type === "local" ? server.command.join(" ") : server.url}
                          </code>
                          <p class="text-xs text-v2-text-text-muted">{language.t("mcp.status.disabled")}</p>
                        </div>
                      )}
                    </For>
                  </div>
                )}
              </Show>
              <div class="flex gap-2">
                <Button variant="neutral" onClick={review}>
                  {language.t("settings.mcp.review")}
                </Button>
                <Show when={store.imports}>
                  {(imports) => (
                    <Button onClick={() => void persist(imports())}>{language.t("settings.mcp.importSave")}</Button>
                  )}
                </Show>
                <Button variant="neutral" onClick={close}>
                  {language.t("common.cancel")}
                </Button>
              </div>
            </fieldset>
          </Show>
        </div>
      </Show>
      {props.children({
        editable: (name) => servers().has(name),
        edit,
        remove: (name) => void persist({ [name]: null }),
        busy: () => store.busy,
      })}
    </section>
  )
}

function pairsText(pairs: Readonly<Record<string, string>> | undefined) {
  return Object.entries(pairs ?? {})
    .map(([key, value]) => `${key}=${value}`)
    .join("\n")
}

function parsePairs(text: string) {
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => {
        const split = line.indexOf("=")

        if (split < 1 || !line.slice(0, split).trim()) throw new Error("Expected KEY=value")

        return [line.slice(0, split).trim(), line.slice(split + 1)]
      }),
  )
}
