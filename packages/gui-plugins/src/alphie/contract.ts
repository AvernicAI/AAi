import { Contract, Ipc } from "@opencode/plugin/gui"
import { Schema } from "effect"

export const Pose = Schema.Literals(["idle", "wave", "walk", "typing", "lifting", "cheering", "sleeping"])

export type Pose = typeof Pose.Type

export const Preferences = Schema.Struct({
  features: Schema.Struct({ alphieMate: Schema.Boolean }),
  size: Schema.Number,
  opacity: Schema.Number,
  floating: Schema.Boolean,
  alwaysOnTop: Schema.Boolean,
  sleepSeconds: Schema.Number,
  x: Schema.Number,
  y: Schema.Number,
})

export const Snapshot = Schema.Struct({
  pose: Pose,
  label: Schema.String,
  bubble: Schema.String,
  busy: Schema.Boolean,
  resting: Schema.Boolean,
})

export type Snapshot = typeof Snapshot.Type

export const Action = Schema.Literals([
  "chat",
  "wave",
  "lifting",
  "cheering",
  "walk",
  "sleeping",
  "ide",
  "settings",
  "quit",
])

export type Action = typeof Action.Type

export const Mirror = Schema.Struct({
  font: Schema.optional(Schema.String),
  appearance: Schema.optional(
    Schema.Struct({
      background: Schema.String,
      text: Schema.String,
      muted: Schema.String,
      mode: Schema.Literals(["light", "dark"]),
    }),
  ),
  snapshot: Snapshot,
  preferences: Preferences,
  labels: Schema.Record(Schema.String, Schema.String),
})

export type Mirror = typeof Mirror.Type

export type MateMessage = { type: "action"; action: Action } | { type: "move"; x: number; y: number }

export type AlphieBridge = {
  subscribe(listener: (value: Mirror) => void): () => void
  send(message: MateMessage): void
}

export const Mate = Ipc.define({
  id: "alphie.mate",
  methods: {
    update: {
      input: Mirror,
      output: Schema.Boolean,
    },
    hide: {},
  },
  events: { action: Action },
})

export const Alphie = Contract.define<
  {
    enabled(): boolean
    snapshot(): Snapshot
    navigate(): void
    task(input: { id: string; status: string; session: string }): void
  },
  "alphie.state"
>("alphie.state")

export const assets: Record<Pose, string> = {
  idle: "alphie_idle_flex_cutout.png",
  wave: "alphie_sitting_wave_cutout.png",
  walk: "alphie_walking_cutout.png",
  typing: "alphie_typing_cutout.png",
  lifting: "alphie_lifting_cutout.png",
  cheering: "alphie_cheering_cutout.png",
  sleeping: "alphie_sleeping_cutout.png",
}
