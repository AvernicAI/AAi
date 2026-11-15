import { Show, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { render } from "solid-js/web"
import { Option, Schema } from "effect"
import AlphieMate from "@opencode/gui-plugins/alphie/mate"
import { Mirror } from "@opencode/gui-plugins/alphie/contract"
import css from "@opencode/gui-plugins/alphie/styles?inline"
import "@opencode/app/index.css"

const decode = Schema.decodeUnknownOption(Mirror)

function MateWindow() {
  // Only the dedicated preload supplies this capability; no full desktop API is available here.
  const bridge = window.electron.alphie
  const [state, setState] = createStore<{ value?: Mirror }>({})

  if (bridge)
    onCleanup(
      bridge.subscribe((value) => {
        const decoded = decode(value)

        if (Option.isSome(decoded)) setState("value", decoded.value)
      }),
    )

  return (
    <>
      <style>{css}</style>
      <Show when={state.value}>
        {(value) => (
          <div
            style={{
              "font-family": value().font ?? "var(--font-family-sans)",
              "--background-base": value().appearance?.background,
              "--text-base": value().appearance?.text,
              "--text-weak": value().appearance?.muted,
              "color-scheme": value().appearance?.mode,
            }}
          >
            <AlphieMate
              snapshot={value().snapshot}
              size={value().preferences.size}
              opacity={1}
              floating
              labels={value().labels}
              action={(action) => bridge?.send({ type: "action", action })}
              move={(x, y) => bridge?.send({ type: "move", x, y })}
            />
          </div>
        )}
      </Show>
    </>
  )
}

const root = document.getElementById("root")

if (root && window.electron?.alphie) render(() => <MateWindow />, root)
