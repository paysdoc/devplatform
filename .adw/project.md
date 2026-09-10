## Project Overview
`@paysdoc/devplatform` is a TypeScript library providing forge ports and adapters (GitHub, GitLab,
Jira) over a forge-neutral git/worktree core. It was extracted from the `AI_Dev_Workflow` repository
with history. Package build, entry points, and release automation are still tracked as open issues
in this repository (see README.md) — there is currently no build/dist pipeline or published entry
point.

## Relevant Files
- `src/git/` — Forge-neutral git/worktree core: identity bootstrap, branch/commit/remote
  operations, worktree create/remove/probe/query/reset, working-directory guard, git context, and a
  console logger. Each module has a co-located `__tests__/` suite.
- `src/providers/forgeProviders.ts`, `src/providers/index.ts`, `src/providers/types.ts` — Forge
  provider selection/registration surface: the neutral abstraction that the GitHub/GitLab/Jira
  adapters implement.
- `src/providers/workspaceValidation.ts` — Workspace validation shared across providers.
- `src/providers/github/` — GitHub adapter: `gh` CLI command runner, issue/PR parsers and APIs,
  board manager, code host, App auth, identity, and token resolution, plus `commands/` for
  issue/PR/board/label/secret CLI commands.
- `src/providers/gitlab/` — GitLab adapter: API client, code host, board manager, type mappers.
- `src/providers/jira/` — Jira adapter: API client, issue tracker, board manager, ADF (Atlassian
  Document Format) converter.
- `.github/adw.yml` — ADW configuration living outside `.adw/` (guardrails toggle); not overwritten
  by `/adw_init` regeneration.
- `.github/workflows/ci.yml` — CI: `bun install`, `bun run typecheck`, `bun run test:unit`.
- `vitest.config.ts` — Test runner config; already wires JUnit output via
  `$ADW_UNIT_TEST_REPORT_PATH`.

## Framework Notes
- Runtime/tooling: Bun (package manager and script runner), TypeScript (strict mode, ES2022,
  `moduleResolution: bundler`, `noEmit`), Vitest for unit tests.
- No linter is currently configured.
- No build step is currently configured; `tsc --noEmit` is used for both `typecheck` and `test`
  npm-scripts (the latter is a naming quirk — it does not run the test suite).
- The actual unit-test suite is run via `bun run test:unit` (vitest).

## Library Install Command
`bun add <package>` for runtime dependencies, `bun add -d <package>` for dev dependencies.

## Script Execution
`bun run <script-name>` (see `package.json` scripts: `typecheck`, `test:unit`, `test`), or
`bunx tsx <file.ts>` for ad-hoc script execution.

## Agent Guardrails
`.claude/settings.json` already existed in this repository prior to `/adw_init` running, so ADW left
it untouched and did not apply the starter guardrails template (step 7 skip-if-exists rule). The
existing file defines its own permission allow/deny list and wires the repo's `.claude/hooks/*`
scripts (pre-tool-use, post-tool-use, notification, stop, subagent-stop) via
`bunx tsx $CLAUDE_PROJECT_DIR/.claude/hooks/...`.
