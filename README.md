# AAi (AvernicAi)

<p align="center">An AI coding agent for the terminal, desktop, and web — built on <a href="https://opencode.ai">OpenCode</a>.</p>

AAi keeps OpenCode's model catalog, **OpenCode Zen**, and **OpenCode Go** connectivity as its default provider
story. AvernicAi is an additional, optional OpenAI-compatible provider: it stays hidden until you give it a key,
so existing OpenCode accounts and models keep working exactly as before.

> This repository is a rebrand of OpenCode. Package names (`@opencode/*`), config files (`opencode.json`),
> config directories, and `OPENCODE_*` environment variables are intentionally unchanged so existing sessions,
> credentials, plugins, and updates keep working.

## Quick start (Windows)

Every workflow has a double-clickable batch file at the repository root:

| Script                | What it does                                                       |
| --------------------- | ------------------------------------------------------------------ |
| `install.bat`         | Install Bun dependencies for the workspace.                        |
| `dev.bat`             | Run the AAi CLI/TUI from source. Pass extra args, e.g. `dev.bat .` |
| `build.bat`           | Build a matching CLI, desktop app, and Windows installer.          |
| `run.bat`             | Launch the built AAi desktop app.                                  |
| `build-desktop.bat`   | Run the complete desktop and installer build.                      |
| `package-desktop.bat` | Rebuild everything and package a fresh Windows installer.          |
| `build-cli.bat`       | Build only the standalone CLI/TUI executable.                      |
| `run-cli.bat`         | Run the built CLI/TUI. Pass a directory or CLI arguments.          |
| `desktop.bat`         | Run the desktop app in development mode.                           |
| `web.bat`             | Run the web app in development mode.                               |
| `check.bat`           | Run lint and type checking across the workspace.                   |
| `sync.bat`            | Merge upstream OpenCode and verify the AAi rebrand.                |

Install the Bun version listed in `package.json` (currently 1.4.4), Node.js 24 or newer, and Git, then double-click `build.bat`.
The scripts find both native and npm-installed Bun. They install the locked dependencies, build the CLI
and its embedded web UI from this checkout, bundle the desktop renderer and all built-in extensions,
and create the Windows installer. They never substitute a downloaded OpenCode server for your AAi build.

Outputs:

- `artifacts\AAi-Setup-x64.exe` (or `-arm64.exe`): Windows installer.
- `packages\desktop\dist\win-unpacked\AAi Dev.exe`: runnable desktop app; keep its adjacent files together.
- `artifacts\aai.exe`: standalone CLI/TUI, including the embedded web app.

`run.bat` launches the desktop. `run-cli.bat` launches the terminal UI. The default channel is `dev`,
with AAi Dev branding and automatic updates disabled. Set `OPENCODE_CHANNEL=prod` before building for
the existing AAi production identity, or `beta` for AAi Beta. Themes, providers, credentials, protocols,
and OpenCode integrations retain their existing behavior. The IDE is under **View → Open IDE** or
**Ctrl/Cmd+Shift+I**; backgrounds are under **Settings → AAi backgrounds**.

**Settings → Context configuration** saves custom instructions and project background. Enable them beside
the prompt with the **Context** switch, or open the same controls with the **Context** button. Saved context
is added to normal prompts as a user note; shell commands, slash commands, and project rules keep their
existing behavior. The page also configures automatic compaction, reserved context tokens, and recent-history
tokens for the selected server. Blank budgets and **Restore compaction defaults** use OpenCode's defaults.
The selected model still determines the maximum context window.

Build errors return a nonzero exit code and remain visible for double-click launches. Set `AAI_NO_PAUSE=1`
when running the scripts in automation. Arguments to dev/run scripts are forwarded unchanged.
Set `OPENCODE_DESKTOP_DISABLE_PROTOCOL_REGISTRATION=1` when launching an isolated verification instance
to leave the installed OpenCode URL handler untouched. Normal launches keep the existing registration behavior.

Manual equivalents:

```bash
bun install
bun run dev                # CLI/TUI from source
bun run script/windows.ts build
bun run script/windows.ts run
bun run dev:desktop
bun run dev:web
bun run check
```

## Connecting to OpenCode

No setup is required. AAi loads the same models.dev catalog as OpenCode, and the OpenCode Zen provider remains
available through the normal `auth login` flow. OpenCode Go models work the same way.

```bash
aai auth login   # choose OpenCode / OpenCode Go
aai models       # list what is available
```

The `aai` command is an alias for the built-in `opencode` binary command, so either name works.

## Optional: AvernicAi provider

AvernicAi is registered as an OpenAI-compatible provider at `https://api.avernic.ai/v1`. It is **disabled by
default** and only appears once a credential exists.

### Enable with an environment variable

```powershell
setx AVERNICAI_API_KEY "your-key"
```

```bash
export AVERNICAI_API_KEY="your-key"
```

Restart AAi. AAi discovers the account's models from `GET /v1/models` and adds them to the model picker.

Optional overrides:

| Variable             | Purpose                                                          |
| -------------------- | ---------------------------------------------------------------- |
| `AVERNICAI_API_KEY`  | API key (also accepts `AVERNIC_AI_API_KEY`).                     |
| `AVERNICAI_BASE_URL` | Override the API base URL (default `https://api.avernic.ai/v1`). |

### Enable interactively

```bash
aai auth login   # choose AvernicAi, then paste the key
```

### Configure manually

If model discovery is unavailable, or you want explicit model metadata, add the provider to `opencode.json`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "providers": {
    "avernicai": {
      "name": "AvernicAi",
      "env": ["AVERNICAI_API_KEY"],
      "package": "@opencode/ai/providers/openai-compatible",
      "settings": {
        "baseURL": "https://api.avernic.ai/v1",
        "provider": "avernicai",
      },
      "models": {
        "avernic-1": {
          "name": "Avernic 1",
          "capabilities": { "tools": true, "input": ["text"], "output": ["text"] },
          "limit": { "context": 128000, "output": 16384 },
        },
      },
    },
  },
}
```

Per-model `capabilities`, `limit`, and `options` follow the normal OpenCode provider configuration rules.

## Repository layout

| Path               | Contents                                          |
| ------------------ | ------------------------------------------------- |
| `packages/cli`     | CLI entrypoint, commands, and standalone builds.  |
| `packages/tui`     | Terminal UI.                                      |
| `packages/core`    | Sessions, providers, tools, and runtime services. |
| `packages/desktop` | Electron desktop application.                     |
| `packages/app`     | Shared web/desktop renderer.                      |
| `packages/server`  | HTTP API and background service.                  |
| `packages/schema`  | Shared wire and storage contracts.                |

## Staying up to date with OpenCode

Fork-level history, brand rules, and environment notes live in [AAI_CHANGELOG.md](AAI_CHANGELOG.md).

AAi tracks upstream OpenCode's `dev` branch. `sync.bat` (or `bun run sync:upstream`) performs the whole merge:

```bash
bun run sync:upstream               # fetch, merge, install changed dependencies, run checks
bun run sync:upstream --dry-run     # show what would come in; change nothing
bun run sync:upstream --no-check    # merge, audit, and install, but skip the checks
bun run sync:upstream --no-install  # merge without installing
bun run sync:upstream --branch=fix-1 # merge into another local branch instead of dev
```

The script:

- refuses to run on a dirty worktree or a branch other than `dev`;
- keeps `backup/pre-upstream-sync` at the commit it started from, so `git reset --hard backup/pre-upstream-sync` undoes a sync;
- merges with `--no-ff`, so published history is never rewritten;
- verifies the AAi brand surface (desktop app names, renderer title, `aai` alias, AvernicAi provider registration) and fails when a merge drops any of it;
- lists `OpenCode` names that upstream adds to client code. Product names and identifiers such as `OpenCode Go`, `OpenCode Console`, `opencode pair` and `OPENCODE_*` variables are kept on purpose so OpenCode keeps working out of the box;
- reinstalls dependencies when `bun.lock` or a `package.json` changed, then runs `bun run check`.

When upstream and the fork touch the same file, the merge stops before committing: resolve the files it lists and
commit, or run `git merge --abort`. The script never pushes; publish with `git push origin dev` once the result
looks right.

## Contributing

- Use conventional commit messages: `type(scope): summary` (for example `feat(core): add AvernicAi provider`).
- Run `check.bat` (or `bun run check`) before opening a pull request.
- See `AGENTS.md` for repository-specific engineering rules and `.opencode/skills` for testing guides.

## License

MIT. AAi is based on OpenCode; see [LICENSE](LICENSE).
