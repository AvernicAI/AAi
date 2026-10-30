import type { ComponentProps } from "solid-js"
import { AaiGlyphs } from "../../components/brand-glyphs"

export function Wordmark(
  props: Pick<ComponentProps<"svg">, "class"> & { fade?: boolean; muted?: boolean; outline?: boolean },
) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 234 42"
      class={props.class}
      aria-hidden="true"
      style={{
        "mask-image": props.fade === false ? undefined : "linear-gradient(to bottom, #fff 45%, transparent)",
        overflow: props.outline ? "visible" : undefined,
      }}
    >
      <g
        opacity={props.muted === false ? 1 : 0.6}
        fill={props.outline ? "none" : "currentColor"}
        stroke={props.outline ? "currentColor" : undefined}
        stroke-width={props.outline ? 1 : undefined}
      >
        <AaiGlyphs outline={props.outline} />
      </g>
    </svg>
  )
}
