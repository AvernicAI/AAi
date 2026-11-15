import { For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { assets, type Action, type Snapshot } from "./contract"

/** The same sprite surface is used docked and in the existing app's utility window. */
export default function AlphieMate(props: {
  snapshot: Snapshot
  size: number
  opacity: number
  floating?: boolean
  x?: number
  y?: number
  labels: Record<string, string>
  action(action: Action): void
  move(x: number, y: number): void
}) {
  const [state, setState] = createStore({ menu: false, dragging: false, dx: 0, dy: 0 })
  const pointer = { x: 0, y: 0, moved: false }
  const menu: Action[] = ["chat", "wave", "lifting", "cheering", "walk", "sleeping", "ide", "settings", "quit"]

  return (
    <aside
      class="alphie-mate"
      classList={{ "alphie-mate-floating": props.floating, "alphie-mate-dragging": state.dragging }}
      data-pose={props.snapshot.pose}
      data-resting={props.snapshot.resting}
      style={{
        width: `${props.size}px`,
        opacity: props.opacity,
        left: props.floating || props.x === undefined || props.x < 0 ? undefined : `${props.x + state.dx}px`,
        top: props.floating || props.y === undefined || props.y < 0 ? undefined : `${props.y + state.dy}px`,
        transform:
          !props.floating && (props.x === undefined || props.x < 0)
            ? `translate(${state.dx}px, ${state.dy}px)`
            : undefined,
      }}
      aria-label="Alphie"
      onContextMenu={(event) => {
        event.preventDefault()
        setState("menu", !state.menu)
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") setState("menu", false)
      }}
    >
      <div class="alphie-bubble" role="status" aria-live="polite">
        <strong>
          Alphie <span>{props.snapshot.label}</span>
        </strong>
        <div>{props.snapshot.bubble}</div>
      </div>
      <button
        type="button"
        class="alphie-sprite"
        title={props.labels.move}
        aria-label={props.labels.chat}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          pointer.x = event.screenX
          pointer.y = event.screenY
          pointer.moved = false
          event.currentTarget.setPointerCapture(event.pointerId)
          setState({ dragging: true, menu: false })
        }}
        onPointerMove={(event) => {
          if (!state.dragging) return
          const dx = event.screenX - pointer.x
          const dy = event.screenY - pointer.y

          if (Math.abs(dx) + Math.abs(dy) < 5 && !pointer.moved) return

          if (!pointer.moved) props.action("walk")
          pointer.moved = true

          if (props.floating) {
            props.move(dx, dy)
            pointer.x = event.screenX
            pointer.y = event.screenY

            return
          }

          setState({ dx, dy })
        }}
        onPointerUp={(event) => {
          if (!state.dragging) return
          const bounds = event.currentTarget.parentElement?.getBoundingClientRect()

          if (pointer.moved && !props.floating && bounds) props.move(bounds.left, bounds.top)
          setState({ dragging: false, dx: 0, dy: 0 })
          event.currentTarget.releasePointerCapture(event.pointerId)

          if (!pointer.moved) props.action("chat")
        }}
        onPointerCancel={() => setState({ dragging: false, dx: 0, dy: 0 })}
        onClick={(event) => {
          if (event.detail === 0) props.action("chat")
        }}
      >
        <picture>
          <Show when={props.snapshot.pose === "lifting"}>
            <source
              media="(prefers-reduced-motion: no-preference)"
              srcset="./assets/alphie/alphie_lifting_transparent.gif"
            />
          </Show>
          <img src={`./assets/alphie/${assets[props.snapshot.pose]}`} alt="" draggable={false} />
        </picture>
      </button>
      <Show when={state.menu}>
        <nav class="alphie-menu" aria-label={props.labels.menu}>
          <For each={menu}>
            {(action) => (
              <button
                type="button"
                onClick={() => {
                  setState("menu", false)
                  props.action(action)
                }}
              >
                {props.labels[action]}
              </button>
            )}
          </For>
        </nav>
      </Show>
    </aside>
  )
}
