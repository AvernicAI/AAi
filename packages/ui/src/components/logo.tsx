import type { ComponentProps } from "solid-js"
import { AaiGlyphs } from "./brand-glyphs"

export const Mark = (props: { class?: string }) => (
  <svg
    data-component="logo-mark"
    class={props.class}
    viewBox="0 0 42 42"
    fill="var(--icon-strong-base)"
    aria-hidden="true"
  >
    <path fill-rule="evenodd" d="M3 35L16 7H25L38 35H28L25 28H15L12 35H3ZM19 16L17 22H23L21 16H19Z" />
    <circle cx="35" cy="8" r="3" />
  </svg>
)

export const Splash = (props: Pick<ComponentProps<"svg">, "ref" | "class">) => (
  <svg
    ref={props.ref}
    data-component="logo-splash"
    class={props.class}
    viewBox="0 0 234 42"
    fill="var(--icon-strong-base)"
    aria-hidden="true"
  >
    <AaiGlyphs />
  </svg>
)

export const Logo = (props: { class?: string }) => (
  <svg data-component="logo" class={props.class} viewBox="0 0 234 42" fill="var(--icon-base)" aria-hidden="true">
    <AaiGlyphs />
  </svg>
)
