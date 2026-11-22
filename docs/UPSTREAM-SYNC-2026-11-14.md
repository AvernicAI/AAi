# OpenCode upstream integration — 2026-11-14

AAi 2.3.0 integrates OpenCode `dev` through `38bd73789a43bf043599d6196af96583228035d7` (1,040 upstream commits relative to the previous AAi source). The pre-update AAi source is retained at `aai-checkpoint` (`83701be6f29359f55d1138ab224253a52f6296fa`).

## Integration decisions

| Area                          | Result                                                                                                                                                                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLI, SDK and protocol         | Upstream 2.3.0 APIs, generated clients, cancellation-safe noninteractive runs, ACP steering, and AAi prompt-file support.                                                                                                                               |
| Agents and subagents          | Upstream scoped plugin identities, parent reporting whenever a background child becomes idle, lifetime/completion handling, fork isolation and ACP updates. Alphie extends the existing instructions and permissions.                                   |
| Providers                     | Updated upstream adapters and model resolution hooks; AAi pricing categories, compatible endpoints and cost safeguards retained. Free selections cannot silently fall back to paid or unpriced routes. Provider free quotas remain provider controlled. |
| Local discovery and Code Mode | Local ranking remains before model execution. Inline namespace descriptions and listings stay bounded; complete inventory metadata remains available for correct tool-change detection and lazy search.                                                 |
| MCP                           | Upstream connection lifecycle, OAuth refresh, startup grace, events, resource discovery and attached clients; AAi catalog selection and call-time allowlists retained. Desktop launches its hosted MCP endpoint and bundled integrations.               |
| Desktop                       | Upstream shared sidecar coordinator, cancellation, deep-link acknowledgments, startup/recovery machines, and storage synchronization; AAi tray, launch preferences, diagnostics and background-window mode retained.                                    |
| GUI plugins                   | AAi IDE/image preview, Merlin signed-in web interface, Alphie and custom integrations retained alongside upstream plugin registries and terminal updates.                                                                                               |
| Themes and branding           | AAi wordmark, palette editor, saved custom themes and default dark scheme carried onto upstream's theme registry. Production macOS Icon Composer uses AAi artwork and retains an ICNS fallback.                                                         |
| Website                       | Existing-hosting AAi showcase remains in `sites/aai-showcase`; upstream website source is separate in `services/site`.                                                                                                                                  |

Convio remains retired according to the fork's provider cleanup; it is not silently re-enabled by this update.

## Verification

- Client generation: `bun run generate` from `packages/client`.
- Canonical root check: `bun run check` (35 packages).
- Core integration: routing, flags, Code Mode, discovery, MCP, AAi plugins and session runner.
- Subagents: report, lifetime, idle end-to-end, completion and tool behavior.
- Desktop lifecycle, packaging, IPC, startup and recovery tests.
- Composer submission and crash-page retry regressions.

The current Turbo parser warns about Bun's version-scoped override format. The scoped security overrides are retained; the canonical check completes all 35 package checks.

Windows artifacts are built from this source. macOS and Linux source compatibility is checked, but their native packages require their corresponding build hosts. Windows Server 2016 remains below the bundled runtime's supported API requirements; use a supported Windows desktop/Server release.

## Future updates

Run `bun run sync:upstream` on a clean `dev` branch. It keeps a `pre-upstream-sync` reference, merges upstream, checks AAi extension points, installs changed dependencies, regenerates public clients when needed, and runs the canonical check. Review conflicts before shipping. It does not push or publish.


## Corrected AAi Dev installer identity

The Windows download targets **AAi Dev**, retaining the existing `ai.opencode.desktop.dev` profile and upgrade GUID `b82a3793-6cb8-5d2a-9ed8-4e6f2297ac4b`. Both desktop and bundled CLI are built for the `dev` channel. The installer checks the previous application's display name before invoking an uninstaller, rejects OpenCode executable folders, and preserves resources of unknown ownership in legacy shared directories.

AAi production and beta use `com.avernic.aai` and `com.avernic.aai.beta`, with distinct package names. AAi registers `aai://` rather than taking ownership of `opencode://`. The corrected download is named `AAi-Dev-2.3.0-Setup-x64.exe`; the previous generic download paths are refreshed with this Dev build.

Validation: all 19 targeted desktop packaging, compiled NSIS and deep-link tests pass, and `bun run check` completes all 35 package checks. The rebuilt Dev CLI's isolated free-routing smoke test records zero paid-provider requests. Packaged-app verification checks the `aai-dev` manifest, version, bundled CLI checksum and full Blender runtime before promoting the installer.

## AAi 2.3.1 wordmark compatibility

The new-session animation now derives its final-letter anchor and animation timing from AAi's three glyphs. The inherited eight-letter index prevented the notch from mounting and crashed the first render; it also referenced a nonexistent pose while dragging. The existing browser keeper now checks for page errors on mount and after dragging the lodger out and returning it. Desktop and CLI builds use version `2.3.1` so an installed `2.3.0` CLI cache cannot retain the broken renderer. The AAi Dev upgrade identity remains unchanged.

The production-story comparison reproduces the exact undefined-`style` exception using the original source. The fixed story mounts without page errors at 640px and 1440px, and the browser drag-and-return keeper passes. All 35 package checks pass for `2.3.1`.
