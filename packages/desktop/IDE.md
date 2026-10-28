# Desktop IDE

Open a local project and session, then choose **View → Open IDE**, choose **Open IDE** from the side-panel + menu or command palette, or press **Ctrl/Cmd+Shift+I**. The IDE shares the session's workspace and AI composer. Its terminal button opens the existing integrated terminal.

Choose **Settings → AAi backgrounds** for Aurora, Avernic Ember, or Blueprint artwork. Choices persist separately from the theme; **Restore OpenCode default** removes the artwork without changing the theme or any integration.

The workspace includes editable Monaco tabs, syntax highlighting, undo/redo, find/replace, multi-cursor editing, file creation and renaming, system-trash deletion, literal text search, Git diffs, staging, unstaging and commits. Unsaved drafts are stored through the desktop's SQLite storage. Reopening a file recovers its draft; saving refuses to overwrite changes made on disk since the file was opened.

Within the IDE, **Ctrl/Cmd+S** saves, **Ctrl/Cmd+Shift+S** saves all files, **Ctrl/Cmd+P** focuses the explorer filter, **Ctrl/Cmd+Shift+F** opens workspace search, and **Ctrl/Cmd+W** closes the selected editor tab. Monaco's context menu exposes symbol navigation, references, rename and formatting. **Add selection to AI chat** attaches the selected source to the session's next prompt.

## Language servers

JavaScript and TypeScript have bundled Monaco language support. To connect a project-aware language server, select **Language servers**, enter its language ID and a JSON command array, then select **Start language server**. The process runs over stdio in the workspace directory. Commands use argument arrays, without a shell.

For TypeScript, install `typescript` in the project and install `typescript-language-server` with your package manager. A Windows configuration can run its script directly:

```json
["node", "C:/tools/typescript-language-server/lib/cli.mjs", "--stdio"]
```

Use an installed executable or a script with its interpreter; Windows `.cmd` wrappers are not executables. Other stdio language servers use their own language IDs and commands. Completion, hover, diagnostics, definitions, references, text formatting and text-based workspace renames are supported. Server-driven resource creation/deletion and arbitrary server commands are not applied automatically.

## Debugging

Select **Run and debug** and configure a stdio Debug Adapter Protocol adapter. For Python, install `debugpy` in the Python environment you want to debug:

```json
["C:/project/.venv/Scripts/python.exe", "-m", "debugpy.adapter"]
```

The launch configuration is a JSON object. `${workspaceFolder}` and `${file}` expand to the current workspace and selected file. For example:

```json
{
  "request": "launch",
  "type": "python",
  "program": "${file}",
  "console": "internalConsole",
  "stopOnEntry": true
}
```

Save a source file, click its editor gutter to set breakpoints, then start debugging. The panel supports continue, pause, step over/into/out, call-stack navigation, variable expansion and expression evaluation. Use `internalConsole`; reverse requests to launch external terminals are not supported. An adapter's language runtime and project dependencies must already be installed.

## Building on Windows

From the repository root, run `build.bat`. It builds the CLI and embedded web UI from this checkout,
then the desktop app and Windows installer. Run `run.bat` to open the packaged desktop.
The installer is also copied to `artifacts/AAi-Setup-x64.exe` (or `-arm64.exe`).

Equivalent command:

```powershell
bun run script/windows.ts build
```

The desktop prebuild accepts the local CLI output for every channel and prepares the development CLI needed by `bun run preview`. Windows packages are written under `packages/desktop/dist`. Language-server and debugger processes are local to this desktop; remote sessions show an explicit unavailable state.
