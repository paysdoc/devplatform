# @paysdoc/devplatform

A TypeScript library of forge-neutral git/worktree primitives plus GitHub, GitLab, and Jira adapters for building dev-workflow automation.

Extracted from [AI_Dev_Workflow](https://github.com/paysdoc/AI_Dev_Workflow) with history.
Releases are automated by semantic-release on every push to `main`.

## Install

```
bun add @paysdoc/devplatform
# or
npm i @paysdoc/devplatform
```

The package ships three entry points:

```ts
import { BoardStatus, type Issue, type RepoContext } from '@paysdoc/devplatform';         // forge ports + domain model
import { forgeProviders } from '@paysdoc/devplatform/providers';                          // adapter assembly + GitHub/GitLab/Jira adapters
import { GitContext, consoleLogger } from '@paysdoc/devplatform/git';                     // forge-neutral git/worktree core
```

## What it does

- **Forge-neutral git executor** — `GitContext.exec()` is the single spawn site, env merge, cwd resolution, and ENOENT rewrap for every git command; no forge semantics leak into it.
- **Identity-bound context construction** — a `GitContext` is built from a mandatory owner/repo/selfHost/tokenProvider/gitIdentity; incomplete identity fails at construction rather than at first use.
- **Worktree lifecycle management** — create/ensure, list, remove, probe (health: `healthy`/`locked`/`prunable`/`missing`), and reset (takeover) operations for git worktrees under `.worktrees/`.
- **Branch, commit, and remote operations** — branch creation/switching, commits, and remote push/fetch helpers layered on the shared executor.
- **Working-directory guard** — turns a spawn ENOENT caused by a missing cwd into a diagnostic naming the path and repo identity, keyed off the OS-independent error `code`.
- **Distributed-lock claim primitives** — detached-worktree add/remove, empty-commit nonce marking, and a never-forced push used to implement an atomic winner/loser election (e.g. for upgrade claims).
- **Process cleanup** — kills processes still running inside a worktree directory before it is removed.
- **Pluggable credential and logging ports** — `TokenProvider` (credential-purpose-scoped) and `Logger` ports let a consumer supply auth and logging without the core depending on either.
- **Bootstrap-only git reads** — a narrow, structurally-exempt set of pre-context reads (origin remote URL, env/git-config identity) for use before a full `GitContext` exists.
- **Forge-neutral provider interfaces** — `IssueTracker`, `CodeHost`, and `BoardManager` ports abstract issue tracking, PR/code hosting, and project boards across platforms.
- **`forgeProviders()` assembly function** — binds one `RepoIdentifier` to a full provider triple, validating identity, token provider shape, and context binding before constructing any adapter; rejects unknown or wrong-port forge names via `UnknownForgeError`.
- **GitHub adapter** — issue tracker, code host, and Projects V2 board manager built on the `gh` CLI, including issue/PR read and write operations, label management, GitHub App authentication, and token resolution.
- **GitLab adapter** — code host implementation backed by a `curl`-based API client with injected configuration (no environment reads).
- **Jira adapter** — issue tracker backed by the Jira REST API v3, including Markdown ↔ Atlassian Document Format (ADF) conversion.
- **Board status model** — a canonical, ordered set of board columns (`Blocked`/`Todo`/`In Progress`/`Review`/`Done`) with colors and descriptions shared across board-capable adapters.
- **Injected configuration everywhere** — GitLab, Jira, and GitHub App adapters take configuration as constructor arguments; none reads `process.env` or files directly, keeping the library embeddable in any host.
- **Compiled ESM + type declarations** — `bun run build` emits `dist/**/*.js` and `dist/**/*.d.ts` via `tsc`, with a three-entry-point `exports` map (`.`, `./providers`, `./git`) and a `files` allow-list so `npm pack` ships only `dist/`, `README.md`, and `LICENSE`.
- **CI type-check, git/gh guard, unit-test, and package gate** — GitHub Actions runs `bun install`, `bun run typecheck`, `bun run lint:git-guard`, and `bun run test:unit` on every PR and push to `main`, plus a second job that builds, packs, and smoke-tests the tarball under both Node and Bun.
- **Automated releases via semantic-release** — a `Release` GitHub Actions job runs semantic-release on every push to `main`, using a commit parser that accepts an optional `<agent-name>: ` prefix before the conventional type (`build-agent: feat: …` → minor, `review-patch-agent: fix: …` → patch, `plan-orchestrator: chore: …` → no release), a PR `release-dry-run` job that prints the computed next version before merge, and npm OIDC trusted publishing with an `NPM_TOKEN` fallback.
- **Git/gh CI guard** — an AST-based check (`bun run lint:git-guard`, `scripts/checkGitGhGuard.ts` + `scripts/guard/`) that fails CI on a direct `git`/`gh` shell-out outside `src/git/` and `src/providers/github/` (the two structurally-exempt packages), or on ad-hoc provider/`GitContext` construction anywhere outside the one-entry `src/providers/forgeProviders.ts` allowlist.
- **Claude Code agent guardrails** — a hooked `.claude/settings.json` and `.claude/hooks/*` scripts (pre/post-tool-use, notification, stop, subagent-stop) constrain and observe agent tool use in this repo.

## Setup

1. Install dependencies: `bun install`
2. Copy the environment template and fill in your own values: `cp .env.sample .env`
3. Type-check: `bun run typecheck`
4. Run the unit test suite: `bun run test:unit`
5. Build: `bun run build`

## Releasing

Releases are computed by [semantic-release](https://semantic-release.gitbook.io/) from commit messages on
every push to `main` — see `release.config.js`. Commit headers must follow the conventional-commits format,
optionally preceded by a hyphenated agent name:

```
[<agent-name>: ]<type>[(<scope>)][!]: <subject>
```

- `feat: …` / `<agent-name>: feat: …` → minor release
- `fix: …` / `<agent-name>: fix: …` → patch release
- `feat!: …`, or any commit with a `BREAKING CHANGE:` footer → major release
- `chore: …`, `docs: …`, and other non-releasing types → no release

The agent-name prefix must be a lowercase, hyphenated token (e.g. `build-agent`, `plan-orchestrator`) so it
can never be confused with a conventional type. Every pull request runs a `release-dry-run` CI job that
prints the version the merge would compute, without publishing anything.

Publishing uses npm OIDC trusted publishing (no long-lived npm credential stored in the repository), falling
back to an `NPM_TOKEN` secret if one is present. The release baseline is the `v1.0.0` git tag on the commit
of the first manually published version; the release workflow hard-fails if that tag is not reachable, so it
can never recompute or republish `1.0.0`.

## Domain glossary

See [UBIQUITOUS_LANGUAGE.md](./UBIQUITOUS_LANGUAGE.md) for the canonical terms used across this codebase (identity, forge, provider, worktree, etc.).

## Project Structure

```
.adw/                        ADW-generated project docs (project.md, providers.md, commands.md, conditional_docs.md, review_proof.md, scenarios.md)
.adw-version                  ADW template version marker
.claude/
  commands/                   ADW-copied slash commands (gitignored except install.md, prime.md)
  hooks/                      Claude Code lifecycle hooks (pre/post-tool-use, notification, stop, subagent-stop)
  skills/                     Agent skills (TDD, PRD authoring, architecture review, ubiquitous language, ...)
  settings.json                Agent permission/guardrail configuration
.github/
  workflows/ci.yml             Typecheck + git/gh guard + unit test CI gate, build/pack/smoke-test package gate, and a PR-only release-dry-run job
  workflows/release.yml        Release automation: semantic-release on push to main (v1.0.0 baseline guard, OIDC + NPM_TOKEN fallback)
  adw.yml                      ADW guardrails toggle (outside .adw/, survives regeneration)
app_docs/                    Per-module documentation owned by conditional_docs.md routing (ADW-generated)
UBIQUITOUS_LANGUAGE.md       Canonical domain glossary
features/regression/vocabulary.md   Regression test vocabulary
logs/<session-id>/           Claude Code hook session logs (chat, pre/post-tool-use, stop transcripts)
specs/                        Per-issue implementation plans (ADW-generated), plus specs/patch/ for patch plans
release.config.js             semantic-release configuration: agent-prefix-aware commit parser, branches, plugin list
scripts/
  smokePackage.ts             Builds, packs, and smoke-tests the tarball under Node + Bun (`bun run smoke:package`)
  releaseDryRun.ts             Runs `semantic-release --dry-run` and prints the computed next version (`bun run release:dry-run`)
  checkGitGhGuard.ts          CI git/gh guard entry point (`bun run lint:git-guard`) — dev-only, excluded from dist/
  guard/                      Guard rule modules: shell-out exempt-package set, construction allowlist, stdout report
src/
  index.ts                    Root entry point ("."): forge ports + domain model only
  __tests__/                  Import-graph, package-exports, and release-config contract tests
  git/                        Forge-neutral git/worktree core (GitContext, worktree ops, bootstrap identity, process cleanup) — entry point "./git"
  providers/                  Forge provider ports and adapters — entry point "./providers"
    github/                   GitHub adapter (issue tracker, code host, board manager, App auth, gh CLI commands)
    gitlab/                   GitLab adapter (API client, code host, type mappers)
    jira/                     Jira adapter (API client, issue tracker, ADF converter)
    forgeProviders.ts          Provider assembly function
    types.ts                   Platform-agnostic provider interfaces
dist/                        Build output (gitignored) — emitted by `bun run build`
tsconfig.json                 TypeScript strict-mode configuration (NodeNext modules/resolution)
tsconfig.build.json            Build config: extends tsconfig.json, emits dist/**/*.js + dist/**/*.d.ts
vitest.config.ts               Vitest configuration (JUnit output via $ADW_UNIT_TEST_REPORT_PATH)
```
