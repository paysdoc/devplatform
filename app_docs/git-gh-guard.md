# Git/GH CI Guard

## Overview

An AST-based CI check, ported from `AI_Dev_Workflow`'s `adws/checkGitGhGuard.ts` +
`adws/guard/`, that stops the library's spawn chokepoint from eroding as agents modify it. It
runs via `bun run lint:git-guard` (`scripts/checkGitGhGuard.ts`) and fails CI (exit 1) on
either of two independent violations.

## Responsibilities

- **`git-gh-shellout` rule** — walks every scannable `.ts`/`.tsx` file (via the TypeScript
  compiler API, so string literals inside comments are never false positives) and flags any
  call expression whose first argument is a string/template literal matching
  `/^(git|gh)(\s|$)/`. Exempt from this rule only: `src/git` (the git core — the only package
  that may run git commands) and `src/providers/github` (the GitHub forge adapter — the only
  package whose `gh` command strings may feed the core's executor). `isExemptPackage` matches
  a directory itself or any path beneath it.
- **`unsanctioned-construction` rule** — flags a bare-identifier call to one of the seven
  adapter factories (`createGitHubIssueTracker`, `createGitHubCodeHost`,
  `createGitHubBoardManager`, `createGitLabCodeHost`, `createGitLabBoardManager`,
  `createJiraIssueTracker`, `createJiraBoardManager`), a bare call to `forgeProviders`, or a
  `new GitContext(…)` expression, anywhere outside a file-scoped allowlist. The allowlist
  (`SANCTIONED_CONSTRUCTION_SITES`, `scripts/guard/constructionRule.ts`) has exactly one
  permanent entry: `src/providers/forgeProviders.ts`. Nothing may ever be added to it — a new
  construction site must call `forgeProviders(...)` instead.
- Unlike the shell-out rule, the construction rule is **not** exempted for `src/git/` or
  `src/providers/github/` — it walks the whole tree. In this library those two packages are
  almost the entire repo, so exempting them (as ADW did, via its single pruning walk) would
  leave the rule guarding almost nothing. Neither package calls the adapter factories or
  `new GitContext` outside its own tests (verified 2026-09-10).
- `main()` prints the exempt-package list and the sanctioned-site list on every run, then
  either two PASS lines (exit 0) or one `file:line [rule] command` line per violation plus a
  remedy line per rule (exit 1).

## Contracts & Invariants

- The flagged construction callee set (`PROVIDER_CONSTRUCTORS`/`CONTEXT_CONSTRUCTORS` in
  `scripts/guard/constructionRule.ts`) is an explicit name set, never a `create*` pattern —
  `createGhCommandRunner`, `createGitHubTokenProvider`, and `createIssueCmd`-style command
  builders must never match.
- Only a bare-identifier call/`new` expression is flagged. A property-access callee
  (`deps.forgeProviders(...)`, `d.forgeProviders(...)`) is an injected seam and is deliberately
  unflagged. A function *declaration* (`export function createGitHubCodeHost(...) {...}`) is
  never flagged, only a call.
- `isSanctionedConstructionSite` does exact path matching only — a directory prefix (e.g.
  `src/providers`) is never sanctioned.
- Every console string the guard prints is indented (starts with at least one space, or a
  leading `\n`) so the guard's own remedy/report text never starts with `git `/`gh ` at
  position 0 and self-flags under the shell-out rule.
- `scripts/checkGitGhGuard.ts` and `scripts/guard/*.ts` are themselves inside the whole-tree
  walk (neither directory is in `EXEMPT_DIR_NAMES` or `EXEMPT_PACKAGES`) — the guard scans
  itself on every run.

## Configuration

- `bun run lint:git-guard` — `bunx tsx scripts/checkGitGhGuard.ts`.
- Wired into `.github/workflows/ci.yml`'s `check` job, after `bun run typecheck` and before
  `bun run test:unit`.
- Dev-only: `scripts/` is outside `tsconfig.build.json`'s `include` and outside
  `package.json`'s `files`, so the guard is never compiled into `dist/` or shipped in the npm
  tarball, even though `tsconfig.json`'s `include` and `vitest.config.ts`'s `test.include` were
  widened to typecheck and test it (see
  `app_docs/feature-wdjsgu-package-build-export-package-build.md`).

## Gotchas

- **Two of ADW's four rules are deliberately not ported.** `cwd-derived-identity` guards a
  *consumer* composing cwd-derived repo identity into a context/provider factory; nothing
  inside this library calls `forgeProviders` outside tests, so there is no consumer here to
  guard. `extraction-readiness` asserted that ADW's extractable packages imported nothing from
  the rest of the ADW framework; here the extractable packages are the whole repo, so the rule
  would have nothing to guard.
- **ADW's sunset/stale-entry ratchet is also not ported.** ADW's allowlist carried transitional
  `owner`-tagged entries plus `hasGuardedConstruction`/`findStaleSanctionedEntries` to make
  them self-cleaning. This port's allowlist has exactly one permanent entry, so the ratchet
  would be unreachable code guarding an empty set.
- A new legitimate adapter or context factory must be added to `PROVIDER_CONSTRUCTORS`/
  `CONTEXT_CONSTRUCTORS` by name (`scripts/guard/constructionRule.ts`) — the rule will not
  infer it from a `create*` naming pattern.
