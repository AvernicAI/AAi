import { onCleanup, onMount } from "solid-js"
import { createKeyed, useExtension, type SessionScreen } from "../sdk"
import { editor, languages, KeyCode, KeyMod, Uri, Range } from "monaco-editor"
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker"
import TypeScriptWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker"
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker"
import CssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker"
import HtmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker"
import type { IdeModel } from "./model"
import type definition from "./index"

type EditorHost = { element?: HTMLDivElement; editor?: editor.IStandaloneCodeEditor }

type Decorations = { current?: editor.IEditorDecorationsCollection }

export default function CodeEditor(props: {
  model: IdeModel
  screen: SessionScreen
  reveal?: { path: string; line: number; column: number }
  onReady: (value: editor.IStandaloneCodeEditor | undefined) => void
  breakpoint: (line: number) => void
}) {
  const ctx = useExtension<typeof definition>()
  const target: EditorHost = {}
  const pending = new Map<string, ReturnType<typeof setTimeout>>()
  onCleanup(() => pending.forEach(clearTimeout))
  const uri = (path: string) => Uri.file(props.model.root + "/" + path)

  const position = (value: { lineNumber: number; column: number }) => ({
    line: value.lineNumber - 1,
    character: value.column - 1,
  })

  const range = (value: { start: { line: number; character: number }; end: { line: number; character: number } }) =>
    new Range(value.start.line + 1, value.start.character + 1, value.end.line + 1, value.end.character + 1)

  const cursor = (model: editor.ITextModel, at: { lineNumber: number; column: number }) => {
    const path = props.model.state.documents.find((item) => props.model.models.get(item.path) === model)?.path

    return path ? { binding: props.model.binding, path, position: position(at) } : undefined
  }

  const document = (model: editor.ITextModel) =>
    props.model.state.documents.find((item) => props.model.models.get(item.path) === model)

  const sync = async (model: editor.ITextModel) => {
    const item = document(model)

    if (item) await props.model.sync(item)
  }

  onMount(() => {
    self.MonacoEnvironment = {
      getWorker: (_module, label) =>
        label === "typescript" || label === "javascript"
          ? new TypeScriptWorker()
          : label === "json"
            ? new JsonWorker()
            : label === "css" || label === "scss" || label === "less"
              ? new CssWorker()
              : label === "html" || label === "handlebars" || label === "razor"
                ? new HtmlWorker()
                : new EditorWorker(),
    }

    if (!target.element) return

    const widget = editor.create(target.element, {
      automaticLayout: true,
      fontSize: 13,
      lineHeight: 22,
      fontFamily: "var(--font-family-mono, monospace)",
      minimap: { enabled: false },
      glyphMargin: true,
      scrollBeyondLastLine: false,
      smoothScrolling: false,
      tabSize: 2,
      insertSpaces: true,
      ariaLabel: ctx.t("panel"),
      model: null,
    })

    target.editor = widget
    props.onReady(widget)

    const theme = () => {
      const background = getComputedStyle(target.element!).getPropertyValue("--background-base").trim()
      const probe = documentColor(background)
      editor.setTheme(probe < 128 ? "vs-dark" : "vs")
    }

    theme()
    const observer = new MutationObserver(theme)
    observer.observe(documentElement(), { attributes: true, attributeFilter: ["class", "style", "data-theme"] })

    const opener = editor.registerEditorOpener({
      openCodeEditor: async (_source, resource, selection) => {
        const base = uri("").path

        if (!resource.path.startsWith(base)) return false
        const path = resource.path.slice(base.length)
        await props.model.open(path)

        if (props.model.options.signal.aborted) return false

        if (selection && "startLineNumber" in selection) {
          widget.setSelection(selection)
          widget.revealLineInCenter(selection.startLineNumber)
        }

        if (selection && "lineNumber" in selection) {
          widget.setPosition(selection)
          widget.revealLineInCenter(selection.lineNumber)
        }

        return true
      },
    })

    const content = editor.onDidCreateModel((model) => {
      if (!model.uri.path.startsWith(uri("").path)) return
      model.onDidChangeContent(() => {
        const item = document(model)

        if (!item) return
        props.model.update(item.path, model.getValue())
        clearTimeout(pending.get(item.path))
        pending.set(
          item.path,
          setTimeout(() => {
            pending.delete(item.path)
            void props.model.run(() => props.model.sync(item))
          }, 200),
        )
      })
    })

    const selection = widget.onDidChangeCursorPosition((event) =>
      props.model.setState("cursor", { line: event.position.lineNumber, column: event.position.column }),
    )

    const mouse = widget.onMouseDown((event) => {
      if (event.target.type === editor.MouseTargetType.GUTTER_GLYPH_MARGIN && event.target.position)
        props.breakpoint(event.target.position.lineNumber)
    })

    const save = widget.addAction({
      id: "aai.save",
      label: ctx.t("save"),
      keybindings: [KeyMod.CtrlCmd | KeyCode.KeyS],
      run: () => props.model.run(() => props.model.save()),
    })

    const attach = widget.addAction({
      id: "aai.attach",
      label: ctx.t("attach"),
      contextMenuGroupId: "navigation",
      run: () => {
        const selected = widget.getSelection()
        const model = widget.getModel()
        const item = props.model.current()

        if (!model || !item) return
        props.screen.composer.attach({
          type: "file",
          path: item.path,
          preview: selected && !selected.isEmpty() ? model.getValueInRange(selected) : undefined,
          selection:
            selected && !selected.isEmpty()
              ? {
                  startLine: selected.startLineNumber,
                  endLine: selected.endLineNumber,
                  startChar: selected.startColumn - 1,
                  endChar: selected.endColumn - 1,
                }
              : undefined,
        })
      },
    })

    onCleanup(() => {
      observer.disconnect()
      content.dispose()
      opener.dispose()
      selection.dispose()
      mouse.dispose()
      save.dispose()
      attach.dispose()
      widget.dispose()
      props.onReady(undefined)
      target.editor = undefined
    })
  })

  // Keep Monaco's active model and view state in step with the selected workspace tab.
  createKeyed(
    () => props.model.state.active,
    (path) => {
      const widget = target.editor
      const item = props.model.state.documents.find((item) => item.path === path)

      if (!widget || !item) return
      const previous = widget.getModel()

      const previousPath =
        previous && props.model.state.documents.find((item) => props.model.models.get(item.path) === previous)?.path

      const view = widget.saveViewState()

      if (previousPath && view) props.model.viewStates.set(previousPath, view)
      const model = props.model.models.get(path) ?? editor.createModel(item.text, item.language, uri(path))
      props.model.models.set(path, model)

      if (model.getValue() !== item.text) model.setValue(item.text)
      widget.setModel(model)
      const saved = props.model.viewStates.get(path)

      if (saved) widget.restoreViewState(saved)
      widget.focus()
      void props.model.run(() => props.model.sync(item))
    },
    { otherwise: () => target.editor?.setModel(null) },
  )

  // Providers exist only for the language servers connected to this workspace.
  createKeyed(
    () => props.model.state.languages.join("\n"),
    () => {
      props.model.state.languages.forEach((language) => {
        const selector = { language, scheme: "file", pattern: props.model.root.replaceAll("\\", "/") + "/**" }

        const complete = languages.registerCompletionItemProvider(selector, {
          triggerCharacters: [".", ":", "/", "<", '"'],
          async provideCompletionItems(model, at) {
            const input = cursor(model, at)

            if (!input) return { suggestions: [] }
            await sync(model)
            const items = await props.model.client.complete(input, props.model.options).catch(() => [])
            const word = model.getWordUntilPosition(at)

            return {
              suggestions: items.map((item) => ({
                label: item.label,
                insertText: item.edit?.newText ?? item.insertText,
                kind: completionKind(item.kind),
                detail: item.detail,
                documentation: { value: item.documentation },
                range: item.edit
                  ? range(item.edit.range)
                  : new Range(at.lineNumber, word.startColumn, at.lineNumber, word.endColumn),
                insertTextRules: item.snippet ? languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
              })),
            }
          },
        })

        const hover = languages.registerHoverProvider(selector, {
          async provideHover(model, at) {
            const input = cursor(model, at)

            if (!input) return null
            await sync(model)
            const value = await props.model.client.hover(input, props.model.options).catch(() => "")

            return value ? { contents: [{ value }] } : null
          },
        })

        const definition = languages.registerDefinitionProvider(selector, {
          async provideDefinition(model, at) {
            const input = cursor(model, at)

            if (!input) return []
            await sync(model)

            return (await props.model.client.locations({ ...input, kind: "definition" }, props.model.options)).map(
              (item) => ({ uri: uri(item.path), range: range(item.range) }),
            )
          },
        })

        const references = languages.registerReferenceProvider(selector, {
          async provideReferences(model, at) {
            const input = cursor(model, at)

            if (!input) return []
            await sync(model)

            return (await props.model.client.locations({ ...input, kind: "references" }, props.model.options)).map(
              (item) => ({ uri: uri(item.path), range: range(item.range) }),
            )
          },
        })

        const format = languages.registerDocumentFormattingEditProvider(selector, {
          async provideDocumentFormattingEdits(model) {
            const item = document(model)

            if (!item) return []
            await sync(model)

            return (
              await props.model.client.format({ binding: props.model.binding, path: item.path }, props.model.options)
            ).map((item) => ({ range: range(item.range), text: item.newText }))
          },
        })

        const rename = languages.registerRenameProvider(selector, {
          async provideRenameEdits(model, at, name) {
            const input = cursor(model, at)

            if (!input) return { edits: [] }
            await sync(model)
            const files = await props.model.client.rename({ ...input, name }, props.model.options)
            await Promise.all(files.map((item) => props.model.open(item.path)))

            return {
              edits: files.flatMap((item) =>
                item.edits.map((edit) => ({
                  resource: uri(item.path),
                  versionId: undefined,
                  textEdit: { range: range(edit.range), text: edit.newText },
                })),
              ),
            }
          },
        })

        onCleanup(() =>
          [complete, hover, definition, references, format, rename].forEach((provider) => provider.dispose()),
        )
      })
    },
  )

  createKeyed(
    () => props.model.state.diagnostics,
    (items) =>
      items.forEach((item) => {
        const model = props.model.models.get(item.path)

        if (model)
          editor.setModelMarkers(
            model,
            "aai-lsp",
            item.items.map((diagnostic) => ({
              ...range(diagnostic.range),
              severity: markerSeverity(diagnostic.severity),
              message: diagnostic.message,
            })),
          )
      }),
  )
  createKeyed(
    () => props.reveal,
    (value) => {
      const widget = target.editor

      if (!widget || props.model.state.active !== value.path) return
      widget.setPosition({ lineNumber: value.line, column: value.column })
      widget.revealLineInCenter(value.line)
      widget.focus()
    },
  )
  const decorations: Decorations = {}
  createKeyed(
    () => ({ path: props.model.state.active, points: props.model.state.breakpoints }),
    (value) => {
      decorations.current?.clear()
      decorations.current = target.editor?.createDecorationsCollection(
        (value.points.find((item) => item.path === value.path)?.lines ?? []).map((line) => ({
          range: new Range(line, 1, line, 1),
          options: {
            glyphMarginClassName: "aai-ide-breakpoint",
            glyphMarginHoverMessage: { value: ctx.t("toggleBreakpoint") },
          },
        })),
      )
    },
  )

  return (
    <div
      class="aai-ide-editor"
      ref={(element) => {
        target.element = element
      }}
    />
  )
}

function documentElement() {
  return window.document.documentElement
}

function markerSeverity(value: number) {
  if (value === 1) return 8

  if (value === 2) return 4

  return 2
}

function documentColor(color: string) {
  const canvas = window.document.createElement("canvas").getContext("2d")

  if (!canvas) return 255
  canvas.fillStyle = color || "#ffffff"
  canvas.fillRect(0, 0, 1, 1)
  const pixel = canvas.getImageData(0, 0, 1, 1).data

  return ((pixel[0] ?? 255) + (pixel[1] ?? 255) + (pixel[2] ?? 255)) / 3
}

function completionKind(kind: number) {
  const kinds = [
    languages.CompletionItemKind.Text,
    languages.CompletionItemKind.Text,
    languages.CompletionItemKind.Method,
    languages.CompletionItemKind.Function,
    languages.CompletionItemKind.Constructor,
    languages.CompletionItemKind.Field,
    languages.CompletionItemKind.Variable,
    languages.CompletionItemKind.Class,
    languages.CompletionItemKind.Interface,
    languages.CompletionItemKind.Module,
    languages.CompletionItemKind.Property,
    languages.CompletionItemKind.Unit,
    languages.CompletionItemKind.Value,
    languages.CompletionItemKind.Enum,
    languages.CompletionItemKind.Keyword,
    languages.CompletionItemKind.Snippet,
    languages.CompletionItemKind.Color,
    languages.CompletionItemKind.File,
    languages.CompletionItemKind.Reference,
    languages.CompletionItemKind.Folder,
    languages.CompletionItemKind.EnumMember,
    languages.CompletionItemKind.Constant,
    languages.CompletionItemKind.Struct,
    languages.CompletionItemKind.Event,
    languages.CompletionItemKind.Operator,
    languages.CompletionItemKind.TypeParameter,
  ]

  return kinds[kind] ?? languages.CompletionItemKind.Text
}
