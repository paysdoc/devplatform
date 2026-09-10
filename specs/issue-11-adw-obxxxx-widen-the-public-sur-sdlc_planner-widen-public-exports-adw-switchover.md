# Feature: Widen the public surface for the ADW switchover — GitHub credential/identity helpers, `createGhRepoApi`, and `commitOps`/`branchOps`/`isLeaseRejection` on the published barrels

## Metadata
issueNumber: `11`
adwId: `obxxxx-widen-the-public-sur`
issueJson: `{"number":11,"title":"Widen the public surface for the ADW switchover (L4)","body":"**Consumer:** paysdoc/AI_Dev_Workflow#840 (ADW switchover to `@paysdoc/devplatform`), blocked at its spec's Step 1 gate. The published 1.0.0 `exports` map is closed (`.`, `./providers`, `./git`, `./package.json`), so ADW can only reach what the three barrels re-export.\n\n**`src/providers/github/index.ts` — add re-exports**\n\n| Symbol | Module | ADW consumer (current `dev`, post-#844) |\n|---|---|---|\n| `createGitHubTokenProvider` | `githubTokenProvider` | `adws/core/launchGitContext.ts` |\n| `resolveBootstrapGitIdentity` | `githubIdentity` | `adws/core/launchGitContext.ts` |\n| `resolveContextToken` | `tokenResolver` | `adws/core/launchGitContext.ts` |\n| `ghAuthToken` | `ghAuthToken` | `adws/core/launchGitContext.ts` |\n| `isGitHubAppConfigured`, `getInstallationToken` | `appAuth` | `adws/core/githubAppAuth.ts` (type `GitHubAppConfig` is already re-exported via `forgeCredentials`) |\n| `createGhRepoApi`, type `GhRepoApi` | `ghRepoApi` | `features/per-issue/step_definitions/feature-797.steps.ts` |\n\n**`src/git/index.ts` — add re-exports**\n\n| Symbol | Module | ADW consumer |\n|---|---|---|\n| `commitOps` | `commitOps` | `features/regression/step_definitions/feature-729.steps.ts`, `feature-844.steps.ts` |\n| `branchOps` | `branchOps` | `feature-844.steps.ts` |\n| `isLeaseRejection` | `commitOps` | none today; export alongside `commitOps` for the lease-rejection scenarios |\n\n**Already on `main` but unreleased (v1.1.0):** `createLiteralTokenProvider` in `./git`, `createForgeCredentials`, type `GitHubAppConfig`. ADW needs these published too. If maintainers prefer, `createForgeCredentials` may be the documented route for the four `launchGitContext.ts` helpers; ADW's plan currently assumes the direct re-exports (PRD story 29: no behaviour change at the switchover).\n\n**No longer needed** (dropped from the ADW plan since paysdoc/AI_Dev_Workflow#844): `readLocalRepoInfo`, `parseGitHubIssue`, `selectPreferredPR`, `convertToSshUrl`, `GitLabApiClient`.\n\n**Acceptance criteria**\n- [ ] Every symbol above resolves from `@paysdoc/devplatform/providers` / `@paysdoc/devplatform/git` in the packed tarball (`npm pack` + dynamic-import key check), with `.d.ts` types\n- [ ] The import-graph test still proves `./git` pulls no `src/providers/` module (`commitOps`/`branchOps` are git-core)\n- [ ] Landed as a `feat:` commit so semantic-release cuts a new minor from v1.1.0\n- [ ] A version containing this change is on npm. Blocker to clear first: the v1.1.0 release run (34503029087) failed at `npm publish` with `403 OIDC permission denied`; the npm trusted-publisher configuration for `@paysdoc/devplatform` must grant the `release.yml` workflow. v1.1.0 is tagged but not published.\n","state":"OPEN","author":"app/paysdoc-adw","labels":[],"createdAt":"2026-09-10T23:05:52Z","comments":[],"actionableComment":null}`

## Feature Description

The published package has a closed `exports` map (`.`, `./providers`, `./git`, `./package.json`),
so a consumer can reach only what the three barrels re-export. ADW's switchover to this library
(paysdoc/AI_Dev_Workflow#840) is blocked at its spec's Step 1 gate because the symbols its launch
boundary (`adws/core/launchGitContext.ts`, `adws/core/githubAppAuth.ts`) and its step definitions
(`feature-797`, `feature-729`, `feature-844`) import today through deep paths sit on no barrel.
Verified against ADW's `origin/dev` on 2026-09-11: `launchGitContext.ts` imports
`resolveBootstrapGitIdentity`, `ghAuthToken`, `resolveContextToken`, `createGitHubTokenProvider`;
`githubAppAuth.ts` imports `isGitHubAppConfigured`, `getInstallationToken` and type
`GitHubAppConfig`; `feature-797.steps.ts` imports `createGhRepoApi` (and `createLiteralTokenProvider`);
`feature-729.steps.ts` imports `commitOps`.

This feature widens the two barrels by exactly the issue's list — nothing moves, no signature
changes, no new `package.json` subpath:

| Entry point | Runtime symbol(s) | Companion type(s) | Source module (unchanged) |
|---|---|---|---|
| `./providers` (via `src/providers/github/index.ts`) | `createGitHubTokenProvider` | `GitHubTokenProviderInput` | `src/providers/github/githubTokenProvider.ts` |
| `./providers` | `resolveBootstrapGitIdentity` | `BootstrapIdentityDeps` | `src/providers/github/githubIdentity.ts` |
| `./providers` | `resolveContextToken` | `ResolveContextTokenInput` | `src/providers/github/tokenResolver.ts` |
| `./providers` | `ghAuthToken` | — | `src/providers/github/ghAuthToken.ts` |
| `./providers` | `isGitHubAppConfigured`, `getInstallationToken` | — (`GitHubAppConfig`/`AppAuthDeps` already ship via `forgeCredentials.ts`) | `src/providers/github/appAuth.ts` |
| `./providers` | `createGhRepoApi` | `GhRepoApi` | `src/providers/github/ghRepoApi.ts` |
| `./git` (`src/git/index.ts`) | `commitOps`, `isLeaseRejection` | — | `src/git/commitOps.ts` |
| `./git` | `branchOps` | — | `src/git/branchOps.ts` |

Every one of those modules is *already* in the module graph of its entry point — the providers
barrel reaches all six GitHub modules through `forgeCredentials.ts` and `githubCodeHost.ts`, and
the git barrel reaches `commitOps.ts`/`branchOps.ts` through `gitContext.ts` — so this is purely an
export-list widening: the bundle a consumer gets does not change, and the committed import-graph
walker's reachable sets do not change. The companion `*Input`/`*Deps` types follow the GitHub
barrel's existing convention of pairing every exported factory with its deps type
(`createGitHubIssueTracker` + `GitHubIssueTrackerDeps`, etc.).

Alongside the exports, the feature (1) refreshes every docblock and doc that currently promises
these names are deep-import only or "never on a barrel", (2) turns the packed-tarball smoke check
into a table-driven **dynamic-import key check** over every public name under Node and Bun, and
(3) adds `@adw-11` BDD scenarios — hermetic ones driving the names through the public entry
points, and `@packaging` ones proving every name resolves at runtime and in the emitted `.d.ts`
of the real tarball.

It also covers the release half of the issue: the change lands as a `feat:` commit so
semantic-release computes **v1.2.0** from the tagged-but-unpublished v1.1.0 (v1.2.0 therefore also
ships `createForgeCredentials`, `createLiteralTokenProvider` on `./git` and type `GitHubAppConfig`),
and the plan records the npm trusted-publishing blocker that stopped the v1.1.0 run, the
maintainer-side fix, the `NPM_TOKEN` fallback, and the recovery procedure if a run leaves another
orphan tag.

Design decision: the issue leaves open whether `createForgeCredentials` should instead be "the
documented route" for the four `launchGitContext.ts` helpers. This plan does both without
contradiction — the direct re-exports are added exactly as requested (ADW PRD story 29: no behaviour
change at the switchover), and the docs name `createForgeCredentials` as the preferred forge-neutral
route, with the direct helpers described as the GitHub-specific building blocks it composes.

## User Story

As the ADW launch boundary and step-definition author consuming `@paysdoc/devplatform` from npm
I want every symbol my code imports today from deep paths to resolve — with types — from
`@paysdoc/devplatform/providers` or `@paysdoc/devplatform/git` in a published version
So that the switchover is a pure import-path change with no behaviour change, and the blocked
Step 1 gate passes.

## Problem Statement

1. The `exports` map is closed and the barrels are the only public surface; the nine runtime names
   ADW needs (`createGitHubTokenProvider`, `resolveBootstrapGitIdentity`, `resolveContextToken`,
   `ghAuthToken`, `isGitHubAppConfigured`, `getInstallationToken`, `createGhRepoApi`, `commitOps`,
   `branchOps`) plus `isLeaseRejection` and type `GhRepoApi` are on none of them, so ADW cannot
   compile or run against the tarball.
2. The tree documents the *opposite* decision in several places — `ghRepoApi.ts` ("Deep-import
   only: never added to `./index.ts`"), `forgeCredentials.ts` ("The published barrels never carry
   the GitHub-named helpers"), `commitOps.ts`/`branchOps.ts` ("Package-private"),
   `app_docs/forge-providers.md` and `app_docs/github-provider.md` — so widening the barrels
   without rewriting those would leave the documented contract contradicting the shipped one.
3. The tarball proof (`scripts/smokePackage.ts` and the `@packaging` scenarios) checks five
   representative names via static imports; the issue's acceptance criterion is a dynamic-import
   key check over *every* listed name, with `.d.ts` coverage.
4. The npm registry has only `1.0.0`. v1.1.0 is tagged (semantic-release run 34503029087 created
   the tag, then `npm publish` failed: `403 Forbidden - PUT …/@paysdoc%2fdevplatform - OIDC
   permission denied for this action`). No `NPM_TOKEN` secret exists and no GitHub release was
   created. Until publishing works, no version containing this change can reach ADW.

## Solution Statement

Add the re-exports to `src/providers/github/index.ts` (grouped under a comment naming issue #11
and pointing at `createForgeCredentials` as the forge-neutral route) and to `src/git/index.ts`
next to `claimOps`. Leave `src/providers/index.ts` untouched — its `export * from
'./github/index.js'` surfaces the GitHub barrel on `./providers` automatically — and do **not**
re-export `GitHubAppConfig`/`AppAuthDeps` from the GitHub barrel: `forgeCredentials.ts` already
re-exports them, and two `export *` sources for one name would make `src/providers/index.ts` fail
typecheck with TS2308. Rewrite the docblocks that pinned the old decision so the source tells the
truth. Convert the smoke script's static import check into a table-driven dynamic-import key
check (one `Record<subpath, names[]>`, so the next widening is a one-line change), and drive the
same table through `@adw-11` scenarios: hermetic scenarios call each name through
`src/providers/index.ts` / `src/git/index.ts` and assert observable outputs (a resolved token, a
`GH_TOKEN` overlay, a resolved identity, a lease-rejection verdict, a stubbed-runner result, a
named refusal); `@packaging` scenarios pack the real tarball into a clean consumer, run a module
that dynamically imports both subpaths and reports missing keys, and type-check a consumer module
that uses every name including `GhRepoApi`. Update README, app docs, glossary and `.adw/project.md`.
Land as `build-agent: feat: …`; clear the npm trusted-publisher blocker (maintainer action, with
the `NPM_TOKEN` fallback) and verify `npm view @paysdoc/devplatform version` reports the new
minor.

## Relevant Files

Use these files to implement the feature:

**Barrels (the change):**
- `src/providers/github/index.ts` — the GitHub adapter barrel, surfaced on `./providers` via
  `src/providers/index.ts`'s `export *`. Gains the runtime + type re-exports listed above.
- `src/git/index.ts` — the `./git` entry point. Gains `commitOps`, `isLeaseRejection`,
  `branchOps`; its header docblock (lines 1–36) is refreshed to mention them and to stop implying
  every production `TokenProvider` helper is reachable only through the adapter's deep paths.
- `src/providers/index.ts` — read-only (already `export *`s the GitHub barrel and
  `forgeCredentials.js`; the TS2308 collision rule in Notes is about this file).

**Modules being re-exported (read-only except the docblock edits named):**
- `src/providers/github/githubTokenProvider.ts` — `createGitHubTokenProvider`, type
  `GitHubTokenProviderInput` (also re-exports `createLiteralTokenProvider` from the core — leave as is).
- `src/providers/github/githubIdentity.ts` — `resolveBootstrapGitIdentity`, type
  `BootstrapIdentityDeps` (`readLocalRepoInfo`, `parseGitHubRemoteUrl`, `ADW_BOT_FALLBACK_IDENTITY`
  stay deep-import only — dropped from the ADW plan).
- `src/providers/github/tokenResolver.ts` — `resolveContextToken`, type `ResolveContextTokenInput`.
- `src/providers/github/ghAuthToken.ts` — `ghAuthToken()`; spawns `gh auth token` when called
  (never call it in a hermetic scenario — assert its type only).
- `src/providers/github/appAuth.ts` — `isGitHubAppConfigured`, `getInstallationToken`
  (`getInstallationToken({}, o, r)` throws a *named* "not configured" error before any I/O —
  the observable behaviour a hermetic scenario can assert).
- `src/providers/github/ghRepoApi.ts` — `createGhRepoApi`, type `GhRepoApi`; docblock lines 5–8
  ("Deep-import only: never added to `./index.ts`") must be rewritten.
- `src/providers/github/ghIssueApi.ts`, `ghPrApi.ts`, `ghCommandRunner.ts` — read-only; they
  remain deep-import only (their docblocks stay true).
- `src/git/commitOps.ts` — `commitOps` namespace + `isLeaseRejection`; header comment
  "Package-private …" (line 2) must be rewritten.
- `src/git/branchOps.ts` — `branchOps` namespace; header comment (lines 1–5) likewise.
- `src/git/gitContext.ts` — read-only; already imports `branchOps`/`commitOps` (lines 54–55), which
  is why the git barrel's reachable set does not change.
- `src/providers/forgeCredentials.ts` — docblock lines 8–16 ("The published barrels never carry
  the GitHub-named helpers …") must be rewritten; no code change.

**Tests and scripts:**
- `src/__tests__/importGraph.test.ts` — the layering proof the issue names. Read-only: the
  `"./git"` walk already reaches `commitOps.ts`/`branchOps.ts` via `gitContext.ts` and still
  reaches nothing under `src/providers/`; the positive control already proves the providers barrel
  reaches `src/providers/github/`. Run it; do not edit it.
- `src/__tests__/packageExports.test.ts` — read-only; pins exactly the four `exports` keys, which
  this feature does not change.
- `scripts/smokePackage.ts` — the packed-tarball consumer check (`importCheck`, lines 75–85);
  becomes the table-driven dynamic-import key check.

**BDD scenario suite (`bun run test:e2e`):**
- `features/per-issue/feature-9.feature` — the precedent for `@packaging` scenarios and the
  hermetic-scenario style (read-only).
- `features/step_definitions/packagedConsumer.steps.ts`, `features/support/packagedConsumer.ts` —
  `installedConsumer()`, `runInConsumer()`, `typeCheckInConsumer()`; reuse them for the new
  packaging steps. The existing `When the consumer runs a module importing {string} from {string}
  and {string} from {string}` step is shaped for exactly two names — add a new multi-name step
  rather than bending it.
- `features/step_definitions/forgeCredentials.steps.ts`, `features/support/world.ts` — the
  dynamic-`import()` loading pattern and the shared World (managed `process.env` keys, structural
  stand-in types); extend the World only if a new scenario needs state it lacks.
- `features/regression/vocabulary.md` — reuse `the subprocess exits {int}` and `the library
  tarball is installed into a clean consumer project`; novel phrases are allowed (no
  `## Vocabulary Registry` is configured) but must assert observable outputs, never source files.
- `cucumber.js`, `.adw/scenarios.md`, `.adw/commands.md` — runner wiring (read-only).

**CI and release (read-only unless stated):**
- `.github/workflows/ci.yml` — `check` runs the hermetic scenarios, `package` runs
  `smoke:package` + `@packaging`; `release-dry-run` prints the computed version on the PR (expect
  `1.2.0`). No change.
- `.github/workflows/release.yml` — OIDC trusted publishing (`id-token: write`, `NPM_TOKEN`
  fallback, `npm install -g npm@latest`). No change in this plan; the fix is on npmjs.com (see
  Step 9).
- `release.config.js`, `scripts/releaseDryRun.ts` — agent-prefix-aware parser: `build-agent:
  feat: …` → minor. No change.

**Documentation (conditional-docs owners of the touched files):**
- `README.md` — top-level usage summary: "What it does" bullets for the git core and the GitHub
  adapter, the three-entry-point install snippet, the Project Structure tree, and the Releasing
  section (trusted-publisher requirement + `NPM_TOKEN` fallback).
- `app_docs/github-provider.md` — owner of `src/providers/github/**`: the "Bound leaf APIs" bullet
  (line 11, "deep-import-only — never re-exported from `index.ts`") and the identity/token
  bullet (line 15) need a "public surface" contract.
- `app_docs/git-worktree-core.md` — owner of `src/git/**`: the `index.ts` export bullet and the
  Contracts section (mention `commitOps`/`branchOps`/`isLeaseRejection`; the "imports nothing from
  `src/providers/`" invariant is unchanged).
- `app_docs/forge-providers.md` — owner of `src/providers/index.ts`/`forgeCredentials.ts`: the
  invariant at line 23 ("The public barrel never exports forge-named runtime helpers …") is now
  false and must be rewritten.
- `app_docs/feature-wdjsgu-package-build-export-package-build.md` — owner of
  `scripts/smokePackage.ts` and `src/__tests__/*`: the `./providers`/`./git` entry-point bullets
  and the smoke-script description.
- `app_docs/bdd-scenarios.md` — owner of `features/**`: the new per-issue file and step module.
- `app_docs/ci-and-adw-config.md`, `app_docs/feature-9xqejz-release-automation.md` — owners of
  `release.yml`/release config: add the trusted-publisher requirements and the orphan-tag recovery
  procedure to their Gotchas.
- `.adw/project.md` — `## Relevant Files` bullets for `src/git/` and `src/providers/github/`
  should mention the widened barrels; the overview sentence "Release automation (`npm publish`) is
  still tracked as a separate open issue" is stale and may be corrected in passing.
- `UBIQUITOUS_LANGUAGE.md` — optional: a `GhRepoApi` ("bound repo API view") row; no other new
  domain term is introduced.

### New Files
- `features/per-issue/feature-11.feature` — the `@adw-11` scenarios (written by the scenario
  writer in the ADW flow; the build agent creates it only if it is absent when implementation
  starts). Contents described under Testing Strategy → BDD Scenarios.
- `features/step_definitions/publicSurface.steps.ts` (name is a suggestion; the step-definition
  generator may choose another) — steps for the hermetic scenarios (dynamic `import()` of
  `../../src/providers/index.js` / `../../src/git/index.js`) and the multi-name packaging steps
  (dynamic-import key report; type-check module using every name).

## Implementation Plan

### Phase 1: Foundation
Confirm the green baseline (numbers below), then make the source tell the truth *before* it is
re-exported: rewrite the header comments of `commitOps.ts` and `branchOps.ts` (no longer
"package-private"), the `ghRepoApi.ts` docblock (exported from the barrel since #11; still not a
construction site — a bound view selects no identity; `ghIssueApi`/`ghPrApi`/`createGhCommandRunner`
stay deep-import only), the `forgeCredentials.ts` docblock (the barrels now carry the GitHub-named
helpers for the ADW switchover; the factory remains the forge-neutral route and composes exactly
those functions), and the `src/git/index.ts` header. No behaviour changes anywhere.

### Phase 2: Core Implementation
Add the re-exports to `src/providers/github/index.ts` and `src/git/index.ts`. Typecheck proves
no `export *` collision on `src/providers/index.ts`; the untouched import-graph test proves
`./git` still reaches nothing under `src/providers/`; the untouched manifest test proves the
`exports` map is unchanged. Build and inspect the emitted `dist/providers/github/index.d.ts` and
`dist/git/index.d.ts` to confirm the type side.

### Phase 3: Integration
Make the packed-tarball proof exhaustive and table-driven (`scripts/smokePackage.ts`), add the
`@adw-11` scenarios and their steps (hermetic through the public entry points; `@packaging`
against the real tarball, including a `.d.ts` type-check that uses `GhRepoApi`), update the
documentation set, commit as `feat:`, and clear the npm publish blocker so the PR's merge actually
ships v1.2.0.

## Step by Step Tasks
Execute every step in order, top to bottom.

### 1. Confirm the green baseline
- `bun install`.
- `bun run typecheck` → clean. `bun run lint:git-guard` → two PASS lines, sanctioned sites still
  exactly one (`src/providers/forgeProviders.ts`).
- `bun run test:unit` → **45 files / 961 tests** green (verified 2026-09-11). This count must be
  unchanged at the end — this plan adds no unit-test files.
- `bun run test:e2e --tags "not @packaging"` → **13 scenarios passed** (`@adw-9`). If a
  `features/per-issue/feature-11.feature` already exists, also run
  `bun run test:e2e --tags "@adw-11 and not @packaging"` and record which scenarios are RED —
  they should be exactly the ones that need a name not yet on a barrel.
- Note the pre-existing uncommitted `README.md` edit in the worktree (Setup section: removes the
  nonexistent `.env.sample` step and explains that configuration is injected). Keep it; commit it
  with this feature's docs changes; never revert it.

### 2. Rewrite the docblocks that pin the old "deep-import only" decision
- `src/git/commitOps.ts` line 2: replace "Package-private commit/push operation orchestration for
  GitContext." with a docblock stating the namespace is exported from the `./git` entry point since
  issue #11 (ADW's regression steps drive it with their own runner) alongside `isLeaseRejection`,
  and that every function still takes an injected `(command, cwd) => string` runner — nothing here
  spawns a process.
- `src/git/branchOps.ts` lines 1–5: same treatment ("Package-private" → exported since #11; runner
  injected; `PROTECTED_BRANCHES` guard unchanged).
- `src/providers/github/ghRepoApi.ts` lines 1–9: replace "Deep-import only: never added to
  `./index.ts` …" with: exported from `./index.ts` since issue #11 because ADW's `feature-797`
  step definitions consume it from the published package; `ghIssueApi`, `ghPrApi` and
  `createGhCommandRunner` remain deep-import only; still not a construction site for the guard's
  `unsanctioned-construction` rule — a bound view over an existing `GitContext` selects no identity.
- `src/providers/forgeCredentials.ts` lines 8–16: replace "The published barrels never carry the
  GitHub-named helpers …" with: since issue #11 the GitHub barrel re-exports those helpers
  (`createGitHubTokenProvider`, `resolveContextToken`, `getInstallationToken`,
  `isGitHubAppConfigured`, `resolveBootstrapGitIdentity`, `ghAuthToken`) so ADW's launch boundary
  can switch over with no behaviour change; this factory remains the forge-neutral, recommended
  route and composes exactly those functions; it still re-exports only the `GitHubAppConfig`/
  `AppAuthDeps` types (the GitHub barrel must not re-export them too — see Notes).
- `src/git/index.ts` header docblock: add a paragraph that `commitOps`, `isLeaseRejection` and
  `branchOps` are exported alongside `claimOps` since issue #11 (they are git-core: runner-injected
  orchestration with no forge vocabulary), and soften the sentence implying the adapter's
  credential helpers are reachable only by deep path (they are now on the GitHub barrel; the
  git core still never imports them). Fix the stale `adws/providers/github/` path reference to
  `src/providers/github/`.

### 3. Widen `src/git/index.ts`
- Next to `export { claimOps } from './claimOps.js';` add:
  `export { commitOps, isLeaseRejection } from './commitOps.js';` and
  `export { branchOps } from './branchOps.js';`
- Do **not** export `PROTECTED_BRANCHES` (not requested; `branchOps.deleteLocalBranch('main')`
  returning `false` is the observable contract).
- Checkpoint: `bun run typecheck && bunx vitest run src/__tests__/importGraph.test.ts` — green,
  untouched assertions.

### 4. Widen `src/providers/github/index.ts`
- Append, under a comment block that names issue #11 and points to `createForgeCredentials`
  (`src/providers/forgeCredentials.ts`) as the forge-neutral route:
  ```ts
  export { createGitHubTokenProvider } from './githubTokenProvider.js';
  export type { GitHubTokenProviderInput } from './githubTokenProvider.js';
  export { resolveBootstrapGitIdentity } from './githubIdentity.js';
  export type { BootstrapIdentityDeps } from './githubIdentity.js';
  export { resolveContextToken } from './tokenResolver.js';
  export type { ResolveContextTokenInput } from './tokenResolver.js';
  export { ghAuthToken } from './ghAuthToken.js';
  export { isGitHubAppConfigured, getInstallationToken } from './appAuth.js';
  export { createGhRepoApi } from './ghRepoApi.js';
  export type { GhRepoApi } from './ghRepoApi.js';
  ```
- Do **not** add `GitHubAppConfig`, `AppAuthDeps`, `createLiteralTokenProvider`, `readLocalRepoInfo`,
  `parseGitHubRemoteUrl`, `ADW_BOT_FALLBACK_IDENTITY`, `clearAppAuthCaches`, `ghIssueApi`, `ghPrApi`
  or `createGhCommandRunner`. The first two would collide with `forgeCredentials.ts` under
  `src/providers/index.ts`'s `export *` (TS2308); the rest are out of scope.
- `src/providers/index.ts` and `package.json` stay untouched.
- Checkpoint: `bun run typecheck` (proves no `export *` ambiguity), `bun run lint:git-guard`
  (unchanged: barrels contain no `git`/`gh` literal and no construction call), `bun run test:unit`
  (961 tests, unchanged count), `bun run build` then confirm the names appear in
  `dist/providers/github/index.d.ts` and `dist/git/index.d.ts` (the `.d.ts` acceptance criterion
  at source level — the packaged proof comes in Step 6).

### 5. Make `scripts/smokePackage.ts` a table-driven dynamic-import key check
- Replace the hand-written `importCheck` lines 75–85 with one exported-shape table, e.g.
  `const EXPECTED_EXPORTS: Readonly<Record<string, readonly string[]>>` keyed by subpath:
  - `@paysdoc/devplatform` → `['BoardStatus']`
  - `@paysdoc/devplatform/providers` → `['forgeProviders', 'createForgeCredentials',
    'createGitHubTokenProvider', 'resolveBootstrapGitIdentity', 'resolveContextToken', 'ghAuthToken',
    'isGitHubAppConfigured', 'getInstallationToken', 'createGhRepoApi']`
  - `@paysdoc/devplatform/git` → `['GitContext', 'createLiteralTokenProvider', 'commitOps',
    'branchOps', 'isLeaseRejection']`
- Generate the consumer module from the table: for each subpath `await import(subpath)`, collect
  every expected key that is missing or `undefined`, throw naming `subpath.key` for each miss, and
  print `OK`. Keep it dependency-free and runnable under both `node --input-type=module -e` and
  `bun -e` (top-level `await` is fine in both; if in doubt wrap in an async IIFE that
  `process.exit(1)`s on rejection). Types cannot be checked at runtime — that is what the
  `@packaging` type-check scenario is for.
- Keep the rest of the script (dist assertions, `npm pack --dry-run` no-`src/` check, temp
  consumer install) as is; it still must stay under the 300-line cap and Node-built-ins only.
- Checkpoint: `bun run smoke:package` → `OK: build, pack, and Node + Bun consumer smoke checks all
  passed`. Sanity-check the check is not vacuous by temporarily adding a bogus name to the table
  and watching it fail, then removing it.

### 6. Add the `@adw-11` scenarios and their step definitions
- If `features/per-issue/feature-11.feature` was generated by the scenario writer, treat it as the
  contract: implement steps for it and fix the implementation, not the scenario, when one stays
  red (report a genuine step bug rather than editing Gherkin silently). If it is absent, create it
  with the scenarios listed under Testing Strategy → BDD Scenarios, tag `@adw-11`, and tag the two
  tarball scenarios `@packaging`.
- Step definitions (new module under `features/step_definitions/`): load the barrels with dynamic
  `import('../../src/providers/index.js')` / `import('../../src/git/index.js')` inside the `When`
  step (missing export fails only that scenario, as `forgeCredentials.steps.ts` does); every
  assertion reads an *output* — never a source file. Hermetic steps never spawn `gh`
  (`ghAuthToken` is `typeof`-checked only), never touch the network
  (`getInstallationToken` is exercised only on the "not configured" refusal path, which throws
  before any I/O), and stub every git runner (`(command, cwd) => string`).
- Packaging steps: reuse `installedConsumer()` / `runInConsumer()` / `typeCheckInConsumer()` from
  `features/support/packagedConsumer.ts`. The runtime step writes a module that dynamically
  imports a subpath and prints a JSON report `{ missing: string[] }` for a comma-separated list of
  names; the type-check step writes a `.ts` module importing every runtime name plus
  `import type { GhRepoApi }` and using them in typed positions (e.g. `const api: GhRepoApi =
  createGhRepoApi(ctx)` under a `GitContext` built with `createLiteralTokenProvider`, a typed
  `resolveContextToken({...})` call, `const ops: typeof commitOps = commitOps`), then `tsc -p`
  must exit 0.
- Run `bun run test:e2e --tags "@adw-11 and not @packaging"` → all green;
  `bun run test:e2e --tags "@packaging"` → the `@adw-9` pair plus the new `@adw-11` pair green;
  `bun run test:e2e` → everything green with no undefined/pending steps (`strict: true`).
- `bun run typecheck` must stay clean — `tsconfig.json` includes `features/**/*.ts`.

### 7. Update the documentation set
- `README.md`: in "What it does", extend the git-core bullet ("Branch, commit, and remote
  operations …") to say `commitOps`, `branchOps` and `isLeaseRejection` ship from
  `@paysdoc/devplatform/git`; extend the GitHub-adapter bullet to say its credential/identity
  helpers (`createGitHubTokenProvider`, `resolveBootstrapGitIdentity`, `resolveContextToken`,
  `ghAuthToken`, `isGitHubAppConfigured`, `getInstallationToken`) and the bound `createGhRepoApi`
  view ship from `@paysdoc/devplatform/providers` for consumers switching over with no behaviour
  change, while `createForgeCredentials` remains the forge-neutral route. Update the entry-point
  snippet comments if useful, the Project Structure lines for `src/git/index.ts`,
  `src/providers/github/`, and `scripts/smokePackage.ts` (table-driven key check), and the
  Releasing section: the npm trusted publisher must be linked to `paysdoc/devplatform` +
  `release.yml`, `NPM_TOKEN` is the fallback, and v1.1.0 is tagged but was never published.
- `app_docs/github-provider.md`: rewrite the "Bound leaf APIs" bullet (only `ghIssueApi`/`ghPrApi`/
  `createGhCommandRunner` are deep-import only now; `createGhRepoApi`/`GhRepoApi` are on the barrel)
  and add a Contracts bullet "Public surface" listing the barrel's credential/identity helpers,
  noting `ghAuthToken()` spawns `gh` when called and `createForgeCredentials` is the forge-neutral
  composition of the same functions.
- `app_docs/git-worktree-core.md`: mention `commitOps`/`branchOps`/`isLeaseRejection` in the
  `index.ts` export bullet and Contracts; restate that the package still imports nothing from
  `src/providers/`.
- `app_docs/forge-providers.md`: replace the line-23 invariant with the new contract (the GitHub
  barrel re-exports the helpers since #11; `forgeCredentials.ts` still re-exports only the
  `GitHubAppConfig`/`AppAuthDeps` types, and the GitHub barrel must not duplicate them).
- `app_docs/feature-wdjsgu-package-build-export-package-build.md`: update the `./providers`/`./git`
  bullets and describe the table-driven dynamic-import key check in `scripts/smokePackage.ts`.
- `app_docs/bdd-scenarios.md`: add `feature-11.feature` and the new step module; note the
  multi-name packaging steps.
- `app_docs/ci-and-adw-config.md` and `app_docs/feature-9xqejz-release-automation.md` (Gotchas):
  the exact trusted-publisher settings (GitHub Actions; owner `paysdoc`; repository `devplatform`;
  workflow filename `release.yml`; no environment), the observed failure mode (OIDC exchange
  succeeds in `verifyConditions`, the publish `PUT` is denied), the `NPM_TOKEN` fallback, and the
  orphan-tag recovery procedure from Step 9.
- `.adw/project.md`: update the `src/git/` and `src/providers/github/` bullets; optionally fix the
  stale release-automation sentence in the overview. `.adw/conditional_docs.md` needs no new entry
  (every touched file already has an owner).
- `UBIQUITOUS_LANGUAGE.md` (optional): `GhRepoApi` — the 35-operation bound view over one
  `GitContext`; aliases to avoid: "repo client".

### 8. Commit as a `feat:` and open the PR
- Commit header must be `build-agent: feat: widen the public surface for the ADW switchover`
  (or plain `feat: …`) so `release.config.js`'s parser computes a **minor** release; docs-only
  follow-up commits may be `docs:`. Never a `chore:`-only branch.
- On the PR, the `release-dry-run` CI job must print `next release version: 1.2.0`. Locally,
  `bun run release:dry-run` shows the same (it needs `git push --dry-run` access to `origin`).
- The PR description should state the API change explicitly for the reviewer
  (`.adw/review_proof.md` asks for an intentional export change to be called out): additive
  re-exports only, no signature or shape changes, `exports` map unchanged.

### 9. Clear the npm publish blocker and verify the release (maintainer action, outside the repo)
- Evidence from run 34503029087 (`gh run view 34503029087 -R paysdoc/devplatform --log-failed`):
  `@semantic-release/npm@13.1.5` logged "Verifying OIDC context for publishing from GitHub
  Actions" → "OIDC token exchange with the npm registry succeeded" → "Created tag v1.1.0" →
  `npm publish … --userconfig /tmp/…/.npmrc --tag latest` → `npm error 403 403 Forbidden - PUT
  https://registry.npmjs.org/@paysdoc%2fdevplatform - OIDC permission denied for this action`.
  `NPM_TOKEN` was empty (no repository secret exists — `gh secret list` is empty); no GitHub
  release was created; `npm view @paysdoc/devplatform versions` is `["1.0.0"]`; the only npm
  maintainer is `paysdoc`.
- **Fix, in order** (the build agent cannot do this; it needs the npm account):
  1. On npmjs.com, package `@paysdoc/devplatform` → Settings → Trusted Publisher: GitHub Actions,
     organization/user `paysdoc`, repository `devplatform`, workflow filename `release.yml`,
     environment left blank. The successful token exchange suggests an entry already matches —
     if it does, check the package's **Publishing access** setting: it must permit trusted
     publishing (not "disallow" automation entirely), and the account that created the trusted
     publisher must hold publish rights.
  2. If OIDC still returns `OIDC permission denied`, add an `NPM_TOKEN` repository secret (npm
     granular access token, packages-and-scopes write on `@paysdoc/devplatform`, bypass-2FA
     enabled). `release.yml` already passes it and `@semantic-release/npm` prefers it over OIDC;
     provenance can be kept by also setting `NPM_CONFIG_PROVENANCE: true` on the semantic-release
     step (the job already has `id-token: write`) — an optional, separate workflow change.
- **Ordering**: fix the registry side *before* merging this PR. Then the merge's `Release` run
  computes 1.2.0 (v1.1.0 tag + this `feat`) and publishes it; 1.2.0 contains everything in
  v1.1.0, so v1.1.0 never needs to be published separately.
- **Recovery if a run fails again after tagging** (an orphan `v1.2.0`): re-running the workflow
  finds no new commits after the tag and publishes nothing, so delete the orphan tag
  (`git push origin :refs/tags/v1.2.0`, plus the GitHub release if one was created — none was for
  v1.1.0) and trigger `workflow_dispatch` on `main`; semantic-release recomputes 1.2.0. Never
  delete `v1.0.0` (the baseline guard hard-fails without it).
- **Verify**: `npm view @paysdoc/devplatform version` → `1.2.0`; `npm view @paysdoc/devplatform
  dist-tags.latest` → `1.2.0`; then from a clean directory `npm i @paysdoc/devplatform@1.2.0` and
  run the Step-5 dynamic-import key check against the *registry* package (same table) — the
  literal acceptance criterion "a version containing this change is on npm".

### 10. Run the validation commands
- Execute every command under `## Validation Commands`; each must exit zero. Report the unit-test
  count (unchanged: 45 files / 961 tests), the scenario counts, and the `release-dry-run` version.

## Testing Strategy

### BDD Scenarios (`features/per-issue/feature-11.feature`, tag `@adw-11`)

Hermetic (no build; run in the `check` CI job):
- **GitHub token provider is reachable from the providers entry point** — `createGitHubTokenProvider`
  built with `pat: 'ghp_from_pat'`, `isAppConfigured: () => false`, `ghAuthToken: () => ''`;
  `credentialEnv({ owner, repo, purpose: 'default' })` sets `GH_TOKEN` to `ghp_from_pat`.
- **Token resolution is reachable and refuses by repository name** — `resolveContextToken` returns
  the PAT when no App is configured; with no PAT and an empty CLI seam it is refused with a
  message naming `owner/repo` (never reads ambient `GH_TOKEN` — set a sentinel via the World's
  managed keys and assert it is not returned).
- **Bootstrap identity is reachable** — `resolveBootstrapGitIdentity({ env: { GIT_AUTHOR_NAME,
  GIT_AUTHOR_EMAIL }, appConfig: null })` yields that identity; with a complete `appConfig`
  (`appId`, `appSlug`, absent key path) and an empty environment yields `<slug>[bot]` /
  `<id>+<slug>[bot]@users.noreply.github.com`.
- **GitHub App helpers are reachable** — `isGitHubAppConfigured({})` is false and
  `isGitHubAppConfigured({ appId, appSlug, privateKeyPath })` is true; `getInstallationToken({},
  'acme', 'webapp')` is refused with a message naming "not configured" (no network, no file read).
- **`ghAuthToken` is reachable** — it is a function (not invoked: it spawns `gh`).
- **The bound repo API is reachable** — `createGhRepoApi` over a `GitContext` built with
  `createLiteralTokenProvider('fixed-token')` and a spy `exec`; calling `defaultBranch()` records a
  `gh repo view acme/webapp …` command and returns the spy's stdout.
- **Commit and branch operations are reachable from the git entry point** — with a stub runner:
  `commitOps.hasUncommittedChanges` reports true for `' M file'` output and false for empty;
  `commitOps.commitChanges` returns false and records no `git add`/`git commit` when status is
  clean; `branchOps.getCurrentBranch` returns the runner's output;
  `branchOps.deleteLocalBranch(run, 'main', cwd)` returns false without running `git branch -D`.
- **Lease rejections are recognised** — `isLeaseRejection({ stderr: '… stale info …' })` and
  `({ message: 'remote ref updated since checkout' })` are true; `({ stderr: 'boom' })` is false.

`@packaging` (real tarball; run in the `package` CI job):
- **A packaged consumer resolves every widened name at runtime** — Given the tarball is installed
  into a clean consumer; When the consumer runs a module that dynamically imports
  `@paysdoc/devplatform/providers` and `@paysdoc/devplatform/git` and reports missing names for the
  Step-5 lists; Then the subprocess exits 0 and reports no missing names.
- **The emitted type declarations expose every widened name to a TypeScript consumer** — When the
  consumer type-checks a module importing every runtime name plus `type GhRepoApi` and using them
  in typed positions; Then the subprocess exits 0.

Step vocabulary: reuse `Given the library tarball is installed into a clean consumer project` and
`Then the subprocess exits {int}`; new phrases are fine (no registry configured) but must assert
outputs, never inspect `src/` (`features/regression/vocabulary.md` rot rules).

### Edge Cases
- **`export *` name collision on `src/providers/index.ts`**: `GitHubAppConfig`/`AppAuthDeps` are
  already re-exported by `forgeCredentials.ts`; re-exporting them from the GitHub barrel too would
  fail `bun run typecheck` with TS2308. Only the names in Step 4 go on the GitHub barrel.
- **No new modules in either entry-point graph**: all target modules are already reached
  (providers via `forgeCredentials.ts`/`githubCodeHost.ts`; git via `gitContext.ts`), so the
  import-graph walker's reachable sets are identical before and after — the `./git` layering
  assertion cannot regress and needs no edit.
- **`ghAuthToken()` spawns `gh`** when called; scenarios and smoke checks assert its type only.
- **`getInstallationToken` with an unconfigured `GitHubAppConfig`** throws a named error before any
  file or network I/O — the only safe path to exercise hermetically.
- **`isLeaseRejection(null)`** throws a `TypeError` (pre-existing: it property-reads the argument);
  scenarios pass object-shaped errors. No behaviour change is in scope.
- **`.d.ts` for `commitOps`/`branchOps`** carries a non-exported local `type Runner` alias; tsc
  emits it in the declaration file, so a typed consumer sees `(run: Runner, …)` — verified on the
  current build. `GhRepoApi` is an intersection over `GhIssueApi`/`GhPrApi`, which the `.d.ts`
  references via type-only imports of their own emitted declarations.
- **Bun vs Node consumer**: the smoke module must run under both `node --input-type=module -e` and
  `bun -e`; top-level `await` works in both, but an async IIFE with explicit `process.exit(1)` on
  rejection is the safest shape.
- **`sideEffects: false`** stays valid: none of the re-exported modules performs work at import
  time (`appAuth.ts` allocates two empty `Map`s; `ghAuthToken.ts` only imports `child_process`).
- **Scope discipline**: `readLocalRepoInfo`, `parseGitHubIssue`, `selectPreferredPR`,
  `convertToSshUrl`, `GitLabApiClient` (dropped by ADW #844), `ghIssueApi`/`ghPrApi`/
  `createGhCommandRunner`, `PROTECTED_BRANCHES`, and the GitLab-internal `createGitLabTokenProvider`/
  `resolveGitLabBootstrapGitIdentity` stay off every barrel.
- **Release ordering**: merging before the npm configuration is fixed leaves an orphan `v1.2.0`
  tag that a re-run will not republish; follow the Step-9 recovery.

## Acceptance Criteria
- `src/providers/github/index.ts` re-exports `createGitHubTokenProvider`, `resolveBootstrapGitIdentity`,
  `resolveContextToken`, `ghAuthToken`, `isGitHubAppConfigured`, `getInstallationToken`,
  `createGhRepoApi` and the types `GitHubTokenProviderInput`, `BootstrapIdentityDeps`,
  `ResolveContextTokenInput`, `GhRepoApi`; `src/git/index.ts` re-exports `commitOps`,
  `isLeaseRejection`, `branchOps`. `src/providers/index.ts`, `package.json` (`exports`/`files`) and
  every re-exported module's signature are unchanged (additive API change, called out in the PR).
- `bun run build` emits the names through `dist/providers/github/index.d.ts` (hence
  `dist/providers/index.d.ts`) and `dist/git/index.d.ts`; a dynamic import of
  `./dist/providers/index.js` and `./dist/git/index.js` exposes every key in the Step-5 table.
- `bun run smoke:package` performs the table-driven dynamic-import key check for every name under
  both Node and Bun against the packed tarball and passes; a deliberately bogus name makes it fail.
- All `@adw-11` scenarios pass (`bun run test:e2e --tags "@adw-11"`), including the two
  `@packaging` scenarios proving runtime resolution and `.d.ts` coverage (with `GhRepoApi`) of the
  real tarball; the 13 `@adw-9` scenarios still pass.
- `src/__tests__/importGraph.test.ts` is unmodified and green: `src/git/index.ts` reaches no module
  under `src/providers/`.
- `bun run typecheck`, `bun run lint:git-guard`, `bun run test:unit` (45 files / 961 tests, count
  unchanged), `npm pack --dry-run` (only `dist/`, `README.md`, `LICENSE`) all pass.
- Docblocks in `ghRepoApi.ts`, `forgeCredentials.ts`, `commitOps.ts`, `branchOps.ts`,
  `src/git/index.ts` and the docs listed in Step 7 no longer claim the names are deep-import only,
  and `createForgeCredentials` is documented as the preferred forge-neutral route.
- The branch lands with a `feat:` (agent-prefixed allowed) commit; the PR's `release-dry-run` job
  prints `1.2.0`.
- After the maintainer clears the trusted-publisher blocker and the PR merges,
  `npm view @paysdoc/devplatform version` reports `1.2.0` and the registry package passes the same
  dynamic-import key check (so `createForgeCredentials`, `createLiteralTokenProvider` on `./git`
  and type `GitHubAppConfig` are published too).

## Validation Commands
Execute every command to validate the feature works correctly with zero regressions.

- `bun install` — no new dependency is needed.
- `bun run typecheck` — `tsc --noEmit` over `src/**`, `scripts/**`, `features/**`; zero errors
  (this is also the `export *` collision proof for `src/providers/index.ts`).
- `bun run lint:git-guard` — both rules PASS; sanctioned construction sites still exactly one.
- `bun run test:unit` — 45 files / 961 tests green, count unchanged.
- `bunx vitest run src/__tests__/importGraph.test.ts src/__tests__/packageExports.test.ts` — the
  untouched layering and manifest proofs in isolation.
- `bun run test:e2e --tags "@adw-11 and not @packaging"` — every hermetic #11 scenario passes.
- `bun run test:e2e --tags "not @packaging"` — the 13 `@adw-9` scenarios plus the new ones pass.
- `bun run build && for f in dist/git/index.d.ts dist/providers/github/index.d.ts; do echo "== $f"; grep -nE "commitOps|isLeaseRejection|branchOps|createGitHubTokenProvider|resolveBootstrapGitIdentity|resolveContextToken|ghAuthToken|isGitHubAppConfigured|getInstallationToken|createGhRepoApi|GhRepoApi" "$f"; done && test ! -d dist/features && echo "d.ts OK"` —
  the emitted declarations carry every name through the barrels; `features/` never reaches `dist/`.
- `node --input-type=module -e "const p = await import('./dist/providers/index.js'); const g = await import('./dist/git/index.js'); const want = { providers: ['createForgeCredentials','forgeProviders','createGitHubTokenProvider','resolveBootstrapGitIdentity','resolveContextToken','ghAuthToken','isGitHubAppConfigured','getInstallationToken','createGhRepoApi'], git: ['GitContext','createLiteralTokenProvider','commitOps','branchOps','isLeaseRejection'] }; const missing = [...want.providers.filter(k => p[k] === undefined).map(k => 'providers.' + k), ...want.git.filter(k => g[k] === undefined).map(k => 'git.' + k)]; if (missing.length) { console.error('MISSING', missing); process.exit(1); } console.log('dynamic-import key check OK');"` —
  the acceptance criterion's dynamic-import key check against the built output.
- `grep -nE "^export" src/index.ts src/providers/index.ts src/providers/github/index.ts src/providers/gitlab/index.ts src/git/index.ts | grep -E "ghIssueApi|ghPrApi|createGhCommandRunner|readLocalRepoInfo|parseGitHubRemoteUrl|createGitLabTokenProvider|resolveGitLabBootstrapGitIdentity|PROTECTED_BRANCHES"; test $? -eq 1 && echo "scope OK: nothing beyond the issue's list is on a barrel"` —
  scope discipline.
- `git diff origin/main --stat -- package.json src/providers/index.ts; git diff origin/main --quiet -- package.json src/providers/index.ts && echo "manifest and providers barrel unchanged"` —
  the `exports` map and the top-level providers barrel are untouched.
- `npm pack --dry-run` — the tarball still lists only `dist/`, `README.md`, `LICENSE`.
- `bun run smoke:package` — builds, packs, installs into a fresh consumer, runs the table-driven
  dynamic-import key check under Node and Bun.
- `bun run test:e2e --tags "@packaging"` — the `@adw-9` and `@adw-11` packaging scenarios pass
  (runtime key report + `.d.ts` type-check). Needs `node` and `npm`; slowest step.
- `bun run test:e2e` — the whole suite passes with no undefined or pending steps.
- `bun run release:dry-run` — prints `next release version: 1.2.0` (needs push access to
  `origin`; the PR's `release-dry-run` job is the authoritative run).
- After merge and the maintainer's npm fix (Step 9): `npm view @paysdoc/devplatform version`
  prints `1.2.0`.

## Notes
- No `.adw/coding_guidelines.md` (nor `guidelines/coding_guidelines.md`) exists. Match the
  surrounding style: a *why*-docblock on every touched module, explicit `.js` extensions on every
  relative specifier (`moduleResolution: NodeNext` enforces it), `export type` for type-only
  re-exports (`isolatedModules`), files under the 300-line cap, no decorators, no new abstractions.
- **No unit-test tasks are planned**: `.adw/project.md` has no `## Unit Tests` section, so per the
  planning rules this plan creates no unit-test files and omits the Unit Tests subsection. The
  existing suite (`bun run test:unit`, the project's configured "Run Tests" command) runs unchanged
  as the regression gate, and the issue's own proof — the `npm pack` + dynamic-import key check
  with `.d.ts` types — lives in `scripts/smokePackage.ts` and the `@adw-11` BDD scenarios, the
  repo's established acceptance layer (`.adw/scenarios.md`).
- **Why direct re-exports and not only `createForgeCredentials`**: the issue asks for the direct
  names (ADW PRD story 29 requires no behaviour change at the switchover, and ADW's `dev` already
  composes them by hand). `createForgeCredentials` composes exactly these functions, so exporting
  them leaks no new behaviour — only names. The docs now state the layering explicitly: the
  factory is the forge-neutral route; the helpers are the GitHub-specific building blocks. A
  future ADW refactor onto the factory needs no library change.
- **Companion types** (`GitHubTokenProviderInput`, `ResolveContextTokenInput`, `BootstrapIdentityDeps`)
  go alongside their functions, following the GitHub barrel's factory-plus-deps-type convention and
  the issue's own `createGhRepoApi` + `type GhRepoApi` pairing; a typed consumer can then annotate
  the input objects it builds. They are types only — no runtime addition beyond the issue's list.
- **The `export *` collision rule**: `src/providers/index.ts` re-exports both the GitHub barrel and
  `forgeCredentials.ts` with `export *`; any name exported by both is a TS2308 error. That is why
  `GitHubAppConfig`/`AppAuthDeps` stay only on `forgeCredentials.ts` (the issue notes
  `GitHubAppConfig` "is already re-exported via `forgeCredentials`"). `bun run typecheck` is the
  enforcement.
- **The git/gh guard needs no change**: barrels contain no `git`/`gh` literal and call nothing in
  `PROVIDER_CONSTRUCTORS`/`CONTEXT_CONSTRUCTORS`; `createGhRepoApi` is deliberately absent from
  those sets (a bound view selects no identity); `features/` is pruned from the walk. Never add a
  file to `SANCTIONED_CONSTRUCTION_SITES`.
- **The import-graph test stays untouched by design**: the issue's second criterion is that the
  *existing* proof still holds. Since the reachable sets are unchanged, editing the test would add
  nothing; running it is the proof.
- **The publish blocker is outside this repository.** Facts verified 2026-09-11: npm has only
  `1.0.0` (published 2026-09-10 13:28 UTC, maintainer `paysdoc`); tags `v1.0.0` and `v1.1.0` exist on
  `origin`; no GitHub release exists; no repository secret exists; run 34503029087's OIDC token
  exchange succeeded in `verifyConditions` and the `PUT` was denied with "OIDC permission denied
  for this action". The build agent must not attempt to publish, create tokens, or delete tags;
  Step 9 is a documented maintainer procedure whose completion is verified with `npm view`.
- **Pre-existing uncommitted change**: the worktree already carries an edit to `README.md`
  (Setup section) from an earlier step of this ADW run; it is correct (there is no `.env.sample`)
  and belongs on this branch — commit it with the docs changes, do not revert it.
- Out of scope: any change to `resolveContextToken`, `appAuth.ts`, `commitOps.ts`/`branchOps.ts`
  behaviour; a new `package.json` subpath; re-exporting the GitLab-internal helpers; changing
  `release.yml` (the optional `NPM_CONFIG_PROVENANCE` note in Step 9 is a separate, maintainer-led
  workflow tweak); publishing `1.1.0` retroactively (1.2.0 supersedes it).
