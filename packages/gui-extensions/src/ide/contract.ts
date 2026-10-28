import { Schema } from "effect"
import { Ipc } from "../sdk"

export const Entry = Schema.Struct({ path: Schema.String, directory: Schema.Boolean })

export const Document = Schema.Struct({ path: Schema.String, text: Schema.String, version: Schema.String })

export const Position = Schema.Struct({ line: Schema.Number, character: Schema.Number })

export const Range = Schema.Struct({ start: Position, end: Position })

export const Location = Schema.Struct({ path: Schema.String, range: Range })

export const Edit = Schema.Struct({ range: Range, newText: Schema.String })

export const Diagnostic = Schema.Struct({ range: Range, message: Schema.String, severity: Schema.Number })

export const Suggestion = Schema.Struct({
  label: Schema.String,
  insertText: Schema.String,
  kind: Schema.Number,
  detail: Schema.String,
  documentation: Schema.String,
  snippet: Schema.Boolean,
  edit: Schema.optional(Edit),
})

const Binding = Schema.Struct({ binding: Schema.String })

const Path = Schema.Struct({ binding: Schema.String, path: Schema.String })

const Cursor = Schema.Struct({ binding: Schema.String, path: Schema.String, position: Position })

const Command = Schema.Array(Schema.String)

export const Ide = Ipc.define({
  id: "ide.workspace",
  methods: {
    open: {
      input: Schema.Struct({ server: Schema.String, directory: Schema.String }),
      output: Schema.Struct({ binding: Schema.String, root: Schema.String }),
    },
    close: { input: Binding },
    list: { input: Path, output: Schema.Array(Entry) },
    read: { input: Path, output: Document },
    save: {
      input: Schema.Struct({
        binding: Schema.String,
        path: Schema.String,
        text: Schema.String,
        version: Schema.String,
      }),
      output: Document,
    },
    create: { input: Schema.Struct({ binding: Schema.String, path: Schema.String, directory: Schema.Boolean }) },
    renameFile: { input: Schema.Struct({ binding: Schema.String, path: Schema.String, target: Schema.String }) },
    trash: { input: Path },
    search: {
      input: Schema.Struct({ binding: Schema.String, query: Schema.String, caseSensitive: Schema.Boolean }),
      output: Schema.Struct({
        matches: Schema.Array(Schema.Struct({ path: Schema.String, line: Schema.Number, text: Schema.String })),
        truncated: Schema.Boolean,
      }),
    },
    git: {
      input: Binding,
      output: Schema.Struct({
        branch: Schema.String,
        changes: Schema.Array(Schema.Struct({ path: Schema.String, index: Schema.String, worktree: Schema.String })),
      }),
    },
    diff: { input: Path, output: Schema.String },
    stage: { input: Schema.Struct({ binding: Schema.String, path: Schema.String, staged: Schema.Boolean }) },
    commit: { input: Schema.Struct({ binding: Schema.String, message: Schema.String }), output: Schema.String },
    languageStart: { input: Schema.Struct({ binding: Schema.String, language: Schema.String, command: Command }) },
    languageStop: { input: Schema.Struct({ binding: Schema.String, language: Schema.String }) },
    document: {
      input: Schema.Struct({
        binding: Schema.String,
        path: Schema.String,
        language: Schema.String,
        text: Schema.String,
        version: Schema.Number,
      }),
    },
    complete: { input: Cursor, output: Schema.Array(Suggestion) },
    hover: { input: Cursor, output: Schema.String },
    locations: {
      input: Schema.Struct({ ...Cursor.fields, kind: Schema.Literals(["definition", "references"]) }),
      output: Schema.Array(Location),
    },
    format: { input: Path, output: Schema.Array(Edit) },
    rename: {
      input: Schema.Struct({ ...Cursor.fields, name: Schema.String }),
      output: Schema.Array(Schema.Struct({ path: Schema.String, edits: Schema.Array(Edit) })),
    },
    debugStart: {
      input: Schema.Struct({
        binding: Schema.String,
        command: Command,
        configuration: Schema.JsonObject,
      }),
    },
    debugRequest: {
      input: Schema.Struct({
        binding: Schema.String,
        command: Schema.String,
        arguments: Schema.JsonObject,
      }),
      output: Schema.Json,
    },
    debugStop: { input: Binding },
  },
  events: {
    open: Schema.Null,
    diagnostics: Schema.Struct({ binding: Schema.String, path: Schema.String, diagnostics: Schema.Array(Diagnostic) }),
    debug: Schema.Struct({ binding: Schema.String, event: Schema.String, body: Schema.Json }),
    status: Schema.Struct({ binding: Schema.String, service: Schema.String, message: Schema.String }),
  },
})

export type Ide = typeof Ide
