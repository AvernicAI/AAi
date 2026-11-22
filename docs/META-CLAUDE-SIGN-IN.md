# Meta AI and Claude account sign-in

This adds sign-in entry points to the existing AlphaAi desktop. Existing providers, models, API keys, chat history, themes, IDE, terminal and Orlon workspace are preserved.

## Claude

**Settings → Providers → Popular → Claude Agent** now includes **Open Claude Code sign-in** on the local desktop server. It opens an interactive terminal running the user's installed, unmodified `claude auth login`. Complete Anthropic's browser flow, then press **Connect** or **Check again** in the existing provider dialog.

The existing Claude Agent provider and its model-discovery, tools and session logic are unchanged. Claude Code owns its login, callback, credentials and refresh. AAi does not collect, copy or proxy its OAuth token. The Anthropic API-key provider remains available separately.

The launcher uses `claude` on the local machine's PATH. Windows uses an interactive command prompt, macOS uses Terminal, and Linux uses `x-terminal-emulator`. If Claude Code or the terminal is unavailable, use the existing install link and copyable command. A custom Claude executable path or a remote server can still use the manual command on that server. The desktop launcher is hidden for remote server connections to avoid signing in on the wrong machine.

## Meta AI

**Meta AI** is available from the sidebar/titlebar, **Settings → Meta AI**, the command palette and a session side-panel tab. **Sign in on Meta.ai** opens Meta's own page; choose its Log in control and complete Meta's sign-in. The workspace keeps its own `persist:aai-meta-ai` Chromium session, including any first-party Meta/Facebook/Instagram account redirects. It is sandboxed, has no AAi preload bridge or Node access, and does not share the system browser's account cookies or other AAi providers' sessions.

**Clear Meta AI sign-in** asks for confirmation and clears only this workspace's partition. **Sign in in browser** opens the official website in the system browser when the embedded browser is unavailable or restricted. Browser and embedded sign-ins are separate.

Meta AI's consumer website sign-in does not authorize AAi's agent/model API. The official [Meta Model API authentication documentation](https://dev.meta.ai/docs/authentication) requires an API key. No third-party Meta model OAuth contract was verified, so this change does not forge an OAuth client, extract session cookies or add nonworking native models. For API use, the existing OpenAI-compatible connector can be configured with Meta's documented base URL `https://api.meta.ai/v1` and a Meta Model API key.

Claude's official [authentication documentation](https://code.claude.com/docs/en/authentication) describes its own account sign-in. Its [credential-use documentation](https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use) requires Claude account sign-in to complete through Anthropic's flow; the launcher delegates to the unmodified installed program.

## Files

- `packages/gui-plugins/src/meta-ai/`: isolated Meta workspace, typed private GUI IPC, lifecycle, copy, navigation policy and security tests.
- `packages/gui-plugins/src/main.ts`, `src/renderer.ts`, `README.md`: built-in registration and matching guide examples.
- `packages/app/src/providers/catalog/order.ts`: lists the existing Claude Agent provider under Popular.
- `packages/app/src/providers/connect/claude-login.tsx`, `claude-login-machine.ts`, `claude-login-machine.test.ts`: launcher UI and lifecycle with timeout, stale-reply and disposal handling.
- `packages/app/src/providers/connect/dialog.tsx`, `runtime/i18n/en.ts`, `runtime/platform/platform.tsx`: setup button, localized copy and optional desktop launcher capability.
- `packages/desktop/src/main/files/claude-login.ts`, `main/ipc-handlers/files.ts`: fixed local login command, accepting no shell text from the renderer.
- `packages/desktop/src/shared/ipc-rpc/files.ts`, `renderer/api-types.ts`, `renderer/api.ts`, `renderer/platform/files.ts`, `renderer/platform/files.test.ts`: typed desktop bridge and existing file-action regression coverage.

No public Protocol or Server HttpApi was changed. No generated clients were edited.

## Validation

- Canonical `bun run check`: 35 packages passed.
- Focused provider-flow/lifecycle tests: 49 passed; Meta/Orlon navigation tests: 28 passed; desktop file-action tests: 4 passed. The final Claude retry/timeout lifecycle tests also passed separately after the last lifecycle change.
- Existing built-in plugin compatibility matrix: passed, including each built-in being disabled in turn.
- Files changed for this task pass focused lint with zero warnings/errors. The broader working-tree lint still reports pre-existing findings in five unrelated files.
- Private native desktop acceptance reached Meta AI's live homepage and its Log in control; verified the distinct sandboxed Chromium session, absent Node/preload access, confirmation for clearing sign-in, and preservation of another session's test cookie.
- The same acceptance run verified Claude Agent's Popular-provider entry, new official-CLI sign-in button and copyable manual fallback.
- Acceptance also passed against the packaged Windows executable, whose application metadata reports `2.3.1-signin.1`.
- Windows installer packaging completed successfully, including the native dependency rebuild. The bundled CLI remains `2.3.1`; this change adds desktop/GUI sign-in entry points without changing the backend provider engine.
- The Meta/Orlon shortcut collision found in native testing was fixed with a distinct Meta titlebar item ID.

Account credentials were not entered, Claude's real login was not launched during automated testing, and no model inference was submitted. Complete the sign-in through the provider's own page/program to validate your account. Testing used private profiles and an explicit debug-port override; the installed application and its existing server were not restarted.
