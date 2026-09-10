# @paysdoc/devplatform

A TypeScript library of forge-neutral git/worktree primitives plus GitHub, GitLab, and Jira adapters for building dev-workflow automation.

Extracted from [AI_Dev_Workflow](https://github.com/paysdoc/AI_Dev_Workflow) with history.
Release automation is tracked as a separate issue in this repository.

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
- **CI type-check, unit-test, and package gate** — GitHub Actions runs `bun install`, `bun run typecheck`, and `bun run test:unit` on every PR and push to `main`, plus a second job that builds, packs, and smoke-tests the tarball under both Node and Bun.
- **Release workflow placeholder** — a `Release` GitHub Actions job reserved for future semantic-release automation (tracked as a separate issue).
- **Claude Code agent guardrails** — a hooked `.claude/settings.json` and `.claude/hooks/*` scripts (pre/post-tool-use, notification, stop, subagent-stop) constrain and observe agent tool use in this repo.

## Setup

1. Install dependencies: `bun install`
2. Copy the environment template and fill in your own values: `cp .env.sample .env`
3. Type-check: `bun run typecheck`
4. Run the unit test suite: `bun run test:unit`
5. Build: `bun run build`

## Domain glossary

See [UBIQUITOUS_LANGUAGE.md](./UBIQUITOUS_LANGUAGE.md) for the canonical terms used across this codebase (identity, forge, provider, worktree, etc.).

## Project Structure

```
.adw/                        ADW-generated project docs (project.md, providers.md, conditional_docs.md, ...)
.claude/
  hooks/                      Claude Code lifecycle hooks (pre/post-tool-use, notification, stop, subagent-stop)
  settings.json                Agent permission/guardrail configuration
.github/
  workflows/ci.yml             Typecheck + unit test CI gate
  workflows/release.yml        Release automation placeholder
  adw.yml                      ADW guardrails toggle (outside .adw/, survives regeneration)
features/regression/vocabulary.md   Regression test vocabulary
scripts/
  smokePackage.ts             Builds, packs, and smoke-tests the tarball under Node + Bun (`bun run smoke:package`)
src/
  index.ts                    Root entry point ("."): forge ports + domain model only
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
