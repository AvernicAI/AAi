# Antigravity and Google AI in AlphaAi

AlphaAi connects to the official installed Antigravity CLI through Agent Client Protocol (ACP). It does not copy Google cookies or extract OAuth tokens. Existing Gemini API, Vertex AI, Gemini web, other providers, Alphie, IDE, terminal and themes remain available.

## Connect

1. Install the official CLI from https://antigravity.google/docs/install/.
2. Open **Settings > Antigravity > Models & setup** and click **Sign in with official CLI**. Complete Google's login in the terminal/browser. Alternatively run `agy acp --login` yourself.
3. Connect **Antigravity Agent** under **Settings > Providers** (Popular).
4. Click **Refresh models** in Antigravity settings. Select the resulting Antigravity model in the existing chat model picker.
5. Use Review permissions, Plan, Accept edits or Auto. AAi host permissions still apply when Antigravity requests client file or terminal operations.

The official CLI must run on the same machine as the AAi backend. A remote backend requires its own official CLI installation and login. `OPENCODE_ANTIGRAVITY_PATH` can select an installed executable. The desktop login button starts the desktop machine's CLI; it does not remotely authenticate another host. Embedded web sign-in and native CLI sign-in are separate sessions.

## Capabilities and boundaries

| Area | Integration |
| --- | --- |
| Model discovery | Exact IDs/names from `agy models`; refreshed after connection changes, on connected startup and manually. No hardcoded model allowlist. |
| Reasoning levels | Native model selector is changed first, then reasoning options are reread before choosing the advertised level. |
| Google access | Official CLI owns login, subscription entitlements, quotas and billing. Listing a model does not guarantee entitlement. |
| Chat | Streams into existing AAi chat; sends current instructions, conversation history and supported attachments. |
| Continued conversations | Native ACP session IDs persisted per AAi session and workspace; resume uses the official advertised capability. |
| Alphie | Existing AAi agent instructions are forwarded; selected custom agent instructions remain intact. |
| Planning/tool status | Live plans, reasoning, tool calls and results appear in the existing timeline. Tools run by the official agent are marked provider executed. |
| Client file edits | Permission checked, then committed through AAi's shared file-write service, including existing BOM and formatter behavior. |
| Client terminal | Uses AAi's existing shell service; session ownership checked on output/wait/stop. No duplicate terminal service. Request cleanup stops its own remaining terminals, including on cancellation. |
| Permissions | Official CLI sandbox flag; native tool approval requests go through AAi permission requests. No skip-permissions flag. Auxiliary/title requests cannot use client workspace tools. |
| Native Antigravity tools | Official agent retains its own configured tools, skills, rules, MCP servers and agent orchestration. |
| AAi function tools | Not automatically exported as Antigravity MCP tools. Browser/account control is available to AAi's existing browser-enabled agents separately. |
| Web app | One Antigravity settings page/panel, isolated saved web session, native downloads and external-browser fallback. |
| Google AI Studio | Own saved web workspace, exposed to existing browser-enabled AAi agents through the browser account registry. |
| Gemini/Vertex APIs | Existing Google API-key and Vertex authentication/provider behavior is preserved. |
| Images/video/audio | Native ACP reports image input and embedded context; it currently reports no audio prompt input. Existing Google web workspaces expose their account's supported media features. ACP is not an invented image/video generation API. |
| Proprietary IDE features | VSIX extensions, Google's tab completion, proprietary remote-agent UI and IDE-only artifacts are not reproduced by ACP. Use the official interfaces for capabilities ACP does not expose. |
| Usage | No fabricated context limit, token counts or prices when the agent does not report them. Google remains authoritative. |

AAi file explorer and Changes use their existing refresh/watch behavior for files changed by the native agent. The adapter does not create a separate editor, file explorer or change-review subsystem.

## Verified

On November 18, 2026, installed official ACP server **1.5.11** advertised protocol 1 and returned 18 model/reasoning IDs. The actual adapter successfully streamed a minimal response using `gemini-3.8-flash-low`. Adapter tests cover exact catalog parsing, changed reasoning options, stale model rejection, live tool/plan translation and context/attachment preservation. This is not an entitlement test of every model or a paid media generation test.

Official references: [ACP](https://antigravity.google/docs/cli/acp/), [models](https://antigravity.google/docs/models/), [authentication](https://antigravity.google/docs/authentication/).

## Acceptance

Launch AlphaAi, connect as above, select Antigravity, and ask it to create `hello.js` printing `Hello Alphie` in a disposable workspace and run it. Review permission requests. Confirm the real file appears in the existing explorer and terminal activity/results are visible. Check Plan does not apply requested edits; cancel a running request and verify the owned CLI process stops. Keep a second non-Antigravity provider connected to confirm its settings/history are unchanged.

## Files added or changed for this integration

- `packages/core/src/plugin/provider/antigravity/index.ts`: provider, external login method, model refresh RPC and session headers.
- `packages/core/src/plugin/provider/antigravity/protocol.ts`: official CLI discovery, ACP process lifecycle and model/reasoning selectors.
- `packages/core/src/plugin/provider/antigravity/model.ts`: streaming model adapter, conversation resume, current instructions and request cleanup.
- `packages/core/src/plugin/provider/antigravity/host.ts`: AAi permission, file-write and shell-service callbacks.
- `packages/core/src/plugin/provider/antigravity/stream.ts`: native text, reasoning, plans and provider-executed tool events.
- `packages/schema/src/antigravity.ts`: experimental plugin RPC catalog contract; no public HTTP endpoint changed.
- `packages/core/src/plugin/provider.ts`: register the native provider.
- `packages/core/package.json` and `bun.lock`: pin official ACP SDK 1.6.0 (already used by the CLI package).
- `packages/gui-plugins/src/antigravity/`: settings, official login launcher, model catalog and isolated web workspace.
- `packages/gui-plugins/src/google-ai-studio/`: isolated AI Studio workspace and browser account registration.
- `packages/gui-plugins/src/main.ts`, `src/renderer.ts` and `README.md`: register both built-ins and synchronize source-checked documentation.
- `packages/app/src/providers/catalog/order.ts`: show Antigravity Agent under Popular providers.
- `packages/core/test/plugin/antigravity.test.ts`: parsing, live selector validation, stream conversion, context preservation and cancellation regression tests.

Build, metadata probes, packaged desktop acceptance scripts and release source archive helpers are under `artifacts/antigravity-*`; they are local verification artifacts, not additional application services.
