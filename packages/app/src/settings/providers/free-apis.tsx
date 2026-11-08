import { createSignal, For, Show } from "solid-js"
import { Badge } from "@opencode/ui/badge"
import { Button } from "@opencode/ui/button"
import {
  freeAPIs,
  freeAPIInput,
  freeAPISource,
  freeAPITier,
  freeAPIUse,
  type FreeAPI,
} from "@/providers/catalog/free-apis"
import { useLanguage } from "@/runtime/i18n/language"
import { ExternalLink } from "@/runtime/platform/external-link"

const notes = [
  ["hetzner", "settings.freeAPI.note.hetzner"],
  ["pollinations", "settings.freeAPI.note.pollinations"],
  ["publicai", "settings.freeAPI.note.publicai"],
  ["agnes", "settings.freeAPI.note.agnes"],
  ["bazaarlink", "settings.freeAPI.note.bazaarlink"],
  ["nara", "settings.freeAPI.note.nara"],
  ["radeon", "settings.freeAPI.note.radeon"],
  ["requesty", "settings.freeAPI.note.requesty"],
  ["routeway", "settings.freeAPI.note.routeway"],
  ["sealion", "settings.freeAPI.note.sealion"],
  ["unorouter", "settings.freeAPI.note.unorouter"],
  ["xkiro", "settings.freeAPI.note.xkiro"],
  ["electronhub", "settings.freeAPI.note.electronhub"],
  ["router9", "settings.freeAPI.note.router9"],
  ["septor", "settings.freeAPI.note.septor"],
  ["clod", "settings.freeAPI.note.clod"],
  ["airforce", "settings.freeAPI.note.airforce"],
  ["dreamprompting", "settings.freeAPI.note.dreamprompting"],
  ["waterfall", "settings.freeAPI.note.waterfall"],
  ["logfare", "settings.freeAPI.note.logfare"],
  ["freellmapi", "settings.freeAPI.note.freellmapi"],
  ["aion", "settings.freeAPI.note.aion"],
  ["cohere", "settings.freeAPI.note.cohere"],
  ["google", "settings.freeAPI.note.google"],
  ["mistral", "settings.freeAPI.note.mistral"],
  ["zhipu", "settings.freeAPI.note.zhipu"],
  ["cloudflare", "settings.freeAPI.note.cloudflare"],
  ["gonka", "settings.freeAPI.note.gonka"],
  ["groq", "settings.freeAPI.note.groq"],
  ["kilo", "settings.freeAPI.note.kilo"],
  ["llm7", "settings.freeAPI.note.llm7"],
  ["modelscope", "settings.freeAPI.note.modelscope"],
  ["nvidia", "settings.freeAPI.note.nvidia"],
  ["openrouter", "settings.freeAPI.note.openrouter"],
  ["ovh", "settings.freeAPI.note.ovh"],
  ["siliconflow", "settings.freeAPI.note.siliconflow"],
] as const

const noteByID = new Map<string, (typeof notes)[number][1]>(notes)

export function FreeAPICatalog(props: {
  disabled: boolean
  installed: (profile: FreeAPI) => boolean
  setup: (profile: FreeAPI) => void
}) {
  const language = useLanguage()
  const [selected, select] = createSignal(freeAPIs[0].id)
  const profile = () => freeAPIs.find((entry) => entry.id === selected())

  return (
    <section class="mb-5 flex flex-col gap-3" aria-label={language.t("settings.freeAPI.title")}>
      <h3 class="settings-section-title">{language.t("settings.freeAPI.title")}</h3>
      <p class="text-sm text-v2-text-text-muted">{language.t("settings.freeAPI.description")}</p>
      <div class="flex flex-wrap items-center gap-3">
        <select
          class="min-w-0 rounded border border-v2-border-border-base bg-v2-background-bg-base p-2"
          aria-label={language.t("settings.freeAPI.provider")}
          value={selected()}
          onChange={(event) => select(event.currentTarget.value)}
        >
          <For each={freeAPIs}>{(entry) => <option value={entry.id}>{entry.name}</option>}</For>
        </select>
        <Show when={profile()}>
          {(entry) => (
            <Button disabled={props.disabled} onClick={() => props.setup(entry())}>
              {language.t(props.installed(entry()) ? "settings.freeAPI.configure" : "settings.freeAPI.connect")}
            </Button>
          )}
        </Show>
      </div>
      <Show when={profile()}>{(entry) => <FreeAPIGuide profile={entry()} />}</Show>
      <ExternalLink href={freeAPISource}>{language.t("settings.freeAPI.source")}</ExternalLink>
    </section>
  )
}

export function FreeAPIGuide(props: { profile: FreeAPI }) {
  const language = useLanguage()

  const auth = () => {
    if (props.profile.auth === "anonymous") return "settings.freeAPI.anonymous"

    if (props.profile.auth === "optional") return "settings.freeAPI.optionalKey"

    return "settings.freeAPI.requiresKey"
  }

  const format = (tokens: number | null) =>
    tokens === null ? language.t("settings.freeAPI.varies") : tokens.toLocaleString(language.intl())

  return (
    <div class="flex min-w-0 flex-col gap-3 rounded border border-v2-border-border-base p-3">
      <div class="flex flex-wrap items-center gap-2">
        <strong>{props.profile.name}</strong>
        <Badge>{language.t(freeAPITier(props.profile))}</Badge>
        <Badge>{language.t(auth())}</Badge>
      </div>
      <Show when={noteByID.get(props.profile.id)}>
        {(key) => <p class="text-sm text-v2-text-text-muted">{language.t(key())}</p>}
      </Show>
      <div class="flex flex-wrap gap-x-4 gap-y-2">
        <ExternalLink href={props.profile.docs}>{language.t("settings.freeAPI.terms")}</ExternalLink>
        <Show when={props.profile.catalog}>
          {(source) => <ExternalLink href={source()}>{language.t("settings.freeAPI.modelSource")}</ExternalLink>}
        </Show>
        <Show when={props.profile.auth !== "anonymous"}>
          <ExternalLink href={props.profile.keyURL}>{language.t("settings.freeAPI.getKey")}</ExternalLink>
        </Show>
      </div>
      <details>
        <summary class="cursor-pointer">{language.t("settings.freeAPI.review")}</summary>
        <ul class="mt-2 grid gap-2">
          <For each={props.profile.models}>
            {(model) => (
              <li class="grid min-w-0 gap-1 rounded border border-v2-border-border-base p-2">
                <strong class="break-words">{model.name}</strong>
                <code class="break-all text-xs text-v2-text-text-muted">{model.id}</code>
                <p class="text-sm">
                  {language.t("settings.freeAPI.bestFor", { use: language.t(freeAPIUse(model, props.profile)) })}
                </p>
                <p class="text-sm text-v2-text-text-muted">
                  {language.t("settings.freeAPI.listedInputs", { modality: model.modality })}
                </p>
                <Show
                  when={!model.reference}
                  fallback={
                    <p class="text-sm text-v2-text-text-muted">
                      {language.t(
                        model.reference === "embeddings"
                          ? "settings.freeAPI.embeddings"
                          : "settings.freeAPI.retirement",
                      )}
                    </p>
                  }
                >
                  <p class="text-sm text-v2-text-text-muted">
                    {language.t(
                      freeAPIInput(model).includes("image")
                        ? "settings.freeAPI.chatVision"
                        : "settings.freeAPI.chatText",
                    )}
                    {" · "}
                    {language.t(model.tools ? "settings.freeAPI.tools" : "settings.freeAPI.toolsOff")}
                  </p>
                  <p class="text-sm text-v2-text-text-muted">
                    {language.t("settings.freeAPI.limits", {
                      context: format(model.context),
                      output: format(model.output),
                    })}
                  </p>
                </Show>
                <Show when={model.quota}>{(quota) => <p class="text-sm text-v2-text-text-muted">{quota()}</p>}</Show>
              </li>
            )}
          </For>
        </ul>
      </details>
    </div>
  )
}
