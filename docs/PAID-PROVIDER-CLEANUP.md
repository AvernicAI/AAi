# Paid provider and integration cleanup

Release: `2.2.13-cleanup.1` (Windows x64).

FreeBuff now offers API-key and `FREEBUFF_API_KEY` authentication only. Its provider name is **FreeBuff (Paid API)**. The model list comes from `https://freebuff.com/api/v1/paid/models`, and requests use `/api/v1/paid/chat/completions`. The previous OAuth login, hardcoded free-agent list, session admission, and free-inference metadata path are removed. Previously saved OAuth credentials cannot enable or execute these models; a paid developer API key is required. Existing credentials for other providers are untouched.

The paid catalog's tool capabilities are respected. Its non-streaming JSON completions are adapted inside this provider to the existing OpenAI stream parser. Other providers' requests and responses are not modified.

The retired MCP integration's preset, special authentication UI, injected workflow prompt, website integration/capability cards, external link and setup text are removed. Generic local/remote MCP configuration, import, headers, OAuth and remote tool selection remain available. There were no matching saved server entries in the global or workspace AAi configuration inspected during removal.

Files changed for this release:

- `packages/core/src/plugin/provider/freebuff.ts`: paid-only authentication, catalog and request/response handling.
- `packages/core/test/plugin/provider-freebuff.test.ts`: OAuth rejection, paid catalog and endpoint checks, capability handling, response adaptation and unrelated-provider isolation.
- `packages/util/src/provider-pricing.ts`: FreeBuff's provider category is paid; all other categories retain their values.
- `packages/core/src/mcp/index.ts`: remove the vendor-specific instruction injection.
- `packages/app/src/settings/providers/mcp-settings.tsx`, `src/runtime/i18n/en.ts`: remove the dedicated preset/key controls and retain generic MCP tool controls.
- `sites/aai-showcase/public/index.html`, `public/app.js`: remove the retired integration's public-facing content.
- `sites/aai-showcase/release.json`: point the rebuilt site's download at this release's installer and checksum.

Validation before packaging: all 35 canonical package checks pass; 155 core/provider/MCP tests pass, with one existing platform-specific skip; nine MCP/import/localization tests pass. Focused changed-source lint reports zero warnings/errors. Repository-wide source search finds no remaining retired-integration mentions. No paid inference was billed during verification.

The full Windows `build.bat` workflow builds the matching CLI and embedded web app, prepares the desktop resources/native dependencies, and creates the desktop executable and installer. The static website is then rebuilt against that exact installer. Build, acceptance and checksum records use the `paid-cleanup-*` prefix under `artifacts/`.

The full batch build succeeded. The packaged application and private background server both report `2.2.13-cleanup.1`. Native acceptance passes file creation, the existing editor and terminal, live checklist, TypeScript diagnostics, Alphie's transparent animation, task completion, tray restoration, and the FreeBuff API-key form without browser sign-in. The rebuilt website passes removal, navigation, workspace-tour, mobile-menu and installer-download checks without script errors. Its distribution is ready under `sites/aai-showcase/dist`; hosting was not changed.
