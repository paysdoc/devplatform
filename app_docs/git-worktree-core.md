# Git/Worktree Core (`src/git/`)

## Overview

`src/git/` is a standalone, forge-neutral package providing the `GitContext` deep module — the single authority for "which repo's filesystem" and the sole spawn site for git/gh child processes. It exists so every git and worktree operation in the codebase (branch, commit, worktree lifecycle, remote, and read operations) runs through one credentialed, working-directory-aware executor, with no forge vocabulary (GitHub, GitLab, etc.) anywhere in the package. Forge adapters (e.g. `adws/providers/github/`, `src/providers/`) build on top of this package by implementing its `TokenProvider` port; the package itself never imports from `src/providers/`.

## Responsibilities

- Resolve a repository's base filesystem path from an injected identity (`owner`, `repo`, `selfHost`, `frameworkRepoRoot`, `targetReposDir`) — self-host contexts resolve to `frameworkRepoRoot`, target contexts to `targetReposDir/owner/repo`.
- Provide `GitContext.exec()`, the package's single forge-neutral executor: resolves a working-directory **class** (`workspace` or `frameworkRoot`, never a bare path or `process.cwd()`), merges a per-command credential/identity environment overlay, spawns via an injectable `ExecFn`, and rewraps a spawn ENOENT caused by a missing working directory into an actionable, repo-identified error (`workingDirectoryGuard.ts`).
- Assemble the child-process credential environment by asking the injected `TokenProvider` port (`types.ts`) on every command — never caching a token — and merging it with the configured `GitIdentity` (`GIT_AUTHOR_*`/`GIT_COMMITTER_*`).
- Orchestrate branch operations (`branchOps.ts`): current branch, merge/reset against a default branch, local/remote branch deletion (guarded against `main`/`master`/`develop`), and local branch listing.
- Orchestrate commit/push operations (`commitOps.ts`): status-gated commit (with gitignore-aware path exclusion), scoped add/remove-and-commit for specific paths, `--force-with-lease` push with lease-rejection detection and a descriptive remedy error, HEAD tree hash, and dirty-tree checks.
- Manage the full worktree lifecycle: create/ensure (`worktreeCreateOps.ts`), remove (`worktreeRemoveOps.ts`), list/query (`worktreeQueryOps.ts`), probe an arbitrary worktree path for git-dir/branch/registration state (`worktreeProbeOps.ts`), and hard-reset a worktree to its remote branch, aborting any in-progress merge/rebase first (`worktreeResetOps.ts`).
- Provide read-only git operations (`gitReadOps.ts`): tracked-file listing, short HEAD, diff, log, `git show`, and a bounded `git log --since` builder.
- Provide remote-interaction operations (`remoteOps.ts`): fetch, merge (with `--no-commit`/`--no-ff`/`--no-edit` flags), best-effort merge abort, and `ls-remote`.
- Provide the four upgrade-claim distributed-lock primitives (`claimOps.ts`): detached-HEAD worktree add/remove and an un-forced push whose non-fast-forward rejection implements the "exactly one winner" lock — deliberately bypassing the standard worktree/commit/push methods.
- Resolve pre-`GitContext` bootstrap identity (`bootstrapIdentity.ts`): read the origin remote URL, current branch, `GIT_AUTHOR_*`/`GIT_COMMITTER_*` env, and `git config user.*` — the only legitimate raw-git reads before a `GitContext` exists.
- Manage cloned target-repository workspaces outside any `GitContext` (`repoWorkspace.ts`): compute workspace path, detect an existing clone, clone a caller-supplied URL verbatim, and ensure-fetch an existing clone.
- Kill lingering processes holding open files under a worktree directory before removal (`processCleanup.ts`).
- Supply a default, dependency-free `Logger` (`consoleLogger.ts`) and a fixture-only `TokenProvider` (`literalTokenProvider.ts`).
- Export the entire public surface — `GitContext`, its types, all `*Ops` namespaces, bootstrap functions, and workspace helpers — through `index.ts`.

## Contracts & Invariants

- `GitContext` construction requires a **complete** identity: non-empty `owner`, `repo`, `frameworkRepoRoot`, `targetReposDir`; a boolean `selfHost`; a fully-populated `GitIdentity`; and a `tokenProvider`. Any missing/empty field throws immediately — no cwd fallback, no optional base path.
- Construction performs exactly one validate-and-discard probe of `tokenProvider.credentialEnv(...)` to fail loudly if the provider can produce no credential; that answer is thrown away, and the first real command resolves the provider's next (second) call — the credential is never cached at construction.
- `credentialEnv()` is called on **every** command, never memoised, so an expiring credential (e.g. a GitHub App installation token) can be refreshed transparently by the provider.
- The credential overlay is spread before the `GIT_*` identity fields when assembling `commandEnv()`, so a misbehaving provider can never override the context's configured git identity.
- `GitContext.exec(command, options)` takes `command` as a separate first positional parameter (not nested in `options`) specifically so the `git-gh-shellout` CI guard (`adws/checkGitGhGuard.ts`) can keep inspecting call sites.
- `options.cwd` is always an `ExecWorkingDirectory` class (`{ kind: 'workspace', path? }` or `{ kind: 'frameworkRoot' }`), never a bare path — there is no `process.cwd()` fallback and no third option.
- `exec()` returns stdout trimmed; every call site depends on this. A spawn failure is rewrapped into a descriptive ENOENT-preserving error only when the failure is a confirmed missing-cwd ENOENT (checked by `code`, not message text, since node/bun phrase the message differently); every other failure — including a "real" ENOENT with an existing cwd — propagates verbatim.
- `commitOps.pushBranch` always uses `--force-with-lease --force-if-includes`; a lease rejection (detected via `isLeaseRejection`, matching `"stale info"`/`"remote ref updated since checkout"` in the error text) is converted into a message instructing manual remediation rather than silently retried.
- `claimOps.pushHeadToBranch` must **never** be forced — its non-fast-forward rejection from the remote is the atomic distributed lock; forcing it would break the winner/loser election.
- `branchOps` refuses to delete `main`, `master`, or `develop` (`PROTECTED_BRANCHES`), returning `false` rather than throwing.
- `commitOps.commitChanges`/`removeAndCommitPaths`/`addAndCommitPaths` are status-gated: they return `false` and perform no commit when nothing would change, rather than creating empty/no-op commits (except `claimOps.commitAllowEmpty`, whose entire purpose is an intentional empty commit).
- `bootstrapIdentity.ts` and `repoWorkspace.ts` are structurally exempt from repo-wide git/gh shellout guards by living in this package's directory, not by allowlist — and both are restricted to generic git reads/writes with no forge vocabulary (no GitHub URL parsing, no `gh` CLI, no bot-identity derivation).
- `repoWorkspace.ts` clones exactly the URL it is given, with no scheme rewriting; any forge-specific URL translation happens in the calling adapter before this module is invoked.
- The package imports nothing from `src/providers/`; this boundary is enforced by a committed import-graph test.
- `literalTokenProvider.ts`'s `createLiteralTokenProvider` is a test/fixture-only implementation (not a production credential source) that always answers via the `GH_TOKEN` overlay key — a deliberate, grandfathered exception to the rule that a production provider owns its credential variable name on the adapter side of the port.

## Configuration

None directly read by this package. All environment-derived values (`REPO_ROOT`/`frameworkRepoRoot`, `TARGET_REPOS_DIR`/`targetReposDir`, credentials, git identity) are injected by callers at `GitContext` construction or into `ensureRepoWorkspace`'s `EnsureRepoWorkspaceDeps` — the package itself has no ADW-global or environment-variable dependency, which is what makes it reusable standalone. The one exception is `bootstrapIdentity.readEnvGitIdentity`, which reads `GIT_AUTHOR_NAME`/`GIT_AUTHOR_EMAIL`/`GIT_COMMITTER_NAME`/`GIT_COMMITTER_EMAIL` from an explicitly-passed `env` object (never `process.env` implicitly).

## Gotchas

- `GitContext.exec()`'s `options.env` is merged over `process.env` inside the executor (`{ ...process.env, ...options.env }`) — `process.env` itself is never mutated, but callers should not assume isolation from the parent process environment.
- Several worktree-porcelain parsers (`worktreeCreateOps.isBranchCheckedOutElsewhere`, `worktreeQueryOps.findWorktreeForIssue`/`getWorktreeForBranch`, `worktreeRemoveOps.parseWorktreeBranches`, `worktreeProbeOps.worktreeRegistration`) hand-parse `git worktree list --porcelain` output line-by-line; they rely on blank lines as record separators and on paths containing (or not containing) the literal substring `.worktrees`/`.worktrees/` to distinguish worktrees from the main repo checkout.
- `worktreeCreateOps.freeBranchFromMainRepo` will auto-commit uncommitted changes in the *main* repository (with message `"WIP: auto-commit before switching to worktree"`) and attempt to push them to origin before switching branches — a destructive-adjacent side effect triggered only when the target branch is checked out in the main repo rather than a worktree.
- `worktreeRemoveOps.removeWorktree`/`removeOneWorktree` fall back to `git worktree prune` + `fs.rmSync(..., { recursive: true, force: true })` when `git worktree remove --force` fails — a filesystem-level deletion outside git's bookkeeping.
- `worktreeResetOps.resetWorktree` runs `git clean -fdx`, which deletes untracked **and** gitignored files in the worktree; this is a hard, irreversible reset used for takeover scenarios.
- `commitOps.committableExcludePaths`/`gitignoredSubset` treat any `git check-ignore` failure (including "none of these paths are ignored," which exits non-zero) as "nothing is ignored" — a deliberate fail-safe so the exclude-path filter can never behave worse than passing every path through unfiltered.
- `assertCompleteIdentity`'s token-provider probe result is discarded; a provider that returns a valid credential at construction but fails on the very next call will still pass construction and only fail on the first real command.
- `types.ts`'s `ExecWorkingDirectory` deliberately has no "frameworkRoot with an explicit worktree path" variant — that combination is unrepresentable in the type, not merely undocumented.
- `literalTokenProvider`'s fixed `GH_TOKEN` overlay key means it cannot be used to simulate a non-GitHub credential shape in tests; it is explicitly a grandfathered exception, not a template for new fixtures.
- `consoleLogger` writes every level to `console.log` (stdout) with no level-based routing — errors and warnings are not distinguished from info/success in the stream.
