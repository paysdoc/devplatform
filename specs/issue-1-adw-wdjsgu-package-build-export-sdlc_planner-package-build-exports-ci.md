# Chore: Package build, exports map, CI

## Metadata
issueNumber: `1`
adwId: `wdjsgu-package-build-export`
issueJson: `{"number":1,"title":"Package build, exports map, CI","body":"**Parent PRD:** `paysdoc/AI_Dev_Workflow` `specs/prd/gitcontext-library-extraction.md`\n\n**What to build:** Compiled ESM plus type declarations via `tsc`, emitted to\n`dist/`. `src/index.ts` re-exporting the forge ports and the domain model\nfrom `src/providers/types.ts`. `package.json` `exports` map with three entry\npoints: `\".\"` → forge ports and domain model; `\"./providers\"` →\n`forgeProviders`, `ForgeProvidersOptions`, `ForgeProviderDeps`, and the three\nadapters; `\"./git\"` → `GitContext`, the executor, worktree/workspace/claim\nops, `consoleLogger`. `files` limited to `dist/`, `README.md`, `LICENSE`.\nKeep the existing CI (typecheck + vitest) green.\n\n**Acceptance criteria:**\n- [ ] `bun run build` produces `dist/**/*.js` + `dist/**/*.d.ts`; `npm pack --dry-run` lists no `src/`\n- [ ] A Node consumer (`node -e \"import('@paysdoc/devplatform')\"`) and a Bun consumer resolve all three subpaths from the packed tarball\n- [ ] `./git` import pulls no adapter module and no `forgeProviders` (verify with an import-graph assertion); root import pulls no adapter module\n- [ ] CI green on typecheck + vitest\n\n**User stories:** 14, 15.\n\n\n## Blocked by\n\n- #4\n","state":"OPEN","author":"paysdoc","labels":["adw:chore"],"createdAt":"2026-09-10T10:25:47Z","comments":[],"actionableComment":null}`

## Chore Description

`@paysdoc/devplatform` currently has no build pipeline and no published entry points. `package.json`
carries only `typecheck` / `test:unit` / `test` scripts, `tsconfig.json` is `noEmit`, and there is no
`exports` map, no `files` allow-list, and no root `src/index.ts`. Consumers cannot install and import
the package at all.

This chore turns the repository into a publishable ESM library:

1. **Compiled ESM + declarations via `tsc`, emitted to `dist/`.** A dedicated `tsconfig.build.json`
   emits `dist/**/*.js`, `dist/**/*.d.ts` (plus maps) from `src/`, excluding `__tests__/`.
2. **Extension-correct relative imports.** *This is the blocking prerequisite.* All 237 relative
   import specifiers in `src/` are currently extensionless (`from './gitContext'`,
   `from '../../git'`). `tsc` never rewrites specifiers — it emits them verbatim — so the current
   source would emit ESM that Node's ESM resolver rejects with `ERR_MODULE_NOT_FOUND`. Every relative
   specifier must gain an explicit `.js` extension (directory imports become `/index.js`), and the
   compiler must be switched to `module` / `moduleResolution: NodeNext` so the extension rule is
   *enforced* by `bun run typecheck` in CI rather than silently regressing.
   Verified empirically against this repo's toolchain: `tsc` emits `.js` specifiers verbatim and Node
   resolves the output; Vitest/Vite resolves a `./foo.js` specifier to the co-located `foo.ts`, so
   the unit suite keeps working unchanged.
3. **A root `src/index.ts`** re-exporting the forge ports and domain model from
   `src/providers/types.ts` only — no adapter module, no `forgeProviders`.
4. **A three-entry-point `exports` map**:
   - `"."` → `dist/index.js` — forge ports + domain model (`Platform`, `RepoIdentifier`, `Issue`,
     `BoardStatus`, `BOARD_COLUMNS`, `IssueTracker`, `CodeHost`, `BoardManager`, `PullRequest`,
     `BoundProviders`, `RepoContext`, …).
   - `"./providers"` → `dist/providers/index.js` — `forgeProviders`, `ForgeProvidersOptions`,
     `ForgeProviderDeps`, and the GitHub/GitLab/Jira adapters.
   - `"./git"` → `dist/git/index.js` — `GitContext`, the executor types, worktree/workspace/claim
     ops, `consoleLogger`.
5. **`files` limited to `dist/`, `README.md`, `LICENSE`** so `npm pack` ships no `src/`.
6. **Layering assertions.** A committed import-graph test proves `./git` reaches no adapter module
   and no `forgeProviders`, and that the root entry reaches no adapter module. (Production
   `src/git/` code is already clean — only `src/git/__tests__/` imports
   `../../providers/github/githubTokenProvider`, and tests are not part of the shipped graph. The
   test guards against future regression.)
7. **A packed-tarball smoke check** run by both Node and Bun, plus a CI job that builds, packs and
   smoke-tests, on top of the existing green typecheck + vitest gate.

## Relevant Files

Use these files to resolve the chore:

- `package.json` — needs `exports`, `files`, `main`, `types`, `sideEffects`, `publishConfig`, and
  `build` / `smoke:package` scripts. The existing `test` script is a naming quirk (it runs
  `tsc --noEmit`, not the suite) — leave its behaviour alone; CI uses `test:unit`.
- `tsconfig.json` — currently `noEmit`, `moduleResolution: bundler`, `include: ["src/**/*.ts"]`.
  Switch to `module` / `moduleResolution: NodeNext` (keeps `noEmit` — this remains the
  typecheck-everything-including-tests config).
- `src/providers/types.ts` — the forge ports and domain model that the root entry point re-exports.
  Read-only reference; already exports every port and domain type needed.
- `src/providers/index.ts` — the `"./providers"` entry point. Already re-exports `./types`,
  `./jira`, `./github`, `./gitlab`, `./forgeProviders`, `./workspaceValidation`; only its specifiers
  need extensions.
- `src/git/index.ts` — the `"./git"` entry point. Already exports `GitContext`, executor/port types,
  `consoleLogger`, `killProcessesInDirectory`, and the `repoWorkspace` (workspace) ops. Missing the
  worktree op namespaces and `claimOps` named in the issue — those must be added.
- `src/git/claimOps.ts` — exports `claimOps`; must be surfaced through `src/git/index.ts`.
- `src/git/worktreeCreateOps.ts`, `worktreeRemoveOps.ts`, `worktreeQueryOps.ts`,
  `worktreeProbeOps.ts`, `worktreeResetOps.ts` — export `worktree*Ops` namespaces; must be surfaced
  through `src/git/index.ts`.
- `src/git/repoWorkspace.ts` — workspace ops (`ensureRepoWorkspace`, `cloneRepo`, …), already
  exported from the barrel.
- `src/git/gitContext.ts` and all other `src/**/*.ts` (58 production modules, 36 test files) — every
  relative import specifier needs a `.js` extension.
- `src/providers/github/**`, `src/providers/gitlab/**`, `src/providers/jira/**` — adapter modules;
  their barrels (`index.ts`) are reached only from `"./providers"`.
- `vitest.config.ts` — `include: ['src/**/__tests__/**/*.test.ts']`; the new tests must live under a
  `__tests__/` directory to be picked up. No config change expected.
- `.github/workflows/ci.yml` — the existing `bun install` → `typecheck` → `test:unit` gate; extend
  with build + pack + consumer smoke steps.
- `.gitignore` — already ignores `dist/` and `*.tsbuildinfo`; no change expected (verify).
- `README.md` — owned by `.adw/conditional_docs.md` for "project overview / top-level usage summary";
  add install + entry-point usage and the build step to Setup.
- `.adw/commands.md` — currently records `Run Build: N/A`; must be updated to `bun run build`.
- `.adw/project.md` — "Framework Notes" states no build step exists and
  `moduleResolution: bundler`; update once the build lands.
- `LICENSE` — must be present in the packed tarball (it is, at repo root).
- `app_docs/ci-and-adw-config.md`, `app_docs/git-worktree-core.md`, `app_docs/forge-providers.md` —
  named as owners in `.adw/conditional_docs.md` for `.github/workflows/**`, `src/git/**` and the
  provider abstraction. The `app_docs/` directory does not currently exist; if it has been created
  by the time this is implemented, read and update those files. Otherwise skip (do not create them
  as part of this chore).

### New Files

- `src/index.ts` — root entry point; `export * from './providers/types.js';` and nothing else. Must
  not import any adapter or `forgeProviders`.
- `tsconfig.build.json` — extends `tsconfig.json`; `noEmit: false`, `declaration: true`,
  `declarationMap: true`, `sourceMap: true`, `outDir: "dist"`, `rootDir: "src"`, and an `exclude`
  that drops `src/**/__tests__/**`.
- `src/__tests__/importGraph.test.ts` — static import-graph walker asserting the `"./git"` and `"."`
  entry points reach no adapter module and no `forgeProviders`.
- `src/__tests__/packageExports.test.ts` — asserts the `exports` / `files` contract in
  `package.json` matches the three entry points and that every mapped target has a corresponding
  source file.
- `scripts/smokePackage.ts` — builds, packs, installs the tarball into a temp dir, then imports all
  three subpaths under both Node and Bun. Wired as `bun run smoke:package`.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Confirm the starting state is green

- Run `bun install`.
- Run `bun run typecheck` and `bun run test:unit`; both must pass before any change.
- Confirm `LICENSE` and `README.md` exist at the repo root.
- Record the baseline test count from `bun run test:unit` so a regression is visible later.

### 2. Add explicit `.js` extensions to every relative import specifier in `src/`

- Mechanical, but it must cover **all** forms: `import … from '…'`, `export … from '…'`,
  `export * from '…'`, `import type … from '…'`, and any bare `import '…'`. There are currently no
  dynamic `import('…')` calls and no `vi.mock('…')` calls in `src/` — re-verify with
  `grep -rnE "import\(['\"]\.|vi\.mock\(" src --include='*.ts'` before starting, and handle any that
  have appeared.
- Two cases:
  - **File imports** — `'./gitContext'` → `'./gitContext.js'`.
  - **Directory imports** — `'../../git'` → `'../../git/index.js'`, `'../github'` →
    `'../github/index.js'`. Distinguish them by checking whether `<resolved>.ts` or
    `<resolved>/index.ts` exists on disk; never guess.
- Apply to production modules **and** `__tests__/` files (36 test files) — the root `tsconfig.json`
  type-checks both.
- Do not touch bare package specifiers (`'path'`, `'child_process'`, `'fs'`, `'vitest'`).
- Verify no extensionless relative specifier remains:
  `grep -rhoE "from '\.[^']*'" src --include='*.ts' | grep -v "\.js'"` must print nothing.

### 3. Switch the compiler to NodeNext so the extension rule is enforced

- In `tsconfig.json`, set `"module": "NodeNext"` and `"moduleResolution": "NodeNext"`. Keep
  `target: ES2022`, `lib`, `types: ["node"]`, `strict`, `esModuleInterop`, `skipLibCheck`,
  `isolatedModules`, `resolveJsonModule`, `noEmit: true`, and the existing `include` / `exclude`.
- Run `bun run typecheck`. It must report **zero** errors.
- Expected error classes if step 2 was incomplete: `TS2835` (missing extension on a file import) and
  `TS2834` (missing `/index.js` on a directory import). A NodeNext probe on the unmodified tree
  produced 217 × TS2835 and 20 × TS2834, plus ~215 cascading `TS7006` / `TS2339` / `TS7031` /
  `TS2578` errors caused purely by unresolved modules degrading imported types to `any`. Those
  cascades disappear once the specifiers resolve — **do not "fix" them by adding type annotations or
  suppressions.** If any non-cascade error survives, fix it properly.

### 4. Run the unit suite to confirm the specifier change is behaviour-neutral

- Run `bun run test:unit`. All existing tests must pass, with the same count as the step-1 baseline.
- Vitest/Vite resolves a `./foo.js` specifier to the co-located `foo.ts`, so no test change is
  expected. If a test fails on resolution, fix the specifier — do not weaken the test.

### 5. Complete the `"./git"` public surface

- In `src/git/index.ts`, add the ops the issue names that are not yet exported:
  `claimOps` from `./claimOps.js`, and the worktree op namespaces `worktreeCreateOps`,
  `worktreeRemoveOps`, `worktreeQueryOps`, `worktreeProbeOps`, `worktreeResetOps` from their
  respective modules.
- Keep the existing exports (`GitContext`, executor/port/logger types, `consoleLogger`,
  `killProcessesInDirectory`, the bootstrap readers, the `repoWorkspace` workspace ops, and the
  `WorktreeForIssueResult` / `WorktreeRegistration` / `LogSinceOptions` types) exactly as they are.
- Add nothing from `src/providers/` — the barrel must stay adapter-free.
- Update the file's header docblock if the ops addition makes it inaccurate; leave the
  bootstrap-exception commentary intact.

### 6. Create the root entry point `src/index.ts`

- Contents: a short docblock explaining that the root entry is the forge ports and domain model only
  (adapters live behind `"./providers"`, the git core behind `"./git"`), then
  `export * from './providers/types.js';`.
- No other import. In particular do not re-export `./providers/index.js`, `./forgeProviders.js`, or
  any adapter — that would break the "root import pulls no adapter module" criterion.

### 7. Add `tsconfig.build.json`

- `{ "extends": "./tsconfig.json", "compilerOptions": { "noEmit": false, "declaration": true,
  "declarationMap": true, "sourceMap": true, "outDir": "dist", "rootDir": "src" },
  "include": ["src/**/*.ts"], "exclude": ["node_modules", "dist", "src/**/__tests__/**"] }`.
- Tests must be excluded so `dist/` contains no test code and no test-only import of
  `providers/github/githubTokenProvider` from the git tree.

### 8. Wire `package.json`

- Add scripts:
  - `"clean": "node -e \"require('node:fs').rmSync('dist',{recursive:true,force:true})\""` — a
    dependency-free, cross-platform clean (avoids adding `rimraf`).
  - `"build": "bun run clean && tsc -p tsconfig.build.json"`.
  - `"smoke:package": "bunx tsx scripts/smokePackage.ts"`.
  - `"prepack": "bun run build"` so a packed or published artifact is never stale.
- Add the entry-point metadata:
  - `"main": "./dist/index.js"`, `"types": "./dist/index.d.ts"` (legacy resolver fallback).
  - `"exports"`:
    - `"."` → `{ "types": "./dist/index.d.ts", "import": "./dist/index.js", "default": "./dist/index.js" }`
    - `"./providers"` → `{ "types": "./dist/providers/index.d.ts", "import": "./dist/providers/index.js", "default": "./dist/providers/index.js" }`
    - `"./git"` → `{ "types": "./dist/git/index.d.ts", "import": "./dist/git/index.js", "default": "./dist/git/index.js" }`
    - `"./package.json"` → `"./package.json"` (conventional; keeps tooling that reads it working).
    - Put `"types"` first in each condition object — condition order is significant.
  - `"files": ["dist", "README.md", "LICENSE"]`.
  - `"sideEffects": false` — the modules are pure declarations/factories, so a consumer's bundler can
    tree-shake `"./providers"` down to the adapter actually used.
  - `"publishConfig": { "access": "public" }` — required for a scoped package.
  - `"engines": { "node": ">=20" }` — the emitted ESM targets ES2022 and relies on the Node ESM
    resolver.
- Leave `name`, `version`, `type: "module"`, `license`, `repository`, `description` untouched.

### 9. Add the import-graph assertion test

- Create `src/__tests__/importGraph.test.ts`.
- Implement a small static walker: start from an entry file, read it with `node:fs`, extract every
  relative specifier with a regex over `from '…'` / `import '…'`, resolve each against the importing
  file's directory (mapping the `.js` extension back to `.ts`, and `/index.js` to `/index.ts`), and
  recurse with a visited set. Return the set of repo-relative file paths reached.
- Assertions:
  - From `src/git/index.ts`: no reached path starts with `src/providers/` (this covers all three
    adapters **and** `forgeProviders.ts`), with a failure message listing the offenders.
  - From `src/index.ts`: no reached path is under `src/providers/github/`, `src/providers/gitlab/`
    or `src/providers/jira/`, and `src/providers/forgeProviders.ts` is not reached.
  - Positive control, so the walker cannot silently pass by reaching nothing: from
    `src/providers/index.ts` the reached set **does** include `src/providers/forgeProviders.ts` and
    at least one file under each adapter directory; and the git walk reaches more than one file.
- The walker must read from `src/`, not `dist/`, so the assertion runs in the normal `test:unit`
  gate without requiring a build.

### 10. Add the package-manifest contract test

- Create `src/__tests__/packageExports.test.ts`, reading `package.json` from disk.
- Assert: exactly the four documented `exports` keys are present; each subpath's `types` / `import`
  targets point under `dist/`; every mapped target has a corresponding source file
  (`dist/index.js` ↔ `src/index.ts`, `dist/providers/index.js` ↔ `src/providers/index.ts`,
  `dist/git/index.js` ↔ `src/git/index.ts`); `files` is exactly `["dist", "README.md", "LICENSE"]`
  and contains no `src`; `type` is `"module"`.
- This keeps the manifest contract enforced by CI without needing a build in the unit gate.

### 11. Add the packed-tarball consumer smoke script

- Create `scripts/smokePackage.ts`, run via `bunx tsx` (per `.adw/commands.md` → Script Execution).
- Behaviour:
  1. Run `bun run build`.
  2. Assert `dist/index.js`, `dist/index.d.ts`, `dist/providers/index.js`,
     `dist/providers/index.d.ts`, `dist/git/index.js`, `dist/git/index.d.ts` all exist.
  3. Run `npm pack --dry-run --json` and assert **no** listed entry path starts with `src/`, and
     that `README.md` and `LICENSE` are present.
  4. Run `npm pack --pack-destination <tmpdir>` to produce a real tarball.
  5. In a fresh temp consumer directory with its own `package.json` (`"type": "module"`), install
     the tarball with `npm install <tarball>` — do not reuse the workspace's `node_modules`.
  6. Run the Node consumer: `node --input-type=module -e "…"` importing `'@paysdoc/devplatform'`,
     `'@paysdoc/devplatform/providers'` and `'@paysdoc/devplatform/git'`, asserting a representative
     symbol from each (`BoardStatus` from `.`, `forgeProviders` from `./providers`, `GitContext`
     from `./git`).
  7. Repeat the same three imports with `bun -e …`.
  8. Clean up the temp directories; exit non-zero with a clear message on any failure.
- Keep the script dependency-free (Node built-ins only) so it runs on a bare CI runner.
- Run `bun run smoke:package` locally and make it pass.

### 12. Extend CI without breaking the existing gate

- In `.github/workflows/ci.yml`, keep the existing `check` job exactly as-is
  (`bun install` → `bun run typecheck` → `bun run test:unit`) so the required status check keeps its
  name and stays green.
- Add a second job `package` on the same triggers that runs `bun install`, `bun run build`,
  `npm pack --dry-run`, and `bun run smoke:package`. It needs both Bun and Node on the runner: use
  `oven-sh/setup-bun@v2` **and** `actions/setup-node@v4` (Node 20 or 22) so the Node consumer leg is
  real rather than Bun-shimmed.
- Do not touch `.github/workflows/release.yml` — release automation is a separate issue.

### 13. Update documentation and ADW metadata

- `README.md`: add an **Install** section (`bun add @paysdoc/devplatform` / `npm i …`) documenting
  the three entry points with a one-line import example each, and add `Build: bun run build` to the
  Setup steps. Update the Project Structure block to mention `src/index.ts`, `tsconfig.build.json`,
  `scripts/smokePackage.ts`, and `dist/` (build output, gitignored).
- `.adw/commands.md`: change `## Run Build` from `N/A …` to `bun run build`.
- `.adw/project.md`: update **Framework Notes** — a build step now exists
  (`tsc -p tsconfig.build.json` → `dist/`), and `moduleResolution` is `NodeNext`, not `bundler`. Add
  `src/index.ts`, `tsconfig.build.json` and `scripts/smokePackage.ts` to **Relevant Files**.
- If `app_docs/ci-and-adw-config.md`, `app_docs/git-worktree-core.md` or
  `app_docs/forge-providers.md` exist at implementation time, update them for the new CI job and the
  widened `src/git/index.ts` surface. Do not create them if absent.
- Confirm `.gitignore` still covers `dist/` and `*.tsbuildinfo` (it does) and that no build output
  or tarball is staged for commit.

### 14. Run the validation commands

- Execute every command in the `Validation Commands` section below, in order. All must exit zero.
- Confirm `git status` shows no `dist/` or `*.tgz` artifacts staged.

## Validation Commands

Execute every command to validate the chore is complete with zero regressions.

- `bun install` — dependencies resolve cleanly.
- `bun run typecheck` — `tsc --noEmit` under NodeNext over `src/` including tests; zero errors. This
  is the enforcement that every relative import carries an explicit extension.
- `bun run test:unit` — full Vitest suite including the new `importGraph` and `packageExports`
  tests; zero failures and no drop from the pre-change test count.
- `bun run build` — emits `dist/`; zero errors.
- `test -f dist/index.js && test -f dist/index.d.ts && test -f dist/providers/index.js && test -f dist/providers/index.d.ts && test -f dist/git/index.js && test -f dist/git/index.d.ts && echo 'OK: all three entry points emitted with declarations'`
- `npm pack --dry-run 2>&1 | grep -q ' src/' && { echo 'FAIL: src/ in tarball'; exit 1; } || echo 'OK: no src/ in tarball'`
- `npm pack --dry-run 2>&1 | grep -E 'README.md|LICENSE'` — README and LICENSE are packed.
- `bun run smoke:package` — builds, packs, installs the tarball into a clean temp consumer, and
  resolves all three subpaths under **both** `node` and `bun`.
- `node -e "const p=require('./package.json'); const k=Object.keys(p.exports).sort(); if(JSON.stringify(k)!==JSON.stringify(['.','./git','./package.json','./providers'])){console.error('exports keys wrong:',k);process.exit(1)} console.log('exports map OK')"`
- `grep -rhoE "from '\.[^']*'" src --include='*.ts' | grep -v "\.js'" | head` — must print nothing.

## Notes

- **No coding-guidelines file exists in this repo.** Neither `.adw/coding_guidelines.md` nor
  `guidelines/coding_guidelines.md` is present, so there is no project style document to conform to.
  Match the surrounding code instead: named exports only, `export type` for type-only re-exports,
  `interface` for object shapes, DI via a `*Deps` parameter object, and the existing docblock style
  on barrel files. If a guidelines file appears before implementation, follow it strictly and
  refactor touched files to match.
- **No linter is configured**, so `bun run lint` does not exist — the validation list above omits it
  deliberately. Do not add a linter as part of this chore.
- **`bun run test` is a naming quirk**: it runs `tsc --noEmit`, not the suite. The real suite is
  `bun run test:unit`. Leave the quirk alone; it is out of scope.
- **The extension codemod is the risky part of this chore.** It touches ~237 specifiers across ~94
  files. Do it as one mechanical pass and let `bun run typecheck` (step 3) prove completeness —
  NodeNext turns every miss into a hard error, so there is no need to eyeball each file. Resist
  hand-editing individual specifiers after the pass; re-run the codemod instead.
- **Why not a bundler**: the issue specifies `tsc`, and `tsc` emits import specifiers verbatim. That
  is what forces step 2. A bundler (tsup/esbuild) would rewrite specifiers automatically but is
  explicitly out of scope here.
- **`moduleResolution: bundler` would also work** with `.js` specifiers (verified), but it does not
  *enforce* them, so a future extensionless import would pass typecheck and ship broken. NodeNext is
  chosen for the enforcement, which is what keeps the packaging criterion from silently regressing.
- **The `"./git"` layering criterion is already satisfied in production code** — no module under
  `src/git/` imports from `src/providers/`. Six files under `src/git/__tests__/` import
  `createLiteralTokenProvider` from `../../providers/github/githubTokenProvider`; that is test-only,
  excluded from `tsconfig.build.json`, and therefore absent from `dist/` and from the import-graph
  walk (which starts at `src/git/index.ts`). Do not refactor those tests as part of this chore.
- **This issue is marked blocked by #4.** Confirm #4 has landed on the branch point before
  implementing; if `src/providers/types.ts` or the adapter barrels differ from what this plan
  describes, re-derive the entry-point export lists from the actual source rather than from this
  document.
- **Do not publish.** This chore stops at "packable and verified". `npm publish` and semantic-release
  belong to the separate release-automation issue that `.github/workflows/release.yml` reserves.
