# BDD Scenario Suite

## Overview

Cucumber/Gherkin behavioural scenarios that pin the library's public surface from the outside —
through `@paysdoc/devplatform`'s published entry points, never a source-file inspection. Added
alongside issue #9 (the forge-keyed credential factory) as the executable acceptance layer that
sits between the co-located `vitest` unit suites and manual verification.

## Responsibilities

- `cucumber.js` — the scenario runner configuration: scenarios live under `features/**/*.feature`,
  step definitions and shared support code under `features/step_definitions/**/*.ts` and
  `features/support/**/*.ts`. Step definitions are TypeScript, transpiled on the fly by `tsx`
  (registered via `NODE_OPTIONS="--import tsx"` in the `test:e2e` script, not cucumber's own
  `loader` option) so they can import the library's own `src/` modules under the repository's
  `NodeNext` resolution without a separate build step.
- `features/per-issue/` — one `.feature` file per issue (e.g. `feature-9.feature`), tagged
  `@adw-<issue>`, generated as the behavioural contract for that issue's build.
- `features/regression/vocabulary.md` — the promoted, reusable Given/When/Then phrase registry
  for scenarios worth keeping as a standing regression suite (`@regression`).
- `features/step_definitions/` — step definitions wiring Gherkin phrases to the library's public
  entry points (`src/providers/index.ts`, `src/git/index.ts`), via dynamic `import()` so a
  missing export fails only the scenario that needs it, not the whole run.
- `features/support/world.ts` — the shared Cucumber `World`: per-scenario input/output state,
  managed `process.env` keys snapshotted before and restored after every scenario so a
  developer's own shell identity never leaks into an assertion.
- `features/support/packagedConsumer.ts` — the packaging fixture shared by every `@packaging`
  scenario: packs the real tarball (`npm pack`, which runs `prepack` → `bun run build`) once per
  cucumber process, installs it into a throwaway consumer project, and exposes helpers to run or
  type-check a module against it.
- `bun run test:e2e` — runs the whole suite; extra cucumber flags pass straight through, e.g.
  `bun run test:e2e --tags "@adw-9"` or `bun run test:e2e --tags "not @packaging"` for a fast
  inner loop that skips the pack-and-install scenarios.

## Contracts & Invariants

- No step definition or support module inspects a source file — every assertion reads an
  *output* of the public surface (a `credentialEnv` overlay, a resolved `GitIdentity`, a thrown
  refusal, or a subprocess's exit code/stdout).
- `@packaging`-tagged scenarios build, pack and install the tarball into a clean project, then
  run a Node subprocess and the repository's own `tsc` against it — the committed proof that a
  published name resolves both at runtime and in the emitted `.d.ts`, per
  `app_docs/feature-wdjsgu-package-build-export-package-build.md`.
- `tsconfig.json`'s `include` covers `features/**/*.ts` so the step layer is typechecked by
  `bun run typecheck`/`bun run test`; `tsconfig.build.json` stays `src`-only, so nothing under
  `features/` ever reaches `dist/` or the npm tarball.
- CI splits the suite across both `.github/workflows/ci.yml` jobs (`app_docs/ci-and-adw-config.md`):
  the hermetic scenarios run in `check` (need nothing built); the `@packaging` scenarios run in
  `package` (need Node + npm to pack and install, which only that job provisions).
- `strict: true` in `cucumber.js` fails the run on any undefined or pending step, so a
  typo'd Gherkin phrase is a hard failure, not a silent skip.

## Configuration

- `bun run test:e2e` — `NODE_OPTIONS="--import tsx" cucumber-js`.
- `bun run test:e2e --tags "<expression>"` — Cucumber tag expression, e.g. `"@adw-9"`,
  `"not @packaging"`, `"@regression"`.

## Gotchas

- `features/support/packagedConsumer.ts` drops `NODE_OPTIONS` from the child environment before
  spawning a subprocess in the installed consumer: the suite itself runs under `--import tsx`,
  but the consumer is a clean install of nothing but the tarball and cannot resolve `tsx`.
- The `@packaging` scenarios are minutes-scale on a cold cache (a real `npm pack` + `npm install`)
  — exclude them with `--tags "not @packaging"` for a fast inner loop while iterating.
- The install happens once per cucumber process and is shared by every `@packaging` scenario in
  that run, not once per scenario.
