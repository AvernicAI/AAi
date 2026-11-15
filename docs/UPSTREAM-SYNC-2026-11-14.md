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

Windows artifacts are built from this source. macOS and Linux source compatibility is checked, but their native packages require their corresponding build hosts. Windows Server 2016 remains below the bundled runtime's supported API requirements; use a supported Windows desktop/Server release.

## Future updates

Run `bun run sync:upstream` on a clean `dev` branch. It keeps a `pre-upstream-sync` reference, merges upstream, checks AAi extension points, installs changed dependencies, regenerates public clients when needed, and runs the canonical check. Review conflicts before shipping. It does not push or publish.
