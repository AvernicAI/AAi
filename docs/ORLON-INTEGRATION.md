# Orlon workspace

Orlon is integrated into the existing AlphaAi desktop through a built-in GUI plugin. No existing provider, model, chat history, IDE, terminal, API key or theme is replaced.

## Open it

- Click **Orlon** in the left sidebar footer (or titlebar when horizontal tabs are selected).
- In a session, **Open Orlon workspace** opens a side-panel tab beside the existing chat and IDE.
- From Home, it opens **Settings → Orlon**. The command palette and session panel menu also expose the workspace.
- Use **Sign in to Orlon** to sign in directly on Orlon's website. AAi does not collect the password or copy the session into its API credential store.

The toolbar opens Orlon's live model picker, chat, image creator, 3D workspace and community image gallery. Model availability and account limits are controlled by Orlon. Generated images and 3D exports use the native Save As flow; choose a workspace folder to bring an asset into your project. Orlon's 3D UI currently offers GLB, OBJ and STL exports.

The sign-in persists in a dedicated `persist:aai-orlon` Chromium session, separate from AAi and other provider workspaces. **Clear Orlon sign-in** asks for confirmation and clears this partition's storage and cache across Orlon panels. The embedded page has no Node integration, preload bridge or access to AAi API keys. External HTTPS sign-in popups keep the same isolated partition. Native permission requests are denied. **Open in browser** is available if the site requires a browser feature unavailable in the embed; browser and embedded sign-ins are independent.

## Confirmed limits

On November 15, 2026, the public website and its shipped client exposed chat, image creation, model selection and 3D creation. Its current web client calls session-authenticated `/api/chat/stream` and `/api/create3d/stream`, rather than a documented third-party model API.

No supported OAuth client-registration/authorization flow, public third-party inference contract or video-generation feature was verified. This integration therefore does **not** invent an OAuth client, register nonworking API models in AAi's agent model picker, extract login cookies, or claim video support. Orlon models run inside the Orlon workspace. A native agent/provider connector needs Orlon's supported API and authentication contract.

## Implementation

- `packages/gui-plugins/src/orlon/index.ts`: built-in plugin definition and copy.
- `i18n/en.ts`: localized source strings, capabilities and limitations.
- `renderer.tsx`: sidebar/titlebar shortcut, command, session panel and settings page.
- `panel.tsx`: toolbar, embedded workspace, clear-sign-in confirmation and async driver.
- `machine.ts`: shared UI lifecycle with stale-result protection, failures and disposal.
- `contract.ts`: typed private GUI IPC; no public HTTP API changes.
- `main.ts`: native embedded page, fixed navigation controls, login isolation, downloads and cleanup.
- `policy.ts`: exact-origin embedded navigation and HTTPS popup policy.
- `machine.test.ts`, `policy.test.ts`: lifecycle and navigation-security contracts.
- `packages/gui-plugins/src/renderer.ts`, `main.ts`: existing built-in registration lists.

## Run

From the repository root, use the existing `bun run dev:desktop`, or the standard `build.bat` packaging workflow. Open Orlon, sign in on its page, select a model, and use its image or 3D controls. Generation itself is user initiated and subject to the Orlon account plan.

## Validation

- `bun run check`: all 35 packages passed. Existing repository-wide lint warnings remain; Orlon's files have zero lint warnings/errors.
- Orlon unit tests: 16 passed, covering lifecycle, stale replies, retry/disposal and navigation policy.
- The existing plugin graph component test passed against the warmed story server, including the matrix that disables each built-in in turn. Earlier cold attempts failed before mounting the story; isolated diagnostics recorded `ERR_NETWORK_CHANGED` during module loading.
- A private desktop profile verified the sidebar entry, settings workspace, visible native view, sandbox/context isolation, distinct Chromium session, no AAi preload bridge, live 3D/gallery/model/image controls and Orlon's sign-in dialog.
- The real clear-sign-in action removed disposable Orlon cookies while preserving a disposable cookie in a different browser session.
- Desktop main/preload/renderer assets rebuilt successfully. No installed application or existing server was restarted.
- The same native acceptance check also passed against the packaged Windows executable, including the real sign-in-clearing action and cookie isolation check.
- Windows installer packaging (including the native dependency rebuild) completed successfully for `2.3.1-orlon.1`; the packaged application metadata confirms that version. The matching CLI remains `2.3.1`, since this integration changes GUI plugins only.

No account credentials were entered and no paid generation was submitted during these checks. Account-authenticated generation must be completed by the user on Orlon's page.
