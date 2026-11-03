import { For, Show, createEffect, createMemo, on, onCleanup, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { Button } from "@opencode/ui/button"
import { Loader } from "@opencode/ui/loader"
import { useProviders } from "@/providers/catalog/providers"
import { useData } from "@/runtime/server/current"
import { useServerSDK } from "@/runtime/server/client"
import { usePlatform } from "@/runtime/platform/platform"
import { useLanguage } from "@/runtime/i18n/language"
import { useSettingsSurface } from "@/settings/surface"

export function SettingsDeveloper(props: { directory?: string; headerAction?: JSX.Element }) {
  const language = useLanguage()
  const data = useData()
  const sdk = useServerSDK()
  const platform = usePlatform()
  const surface = useSettingsSurface()
  const providers = useProviders(() => props.directory)
  const lifetime = new AbortController()
  onCleanup(() => lifetime.abort())
  const [store, setStore] = createStore({ checking: false, copying: false, copied: false, error: false, retry: "" })
  const location = () => (props.directory ? { directory: props.directory } : data.location.default())
  const servers = () => data.location.mcp.server.list(location())
  const skills = () => data.location.skill.list(location())
  const loaded = () => providers.ready() && servers() !== undefined && skills() !== undefined

  const failures = createMemo(() =>
    (servers() ?? []).filter((server) => server.status.status === "failed" || server.status.status === "needs_auth"),
  )

  const refresh = async () => {
    if (store.checking) return
    const scope = sdk.scope
    const ref = location()
    setStore({ checking: true, error: false, copied: false })

    try {
      await Promise.all([
        data.location.provider.sync(ref),
        data.location.model.sync(ref),
        data.location.mcp.server.sync(ref),
        data.location.skill.sync(ref),
        data.location.integration.sync(ref),
      ])
    } catch {
      if (!lifetime.signal.aborted && sdk.scope === scope) setStore("error", true)
    } finally {
      if (!lifetime.signal.aborted) setStore("checking", false)
    }
  }

  createEffect(
    on(
      () => [sdk.connection.status(), props.directory] as const,
      ([status]) => {
        if (status === "connected") void refresh()
      },
    ),
  )

  const retry = async (name: string) => {
    if (store.retry) return
    const api = sdk.api
    const scope = sdk.scope
    const ref = location()
    setStore({ retry: name, error: false })

    try {
      await api.experimental.mcp.connect({ server: name, location: ref })

      if (lifetime.signal.aborted || sdk.scope !== scope) return
      await data.location.mcp.server.sync(ref)
    } catch {
      if (!lifetime.signal.aborted && sdk.scope === scope) setStore("error", true)
    } finally {
      if (!lifetime.signal.aborted) setStore("retry", "")
    }
  }

  const summary = () => ({
    application: "AAi",
    version: platform.version ?? null,
    reportVersion: 1,
    providers: {
      connected: providers.connected().length,
      models: providers.connected().reduce((count, provider) => count + Object.keys(provider.models).length, 0),
    },
    mcp: {
      total: (servers() ?? []).length,
      connected: (servers() ?? []).filter((server) => server.status.status === "connected").length,
      disabled: (servers() ?? []).filter((server) => server.status.status === "disabled").length,
      pending: (servers() ?? []).filter((server) => server.status.status === "pending").length,
      failed: (servers() ?? []).filter((server) => server.status.status === "failed").length,
      needsAuth: (servers() ?? []).filter((server) => server.status.status === "needs_auth").length,
    },
    skills: { available: (skills() ?? []).length },
  })

  const copy = async () => {
    setStore({ copying: true, copied: false, error: false })

    try {
      // Deliberately construct counts only: never serialize server/config objects, names, URLs or errors.
      const text = JSON.stringify(summary(), null, 2)
      await (platform.writeClipboardText?.(text) ?? navigator.clipboard.writeText(text))

      if (!lifetime.signal.aborted) setStore("copied", true)
    } catch {
      if (!lifetime.signal.aborted) setStore("error", true)
    } finally {
      if (!lifetime.signal.aborted) setStore("copying", false)
    }
  }

  return (
    <>
      <div class="settings-tab-header">
        <div class="settings-tab-header-row">
          <div class="flex min-w-0 flex-col gap-1">
            <h2 class="settings-tab-title">{language.t("settings.developer.title")}</h2>
            <p class="text-sm text-v2-text-text-muted">{language.t("settings.developer.description")}</p>
          </div>
          <div class="settings-tab-header-actions">{props.headerAction}</div>
        </div>
      </div>
      <div class="settings-tab-body settings-tab-body--sectioned flex flex-col gap-5">
        <div class="flex flex-wrap gap-2">
          <Button disabled={store.checking} onClick={() => void refresh()}>
            {language.t("settings.developer.refresh")}
          </Button>
          <Button variant="neutral" disabled={!loaded() || store.checking || store.copying} onClick={() => void copy()}>
            {language.t(store.copied ? "settings.developer.copied" : "settings.developer.copy")}
          </Button>
        </div>
        <p class="text-sm text-v2-text-text-muted">{language.t("settings.developer.privacy")}</p>
        <Show when={store.error}>
          <p role="alert">{language.t("settings.developer.failed")}</p>
        </Show>
        <Show when={loaded()} fallback={<Loader />}>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <section
              class="rounded-md border border-v2-border-border-base p-4"
              aria-label={language.t("settings.developer.providers")}
            >
              <h3>{language.t("settings.developer.providers")}</h3>
              <p class="my-2 text-2xl font-medium">{summary().providers.connected}</p>
              <p class="text-sm text-v2-text-text-muted">
                {language.t("settings.developer.models", { count: summary().providers.models })}
              </p>
              <Button class="mt-3" variant="neutral" onClick={() => surface.select("providers")}>
                {language.t("settings.developer.manageProviders")}
              </Button>
            </section>
            <section
              class="rounded-md border border-v2-border-border-base p-4"
              aria-label={language.t("settings.developer.mcp")}
            >
              <h3>{language.t("settings.developer.mcp")}</h3>
              <p class="my-2 text-2xl font-medium">
                {summary().mcp.connected} / {summary().mcp.total}
              </p>
              <p class="text-sm text-v2-text-text-muted">{language.t("settings.developer.connected")}</p>
              <Button
                class="mt-3"
                variant="neutral"
                onClick={() =>
                  surface.replace({ type: "root", tab: "extensions", server: surface.server()?.key, subtab: "mcps" })
                }
              >
                {language.t("settings.developer.manageMcp")}
              </Button>
            </section>
            <section
              class="rounded-md border border-v2-border-border-base p-4"
              aria-label={language.t("settings.developer.skills")}
            >
              <h3>{language.t("settings.developer.skills")}</h3>
              <p class="my-2 text-2xl font-medium">{summary().skills.available}</p>
              <p class="text-sm text-v2-text-text-muted">{language.t("settings.developer.available")}</p>
              <Button
                class="mt-3"
                variant="neutral"
                onClick={() =>
                  surface.replace({ type: "root", tab: "extensions", server: surface.server()?.key, subtab: "skills" })
                }
              >
                {language.t("settings.developer.manageSkills")}
              </Button>
            </section>
          </div>
          <section aria-label={language.t("settings.developer.attention")}>
            <h3 class="settings-section-title">{language.t("settings.developer.attention")}</h3>
            <Show
              when={failures().length}
              fallback={<p class="text-sm text-v2-text-text-muted">{language.t("settings.developer.noFailures")}</p>}
            >
              <For each={failures()}>
                {(server) => (
                  <div class="my-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-v2-border-border-base p-3">
                    <div>
                      <p>{server.name}</p>
                      <p class="text-sm text-v2-text-text-muted">
                        {language.t(
                          server.status.status === "needs_auth" ? "mcp.status.needs_auth" : "mcp.status.failed",
                        )}
                      </p>
                    </div>
                    <Show
                      when={server.status.status === "failed"}
                      fallback={
                        <Button
                          variant="neutral"
                          onClick={() =>
                            surface.replace({
                              type: "root",
                              tab: "extensions",
                              server: surface.server()?.key,
                              subtab: "mcps",
                            })
                          }
                        >
                          {language.t("settings.developer.manageMcp")}
                        </Button>
                      }
                    >
                      <Button
                        variant="neutral"
                        disabled={!!store.retry}
                        aria-label={language.t("settings.developer.retryNamed", { name: server.name })}
                        onClick={() => void retry(server.name)}
                      >
                        {language.t("settings.developer.retry")}
                      </Button>
                    </Show>
                  </div>
                )}
              </For>
            </Show>
          </section>
        </Show>
      </div>
    </>
  )
}
