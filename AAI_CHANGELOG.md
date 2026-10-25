# AAi change log

Fork-level history for AAi, the rebranded OpenCode build. Upstream's own release notes stay in
[CHANGELOG.md](CHANGELOG.md); this file records what the fork changed and which upstream commits it has taken.

- **Branch:** `dev`, merging `upstream/dev` (`anomalyco/opencode`)
- **Last updated:** 2026-10-24

## Sync history

| Date       | Fork commit  | Upstream tip | Commits | Notes                                                 |
| ---------- | ------------ | ------------ | ------- | ----------------------------------------------------- |
| 2026-10-23 | `fd9986acc3` | —            | —       | AAi rebrand checkpoint, squashed into one commit      |
| 2026-10-24 | `aa98cfb208` | `6806c6e29a` | 19      | First upstream sync, merged with no conflicts         |
| 2026-10-24 | `4adc2235a8` | `7ba0e4b67b` | 3       | Console usage limits (core + TUI), CI skips draft PRs |

The upstream history is merged with `--no-ff`; fork history after the checkpoint is `aa98cfb208` (sync),
`4dc5a80fc4` (sync tool), `4adc2235a8` (sync).

## What came from upstream

**First sync (`aa98cfb208`, 19 commits)**

- Go allowance reporting end to end: core records reported cost and Go allowance, TUI and app show it.
- New `20261024002554_session_allowance` migration; schema bootstrap now reports 51 migrations.
- Provider and protocol fixes: unknown OpenAI Chat finish reasons, unknown OpenAI speech and image stream events,
  native Google video URLs, no-op Azure model transform updates, OpenAI image moderation classified as content
  policy, ANSI stripped from TUI tool errors.
- Plugins are activated before each runner step; the macOS git binary is resolved once.
- Bundled models.dev snapshot refreshed; `services/www` stopped committing OpenAPI copies.

**Second sync (`4adc2235a8`, 3 commits)**

- Core reads OpenCode Console usage limits and classifies budget refusals (#58694).
- TUI shows Console usage limits in the model dialog and prompt metadata (#58731).
- CI skips draft pull requests (#58750).

## Rebrand rules

`sync:upstream` fails the run when any of these brand anchors disappears:

| Anchor                                        | Where                                    |
| --------------------------------------------- | ---------------------------------------- |
| `prod: "AAi"`, `dev: "AAi Dev"`               | `packages/desktop/src/main/constants.ts` |
| `<title>AAi</title>`                          | `packages/app/index.html`                |
| `"aai": "./bin/opencode.cjs"`                 | `packages/cli/package.json`              |
| `AvernicAIPlugin` registration and definition | `packages/core/src/plugin/provider*`     |

These OpenCode names are kept on purpose, because OpenCode is still the default provider and must work out of
the box:

- Products: `OpenCode Go`, `OpenCode Zen`, `OpenCode Console`, `OpenCode Free`.
- Identifiers and paths: `@opencode/*` and `@opencode-ai/*` packages, `OPENCODE_*` variables, `opencode.json`,
  `opencode pair`, `opencode service`, `opencode auth`.
- The trademark line in `settings.about.trademark`.
- AvernicAi stays opt-in: `packages/core/src/plugin/provider/avernicai.ts` only adds the provider once a
  credential resolves models, so a fresh install talks to OpenCode.

## Syncing with upstream

```bash
bun run sync:upstream                # fetch, merge, audit, install if needed, run bun run check
bun run sync:upstream --dry-run      # list incoming commits; change nothing
bun run sync:upstream --no-check     # merge, audit, install, but skip the checks
bun run sync:upstream --no-install   # merge without installing
bun run sync:upstream --branch=fix-1 # merge into another local branch instead of dev
```

Windows: `sync.bat` runs the same thing. The script is [script/sync-upstream.ts](script/sync-upstream.ts).

What it does:

1. Refuses a dirty worktree or the wrong branch.
2. Fetches `upstream/dev` and lists the incoming commits.
3. Moves `backup/pre-upstream-sync` to the starting commit, then merges `--no-ff`.
4. Verifies the brand anchors above and prints new OpenCode names in client code for review.
5. Runs `bun install` only when `bun.lock` or a `package.json` changed.
6. Runs `bun run check` (lint + typecheck) unless `--no-check`.

On conflicts it stops before committing, names the files, and prints both recovery paths. It never pushes.

Undo the most recent sync with:

```bash
git reset --hard backup/pre-upstream-sync
```

## Environment notes for this checkout

- **Bun 1.4.4 is required.** The repo pins `bun@1.4.4`; Bun 1.4.3 does not know `bun check --no-script`, so the
  `typecheck` task fails in `theme`, `plugin-figma`, `stats-core` and others for no code reason.
- **Symlinks must be real.** Upstream stores 43 files as git symlinks (favicons, window icons,
  `packages/app/src/custom-elements.d.ts`). With `core.symlinks=false` they check out as text files, which fails
  the app typecheck and embeds the literal path instead of an icon in the desktop build. This clone sets
  `core.symlinks` to `true` and re-checked those paths out.
- **`bun.lock` line endings.** Bun writes LF; this clone checks out CRLF, so `git status` can show `bun.lock`
  modified with an empty `git diff`. The sync script restores the working copy in that case.

## Verification on 2026-10-24

| Check                                    | Result                                            |
| ---------------------------------------- | ------------------------------------------------- |
| `bun run check` (lint + typecheck)       | Pass, 34/34 packages                              |
| `bun run typecheck:tsc`                  | Pass, 34/34 packages                              |
| `packages/desktop` `electron-vite build` | Exit 0, real SVG/ICO assets in `out/renderer`     |
| `packages/cli` `--version`               | `aai vlocal`                                      |
| core tests (session, migration, plugin)  | 56 pass                                           |
| core tests (usage limits, session error) | 16 pass                                           |
| ai tests (protocols, image, speech)      | 165 pass                                          |
| ai provider-error tests                  | 39 pass                                           |
| tui tests (allowance, context)           | 6 pass                                            |
| tui usage-limit render test              | 1 pass at the package timeout (`--timeout 30000`) |
| client promise tests                     | 40 pass                                           |
| server usage tests                       | 3 pass                                            |
| gui-extensions tests                     | 179 pass, 1 skip                                  |

The sync tool itself was exercised with `--dry-run`, a full merge in a throwaway worktree, a forced conflict,
and a real run on `dev` that merged the three newest upstream commits and passed the check.

## Open items

- Nothing has been pushed; publish with `git push origin dev`.
- The desktop app builds but has not been launched.
- `backup/pre-upstream-sync` covers one sync; older fork history is recoverable from the commits above.
