import { createMemo, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { Schema } from "effect"
import { Button } from "@opencode/ui/button"
import { usePlugin } from "@opencode/plugin/gui"
import { Recipe } from "./contract"
import { exportRecipes, importRecipes } from "./recipes-model"
import type definition from "./index"

export default function RecipesPage(props: { onUse?: () => void }) {
  const ctx = usePlugin<typeof definition>()

  const [state, setState] = createStore({
    query: "",
    title: "",
    description: "",
    prompt: "",
    editing: "",
    selected: "",
    busy: false,
    error: "",
    message: "",
  })

  const defaults = () =>
    ["review", "debug", "tests", "ship", "onboard", "architecture"].map((id) => ({
      id: `aai-${id}`,
      title: ctx.t(`recipes.${id}.title`),
      description: ctx.t(`recipes.${id}.description`),
      prompt: ctx.t(`recipes.${id}.prompt`),
    }))

  const recipes = () => [...defaults(), ...ctx.stores.recipes.value]

  const filtered = createMemo(() =>
    recipes().filter((item) =>
      `${item.title} ${item.description}`.toLowerCase().includes(state.query.trim().toLowerCase()),
    ),
  )

  const selected = () => recipes().find((item) => item.id === state.selected)
  const fail = () => setState("error", ctx.t("recipes.failed"))

  const persist = async () => {
    if (state.busy) return
    setState({ busy: true, error: "", message: "" })

    try {
      const value = Schema.decodeUnknownSync(Recipe)({
        id: state.editing || crypto.randomUUID(),
        title: state.title.trim(),
        description: state.description.trim(),
        prompt: state.prompt.trim(),
      })

      if (!state.editing && ctx.stores.recipes.value.length >= 100) throw new Error("recipes.limit")
      await ctx.stores.recipes.update((items) => {
        const index = items.findIndex((item) => item.id === value.id)

        if (index >= 0) items[index] = value

        if (index < 0) items.push(value)
      })

      if (!ctx.signal.aborted)
        setState({
          title: "",
          description: "",
          prompt: "",
          editing: "",
          selected: value.id,
          message: ctx.t("recipes.saved"),
        })
    } catch {
      fail()
    } finally {
      if (!ctx.signal.aborted) setState("busy", false)
    }
  }

  const importFile = async (file: File) => {
    setState({ busy: true, error: "", message: "" })

    try {
      if (file.size > 1024 * 1024) throw new Error("recipes.invalid")
      const items = importRecipes(await file.text())

      if (ctx.signal.aborted) return

      if (ctx.stores.recipes.value.length + items.length > 100) throw new Error("recipes.limit")
      await ctx.stores.recipes.update((draft) => {
        draft.push(...items.map((item) => ({ ...item, id: crypto.randomUUID() })))
      })

      if (!ctx.signal.aborted) setState("message", ctx.t("recipes.imported"))
    } catch {
      fail()
    } finally {
      if (!ctx.signal.aborted) setState("busy", false)
    }
  }

  const copy = async (text: string) => {
    try {
      await ctx.system.copy(text)

      if (!ctx.signal.aborted) setState("message", ctx.t("recipes.copied"))
    } catch {
      fail()
    }
  }

  return (
    <div class="aai-skill-library">
      <p>{ctx.t("recipes.description")}</p>
      <Show when={state.error}>
        <p role="alert" class="aai-skill-error">
          {state.error}
        </p>
      </Show>
      <Show when={state.message}>
        <p role="status">{state.message}</p>
      </Show>
      <div class="aai-library-actions">
        <Button
          variant="neutral"
          disabled={state.busy || !ctx.stores.recipes.value.length}
          onClick={() =>
            void ctx.system
              .save({ name: "AAi-prompts.json", content: exportRecipes(ctx.stores.recipes.value) })
              .catch(fail)
          }
        >
          {ctx.t("recipes.export")}
        </Button>
        <label class="aai-library-import">
          {ctx.t("recipes.import")}
          <input
            type="file"
            accept="application/json,.json"
            disabled={state.busy}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]

              if (file) void importFile(file)
              event.currentTarget.value = ""
            }}
          />
        </label>
      </div>
      <input
        aria-label={ctx.t("recipes.search")}
        placeholder={ctx.t("recipes.search")}
        value={state.query}
        onInput={(event) => setState("query", event.currentTarget.value)}
      />
      <div class="aai-skill-columns">
        <div class="aai-skill-results" data-scrollable>
          <Show when={!filtered().length}>
            <p>{ctx.t("recipes.empty")}</p>
          </Show>
          <For each={filtered()}>
            {(item) => (
              <button
                class="aai-skill-result"
                aria-pressed={state.selected === item.id}
                onClick={() => setState({ selected: item.id, error: "", message: "" })}
              >
                <strong>{item.title}</strong>
                <p>{item.description}</p>
                <span>{ctx.t(item.id.startsWith("aai-") ? "recipes.builtin" : "recipes.personal")}</span>
              </button>
            )}
          </For>
        </div>
        <section class="aai-skill-preview" data-scrollable aria-label={ctx.t("recipes.preview")}>
          <Show when={selected()} fallback={<p>{ctx.t("recipes.select")}</p>}>
            {(item) => (
              <>
                <h3>{item().title}</h3>
                <p>{item().description}</p>
                <pre data-scrollable>{item().prompt}</pre>
                <div class="aai-library-actions">
                  <Button variant="neutral" onClick={() => void copy(item().prompt)}>
                    {ctx.t("recipes.copy")}
                  </Button>
                  <Button
                    disabled={!ctx.screen.current()}
                    onClick={() => {
                      const composer = ctx.screen.current()?.composer

                      if (!composer) return
                      composer.insert(`${composer.text() ? "\n\n" : ""}${item().prompt}`)
                      props.onUse?.()
                      composer.focus()
                    }}
                  >
                    {ctx.t("recipes.use")}
                  </Button>
                </div>
                <Show when={!ctx.screen.current()}>
                  <p>{ctx.t("recipes.sessionHint")}</p>
                </Show>
                <Show when={!item().id.startsWith("aai-")}>
                  <div class="aai-library-actions">
                    <Button
                      variant="ghost"
                      onClick={() =>
                        setState({
                          editing: item().id,
                          title: item().title,
                          description: item().description,
                          prompt: item().prompt,
                        })
                      }
                    >
                      {ctx.t("recipes.edit")}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        const id = item().id

                        if (
                          !(await ctx.dialogs.confirm({
                            title: ctx.t("recipes.deleteQuestion"),
                            confirm: ctx.t("recipes.delete"),
                            danger: true,
                          }))
                        )
                          return
                        ctx.stores.recipes.update((items) => {
                          const index = items.findIndex((item) => item.id === id)

                          if (index >= 0) items.splice(index, 1)
                        })
                        setState("selected", "")
                      }}
                    >
                      {ctx.t("recipes.delete")}
                    </Button>
                  </div>
                </Show>
              </>
            )}
          </Show>
        </section>
      </div>
      <form
        class="aai-skill-catalog-form"
        onSubmit={(event) => {
          event.preventDefault()
          void persist()
        }}
      >
        <h3>{ctx.t(state.editing ? "recipes.edit" : "recipes.create")}</h3>
        <label class="aai-skill-field">
          <span>{ctx.t("recipes.name")}</span>
          <input
            required
            maxLength={160}
            value={state.title}
            onInput={(event) => setState("title", event.currentTarget.value)}
          />
        </label>
        <label class="aai-skill-field">
          <span>{ctx.t("recipes.summary")}</span>
          <input
            maxLength={1000}
            value={state.description}
            onInput={(event) => setState("description", event.currentTarget.value)}
          />
        </label>
        <label class="aai-skill-field">
          <span>{ctx.t("recipes.prompt")}</span>
          <textarea
            required
            rows={6}
            maxLength={100000}
            value={state.prompt}
            onInput={(event) => setState("prompt", event.currentTarget.value)}
          />
        </label>
        <div class="aai-library-actions">
          <Button type="submit" disabled={state.busy}>
            {ctx.t("recipes.save")}
          </Button>
          <Show when={state.editing}>
            <Button variant="ghost" onClick={() => setState({ editing: "", title: "", description: "", prompt: "" })}>
              {ctx.t("recipes.cancel")}
            </Button>
          </Show>
        </div>
      </form>
    </div>
  )
}
