# AlphaAi implementation audit

Audit date: 2026-11-12. This reviews the combined working tree, including the other agent's pending changes. The existing app and its provider/tool/runtime architecture are preserved. No project was recreated, no user profile was migrated, and no live user session was restarted.

## Architecture and feature wiring

| Surface | Implementation and integration | Verification |
| --- | --- | --- |
| Desktop shell | Electron main/preload, Solid renderer, typed MessagePort RPC, existing SQLite persistence | Full desktop package tests; canonical repository check |
| Alphie | Core additive context/generate hooks; one renderer state shared by chat, IDE and native mate; supplied PNGs and transparent animated GIF | Core prompt tests; real plugin-host UI test; packaged acceptance scenario |
| Built-in IDE | Monaco, explorer, quick open, multi-file editing, draft recovery, search, Git/diffs, Problems, language-server and debug-adapter bridges, project tasks | GUI workspace/DAP/task tests; real IDE UI test; packaged file creation and task execution |
| Terminal | Existing interactive terminals plus original agent shell records/output in Alphie commands | Packaged Node execution/output; IDE terminal command integration |
| Tasks/context | Existing todo tool/checklist enabled by default unless explicitly disabled; context settings and composer controls | Todo tests; packaged visible checklist; source integration review |
| Appearance/branding | AAi splash/about links; six AAi background options; Avernic Ember/dark defaults; editable/importable/exportable custom themes | Theme tests; packaged dark mate; source integration review |
| Providers | Popular Vyce Code entry and signed device login/model discovery; generic OpenAI-compatible connector; capability/usage-labelled API catalog; same-model routing | Vyce, catalog, router and connection/error tests |
| MCP | Settings forms for local/remote servers, environment/headers/OAuth, edit/remove, and JSON block import | Import and MCP synchronization tests; source integration review |
| Library | SkillMD default catalog and additional indexes; preview/install/enable/remove; npm plugin review/configuration; reusable prompt recipes | Native library/package tests, including traversal and parser protections |
| Browser/desktop skills | Existing browser tools/skill, `/control-mouse`, bounded native computer actions with permissions | Skill/command/computer input tests; no mouse or keyboard injection into the user's applications |
| Native OS integration | Desktop settings, login-item registration, summon shortcut, close-to-tray, tray commands | Desktop policy/IPC tests; native smoke covers settings, hide and restore |
| Reliability | Sidecar connect classification/retries, health reconnect, per-window crash-loop handling, existing recovery UI | Startup, service state, crash-loop and reactive health tests |
| Website | Existing static AlphaAi showcase under `sites/aai-showcase` | Source/branding inspection and JavaScript syntax check; hosting was not changed |

## Integration defects repaired in this audit

1. **Tray visibility included Alphie.** The tray now derives Show/Hide from registered main windows, excluding companion/utility windows. It updates on show, hide and close, including the early startup window. Turning off background mode restores the workspace before removing the tray.
2. **Retry cancelled future reconnects.** Each health-probe generation now owns a fresh AbortController. Disposed probes cannot start a late reconnect. The new regression test fails against the previous implementation and passes with the repair.
3. **Native labels shifted four locales.** Croatian, Hungarian, Icelandic and Lithuanian used positional native-label arrays. New tray/recovery keys produced undefined entries; an older microphone insertion also misaligned menu labels. Their 67 applicable existing translations per locale now have stable named keys; wording is unchanged, a retired unused server label is omitted, and new strings use the normal English fallback. A regression checks menu identity and CLI/recovery placeholders as well as string-valued dictionaries.

Files changed for these repairs:

- `packages/desktop/src/main/native/tray.ts`
- `packages/desktop/src/main/native/desktop-preferences.ts`
- `packages/app/src/runtime/server/health.ts`
- `packages/app/test-browser/ssh-health.test.ts`
- `packages/app/src/runtime/i18n/{hr,hu,is,lt}.ts`
- `packages/app/src/runtime/i18n/language.test.ts`
- `packages/desktop/script/alphie-smoke.cjs` extends packaged coverage to Desktop settings and close/restore behavior.
- `packages/core/test/session-runner.test.ts` supplies the new routing method in the existing single-route fixture, preserving its retry/failure contract.

The previously implemented checklist default and scalar IDE task-status subscription are retained. Earlier agents' other working-tree changes are retained.

## Checks and limits

- `bun run check` is the canonical lint/type check. It passes all 35 package checks; repository lint still reports existing warnings.
- Full app unit suite after locale repair: **1,091 passed, 0 failed** (132 files).
- Full desktop suite: **287 passed, 0 failed** (44 files).
- GUI plugin suites: **258 renderer/policy tests and 33 native library/package tests passed**.
- App reactive browser-state suite: **304 passed, 0 failed**. Browser tool/RPC/tunnel suite: **44 passed, 0 failed**.
- Existing session execution, runner, retry, tool-event and message suites: **337 passed, 0 failed**. Initially three cases failed because the partial model-service fixture omitted the new routing method; explicitly supplying the no-alternate-route result restores the intended tests without changing production retry behavior.
- The actual catalog implementation also successfully queried SkillMD's live public API. No remote skill was installed or executed by that check.
- Focused suites additionally cover Alphie/todo/provider routing/catalog, Vyce, MCP, themes, computer/skill commands, and reactive reconnect behavior. Counts overlap full suites and should not be added as unique coverage.
- The combined Alphie/IDE component run passes both scenarios. An initial run failed to receive Monaco TypeScript diagnostics; the isolated run and combined rerun pass without changing production diagnostics code. That initial worker-load failure remains recorded in `artifacts/feature-audit-components.log`; it is not represented as a diagnosed production fix.
- `bun audit --json` reports deepmerge and legacy Zod version advisories. Existing checked-in patches are installed, and both actual-consumer attack-case tests pass. The version-based audit remains nonzero; this is not a claim of a clean vulnerability scan.
- Native Windows acceptance uses a private profile, workspace and loopback model. It exercises real file and shell tools without reading users' API credentials. Provider-specific live inference, current third-party quotas, macOS/Linux native integration, and every possible LSP/debug adapter require their respective accounts/environments and are not certified by these tests.
- Feature presence and test coverage do not establish complete parity with a future upstream release. The underlying compatible IDs, storage paths and legal notices remain intact.

Audit logs use the `artifacts/feature-audit-*` prefix. Release build/acceptance results and artifact checksums are recorded alongside the deliverables.

## Release acceptance

The final source is built as `2.2.12-audit.1` using the existing version override and Windows packaging workflow. The CLI's embedded web UI is rebuilt as well. Both the packaged application version and its private background server version are checked by the acceptance script.

The packaged acceptance run passes all of the following:

- Existing agent loop, additive persona, visible live checklist, real `hello.js` creation, and the existing IDE tab.
- File switching drives the shared walking pose; waiting for actual quick-open results and observing the short pose in-page makes this check reliable.
- Original shell execution and original output in the existing terminal; the supplied transparent GIF is loaded.
- Session success and real IDE task completion both cheer and release the busy state.
- The shipped Monaco TypeScript worker reports an invalid assignment in the existing Problems panel.
- Native Desktop settings, close-to-tray and clicking Alphie restore the same main window.
- Disabling the mate disposes its native window.

The measured session-entry sample was 540 ms, compared with the earlier 513 ms sample. Single samples do not establish a performance improvement or regression, especially across the other agent's intervening changes.

Run `packages/desktop/dist/win-unpacked/AAi Dev.exe` for the tested unpacked app, or use the new installer under `artifacts/`. The standalone CLI is `artifacts/AlphaAi-CLI-2.2.12-audit.1-x64.exe`. Existing `run.bat` / `run-cli.bat` paths are retained. Checksums and the combined source snapshot are delivered alongside the installer.
