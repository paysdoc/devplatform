# Chore: Release automation with agent-prefixed commit parser

## Metadata
issueNumber: `2`
adwId: `9xqejz-release-automation-w`
issueJson: `{"number":2,"title":"Release automation with agent-prefixed commit parser","body":"**Parent PRD:** `paysdoc/AI_Dev_Workflow` `specs/prd/gitcontext-library-extraction.md`\n\n\n**What to build:** semantic-release on push to `main`. `parserOpts.headerPattern`\naccepts an optional `<agent-name>: ` prefix before the conventional type, e.g.\n`build-agent: feat: …` → minor, `review-patch-agent: fix: …` → patch,\n`plan-orchestrator: chore: …` → no release, plain `feat: …` → minor. Unit tests\nfor the pattern; a CI dry-run job (`semantic-release --dry-run`) on PRs so a\nnever-publishing configuration is caught before merge. Publishing via OIDC\ntrusted publishing (`id-token: write`), falling back to `NPM_TOKEN` if the\nsecret is present. The baseline is the hand-pushed `v1.0.0` tag from the\nfirst manual publish; the workflow must never recompute 1.0.0.\n\n**Acceptance criteria:**\n- [ ] Parser unit tests cover agent-prefixed and plain commits for patch, minor, and none\n- [ ] PR dry-run job shows the computed next version in the log\n- [ ] First CI-driven release after 1.0.0 publishes `1.0.1` or `1.1.0` from a real merged commit\n- [ ] No long-lived broad npm credential in the repository\n\n**User stories:** 16, 17, 18, 19, 20.\n\n\n## Blocked by\n\n- #1\n","state":"OPEN","author":"paysdoc","labels":[],"createdAt":"2026-09-10T10:25:54Z","comments":[],"actionableComment":null}`

## Chore Description

Issue #1 (merged in `fee68b9`) made this repository publishable: `bun run build` emits `dist/`, the
`exports`/`files` contract is enforced by a unit test, and CI type-checks, unit-tests, builds, packs
and smoke-tests the tarball. What is still missing is *release automation* —
`.github/workflows/release.yml` is a literal placeholder that echoes
`"Release automation is configured by issue L2."`, and `package.json` carries the
semantic-release sentinel version `0.0.0-development` with no tooling that consumes it.

This chore wires up semantic-release. Four things make it non-standard:

1. **Agent-prefixed commit headers.** This repository's commits are produced by ADW agents and carry
   an agent name before the conventional type — `build-agent: feat: add forgeProviders assembly`,
   `review-patch-agent: feat: split forgeProviders assembly test suites`,
   `plan-orchestrator: chore: expand README`, `document-agent: chore: document package build`. The
   stock conventional header pattern does **not** match these, so every agent commit currently
   parses as `type: null` → **no release ever**. That is precisely the "never-publishing
   configuration" the issue asks CI to catch. `parserOpts.headerPattern` (and, for `!`-style
   breaking changes, `parserOpts.breakingHeaderPattern`) must therefore accept an *optional*
   `<agent-name>: ` prefix while still matching plain `feat: …` headers unchanged.

   The prefix is constrained to a **hyphenated lowercase token** (`[a-z0-9]+(?:-[a-z0-9]+)+`).
   Every real agent name qualifies (`build-agent`, `review-patch-agent`, `plan-orchestrator`,
   `document-agent`); no conventional type does (`feat`, `fix`, `chore`, `docs`, `perf`, `refactor`,
   `test`, `build`, `ci`, `style`, `revert` contain no hyphen). This keeps a header such as
   `feat: fix: something` from being misread as agent `feat`.

2. **A single source of truth for the pattern, importable by tests.** The pattern is defined once in
   a root `release.config.js` and both the parser unit tests and semantic-release read that same
   object, so a test can never pass against a pattern the release does not use. Because
   `tsconfig.json` currently includes only `src/**/*.ts`, the config file must be added to the
   type-check program with `allowJs` so a `src/__tests__/*.test.ts` file may import it.
   `tsconfig.build.json` pins its own `include`/`rootDir`, so `dist/` is unaffected, and the
   `files` allow-list (`["dist", "README.md", "LICENSE"]`) already keeps the config out of the
   tarball.

3. **A PR dry-run gate that prints the computed next version.** A `release-dry-run` job on
   `pull_request` runs semantic-release in dry-run mode against the PR branch and echoes the
   computed next version, so a configuration that would never publish is visible before merge.
   The dry run must need **no secrets**: the publish plugins (`@semantic-release/npm`,
   `@semantic-release/github`) are omitted in dry-run mode, leaving the analyzer and notes
   generator — the parts that decide whether a release happens at all.

4. **A 1.0.0 baseline that is never recomputed.** There are currently **no tags in the repository**
   (`git ls-remote --tags origin` returns nothing). With no tag reachable, semantic-release would
   compute the first release as `1.0.0` and try to republish over the hand-published `1.0.0`. The
   baseline `v1.0.0` tag must exist on the manually published commit *before* the first automated
   run, and the release workflow must hard-fail if `refs/tags/v1.0.0` is not reachable after
   fetching tags — that guard makes "never recompute 1.0.0" structural rather than aspirational.

Publishing uses npm **OIDC trusted publishing** (`permissions: id-token: write`) with an
`NPM_TOKEN` fallback that engages only when the secret is present, so no long-lived npm credential
has to be stored in the repository.

## Relevant Files

Use these files to resolve the chore:

- `.github/workflows/release.yml` — the placeholder job to be replaced with the real
  semantic-release job (checkout with full history + tags, Node + bun setup, npm CLI upgrade for
  OIDC, `v1.0.0` baseline guard, `id-token: write`, `NPM_TOKEN` fallback, concurrency guard).
- `.github/workflows/ci.yml` — existing `check` and `package` jobs; gains a `release-dry-run` job
  that runs on `pull_request` only and prints the computed next version.
- `package.json` — version sentinel `0.0.0-development` (already correct for semantic-release);
  gains the semantic-release devDependencies and a `release:dry-run` script. Its `files`
  allow-list already excludes the new root config from the tarball; `prepack` (`bun run build`)
  is what `npm publish` will invoke during the release, so bun must be present on the release
  runner.
- `tsconfig.json` — `include` is `["src/**/*.ts"]` and `allowJs` is unset; both need adjusting so
  the unit test can import `release.config.js` without breaking `bun run typecheck`.
- `tsconfig.build.json` — read-only reference: it overrides `include` (`src/**/*.ts`) and pins
  `rootDir: src`, so the `tsconfig.json` change cannot leak the release config into `dist/`.
- `vitest.config.ts` — read-only reference: `include` is `src/**/__tests__/**/*.test.ts`, which is
  why the new tests live under `src/__tests__/`.
- `src/__tests__/packageExports.test.ts` — the style template for the new config-contract test:
  reads a manifest from the repo root, asserts a contract, no build required.
- `src/__tests__/importGraph.test.ts` — the second existing root-level contract test; confirms the
  `src/__tests__/` location convention for repo-wide (non-module) assertions.
- `scripts/smokePackage.ts` — the style template for the new dry-run wrapper script (Node built-ins
  only, `REPO_ROOT` via `fileURLToPath`, `fail()` helper, `console.log('==> …')` progress lines).
- `README.md` — states "Release automation is tracked as a separate issue in this repository", has a
  "**Release workflow placeholder**" bullet, and lists `workflows/release.yml  Release automation
  placeholder` plus the file tree in *Project Structure*; all three must be updated (conditional
  docs: README.md owns the top-level usage summary).
- `app_docs/ci-and-adw-config.md` — conditional doc that owns `.github/workflows/**`; does not exist
  yet and is produced by the documentation step after implementation.
- `.adw/commands.md` — source of the validation commands (no linter is configured in this repo;
  `bun run typecheck` and `bun run test:unit` are the gates).

### New Files

- `release.config.js` — root ESM semantic-release configuration (the package is `"type": "module"`).
  Exports `branches: ['main']`, `tagFormat: 'v${version}'`, a shared `parserOpts` object (with the
  agent-prefix-aware `headerPattern` and `breakingHeaderPattern`), and the plugin list. Plugins are
  assembled conditionally: `@semantic-release/commit-analyzer` and
  `@semantic-release/release-notes-generator` always, plus `@semantic-release/npm` and
  `@semantic-release/github` only when the dry-run env flag is unset. `parserOpts` is passed to both
  the analyzer and the notes generator so headers parse identically in both.
- `scripts/releaseDryRun.ts` — spawns semantic-release under Node with `--dry-run`, streams and
  captures its output, extracts and prints the computed next version, and fails if that version is
  `1.0.0` (the recompute-the-baseline failure mode) or if semantic-release exits non-zero. Exits 0
  with an explicit "no release would be triggered" line when the branch legitimately carries only
  non-releasing commits.
- `src/__tests__/releaseParser.test.ts` — parser unit tests: direct `headerPattern` /
  `breakingHeaderPattern` regex assertions plus end-to-end release-type assertions driving
  `analyzeCommits` from `@semantic-release/commit-analyzer` with the real `parserOpts`.
- `src/__tests__/releaseConfig.test.ts` — configuration contract test: branch list, tag format,
  plugin order and identity in both normal and dry-run mode, and that the same `parserOpts`
  instance reaches both the analyzer and the notes generator.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Establish the `v1.0.0` baseline tag

- Confirm the current state: `git ls-remote --tags origin` — at planning time this returns **no
  tags**, so semantic-release would compute `1.0.0` on its first run.
- Identify the commit that was manually published as `1.0.0` (the tip of `main` at the time of the
  manual `npm publish`; `fee68b9` unless the operator states otherwise) and confirm the published
  version on npm with `npm view @paysdoc/devplatform version`.
- If `v1.0.0` is absent, create and push it against that commit:
  `git tag v1.0.0 <sha>` then `git push origin v1.0.0`. This is an outward-facing, hard-to-reverse
  action on a shared remote — confirm the target commit with the repository owner before pushing,
  and do not push a tag that already exists.
- Re-run `git ls-remote --tags origin` and verify `refs/tags/v1.0.0` is listed. Every later step
  assumes this tag exists; the workflow guard added in step 6 enforces it.

### 2. Add the semantic-release toolchain as devDependencies

- `bun add -d semantic-release @semantic-release/commit-analyzer @semantic-release/release-notes-generator @semantic-release/npm @semantic-release/github conventional-changelog-conventionalcommits`
- The analyzer, notes generator, npm and github plugins ship inside `semantic-release` but are
  declared explicitly because `src/__tests__/releaseParser.test.ts` imports `analyzeCommits`
  directly and because the OIDC behaviour depends on the `@semantic-release/npm` version.
- `conventional-changelog-conventionalcommits` is the peer package required by the
  `conventionalcommits` preset used below.
- Verify the resolved `@semantic-release/npm` version is **>= 12.0.2** (`bun pm ls | grep
  semantic-release`), the line from which npm trusted publishing (OIDC) is handled; if a lower
  version resolves, pin it explicitly.
- Confirm nothing landed in `dependencies` — this package must stay dependency-free at runtime.

### 3. Write `release.config.js`

- Create `release.config.js` at the repository root as ESM (`export default …`).
- Define the shared parser options once, above the export:
  - `headerPattern: /^(?:[a-z0-9]+(?:-[a-z0-9]+)+: )?(\w*)(?:\((.*)\))?!?: (.*)$/`
  - `breakingHeaderPattern: /^(?:[a-z0-9]+(?:-[a-z0-9]+)+: )?(\w*)(?:\((.*)\))?!: (.*)$/`
  - `headerCorrespondence: ['type', 'scope', 'subject']`
  - The agent prefix is a **non-capturing** group, so the correspondence array stays identical to
    the `conventionalcommits` preset's and no downstream plugin has to know about agents.
- Export the configuration:
  - `branches: ['main']`
  - `tagFormat: 'v${version}'` (matches the hand-pushed `v1.0.0`; state it explicitly rather than
    relying on the default).
  - `plugins`: `['@semantic-release/commit-analyzer', { preset: 'conventionalcommits', parserOpts }]`
    then `['@semantic-release/release-notes-generator', { preset: 'conventionalcommits', parserOpts }]`,
    then — only when `process.env.SEMANTIC_RELEASE_DRY_RUN !== 'true'` —
    `['@semantic-release/npm', {}]` and
    `['@semantic-release/github', { successComment: false, failComment: false }]`.
  - Leave the analyzer's `releaseRules` at the preset default (`feat` → minor, `fix` → patch,
    `perf` → patch, breaking → major, everything else → no release), which is exactly the mapping
    the issue specifies.
- Add a file-header comment in the repo's existing style explaining *why* the header pattern is
  non-standard (ADW agent-prefixed commits) and why the prefix must contain a hyphen.
- Do **not** add `@semantic-release/changelog` or `@semantic-release/git`: committing back to `main`
  would retrigger CI and is outside this chore's scope.

### 4. Make the config importable by the type-check program

- In `tsconfig.json`, add `"allowJs": true` to `compilerOptions` and extend `include` to
  `["src/**/*.ts", "release.config.js"]`.
- Do not set `checkJs` — the config is a plain JS module; TypeScript only needs to resolve and infer
  it so the test's import type-checks.
- Confirm `tsconfig.build.json` still overrides `include` to `["src/**/*.ts"]` with `rootDir: src`,
  so `bun run build` emits no `release.config.js` into `dist/` (verified in step 9).

### 5. Write the parser and configuration unit tests

- `src/__tests__/releaseParser.test.ts`:
  - Import the config: `import releaseConfig from '../../release.config.js'`, and pull `parserOpts`
    out of the `@semantic-release/commit-analyzer` plugin entry so the tests assert the *shipped*
    object, never a copy.
  - **Regex-level cases** against `headerPattern`, asserting the captured `type` (group 1) and
    `subject` (group 3):
    - `build-agent: feat: add forgeProviders assembly` → type `feat`
    - `review-patch-agent: fix: correct token resolution` → type `fix`
    - `plan-orchestrator: chore: expand README` → type `chore`
    - `document-agent: docs: document package build` → type `docs`
    - `feat: add worktree probe` → type `feat` (plain, unprefixed)
    - `fix: handle ENOENT` → type `fix`
    - `chore: bump deps` → type `chore`
    - `build-agent: feat(git): scoped subject` → type `feat`, scope `git`
    - `feat: fix: colon in the subject` → type `feat` (guards the hyphen constraint: `feat` must
      **not** be swallowed as an agent name)
    - `Merge pull request #6 from paysdoc/branch` → no match
  - **Breaking-change cases** against `breakingHeaderPattern`: `build-agent: feat!: drop legacy
    layer` and `feat(git)!: rename export` match; `build-agent: feat: normal` does not.
  - **Release-type cases** driving the real analyzer: import `{ analyzeCommits }` from
    `@semantic-release/commit-analyzer` and call it as
    `analyzeCommits({ preset: 'conventionalcommits', parserOpts }, { commits, logger, cwd,
    env: {}, options: {} })` with a no-op `logger` (`{ log() {}, error() {} }`). Assert:
    - `build-agent: feat: …` → `'minor'`
    - `review-patch-agent: fix: …` → `'patch'`
    - `plan-orchestrator: chore: …` → `null`
    - `document-agent: docs: …` → `null`
    - plain `feat: …` → `'minor'`, plain `fix: …` → `'patch'`, plain `chore: …` → `null`
    - `build-agent: feat!: …` → `'major'`
    - a commit whose body carries `BREAKING CHANGE: …` under an agent-prefixed header → `'major'`
    - the mixed set of all of the above in one call → `'major'` (highest wins)
    - a set containing only `plan-orchestrator: chore: …` and `document-agent: docs: …` → `null`,
      i.e. an ADW-only housekeeping batch does not publish
  - Build commit fixtures as `{ hash: '0'.repeat(40), message: '<header>\n\n<body>' }`; if the
    installed plugin exposes `analyzeCommits` as a default/CJS interop export rather than a named
    one, adapt the import rather than duplicating the analyzer's logic in the test.
- `src/__tests__/releaseConfig.test.ts` (mirroring `packageExports.test.ts`'s contract style):
  - `branches` is exactly `['main']` and `tagFormat` is `'v${version}'`.
  - In normal mode the plugin list is exactly, in order: commit-analyzer, release-notes-generator,
    `@semantic-release/npm`, `@semantic-release/github`.
  - With `SEMANTIC_RELEASE_DRY_RUN=true` the list is exactly commit-analyzer and
    release-notes-generator — no plugin that requires a credential. Re-import the module with a
    cache-busting query (`await import('../../release.config.js?dryrun')`) after setting the env var,
    and restore the env afterwards.
  - The analyzer and the notes generator receive the **same** `parserOpts` object identity.
  - `parserOpts.headerCorrespondence` is exactly `['type', 'scope', 'subject']`.
- Run `bun run test:unit` and iterate until green.

### 6. Replace the release workflow

- Rewrite `.github/workflows/release.yml`, keeping the filename (it is referenced by the npm trusted
  publisher configuration):
  - Trigger: `push: branches: [main]`, plus `workflow_dispatch` for manual re-runs.
  - `concurrency: { group: release, cancel-in-progress: false }` so two pushes cannot release
    concurrently.
  - `permissions: { contents: write, issues: write, pull-requests: write, id-token: write }`.
  - Steps:
    1. `actions/checkout@v4` with `fetch-depth: 0` and `fetch-tags: true` — semantic-release needs
       the full history and every tag to locate the last release.
    2. **Baseline guard:** `git rev-parse -q --verify refs/tags/v1.0.0` and fail with an explicit
       message if the tag is missing, so a tagless repository can never republish `1.0.0`.
    3. `oven-sh/setup-bun@v2` (the `prepack` script shells out to `bun run build` during
       `npm publish`, so bun must be on the runner).
    4. `actions/setup-node@v4` with `node-version: 22` and `registry-url:
       'https://registry.npmjs.org'`.
    5. `npm install -g npm@latest` and `npm --version` — npm **>= 11.5.1** is required for OIDC
       trusted publishing; print the version so the log proves it.
    6. `bun install --frozen-lockfile`.
    7. `bun run typecheck` and `bun run test:unit` — do not publish an untested tree.
    8. `node node_modules/semantic-release/bin/semantic-release.js` (run under Node, not bun, which
       is what semantic-release supports), with env `GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}` and
       `NPM_TOKEN: ${{ secrets.NPM_TOKEN }}`. An absent secret expands to the empty string, which
       semantic-release treats as unset — that *is* the "fall back to `NPM_TOKEN` only if the secret
       is present" behaviour, with OIDC used otherwise.
- Add a comment at the top of the workflow noting that the npm trusted publisher on npmjs.com must
  be linked to `paysdoc/devplatform` + `release.yml`, and that OIDC is what avoids storing a
  long-lived npm credential.

### 7. Add the PR dry-run script and CI job

- Create `scripts/releaseDryRun.ts` following `scripts/smokePackage.ts`'s conventions (Node
  built-ins only, `REPO_ROOT` from `fileURLToPath`, a `fail(message): never` helper, `==>` progress
  lines):
  - Resolve the branch to dry-run against: `process.env.DRY_RUN_BRANCH` (set to the PR head ref in
    CI) falling back to the current branch from `git rev-parse --abbrev-ref HEAD`.
  - Spawn `node node_modules/semantic-release/bin/semantic-release.js --dry-run --no-ci --branches
    <branch>` with `SEMANTIC_RELEASE_DRY_RUN=true` in the environment, inheriting stdout/stderr into
    the job log while also capturing the combined output.
  - Parse the captured output for `The next release version is <x.y.z>`; print
    `==> next release version: <x.y.z>` (this is what acceptance criterion 2 requires the log to
    show).
  - `fail(...)` if semantic-release exits non-zero, or if the computed version is exactly `1.0.0`
    (the baseline must never be recomputed).
  - When semantic-release reports no release, print
    `==> no release would be triggered by this branch` and exit `0` — a PR containing only
    `chore:`/`docs:` commits is a legitimate no-release, not a failure.
- Add the npm script `"release:dry-run": "bunx tsx scripts/releaseDryRun.ts"` to `package.json`,
  alongside the existing `smoke:package` entry.
- Add a `release-dry-run` job to `.github/workflows/ci.yml`:
  - `if: github.event_name == 'pull_request'`, `permissions: { contents: read }`, no secrets.
  - `actions/checkout@v4` with `fetch-depth: 0`, `fetch-tags: true`, and
    `ref: ${{ github.event.pull_request.head.sha }}`.
  - `oven-sh/setup-bun@v2`, `actions/setup-node@v4` (`node-version: 22`), `bun install`.
  - `bun run release:dry-run` with env `DRY_RUN_BRANCH: ${{ github.head_ref }}` and
    `GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}`.
  - Leave the existing `check` and `package` jobs untouched.

### 8. Update the README

- Replace the "Release automation is tracked as a separate issue in this repository." line with a
  statement that releases are automated by semantic-release on push to `main`.
- Replace the "**Release workflow placeholder**" bullet in *What it does* with a bullet describing
  the real behaviour: semantic-release on `main`, a commit parser that accepts an optional
  `<agent-name>: ` prefix (`build-agent: feat: …` → minor, `review-patch-agent: fix: …` → patch,
  `plan-orchestrator: chore: …` → no release), a PR dry-run gate that prints the computed next
  version, and OIDC trusted publishing with an `NPM_TOKEN` fallback.
- Update *Project Structure*: change `workflows/release.yml  Release automation placeholder` to
  describe the real job, note the dry-run job under `workflows/ci.yml`, and add entries for
  `release.config.js` and `scripts/releaseDryRun.ts`.
- Add a short "Releasing" section documenting the commit-message contract agents must follow
  (optional hyphenated agent prefix, then a conventional type) and the `v1.0.0` baseline.

### 9. Validate

- Run every command in the *Validation Commands* section below and confirm each exits zero.
- Additionally confirm `dist/` contains **no** `release.config.js` after `bun run build` (the
  `allowJs` change must not leak the config into the published output).
- Confirm `git status` shows no unintended changes to `bun.lock` beyond the new devDependencies.

## Validation Commands

Execute every command to validate the chore is complete with zero regressions.

- `bun install` — install the new semantic-release devDependencies and refresh `bun.lock`.
- `bun run typecheck` — TypeScript strict-mode check across `src/**/*.ts` plus `release.config.js`;
  must report zero errors (no linter is configured in this repository).
- `bun run test:unit` — full Vitest suite, including the new `src/__tests__/releaseParser.test.ts`
  and `src/__tests__/releaseConfig.test.ts`; all tests must pass with no pre-existing test lost.
- `bun run build` — `tsc -p tsconfig.build.json` must emit `dist/**/*.js` + `dist/**/*.d.ts` with no
  errors.
- `node -e "const fs=require('node:fs'); if (fs.existsSync('dist/release.config.js')) { console.error('FAIL: release config leaked into dist/'); process.exit(1); } console.log('OK: dist/ is clean');"`
  — proves the `allowJs` change did not widen the build output.
- `bun run smoke:package` — existing packed-tarball gate under Node and Bun; must still pass.
- `node --input-type=module -e "const c=(await import('./release.config.js')).default; if(!Array.isArray(c.plugins)||c.plugins.length!==4){console.error('FAIL: plugin list');process.exit(1);} console.log('OK: release config loads,', c.plugins.length, 'plugins, branches', c.branches.join(','));"`
  — proves the config is loadable ESM with the full publishing plugin chain outside dry-run mode.
- `bun run release:dry-run` — runs `semantic-release --dry-run` against the current branch and
  prints the computed next version. Requires network access and a `GITHUB_TOKEN` in the
  environment; if run locally without one, treat the CI `release-dry-run` job on the pull request
  as the authoritative execution of this command and say so explicitly rather than reporting it as
  passed.

## Notes

- No `.adw/coding_guidelines.md` (nor a `guidelines/coding_guidelines.md` fallback) exists in this
  repository, so follow the conventions already visible in the code: a `/** … */` file-header
  comment stating each module's purpose, `node:`-prefixed built-in imports, explicit `.js`
  extensions on every relative specifier (`moduleResolution: NodeNext` enforces this at type-check
  time), and no `process.env` reads inside `src/` library code — the new env reads live only in
  `release.config.js` and `scripts/releaseDryRun.ts`, both outside the shipped graph.
- **Verify the OIDC path against the installed plugin version.** `@semantic-release/npm` gained npm
  trusted-publishing support in 12.0.2; if the resolved version still demands `NPM_TOKEN` when
  `id-token: write` is granted, the workflow's unconditional `NPM_TOKEN: ${{ secrets.NPM_TOKEN }}`
  env line is the documented fallback and the trusted-publisher link on npmjs.com is what removes
  the need for the secret. Do not report OIDC as working until a real release run proves it.
- **The dry run deliberately exercises only the analyzer and notes generator.** That is what makes
  it secret-free and therefore safe on fork PRs, and version computation is exactly the
  never-publishing failure mode the issue names. npm and GitHub credentials are first exercised by
  the release job on `main`; this is inherent, since secrets are unavailable to fork pull requests.
- **Acceptance criterion 3 cannot be verified inside this PR.** "First CI-driven release after 1.0.0
  publishes 1.0.1 or 1.1.0" is only observable after this branch merges to `main`. What *can* be
  verified pre-merge: the `v1.0.0` tag exists, the dry-run job prints a next version that is not
  `1.0.0`, and the workflow's baseline guard fails closed without the tag. Report it that way
  instead of claiming a publish that has not happened.
- Merging this PR will itself trigger the new release workflow. The merge commit's constituent
  commits determine the version: a `feat:`-typed commit yields `1.1.0`, a `fix:` yields `1.0.1`,
  and a purely `chore:`-typed set yields no release at all. Since this chore is `chore:`-typed by
  convention, expect **no** release from this merge — that is correct behaviour and not a
  configuration failure. Note it in the PR description so the absence of a publish is not
  misdiagnosed.
- `.github/workflows/release.yml` must keep its filename: the npm trusted publisher is linked to a
  specific repository *and workflow filename*, and renaming the file silently breaks OIDC.
- Conditional docs: this change touches `.github/workflows/**` (owned by
  `app_docs/ci-and-adw-config.md`, which does not exist yet and should be created by the
  documentation step) and the README's top-level usage summary (owned by `README.md`).
