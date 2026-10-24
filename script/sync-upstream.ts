#!/usr/bin/env bun
// Keeps the AAi fork current with upstream OpenCode in one repeatable step:
//
//   bun script/sync-upstream.ts               # fetch, merge, install if needed, run check
//   bun script/sync-upstream.ts --dry-run     # list the incoming commits; change nothing
//   bun script/sync-upstream.ts --no-check    # merge, audit, and install, but skip the check
//   bun script/sync-upstream.ts --no-install  # never run bun install
//   bun script/sync-upstream.ts --branch=fix-1 # merge into another local branch instead of dev
//
// The run refuses a dirty worktree, keeps `backup/pre-upstream-sync` at the commit it started from, and fails when
// the AAi brand surface disappears. OpenCode names that upstream adds to client code are listed for review: product
// names such as `OpenCode Go` are kept on purpose so OpenCode still works out of the box. Nothing is pushed.
import { $ } from "bun"

const args = process.argv.slice(2)
const remote = "upstream"
const upstreamBranch = "dev"
const upstream = `${remote}/${upstreamBranch}`
const branch = args.find((arg) => arg.startsWith("--branch="))?.slice("--branch=".length) ?? "dev"
const backup = "backup/pre-upstream-sync"
const dryRun = args.includes("--dry-run")
const check = !args.includes("--no-check") && !dryRun
const install = !args.includes("--no-install") && !dryRun

// The user-visible AAi surface. A merge that drops one of these has silently undone the rebrand.
const brand = [
  ["packages/desktop/src/main/constants.ts", `prod: "AAi"`, "desktop app name"],
  ["packages/desktop/src/main/constants.ts", `dev: "AAi Dev"`, "desktop dev name"],
  ["packages/app/index.html", "<title>AAi</title>", "renderer title"],
  ["packages/cli/package.json", `"aai": "./bin/opencode.cjs"`, "aai command alias"],
  ["packages/core/src/plugin/provider.ts", "AvernicAIPlugin", "AvernicAi provider registration"],
  ["packages/core/src/plugin/provider/avernicai.ts", "AvernicAIPlugin", "AvernicAi provider plugin"],
] as const

// OpenCode names that must stay: they belong to the products this fork still connects to.
const allowed = [
  /@opencode(-ai)?\//,
  /OPENCODE_/,
  /opencode\.(json|jsonc|ai)/,
  /opencode (pair|service|auth|models|acp|generate)/,
  /OpenCode (Go|Zen|Console|Free)/,
  /Anomaly Innovations/,
  /https?:\/\//,
]

// Only the packages that make up the client surface; server and www prose is upstream's own.
const surfaces = [
  "packages/app/src/",
  "packages/desktop/src/",
  "packages/tui/src/",
  "packages/cli/src/",
  "packages/gui-extensions/src/",
]

await sync()

async function sync() {
  await requireClean()
  const current = (await $`git branch --show-current`.text()).trim()
  if (current !== branch) fail(`sync: run this on ${branch}, not ${current}`)
  const fetched = await $`git fetch ${remote} ${upstreamBranch}`.nothrow().quiet()
  if (fetched.exitCode !== 0) fail(`sync: could not fetch ${upstream}; check the ${remote} remote and your network`)
  const incoming = (await $`git log --oneline HEAD..${upstream}`.text()).trim()
  if (incoming.length === 0) {
    console.log(`sync: already up to date with ${upstream}`)
    return
  }
  console.log(`sync: ${incoming.split("\n").length} upstream commit(s) to merge:\n${indent(incoming)}\n`)
  if (dryRun) return
  const previous = (await $`git rev-parse HEAD`.text()).trim()
  await $`git branch -f ${backup} ${previous}`.quiet()
  await merge(previous)
  await audit(previous)
  await dependencies(previous)
  if (check) await runCheck()
  await report(previous)
}

async function merge(previous: string) {
  const count = (await $`git rev-list --count ${previous}..${upstream}`.text()).trim()
  const tip = (await $`git rev-parse --short ${upstream}`.text()).trim()
  const message = [
    `chore: sync upstream dev`,
    ``,
    `Merge ${count} upstream commit(s) through ${upstream} at ${tip} into ${branch}.`,
    ``,
    `The AAi rebrand and the opt-in AvernicAi provider are preserved, and OpenCode`,
    `remains the default provider.`,
  ].join("\n")
  const merged = await $`git merge --no-ff ${upstream} -m ${message}`.nothrow().quiet()
  if (merged.exitCode === 0) return
  const conflicts = (await $`git diff --name-only --diff-filter=U`.text()).trim()
  console.error(
    `sync: the merge stopped before committing.\n\n${indent(conflicts || "(no conflicted files reported)")}\n\n` +
      `Resolve them and commit, or undo now with:\n  git merge --abort\n` +
      `Undo a committed sync with:\n  git reset --hard ${backup}`,
  )
  process.exit(1)
}

async function audit(previous: string) {
  const missing = (
    await Promise.all(
      brand.map(async ([file, marker, label]) => {
        const text = (await Bun.file(file).exists()) ? await Bun.file(file).text() : ""
        return text.includes(marker) ? undefined : `${label}: ${file} no longer contains ${marker}`
      }),
    )
  ).filter((problem): problem is string => problem !== undefined)
  console.log(`sync: rebrand audit: ${brand.length - missing.length}/${brand.length} brand checks intact`)
  missing.forEach((problem) => console.error(`  MISSING  ${problem}`))
  const notes = await opencodeMentions(previous)
  if (notes.length > 0) {
    console.log(`sync: ${notes.length} new OpenCode mention(s) in client code to review:`)
    notes.forEach((note) => console.log(`  ${note}`))
  }
  if (missing.length === 0) return
  console.error(
    `\nsync: the merge is committed but the rebrand regressed.\n` +
      `Restore the brand, or undo with: git reset --hard ${backup}`,
  )
  process.exit(1)
}

async function opencodeMentions(previous: string) {
  const base = (await $`git merge-base ${previous} ${upstream}`.text()).trim()
  const changed = (await $`git diff --name-only ${base} ${upstream}`.text())
    .split("\n")
    .filter((file) => surfaces.some((prefix) => file.startsWith(prefix)))
  return (
    await Promise.all(
      changed.map(async (file) => {
        const diff = await $`git diff -U0 ${base} ${upstream} -- ${file}`.nothrow().quiet().text()
        return diff
          .split("\n")
          .filter((line) => line.startsWith("+") && !line.startsWith("+++") && line.includes("OpenCode"))
          .filter((line) => !/^\+\s*(\/\/|\*|\/\*)/.test(line))
          .filter((line) => !allowed.some((pattern) => pattern.test(line)))
          .map((line) => `${file}: ${line.slice(1).trim()}`)
      }),
    )
  ).flat()
}

async function dependencies(previous: string) {
  const changed = (await $`git diff --name-only ${previous} HEAD -- bun.lock *package.json`.text()).trim()
  if (changed.length === 0) return
  if (!install) {
    console.log(`sync: dependency files changed; run bun install before building:\n${indent(changed)}`)
    return
  }
  console.log(`sync: dependency files changed, installing:\n${indent(changed)}`)
  const installed = await $`bun install`.nothrow()
  if (installed.exitCode !== 0) fail("sync: bun install failed; fix it, then run bun run check")
  // Bun writes LF endings, which this CRLF clone reports as a modification with no content diff.
  const phantom = await $`git diff --quiet -- bun.lock`.nothrow()
  if (phantom.exitCode === 0) await $`git checkout -- bun.lock`.quiet()
}

async function runCheck() {
  console.log("sync: running bun run check (lint + typecheck)")
  const result = await $`bun run check`.nothrow()
  if (result.exitCode === 0) return
  fail(
    `sync: check failed after merging ${upstream}. Fix the errors, then commit; or undo with: git reset --hard ${backup}`,
  )
}

async function report(previous: string) {
  const head = (await $`git rev-parse --short HEAD`.text()).trim()
  const files = (await $`git diff --name-only ${previous} HEAD`.text()).split("\n").filter(Boolean)
  console.log(`\nsync: merged ${upstream} into ${branch} as ${head}, ${files.length} file(s) changed`)
  console.log(`sync: undo with git reset --hard ${backup} (${previous.slice(0, 10)})`)
  console.log("sync: not pushed; publish with git push origin dev once the result looks right")
}

async function requireClean() {
  const dirty = (await $`git status --porcelain`.text()).trim()
  if (dirty.length === 0) return
  fail(`sync: commit or stash these changes first:\n${indent(dirty)}`)
}

function indent(text: string) {
  return text
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n")
}

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}
