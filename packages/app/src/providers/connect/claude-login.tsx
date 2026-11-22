import { createSignal, onCleanup, Show } from "solid-js"
import { Button } from "@opencode/ui/button"
import { Loader } from "@opencode/ui/loader"
import { uuid } from "@opencode/util/uuid"
import { useLanguage } from "@/runtime/i18n/language"
import { usePlatform } from "@/runtime/platform/platform"
import { useServerSDK } from "@/runtime/server/client"
import { ServerConnection } from "@/runtime/server/registry"
import { transition, type State } from "./claude-login-machine"

export function ClaudeLogin() {
  const platform = usePlatform()
  const language = useLanguage()
  const sdk = useServerSDK()
  const [state, setState] = createSignal<State>({ status: "idle" })
  const dispatch = (event: Parameters<typeof transition>[1]) => setState((current) => transition(current, event))
  let timer: ReturnType<typeof setTimeout> | undefined

  onCleanup(() => {
    clearTimeout(timer)
    dispatch({ type: "dispose" })
  })

  const open = () => {
    if (!platform.launchClaudeLogin || state().status === "opening") return
    const attempt = uuid()
    dispatch({ type: "open", attempt })
    const deadline = setTimeout(() => dispatch({ type: "failed", attempt }), 15_000)
    timer = deadline

    void platform.launchClaudeLogin().then(
      (opened) => {
        clearTimeout(deadline)
        dispatch({ type: opened ? "launched" : "failed", attempt })
      },
      () => {
        clearTimeout(deadline)
        dispatch({ type: "failed", attempt })
      },
    )
  }

  return (
    <Show
      when={platform.platform === "desktop" && !!platform.launchClaudeLogin && ServerConnection.builtin(sdk.server)}
    >
      <Button disabled={state().status === "opening"} onClick={open}>
        <Show when={state().status === "opening"}>
          <Loader />
        </Show>
        {language.t("provider.connect.claudeAgent.signIn.open")}
      </Button>
      <Show when={state().status === "launched"}>
        <p role="status">{language.t("provider.connect.claudeAgent.signIn.finish")}</p>
      </Show>
      <Show when={state().status === "failed"}>
        <p role="alert">{language.t("provider.connect.claudeAgent.signIn.failed")}</p>
      </Show>
    </Show>
  )
}
