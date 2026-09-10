## Project Overview
`@paysdoc/devplatform` is a TypeScript library providing forge ports and adapters (GitHub, GitLab,
Jira) over a forge-neutral git/worktree core. It was extracted from the `AI_Dev_Workflow` repository
with history. `bun run build` compiles `src/` to `dist/**/*.js` + `dist/**/*.d.ts` via `tsc`, and
`package.json` exposes three entry points (`.`, `./providers`, `./git`). Release automation
(`npm publish`) is still tracked as a separate open issue in this repository (see README.md).

## Relevant Files
- `src/index.ts` — Root package entry point (`"."`): re-exports the forge ports and domain model
  from `src/providers/types.ts` only — no adapter, no `forgeProviders`.
- `src/git/` — Forge-neutral git/worktree core: identity bootstrap, branch/commit/remote
  operations, worktree create/remove/probe/query/reset, claim ops, working-directory guard, git
  context, a console logger, and `literalTokenProvider.ts` (a fixed-string `TokenProvider` for
  tests/fixtures, re-exported from the GitHub adapter for backwards compatibility). Each module
  has a co-located `__tests__/` suite. `src/git/index.ts` is the `"./git"` entry point.
- `src/providers/forgeProviders.ts`, `src/providers/index.ts`, `src/providers/types.ts` — Forge
  provider selection/registration surface: the neutral abstraction that the GitHub/GitLab/Jira
  adapters implement. `src/providers/index.ts` is the `"./providers"` entry point.
- `src/providers/forgeCredentials.ts` — `createForgeCredentials()`, the forge-keyed credential
  factory (sibling of `forgeProviders()`): resolves a `TokenProvider` and bootstrap `GitIdentity`
  from `forge.codeHost` alone, dispatching to the GitHub or GitLab adapter internally.
- `src/providers/workspaceValidation.ts` — Workspace validation shared across providers.
- `src/providers/github/` — GitHub adapter: `gh` CLI command runner, issue/PR parsers and APIs,
  board manager, code host, App auth, identity, and token resolution, plus `commands/` for
  issue/PR/board/label/secret CLI commands.
- `src/providers/gitlab/` — GitLab adapter: API client, code host, board manager, type mappers,
  plus the adapter-internal `gitlabTokenProvider.ts`/`gitlabIdentity.ts` `createForgeCredentials`
  composes (not exported from the GitLab barrel).
- `src/providers/jira/` — Jira adapter: API client, issue tracker, board manager, ADF (Atlassian
  Document Format) converter.
- `src/__tests__/importGraph.test.ts` — static import-graph walker asserting `"./git"` and `"."`
  reach no adapter module and no `forgeProviders`.
- `src/__tests__/packageExports.test.ts` — asserts the `package.json` `exports`/`files` contract.
- `tsconfig.build.json` — build-only tsconfig (extends `tsconfig.json`, emits `dist/`, excludes
  `__tests__/`).
- `scripts/smokePackage.ts` — builds, packs, and smoke-tests the tarball under Node + Bun (`bun run
  smoke:package`).
- `scripts/checkGitGhGuard.ts`, `scripts/guard/` — AST-based git/gh CI guard (`bun run
  lint:git-guard`): a `git-gh-shellout` rule exempting `src/git/` and `src/providers/github/`, and
  an `unsanctioned-construction` rule allowlisting only `src/providers/forgeProviders.ts`, walked
  over the whole tree. Dev-only; excluded from `dist/` and the npm tarball.
- `.github/adw.yml` — ADW configuration living outside `.adw/` (guardrails toggle); not overwritten
  by `/adw_init` regeneration.
- `.github/workflows/ci.yml` — CI: `check` job (`bun install`, `bun run typecheck`, `bun run
  lint:git-guard`, `bun run test:unit`, `bun run test:e2e --tags "not @packaging"`) plus a
  `package` job (`bun run build`, `npm pack --dry-run`, `bun run smoke:package`,
  `bun run test:e2e --tags "@packaging"`).
- `vitest.config.ts` — Test runner config; already wires JUnit output via
  `$ADW_UNIT_TEST_REPORT_PATH`.
- `cucumber.js`, `features/**` — Cucumber/Gherkin BDD scenario suite (`bun run test:e2e`):
  per-issue `.feature` files under `features/per-issue/`, step definitions, shared world/support
  code, and the promoted regression vocabulary. See `app_docs/bdd-scenarios.md`.

## Framework Notes
- Runtime/tooling: Bun (package manager and script runner), TypeScript (strict mode, ES2022,
  `module`/`moduleResolution: NodeNext`), Vitest for unit tests.
- No linter is currently configured.
- A build step exists: `bun run build` runs `tsc -p tsconfig.build.json`, emitting
  `dist/**/*.js` + `dist/**/*.d.ts` from `src/`. `moduleResolution` is `NodeNext` (not `bundler`),
  which enforces explicit `.js` extensions on every relative import specifier at typecheck time.
  `tsc --noEmit` is still used for both `typecheck` and `test` npm-scripts (the latter is a naming
  quirk — it does not run the test suite).
- The actual unit-test suite is run via `bun run test:unit` (vitest).
- A BDD scenario suite (`bun run test:e2e`, `cucumber-js` + `tsx`) sits alongside the unit suite:
  per-issue `.feature` files under `features/per-issue/` drive the library's public entry points
  end to end, including a `@packaging` subset that packs and installs the real tarball. See
  `app_docs/bdd-scenarios.md`.

## Library Install Command
`bun add <package>` for runtime dependencies, `bun add -d <package>` for dev dependencies.

## Script Execution
`bun run <script-name>` (see `package.json` scripts: `typecheck`, `test:unit`, `test:e2e`,
`test`), or `bunx tsx <file.ts>` for ad-hoc script execution.

## Agent Guardrails
`.claude/settings.json` already existed in this repository prior to `/adw_init` running, so ADW left
it untouched and did not apply the starter guardrails template (step 7 skip-if-exists rule). The
existing file defines its own permission allow/deny list and wires the repo's `.claude/hooks/*`
scripts (pre-tool-use, post-tool-use, notification, stop, subagent-stop) via
`bunx tsx $CLAUDE_PROJECT_DIR/.claude/hooks/...`.
