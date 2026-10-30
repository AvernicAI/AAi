import { spawn } from "node:child_process"
import { fileURLToPath, pathToFileURL } from "node:url"
import { Predicate } from "effect"
import {
  createProtocolConnection,
  InitializeRequest,
  InitializedNotification,
  ShutdownRequest,
  ExitNotification,
  DidOpenTextDocumentNotification,
  DidChangeTextDocumentNotification,
  PublishDiagnosticsNotification,
  CompletionRequest,
  HoverRequest,
  DefinitionRequest,
  ReferencesRequest,
  DocumentFormattingRequest,
  RenameRequest,
  ConfigurationRequest,
  WorkspaceFoldersRequest,
  RegistrationRequest,
  UnregistrationRequest,
  ApplyWorkspaceEditRequest,
  type Position,
  type MarkupContent,
  type MarkedString,
  type TextEdit,
} from "vscode-languageserver-protocol/node"
import type { Workspace } from "./workspace"
import type { Diagnostic } from "./contract"

type LanguageLifetime = { closing?: Promise<void>; exited: boolean }

export async function startLanguage(input: {
  command: readonly string[]
  workspace: Workspace
  signal: AbortSignal
  diagnostics: (path: string, diagnostics: readonly (typeof Diagnostic.Type)[]) => void
  output: (text: string) => void
}) {
  if (!input.command[0]) throw new Error("ide.command")

  const child = spawn(input.command[0], input.command.slice(1), {
    cwd: input.workspace.root,
    stdio: "pipe",
    windowsHide: true,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  })

  const connection = createProtocolConnection(child.stdout, child.stdin, {
    error: input.output,
    warn: input.output,
    info: input.output,
    log: input.output,
  })

  const documents = new Map<string, number>()

  const lifetime: LanguageLifetime = { exited: false }
  const closed = Promise.withResolvers<void>()

  const close = (): Promise<void> => {
    if (lifetime.closing) return lifetime.closing

    if (lifetime.exited) return closed.promise
    const timer = setTimeout(() => child.kill(), 1000)
    lifetime.closing = connection
      .sendRequest(ShutdownRequest.type)
      .catch(() => undefined)
      .then(async () => {
        await connection.sendNotification(ExitNotification.type).catch(() => undefined)
        child.stdin.end()
        await closed.promise
      })
      .finally(() => clearTimeout(timer))

    return lifetime.closing
  }

  const abort = () => void close()

  child.on("error", (error) => {
    input.output(error.message)
    void close()
  })
  child.on("close", () => {
    lifetime.exited = true
    connection.dispose()
    input.signal.removeEventListener("abort", abort)
    closed.resolve()
    input.output("ide.language.exited")
  })
  child.stderr.setEncoding("utf8").on("data", input.output)
  connection.onRequest(ConfigurationRequest.type, (params) => params.items.map(() => ({})))
  connection.onRequest(WorkspaceFoldersRequest.type, () => [
    { uri: pathToFileURL(input.workspace.root).href, name: input.workspace.root },
  ])
  connection.onRequest(RegistrationRequest.type, () => undefined)
  connection.onRequest(UnregistrationRequest.type, () => undefined)
  connection.onRequest(ApplyWorkspaceEditRequest.type, () => ({
    applied: false,
    failureReason: "Use the editor rename command to preview and save edits.",
  }))
  connection.onNotification(PublishDiagnosticsNotification.type, (params) => {
    if (!params.uri.startsWith("file:")) return
    void input.workspace.resolve(fileURLToPath(params.uri)).then(
      (file) =>
        input.diagnostics(
          input.workspace.relative(file),
          params.diagnostics.map((item) => ({
            range: item.range,
            message: item.message,
            severity: item.severity ?? 1,
          })),
        ),
      () => undefined,
    )
  })
  connection.listen()
  input.signal.addEventListener("abort", abort, { once: true })

  if (input.signal.aborted) {
    await close()
    throw new Error("ide.closed")
  }

  await connection
    .sendRequest(InitializeRequest.type, {
      processId: process.pid,
      rootUri: pathToFileURL(input.workspace.root).href,
      workspaceFolders: [{ uri: pathToFileURL(input.workspace.root).href, name: input.workspace.root }],
      capabilities: {
        workspace: { configuration: true, workspaceFolders: true, workspaceEdit: { documentChanges: true } },
        textDocument: {
          synchronization: { didSave: false },
          completion: { completionItem: { snippetSupport: true, documentationFormat: ["markdown", "plaintext"] } },
          hover: { contentFormat: ["markdown", "plaintext"] },
          definition: { linkSupport: true },
          publishDiagnostics: { relatedInformation: true },
        },
      },
    })
    .catch(async (error: Error) => {
      await close()
      throw error
    })

  if (input.signal.aborted) {
    await close()
    throw new Error("ide.closed")
  }

  await connection.sendNotification(InitializedNotification.type, {})
  const uri = async (name: string) => pathToFileURL(await input.workspace.resolve(name)).href
  const cursor = async (name: string, position: Position) => ({ textDocument: { uri: await uri(name) }, position })

  const location = async (address: string, range: TextEdit["range"]) => {
    if (!address.startsWith("file:")) return []

    return input.workspace.resolve(fileURLToPath(address)).then(
      (file) => [{ path: input.workspace.relative(file), range }],
      () => [],
    )
  }

  return {
    close,
    async document(name: string, languageId: string, text: string, version: number) {
      const address = await uri(name)

      if (!documents.has(address)) {
        documents.set(address, version)
        await connection.sendNotification(DidOpenTextDocumentNotification.type, {
          textDocument: { uri: address, languageId, version, text },
        })

        return
      }

      if ((documents.get(address) ?? 0) >= version) return
      documents.set(address, version)
      await connection.sendNotification(DidChangeTextDocumentNotification.type, {
        textDocument: { uri: address, version },
        contentChanges: [{ text }],
      })
    },
    async complete(name: string, position: Position) {
      const result = await connection.sendRequest(CompletionRequest.type, await cursor(name, position))

      return (Array.isArray(result) ? result : (result?.items ?? [])).map((item) => ({
        label: item.label,
        insertText: item.insertText ?? item.label,
        kind: item.kind ?? 1,
        detail: item.detail ?? "",
        documentation: item.documentation ? markup(item.documentation) : "",
        snippet: item.insertTextFormat === 2,
        edit:
          item.textEdit && "range" in item.textEdit
            ? { range: item.textEdit.range, newText: item.textEdit.newText }
            : undefined,
      }))
    },
    async hover(name: string, position: Position) {
      const result = await connection.sendRequest(HoverRequest.type, await cursor(name, position))

      return result
        ? Array.isArray(result.contents)
          ? result.contents.map(markup).join("\n\n")
          : markup(result.contents)
        : ""
    },
    async locations(name: string, position: Position, kind: "definition" | "references") {
      const result =
        kind === "definition"
          ? await connection.sendRequest(DefinitionRequest.type, await cursor(name, position))
          : await connection.sendRequest(ReferencesRequest.type, {
              ...(await cursor(name, position)),
              context: { includeDeclaration: true },
            })

      const items = !result ? [] : Array.isArray(result) ? result : [result]

      return (
        await Promise.all(
          items.map((item) =>
            "targetUri" in item ? location(item.targetUri, item.targetSelectionRange) : location(item.uri, item.range),
          ),
        )
      ).flat()
    },
    async format(name: string) {
      return (
        (await connection.sendRequest(DocumentFormattingRequest.type, {
          textDocument: { uri: await uri(name) },
          options: { tabSize: 2, insertSpaces: true },
        })) ?? []
      )
    },
    async rename(name: string, position: Position, newName: string) {
      const result = await connection.sendRequest(RenameRequest.type, { ...(await cursor(name, position)), newName })
      const edits = Object.entries(result?.changes ?? {}).map(([address, edits]) => ({ address, edits }))
      result?.documentChanges?.forEach((item) => {
        if ("textDocument" in item) edits.push({ address: item.textDocument.uri, edits: item.edits })
      })

      return (
        await Promise.all(
          edits.map(async (item) =>
            (await location(item.address, { start: position, end: position })).map((file) => ({
              path: file.path,
              edits: item.edits,
            })),
          ),
        )
      ).flat()
    },
  }
}

function markup(value: MarkupContent | MarkedString) {
  if (Predicate.isString(value)) return value

  if ("language" in value) return `\`\`\`${value.language}\n${value.value}\n\`\`\``

  return value.value
}

export type Language = Awaited<ReturnType<typeof startLanguage>>
