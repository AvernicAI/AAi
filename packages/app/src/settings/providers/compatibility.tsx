import { For, Show, createResource, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { Button } from "@opencode/ui/button"
import { TextInput } from "@opencode/ui/text-input"
import { useLanguage } from "@/runtime/i18n/language"
import { useServerSDK } from "@/runtime/server/client"
import { useData } from "@/runtime/server/current"
import { useModels } from "@/providers/models/models"
import {
  freeAPIEndpoint,
  freeAPIInput,
  freeAPILimit,
  freeAPIProfile,
  freeAPIProviderID,
} from "@/providers/catalog/free-apis"
import { retry } from "@opencode/util/retry"
import { FreeAPICatalog, FreeAPIGuide } from "./free-apis"

export function CompatibilityConnector(props: { directory?: string }) {
  const sdk = useServerSDK()
  const data = useData()
  const models = useModels()
  const language = useLanguage()
  const lifetime = new AbortController()
  onCleanup(() => lifetime.abort())

  const [store, setStore] = createStore({
    open: false,
    id: "",
    account: "",
    name: "",
    url: "",
    key: "",
    models: "",
    protocol: "chat",
    noAuth: false,
    tools: true,
    vision: false,
    context: 128000,
    output: 16384,
    busy: false,
    error: "",
  })

  const [config, actions] = createResource(
    () => sdk.scope,
    async (scope) => ({ scope, entries: await sdk.api.config.get() }),
  )

  const existing = () => {
    if (config.state !== "ready" && config.state !== "refreshing") return []
    const value = config.latest

    if (!value || value.scope !== sdk.scope) return []
    const boundary = value.entries.findIndex((entry) => entry.type === "directory")

    return [
      ...new Map(
        (boundary === -1 ? value.entries : value.entries.slice(0, boundary)).flatMap((entry) =>
          entry.type === "document" ? Object.entries(entry.info.providers ?? {}) : [],
        ),
      ).entries(),
    ].filter(([id]) => id.startsWith("aai-compatible-"))
  }

  const refresh = () => {
    const ref = props.directory ? { directory: props.directory } : undefined

    return Promise.all([
      data.location.integration.sync(ref),
      data.location.provider.sync(ref),
      data.location.model.sync(ref),
      actions.refetch(),
    ])
  }

  const preset = () => freeAPIProfile(store.id)
  const configReady = () => config.state === "ready" || config.state === "refreshing"

  const edit = (id = "") => {
    const provider = existing().find(([key]) => key === id)?.[1]
    const first = Object.values(provider?.models ?? {})[0]
    const profile = freeAPIProfile(id)
    setStore({
      open: true,
      id,
      account: String(provider?.settings?.aaiAccountID ?? ""),
      name: profile?.name ?? provider?.name ?? "",
      url: String(provider?.settings?.baseURL ?? profile?.base ?? ""),
      key: "",
      models: Object.keys(provider?.models ?? {}).join("\n"),
      protocol: provider?.package === "@opencode/ai/providers/openai-compatible-responses" ? "responses" : "chat",
      noAuth: profile
        ? profile.auth === "anonymous" ||
          (profile.auth === "optional" && (!provider || provider.settings?.aaiNoAuth === true))
        : provider?.settings?.aaiNoAuth === true,
      tools: first?.capabilities?.tools ?? true,
      vision: first?.capabilities?.input?.includes("image") ?? false,
      context: first?.limit?.context ?? 128000,
      output: first?.limit?.output ?? 16384,
      error: "",
    })
  }

  const save = async (event: SubmitEvent) => {
    event.preventDefault()

    if (store.busy) return
    const input = { ...store }
    const previous = existing().find(([id]) => id === input.id)?.[1]
    const profile = freeAPIProfile(input.id)
    const endpoint = profile ? freeAPIEndpoint(profile, input.account, input.url) : input.url.trim()

    const noAuth = profile
      ? profile.auth === "anonymous" || (profile.auth === "optional" && input.noAuth)
      : input.noAuth

    const presetModels = profile?.models.filter((model) => !model.reference)
    const api = sdk.api
    const scope = sdk.scope
    const location = props.directory ? { directory: props.directory } : undefined

    const ids = presetModels?.map((model) => model.id) ?? [
      ...new Set(
        input.models
          .split(/[\n,]+/)
          .map((id) => id.trim())
          .filter(Boolean),
      ),
    ]

    const url = endpoint && URL.canParse(endpoint) ? new URL(endpoint) : undefined

    if (
      !url ||
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !input.name.trim() ||
      !ids.length ||
      !Number.isInteger(input.context) ||
      !Number.isInteger(input.output) ||
      input.output < 1 ||
      input.context < input.output ||
      (!noAuth &&
        !input.key.trim() &&
        (!previous || previous.settings?.aaiNoAuth === true || (profile && previous.settings?.baseURL !== endpoint)))
    ) {
      setStore("error", language.t(profile ? "settings.freeAPI.invalid" : "settings.compatible.invalid"))

      return
    }

    url.pathname = url.pathname.replace(/\/(?:chat\/completions|responses)\/?$/, "").replace(/\/+$/, "")
    const id = input.id || `aai-compatible-${crypto.randomUUID()}`
    setStore({ busy: true, error: "" })

    try {
      if (profile && previous && !noAuth && !input.key.trim()) {
        const current = await api.integration.get({ integrationID: id, location })

        if (lifetime.signal.aborted || sdk.scope !== scope) return

        if (!current.data.connections.some((connection) => connection.type === "credential")) {
          setStore("error", language.t("settings.freeAPI.invalid"))

          return
        }
      }

      await api.experimental.config.update({
        providers: {
          [id]: {
            ...(profile ? undefined : previous),
            name: input.name.trim(),
            ...(profile?.headers ? { headers: profile.headers } : undefined),
            ...(profile?.body ? { body: profile.body } : undefined),
            package:
              !profile && input.protocol === "responses"
                ? "@opencode/ai/providers/openai-compatible-responses"
                : "@opencode/ai/providers/openai-compatible",
            settings: {
              ...(profile ? undefined : previous?.settings),
              baseURL: url.href.replace(/\/+$/, ""),
              provider: id,
              transport: "http",
              encoding: "none",
              aaiNoAuth: noAuth,
              ...(profile?.auth === "account" ? { aaiAccountID: input.account.trim().toLowerCase() } : undefined),
            },
            models: presetModels
              ? Object.fromEntries(
                  presetModels.map((model) => [
                    model.id,
                    {
                      name: model.name,
                      ...(model.body ? { body: model.body } : undefined),
                      capabilities: {
                        tools: model.tools,
                        input: freeAPIInput(model),
                        output: ["text"],
                        reasoning: { supported: model.modality.includes("reasoning") },
                      },
                      limit: freeAPILimit(model),
                    },
                  ]),
                )
              : Object.fromEntries(
                  ids.map((model) => [
                    model,
                    {
                      ...previous?.models?.[model],
                      name: previous?.models?.[model]?.name ?? model,
                      capabilities: {
                        ...previous?.models?.[model]?.capabilities,
                        tools: input.tools,
                        input: input.vision ? ["text", "image"] : ["text"],
                        output: ["text"],
                      },
                      limit: { ...previous?.models?.[model]?.limit, context: input.context, output: input.output },
                    },
                  ]),
                ),
          },
        },
      })
      await retry(
        async () => {
          const result = await api.integration.get({ integrationID: id, location })

          if (!result.data.methods.some((method) => method.type === "key")) throw new Error("Provider is loading")
        },
        { attempts: 12, delay: 250, maxDelay: 1000 },
      )

      if (lifetime.signal.aborted || sdk.scope !== scope) return

      if (!previous || noAuth || input.key.trim())
        await api.integration.connect.key({
          integrationID: id,
          key: noAuth ? "aai-keyless-endpoint" : input.key.trim(),
          label: input.name.trim(),
          location,
        })

      if (lifetime.signal.aborted || sdk.scope !== scope) return
      setStore({ open: false, key: "", id: "" })
      await refresh()

      if (lifetime.signal.aborted || sdk.scope !== scope) return
      ids
        .filter((model) => !previous?.models?.[model])
        .forEach((model) => models.setVisibility({ providerID: id, modelID: model }, true))
    } catch {
      if (!lifetime.signal.aborted && sdk.scope === scope) setStore("error", language.t("settings.compatible.failed"))
    } finally {
      if (!lifetime.signal.aborted) setStore("busy", false)
    }
  }

  const remove = async (id: string) => {
    const api = sdk.api
    const scope = sdk.scope
    setStore({ busy: true, error: "" })

    try {
      const integration = await api.integration.get({
        integrationID: id,
        location: props.directory ? { directory: props.directory } : undefined,
      })

      if (lifetime.signal.aborted || sdk.scope !== scope) return
      await Promise.all(
        integration.data.connections.flatMap((connection) =>
          connection.type === "credential" ? [api.credential.remove({ credentialID: connection.id })] : [],
        ),
      )
      await api.experimental.config.update({ providers: { [id]: null } })

      if (!lifetime.signal.aborted && sdk.scope === scope) await refresh()
    } catch {
      if (!lifetime.signal.aborted) setStore("error", language.t("settings.compatible.failed"))
    } finally {
      if (!lifetime.signal.aborted) setStore("busy", false)
    }
  }

  return (
    <section class="settings-section" aria-label={language.t("settings.compatible.title")}>
      <Show when={!store.open}>
        <FreeAPICatalog
          disabled={!configReady() || store.busy}
          installed={(profile) => existing().some(([id]) => id === freeAPIProviderID(profile))}
          setup={(profile) => edit(freeAPIProviderID(profile))}
        />
      </Show>
      <h3 class="settings-section-title">
        {language.t(preset() ? "settings.freeAPI.title" : "settings.compatible.title")}
      </h3>
      <Show when={!preset()}>
        <p class="mb-4 text-sm text-v2-text-text-muted">{language.t("settings.compatible.description")}</p>
      </Show>
      <Show when={store.error}>
        <p role="alert">{store.error}</p>
      </Show>
      <Show when={!store.open}>
        <Button onClick={() => edit()}>{language.t("settings.compatible.add")}</Button>
      </Show>
      <For each={store.open && preset() ? [] : existing()}>
        {([id, provider]) => (
          <div class="my-3 flex items-center justify-between gap-3 rounded border border-v2-border-border-base p-3">
            <div class="min-w-0">
              <p>{provider.name}</p>
              <Show when={provider.settings?.aaiNoAuth === true}>
                <p class="text-xs text-v2-text-text-muted">{language.t("settings.compatible.noAuthTag")}</p>
              </Show>
              <p class="truncate text-xs text-v2-text-text-muted">{String(provider.settings?.baseURL ?? "")}</p>
            </div>
            <div class="flex gap-2">
              <Button variant="neutral" disabled={store.busy} onClick={() => edit(id)}>
                {language.t("settings.compatible.edit")}
              </Button>
              <Button variant="neutral" disabled={store.busy} onClick={() => void remove(id)}>
                {language.t("settings.compatible.remove")}
              </Button>
            </div>
          </div>
        )}
      </For>
      <Show when={store.open}>
        <form onSubmit={(event) => void save(event)} class="mt-4 flex flex-col gap-4">
          <fieldset disabled={store.busy} class="flex flex-col gap-4">
            <Show when={preset()}>
              {(profile) => (
                <>
                  <FreeAPIGuide profile={profile()} />
                  <p class="text-sm text-v2-text-text-muted">{language.t("settings.freeAPI.installDescription")}</p>
                  <Show when={profile().auth === "account"}>
                    <label class="flex flex-col gap-2">
                      {language.t("settings.freeAPI.account")}
                      <TextInput
                        required
                        value={store.account}
                        aria-label={language.t("settings.freeAPI.account")}
                        onInput={(event) => setStore("account", event.currentTarget.value)}
                      />
                    </label>
                  </Show>
                </>
              )}
            </Show>
            <Show when={!preset()}>
              <label class="flex flex-col gap-2">
                {language.t("settings.compatible.name")}
                <TextInput
                  required
                  value={store.name}
                  aria-label={language.t("settings.compatible.name")}
                  onInput={(event) => setStore("name", event.currentTarget.value)}
                />
              </label>
            </Show>
            <Show when={!preset() || preset()?.configurableEndpoint}>
              <label class="flex flex-col gap-2">
                {language.t("settings.compatible.url")}
                <TextInput
                  required
                  value={store.url}
                  type="url"
                  placeholder="https://api.example.com/v1"
                  aria-label={language.t("settings.compatible.url")}
                  onInput={(event) => setStore("url", event.currentTarget.value)}
                />
              </label>
            </Show>
            <Show when={!preset()}>
              <label class="flex flex-col gap-2">
                {language.t("settings.compatible.protocol")}
                <select
                  class="rounded border p-2 bg-v2-background-bg-base"
                  aria-label={language.t("settings.compatible.protocol")}
                  value={store.protocol}
                  onChange={(event) => setStore("protocol", event.currentTarget.value)}
                >
                  <option value="chat">{language.t("settings.compatible.chat")}</option>
                  <option value="responses">{language.t("settings.compatible.responses")}</option>
                </select>
              </label>
            </Show>
            <Show when={!preset() || preset()?.auth === "optional"}>
              <label class="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={store.noAuth}
                  onChange={(event) => setStore("noAuth", event.currentTarget.checked)}
                />
                {language.t("settings.compatible.noAuth")}
              </label>
            </Show>
            <Show when={!store.noAuth}>
              <label class="flex flex-col gap-2">
                {language.t("settings.compatible.key")}
                <TextInput
                  type="password"
                  autocomplete="new-password"
                  value={store.key}
                  aria-label={language.t("settings.compatible.key")}
                  onInput={(event) => setStore("key", event.currentTarget.value)}
                />
                <span class="text-xs text-v2-text-text-muted">
                  {language.t(
                    existing().some(([id]) => id === store.id)
                      ? "settings.compatible.keepKey"
                      : "settings.compatible.secureKey",
                  )}
                </span>
              </label>
            </Show>
            <Show when={!preset()}>
              <label class="flex flex-col gap-2">
                {language.t("settings.compatible.models")}
                <textarea
                  required
                  rows={4}
                  class="rounded border bg-v2-background-bg-base p-3"
                  value={store.models}
                  aria-label={language.t("settings.compatible.models")}
                  onInput={(event) => setStore("models", event.currentTarget.value)}
                />
                <span class="text-xs text-v2-text-text-muted">{language.t("settings.compatible.modelHelp")}</span>
              </label>
              <div class="grid grid-cols-2 gap-3">
                <label>
                  {language.t("settings.compatible.context")}
                  <TextInput
                    type="number"
                    min="1"
                    required
                    value={store.context}
                    aria-label={language.t("settings.compatible.context")}
                    onInput={(event) => setStore("context", Number(event.currentTarget.value))}
                  />
                </label>
                <label>
                  {language.t("settings.compatible.output")}
                  <TextInput
                    type="number"
                    min="1"
                    required
                    value={store.output}
                    aria-label={language.t("settings.compatible.output")}
                    onInput={(event) => setStore("output", Number(event.currentTarget.value))}
                  />
                </label>
              </div>
              <label class="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={store.tools}
                  onChange={(event) => setStore("tools", event.currentTarget.checked)}
                />
                {language.t("settings.compatible.tools")}
              </label>
              <label class="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={store.vision}
                  onChange={(event) => setStore("vision", event.currentTarget.checked)}
                />
                {language.t("settings.compatible.vision")}
              </label>
            </Show>
            <div class="flex gap-2">
              <Button type="submit">{language.t("settings.compatible.save")}</Button>
              <Button variant="neutral" onClick={() => setStore({ open: false, id: "", key: "", error: "" })}>
                {language.t("common.cancel")}
              </Button>
            </div>
          </fieldset>
        </form>
      </Show>
    </section>
  )
}
