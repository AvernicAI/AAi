import { For } from "solid-js"

/** AAi's vector letters, shared with the interactive new-session wordmark. */
export const AaiLetters = [
  {
    cx: 59,
    weak: "M68 24H50V18H68V24Z",
    fill: "var(--icon-base)",
    stem: "M24 36L50 6H68L94 36H74L70 30H48L44 36H24ZM54 18L50 24H68L64 18H54Z",
  },
  {
    cx: 149,
    weak: "M158 24H140V18H158V24Z",
    fill: "var(--icon-strong-base)",
    stem: "M114 36L140 6H158L184 36H164L160 30H138L134 36H114ZM144 18L140 24H158L154 18H144Z",
  },
  {
    cx: 222,
    weak: "M228 18H216V12H228V18Z",
    fill: "var(--icon-strong-base)",
    stem: "M234 6H210V24H234V6ZM216 12H228V18H216V12ZM228 30H216V42H228V30Z",
  },
] as const

/** The same AAi geometry for filled marks and the first-launch outline animation. */
export function AaiGlyphs(props: { outline?: boolean }) {
  return (
    <For each={AaiLetters}>
      {(letter) => <path d={letter.stem} fill-rule="evenodd" pathLength={props.outline ? 1 : undefined} />}
    </For>
  )
}
