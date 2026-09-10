# Package Build & Exports

## Overview

This module turns `@paysdoc/devplatform` into a publishable ESM library: a `tsc`-driven build
that emits `dist/**/*.js` + `.d.ts` from `src/`, a three-entry-point `package.json` `exports`
map, and the tests/scripts that keep the build and the manifest honest. It exists so consumers
can `npm install`/`bun add` the package and import the forge ports, the provider adapters, or the
git/worktree core independently, without pulling adapter code into a git-only consumer.

## Responsibilities

- Compile `src/**/*.ts` (excluding `__tests__/`) to ESM + declarations in `dist/`, via
  `tsconfig.build.json` (`tsc -p tsconfig.build.json`, wired as `bun run build`).
- Define three public entry points via `package.json` `exports`:
  - `"."` → `dist/index.js` — forge ports and domain model only, re-exported from
    `src/index.ts` (`export * from './providers/types.js'`). No adapter code.
  - `"./providers"` → `dist/providers/index.js` — `forgeProviders`, its options/deps types, and
    the GitHub/GitLab/Jira adapters (`src/providers/index.ts`).
  - `"./git"` → `dist/git/index.js` — the forge-neutral git/worktree core (`src/git/index.ts`):
    `GitContext`, the executor/port/logger types, `consoleLogger`, `claimOps`, the worktree
    create/remove/query/probe/reset op namespaces, and the workspace ops.
  - `"./package.json"` — conventional passthrough for tooling that reads the manifest directly.
- Limit the packed tarball to `dist/`, `README.md`, `LICENSE` (`files` in `package.json`); `main`/
  `types` point at `dist/index.js`/`dist/index.d.ts` as a legacy-resolver fallback.
- Enforce ESM-correct relative import specifiers: `tsconfig.json` compiles under
  `module`/`moduleResolution: NodeNext`, which hard-errors (`TS2835`/`TS2834`) on any relative
  import missing an explicit `.js` (or `/index.js`) extension — `tsc` emits specifiers verbatim,
  so this is what keeps the emitted ESM resolvable by Node.
- Guard the entry-point layering with a static import-graph walker
  (`src/__tests__/importGraph.test.ts`) that reads `src/` directly (no build needed): `"./git"`
  and `"."` must never reach an adapter module or `src/providers/forgeProviders.ts`; a positive
  control confirms `"./providers"` does reach every adapter and `forgeProviders`.
- Guard the manifest contract with `src/__tests__/packageExports.test.ts`: exactly the four
  `exports` keys, every mapped `types`/`import` target under `dist/` with a corresponding `src/`
  file, `files` exactly `["dist", "README.md", "LICENSE"]`, `type: "module"`.
- Verify the packed artifact actually works for consumers via `scripts/smokePackage.ts`
  (`bun run smoke:package`): builds, asserts the six `dist/**/index.{js,d.ts}` outputs exist,
  runs `npm pack --dry-run --json` to assert no `src/` entries and that `README.md`/`LICENSE` are
  present, packs a real tarball, installs it into a throwaway temp consumer (its own
  `node_modules`, not the workspace's), and imports all three subpaths under both `node` and
  `bun`, asserting a representative symbol from each (`BoardStatus`, `forgeProviders`,
  `createForgeCredentials`, `GitContext`, `createLiteralTokenProvider`) — the last two names
  (issue #9) are the same symbols the committed `@packaging` BDD scenarios prove resolve at
  runtime and in the emitted `.d.ts` (`app_docs/bdd-scenarios.md`).
- CI: a `package` job (`.github/workflows/ci.yml`, alongside the existing `check` job) runs
  `bun install` → `bun run build` → `npm pack --dry-run` → `bun run smoke:package` on
  `oven-sh/setup-bun@v2` + `actions/setup-node@v4`, so the Node consumer leg is real rather than
  Bun-shimmed.
- `tsconfig.json`'s `include` and `vitest.config.ts`'s `test.include` both also cover
  `scripts/**` (widened alongside `scripts/checkGitGhGuard.ts` + `scripts/guard/`, issue #3),
  so the dev-only `scripts/` tree — the packed-tarball smoke check and the git/gh CI guard — is
  typechecked by `bun run typecheck` and tested by `bun run test:unit`, without becoming part
  of the build: `tsconfig.build.json` keeps its own `include`/`rootDir` at `src` only. See
  `app_docs/git-gh-guard.md` for the guard itself.
- `tsconfig.json`'s `include` also covers `features/**/*.ts` (issue #9), so the Cucumber step
  layer is typechecked by `bun run typecheck`/`bun run test` too. Same isolation rule as
  `scripts/`: `tsconfig.build.json` keeps its own `src`-only `include`/`rootDir`, so nothing
  under `features/` ever reaches `dist/` or the tarball. See `app_docs/bdd-scenarios.md` for the
  scenario suite itself, including the `@packaging` scenarios that build their own throwaway
  `tsconfig.json` against a consumer of the packed tarball — a separate, unrelated config.

## Contracts & Invariants

- `src/index.ts` re-exports only `./providers/types.js` — never `./providers/index.js`, never
  `forgeProviders`, never an adapter. Adding any such import breaks the import-graph test.
- `src/git/index.ts` never imports from `src/providers/` in production code (test-only imports
  under `src/git/__tests__/` are excluded from `tsconfig.build.json` and therefore absent from
  `dist/` and from the import-graph walk, which starts at `src/git/index.ts`).
- Every relative import specifier in `src/` (production and `__tests__/`) carries an explicit
  `.js` extension — file imports as `'./foo.js'`, directory imports as `'../bar/index.js'`.
  `bun run typecheck` (NodeNext) is what enforces this; it is not merely a convention.
  Vitest/Vite resolves `./foo.js` specifiers to the co-located `foo.ts`, so the unit suite runs
  unchanged against the same source tree the build compiles.
- `tsconfig.build.json` excludes `src/**/__tests__/**` — no test code and no test-only
  cross-boundary import ever reaches `dist/`.
- `npm pack` never ships `src/` — enforced by both `scripts/smokePackage.ts` and
  `src/__tests__/packageExports.test.ts`.
- `npm pack` never ships `scripts/` either, despite `tsconfig.json`/`vitest.config.ts` now
  covering it: `files` stays exactly `["dist", "README.md", "LICENSE"]`, and
  `tsconfig.build.json`'s `include`/`rootDir` stay `src`-only, so `scripts/checkGitGhGuard.ts`
  and `scripts/guard/` are excluded from both `dist/` and the tarball by construction, not by a
  separate exclusion rule.
- The `check` CI job runs `bun install` → `bun run typecheck` → `bun run lint:git-guard` →
  `bun run test:unit` (the `lint:git-guard` step, #3, is documented in
  `app_docs/git-gh-guard.md`); the `package` job is unchanged, additive, and runs on the same
  triggers.
- `bun run test` remains a naming quirk that runs `tsc --noEmit`, not the suite; `bun run
  test:unit` is the real suite. This module does not change that.

## Configuration

- `bun run build` — `bun run clean && tsc -p tsconfig.build.json`; `clean` removes `dist/` via a
  dependency-free `node -e` script (no `rimraf`).
- `bun run smoke:package` — `bunx tsx scripts/smokePackage.ts`.
- `bun run lint:git-guard` — `bunx tsx scripts/checkGitGhGuard.ts`; see
  `app_docs/git-gh-guard.md` for the rules it enforces.
- `prepack` — runs `bun run build`, so a packed/published artifact is never stale.
- `package.json`: `sideEffects: false` (lets consumer bundlers tree-shake `"./providers"` down to
  the adapter actually used), `publishConfig.access: "public"` (required for a scoped package),
  `engines.node: ">=20"` (the emitted ESM targets ES2022 and relies on the Node ESM resolver).
- `dist/` and `*.tsbuildinfo` are gitignored; nothing under `dist/` is ever committed.

## Gotchas

- `tsc` emits import specifiers verbatim — it does not rewrite `'./foo'` to `'./foo.js'`. The
  `.js`-extension discipline is a source-level requirement, not a build-step transformation. A
  bundler (tsup/esbuild) would rewrite specifiers automatically but is deliberately not used here.
- `moduleResolution: bundler` would also resolve `.js`-suffixed specifiers correctly, but it does
  not *enforce* the extension — an extensionless import would pass typecheck under `bundler` and
  ship broken. `NodeNext` is chosen specifically so a regression fails `bun run typecheck` in CI.
- `scripts/smokePackage.ts` and the `package` CI job install the tarball into a fresh temp
  directory with its own `package.json`, deliberately not reusing the workspace's `node_modules`
  — that's what catches a manifest that resolves locally (via the workspace symlink/hoisting) but
  would fail for a real external consumer.
- This module stops at "packable and verified" — `npm publish` and semantic-release are out of
  scope here and belong to `.github/workflows/release.yml`, a separate release-automation concern.
