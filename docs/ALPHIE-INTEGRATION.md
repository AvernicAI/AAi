# Alphie integration

The combined working tree was audited again on 2026-11-12. See [FEATURE-IMPLEMENTATION-AUDIT.md](./FEATURE-IMPLEMENTATION-AUDIT.md) for the latest integration fixes, full-suite results and release verification. The current audit build is `2.2.12-audit.1`; the build record below describes the earlier Alphie integration.

Alphie extends the existing AAi desktop application. The chat runner, provider credentials, model selection, permission checks, workspace handling, Monaco editor, task runner, interactive terminals and chat history remain the existing implementations.

## Architecture

- Electron main entry: `packages/desktop/src/main/index.ts`; renderer entry: `packages/desktop/src/renderer/index.tsx`.
- SolidJS chat and composer: `packages/app/src`; native and renderer built-ins: `packages/gui-plugins/src`.
- Existing Effect agent execution: `packages/core/src/session/runner`; Alphie's additive `session.context` and `session.generate` hooks: `packages/core/src/plugin/alphie.ts`. These cover primary chat and side conversations such as `/btw` while leaving title generation and compaction alone.
- One Alphie provider in the current window derives activity from actual session/tool/job state. The chat header and IDE read its `alphie.state` contract. The native mate receives a display-only snapshot over a dedicated MessagePort.
- Direct tool calls and nested Code Mode `execute` progress both drive the sprite. Confirmed session outcomes and real IDE task exits drive success feedback. Restored history, interrupted executions, and a failed command followed by a normal assistant response do not celebrate.
- The companion has no API keys, filesystem API, general IPC, or agent loop. Its validated outgoing messages are UI actions and drag deltas. Closing its owner, disabling the feature, or unloading the plugin disposes the utility window and its port.
- Existing `todowrite` and chat todo UI supply the task checklist. The experimental tool now defaults to enabled; an explicit `experimental.todo: false` is preserved.
- The terminal's **Alphie commands** tab reads the original server shell records/output, including commands nested inside Code Mode. It does not run commands again. Interactive terminals are still available from that tab.
- A completed file mutation opens the existing IDE, refreshes the explorer, and reveals its editor tab. Automatic reload preserves unsaved drafts, including edits made while the filesystem read is pending. **View changes** in the chat header opens the existing Changes view for the affected file.

## Settings and controls

Settings → Alphie stores the following in the existing schema-backed plugin persistence:

| Control                 | Default                                                |
| ----------------------- | ------------------------------------------------------ |
| `features.alphieMate`   | `true`                                                 |
| Floating desktop window | On; docked fallback when native support is unavailable |
| Size                    | 180 px                                                 |
| Opacity                 | 100%                                                   |
| Always on top           | On                                                     |
| Automatic sleep         | 60 seconds; 0 disables                                 |

Click Alphie to focus chat and wave. Drag to move. Right-click for Chat, Wave, Lift, Cheer, Walk, Sleep, Open IDE, Settings, and Hide Alphie. Hiding the mate does not interrupt the agent. The command palette contains **Show or hide Alphie**.

The seven original PNG files are copied unchanged into `packages/app/public/assets/alphie/`. SHA-256 comparisons match all seven uploads. The user-supplied `alphie_lifting_transparent.gif` is an 80-frame, 720×720 looping GIF; every frame has transparency. Lifting/thinking uses this GIF; reduced-motion mode uses the original static lifting PNG. Other activities use their matching supplied PNGs. No artwork was regenerated. The native bubble follows the application theme and UI font.

## Files added

| Files                                                                                                | Purpose                                                                                        |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `packages/gui-plugins/src/alphie/index.ts`, `contract.ts`                                            | Feature settings, shared state and typed native bridge                                         |
| `packages/gui-plugins/src/alphie/activity.ts`, `renderer.tsx`                                        | Project real direct/nested tool progress and session outcomes; provide the single Alphie state |
| `packages/gui-plugins/src/alphie/AlphieMate.tsx`, `styles.css`, `settings.tsx`, `i18n/en.ts`         | Shared mate UI, controls, settings and translated copy                                         |
| `packages/gui-plugins/src/alphie/main.ts`                                                            | Utility-window ownership, positioning, topmost/opacity and MessagePort lifecycle               |
| `packages/core/src/plugin/alphie.ts`                                                                 | Additive persona and default assistant display name                                            |
| `packages/gui-plugins/src/terminal/contract.ts`, `agent.tsx`                                         | Original agent command view inside the terminal plugin                                         |
| `packages/desktop/src/preload/alphie.ts`, `src/renderer/alphie.html`, `src/renderer/alphie-mate.tsx` | Sandboxed native mate preload and renderer                                                     |
| `packages/gui-plugins/src/alphie/alphie.fixture.tsx`, `packages/app/component-tests/alphie.spec.ts`  | Real plugin-host regression coverage                                                           |
| `packages/core/test/plugin/alphie.test.ts`                                                           | Preserve system instructions, tools, model and options when adding the persona                 |
| `packages/desktop/script/alphie-smoke.cjs`                                                           | Packaged acceptance scenario using a private profile and local test model                      |
| `packages/app/public/assets/alphie/*`                                                                | Seven original cutouts and the supplied transparent GIF                                        |

## Existing files integrated

- `packages/gui-plugins/src/{main,renderer}.ts`, `package.json`, `README.md`: register the feature, expose its shared mate surface, and update source-checked guide examples.
- `packages/gui-plugins/src/ide/{contract.ts,renderer.tsx,panel.tsx,model.ts}`: existing editor reveal contract, shared status, real task outcomes and safe refresh.
- `packages/gui-plugins/src/terminal/{renderer.tsx,i18n/en.ts}`: original-command tab and command-palette entry.
- `packages/core/src/plugin/internal.ts`: register the additive prompt plugin.
- `packages/core/src/tool/plugin/todo.ts`, `packages/schema/src/config/experimental.ts`, `packages/core/test/tool-todo.test.ts`: checklist default and explicit-disable verification.
- `packages/desktop/electron.vite.config.ts`, `src/preload/types.ts`: companion build entry, separate window startup bundles, typed bridge.
- `packages/app/component-tests/plugin-host.fixture.tsx`: supply session/screen boundaries to the actual plugin host in tests.
- `packages/app/src/session/composer/region.tsx`: align the existing checklist's visibility with the task tool's default while preserving explicit disabling and waiting for configuration to load.

Unrelated pending workspace changes have not been reverted. Existing FreeBuff/provider IDs, endpoints, authentication and model handling are retained. Core API names and compatibility paths remain unchanged.

## Run and test

1. Launch the newly built desktop executable or installer. For development, use `bun run dev:desktop` from the repository root.
2. Open a workspace and connect a tool-capable model through the existing provider settings.
3. Ask: **Create hello.js that prints Hello Alphie and run it**.
4. Confirm the live checklist, existing IDE tab/explorer, original shell output in **Alphie commands**, synchronized status, and completion cheer/toast.
5. Open Settings → Alphie to adjust the mate. Check docked mode, dragging, sleep/wake and the hide toggle. Use **View changes** to inspect the existing Changes view.

Focused checks (run from the indicated package directories):

```powershell
# packages/core
bun test test/plugin/alphie.test.ts test/tool-todo.test.ts

# packages/app
$env:PLAYWRIGHT_STORIES_PORT = '3294'
bunx playwright test --config playwright.components.config.ts alphie.spec.ts ide.spec.ts --workers=1

# repository root
bun run check
node packages/desktop/script/alphie-smoke.cjs
```

The native script uses a fresh profile/workspace under `node_modules/.cache`, the packaged executable in `packages/desktop/dist/win-unpacked`, and a loopback OpenAI-compatible fixture. Real agent tools write `hello.js` and execute Node; no user's provider credentials are read by the fixture. It closes only its own app/server processes. Screenshots and build/check logs are saved under `artifacts/`.

Existing model tool support and permissions still govern execution. A disabled checklist stays disabled; pending approval waits for the user. Retry and error recovery remain owned by the current agent runtime, without automatic replay of state-changing commands.

## Build and verification record

The Windows build is tagged `2.2.11-alphie.1`, newer than the previous `2.2.10-ide.2` build. It uses the existing `OPENCODE_VERSION` override instead of rewriting upstream package versions. To use that version with the normal Windows workflow:

```powershell
$env:OPENCODE_VERSION = '2.2.11-alphie.1'
.\build.bat
```

- Canonical `bun run check`: all 35 package checks pass.
- Prompt preservation and task checklist tests: 4 pass.
- Browser coverage includes direct/nested tools, real command failure feedback, shared pose, file reveal, terminal navigation and persisted hiding. The existing IDE regression also passes.
- The packaged acceptance scenario passes: original tool execution creates `hello.js`, its existing IDE tab opens, the original shell runs Node, the existing terminal plugin displays `Hello Alphie`, the transparent GIF loads, success celebrates for two seconds, and hiding disposes the native window.
- Strict changed-file lint reports 29 existing findings in 11 unrelated files already modified before this integration. Alphie's new files and the files changed for its GUI integration have zero warnings/errors.

Logs are in `artifacts/Alphie-check.log`, `Alphie-lint-changed.log`, `Alphie-native-smoke.log`, and the build logs. Native screenshots are `artifacts/Alphie-native-IDE.png` and `Alphie-native-mate.png`. `Alphie-source.zip` contains full current copies of the integration files, including preserved earlier edits in shared files.
