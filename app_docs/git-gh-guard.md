# Git/GH CI Guard

## Overview

An AST-based CI check, ported from `AI_Dev_Workflow`'s `adws/checkGitGhGuard.ts` +
`adws/guard/`, that stops the library's spawn chokepoint from eroding as agents modify it. It
runs via `bun run lint:git-guard` (`scripts/checkGitGhGuard.ts`) and fails CI (exit 1) on
any of three independent violations.

## Responsibilities

- **`git-gh-shellout` rule** — walks every scannable `.ts`/`.tsx` file (via the TypeScript
  compiler API, so string literals inside comments are never false positives) and flags any
  call expression whose first argument is a string/template literal matching
  `/^(git|gh)(\s|$)/`, or an array literal whose element 0 is exactly `git` or `gh` (an argv
  array, reported as the command line it spells). Exempt from this rule only: `src/git` (the
  git core — the only package that may run git commands) and `src/providers/github` (the
  GitHub forge adapter — the only package whose `gh` argv arrays may feed the core's
  executor). `isExemptPackage` matches a directory itself or any path beneath it.
- **`shell-command-string` rule** (`scripts/guard/shellCommandStringRule.ts`) — the converse
  scope: applied **only inside** those two exempt packages, where a command must be an argv
  array (element 0 the program, each later element one argument), never one string a shell
  would parse. It flags any string or template literal, wherever it appears — a call argument,
  a builder's return value, an array element — whose text matches `/^(git|gh)\s/`. Outside the
  exempt packages `git-gh-shellout` already reports that shape at a call's first argument, so
  each file gets exactly one of `git-gh-shellout` and `shell-command-string`.
- **`unsanctioned-construction` rule** — flags a bare-identifier call to one of the seven
  adapter factories (`createGitHubIssueTracker`, `createGitHubCodeHost`,
  `createGitHubBoardManager`, `createGitLabCodeHost`, `createGitLabBoardManager`,
  `createJiraIssueTracker`, `createJiraBoardManager`), a bare call to `forgeProviders`, or a
  `new GitContext(…)` expression, anywhere outside a file-scoped allowlist. The allowlist
  (`SANCTIONED_CONSTRUCTION_SITES`, `scripts/guard/constructionRule.ts`) has exactly one
  permanent entry: `src/providers/forgeProviders.ts`. Nothing may ever be added to it — a new
  construction site must call `forgeProviders(...)` instead.
- Unlike the `git-gh-shellout` rule, the construction rule is **not** exempted for `src/git/` or
  `src/providers/github/` — it walks the whole tree. In this library those two packages are
  almost the entire repo, so exempting them (as ADW did, via its single pruning walk) would
  leave the rule guarding almost nothing. Neither package calls the adapter factories or
  `new GitContext` outside its own tests (verified 2026-09-10).
- `main()` prints the exempt-package list and the sanctioned-site list on every run, then
  either three PASS lines (exit 0) — no shell-outs outside the exempt packages, git/gh
  commands inside them are argv arrays, construction confined — or one
  `file:line [rule] command` line per violation plus a remedy line per rule (exit 1).

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
- The `shell-command-string` pattern needs whitespace after the program, so the bare program
  name (`'git'`, `'gh'`, an argv's element 0) never matches, and only a literal that *opens*
  with the program is judged: `'github.com/acme/widget'`, `'ghost town'`, `'gitignore rules'`
  and `'run git status first'` all pass. A template literal is judged by its head text and
  reported as that head plus `${...}`.
- `git-gh-shellout` recognises an argv array only as a call's first argument, and only when
  element 0 is a string literal (or substitution-free template literal) exactly `git` or
  `gh` — `['curl', …]` and `[]` are not flagged. Each non-literal element renders as `${...}`
  in the report (e.g. `git commit -m ${...}`).
- Every console string the guard prints is indented (starts with at least one space, or a
  leading `\n`) so the guard's own remedy/report text never starts with `git `/`gh ` at
  position 0 and self-flags under the `git-gh-shellout` rule.
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
- A log or error message inside `src/git` or `src/providers/github` that **starts** with
  `git ` or `gh ` is flagged: `shell-command-string` cannot tell a message from a command
  line and is deliberately conservative, so `'git fetch failed'` fails exactly as
  `'git fetch origin'` would. Reword the message (`'Could not run git fetch'`) — there is no
  exemption to add.
