# Patch: Pin the conventionalcommits preset to 9.x so `generateNotes` renders under the stable notes generator

## Metadata
adwId: `9xqejz-release-automation-w`
reviewChangeRequest:
```text
Issue #1: The release pipeline aborts before publishing: conventional-changelog-conventionalcommits@10.4.0 (devDependency) refuses to render under conventional-changelog-writer@8.4.0, which is what @semantic-release/release-notes-generator@14.1.1 depends on (latest stable; only 15.0.0-beta.x targets a newer writer). Evidence: `bun run release:dry-run` under a simulated push-to-main GitHub Actions environment passed branch resolution and push-auth, analyzed 173 real commits ("Analysis of 173 commits complete: minor release", proving the agent-prefixed parser works on real history), then failed in step generateNotes with `Missing helper: "conventional-changelog-conventionalcommits requires conventional-changelog-writer@9 or newer ..."` and exited 1 (full log: /tmp/adw-review-expB.log). Reproduced offline by calling generateNotes from @semantic-release/release-notes-generator with the shipped plugin config from release.config.js. On a real push to main the Release job would fail at generateNotes after analyzeCommits and never reach publish, i.e. the never-publishing configuration the issue asks CI to catch. The unit tests do not catch this because they only exercise the analyzer.
Resolution: Pin `conventional-changelog-conventionalcommits` to `^9.3.1` in package.json devDependencies and refresh bun.lock (verified during review: with 9.3.1 installed, generateNotes renders agent-prefixed feat/fix commits under Features/Bug Fixes and all 874 unit tests still pass; the review restored the committed 10.4.0 afterwards). Add a unit test in src/__tests__/releaseConfig.test.ts that drives `generateNotes` from `@semantic-release/release-notes-generator` with the shipped release-notes-generator plugin config so preset/writer drift fails at unit level.
```

## Issue Summary
**Original Spec:** `specs/issue-2-adw-9xqejz-release-automation-w-sdlc_planner-release-automation-agent-prefixed-parser.md`

**Issue:** `package.json` pins `conventional-changelog-conventionalcommits@^10.4.0`, but the 10.x line of
that preset only renders under `conventional-changelog-writer@9`. The notes plugin actually shipped by
`semantic-release@25` is `@semantic-release/release-notes-generator@14.1.1` (the latest stable; only
`15.0.0-beta.x` targets writer 9), and it depends on `conventional-changelog-writer@^8.0.0` (8.4.0 is
installed). The analyzer step succeeds (it only uses the preset's *parser* options), so the release
job on `main` would get past `analyzeCommits` and then die in `generateNotes` with
`Missing helper: "conventional-changelog-conventionalcommits requires conventional-changelog-writer@9 or newer …"`,
never reaching `publish`. That is exactly the never-publishing configuration the issue asks CI to
catch, and neither `releaseParser.test.ts` nor `releaseConfig.test.ts` exercises the notes generator,
so the unit suite stays green.

Reproduced during patch planning against the committed tree (10.4.0): calling `generateNotes` from
`@semantic-release/release-notes-generator` with `releaseConfig.plugins[1][1]` throws the
`Missing helper` error. Re-run in a scratch install with `^9.3.1`: the same call resolves and renders
`### Features` / `### Bug Fixes` sections, with the `build-agent: ` / `review-patch-agent: ` prefix
stripped from the bullet subjects and the `chore:` commit omitted. The writer stays at 8.4.0.

**Solution:** Downgrade the preset devDependency to `^9.3.1` (the last major that renders under
writer 8), refresh `bun.lock`, and add a unit test to `src/__tests__/releaseConfig.test.ts` that
drives the real `generateNotes` with the shipped notes-generator plugin config, so any future
preset/writer drift (e.g. a dependency-bump PR moving the preset back to 10.x) fails at unit level
instead of on the first push to `main`. Because the notes generator ships no type declarations, a
small ambient module shim is added next to the existing `semantic-release-commit-analyzer.d.ts`.

Approaches considered and rejected (all larger or riskier than the pin):
- Move to `@semantic-release/release-notes-generator@15.0.0-beta.x` (writer 9): pre-release, and
  `semantic-release@25` would still bundle its own 14.x copy.
- Force `conventional-changelog-writer@9` via a package-manager override: breaks the writer wrapper
  inside the stable notes generator, which is written against the writer 8 API.
- Switch `preset` to `angular`: changes the release-notes format and diverges from the spec.

## Files to Modify
Use these files to implement the patch:

- `package.json` — change `"conventional-changelog-conventionalcommits": "^10.4.0"` to `"^9.3.1"`
  in `devDependencies` (one line; nothing else in the manifest changes).
- `bun.lock` — refreshed by the install: the workspace specifier moves to `^9.3.1`, the resolved
  entry becomes `conventional-changelog-conventionalcommits@9.3.1` (dependency `compare-func`), and
  the now-orphaned `@conventional-changelog/template` entry is pruned. Must be committed because
  `release.yml` installs with `--frozen-lockfile`.
- `src/__tests__/releaseConfig.test.ts` — add a `describe` block that renders release notes with the
  real `generateNotes` and the shipped plugin config.
- `src/__tests__/semantic-release-release-notes-generator.d.ts` (**new**) — ambient `declare module`
  for `@semantic-release/release-notes-generator`, covering only the `generateNotes` shape the test
  uses, mirroring the existing `semantic-release-commit-analyzer.d.ts`. Picked up by
  `tsconfig.json`'s `src/**/*.ts` include; excluded from `dist/` by `tsconfig.build.json`'s
  `__tests__` exclusion.

Do **not** touch `release.config.js`, `conventional-changelog-writer`,
`@semantic-release/release-notes-generator`, the workflows, or the README — none of them reference
the preset version, and the fix is entirely a dependency pin plus a guarding test.

## Implementation Steps
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Pin the preset to 9.x and refresh the lockfile
- Run `bun add -d conventional-changelog-conventionalcommits@^9.3.1` (the project's documented
  dev-dependency install command). Confirm `package.json` now reads
  `"conventional-changelog-conventionalcommits": "^9.3.1"` under `devDependencies` and that
  `dependencies` still does not exist (the package must stay dependency-free at runtime).
- Verify the resolution:
  `node -p "require('./node_modules/conventional-changelog-conventionalcommits/package.json').version"`
  prints `9.3.1` (or a later 9.x) and
  `node -p "require('./node_modules/conventional-changelog-writer/package.json').version"` still
  prints `8.4.0` — the writer is owned by `@semantic-release/release-notes-generator@14.1.1` and
  must **not** be bumped.
- Check `git diff bun.lock`: expect only the specifier line, the
  `conventional-changelog-conventionalcommits` resolved entry (now `9.3.1` with `compare-func`), and
  the removal of `@conventional-changelog/template`. Any other lockfile churn is unintended.

### Step 2: Add the ambient type shim for the notes generator
- Create `src/__tests__/semantic-release-release-notes-generator.d.ts` with the same file-header
  style as `semantic-release-commit-analyzer.d.ts` (explain that the package ships no declarations
  and this covers only what `releaseConfig.test.ts` exercises). Declare:

```ts
declare module '@semantic-release/release-notes-generator' {
  interface GenerateNotesCommit {
    hash: string;
    message: string;
  }

  interface GenerateNotesLogger {
    log(...args: unknown[]): void;
    error(...args: unknown[]): void;
  }

  interface GenerateNotesRelease {
    version?: string;
    gitTag?: string;
    gitHead?: string;
    type?: string;
  }

  interface GenerateNotesContext {
    commits: GenerateNotesCommit[];
    logger: GenerateNotesLogger;
    cwd: string;
    env: Record<string, string | undefined>;
    options: { repositoryUrl: string } & Record<string, unknown>;
    lastRelease: GenerateNotesRelease;
    nextRelease: GenerateNotesRelease;
  }

  interface GenerateNotesPluginConfig {
    preset?: string;
    parserOpts?: Record<string, unknown>;
    writerOpts?: Record<string, unknown>;
  }

  export function generateNotes(
    pluginConfig: GenerateNotesPluginConfig,
    context: GenerateNotesContext,
  ): Promise<string>;
}
```

### Step 3: Add the `generateNotes` drift test to `src/__tests__/releaseConfig.test.ts`
- Add `import { generateNotes } from '@semantic-release/release-notes-generator';` next to the
  existing imports, and extend the file-header comment with one sentence: the notes-generator block
  exists because the `conventionalcommits` preset major must match the writer major bundled by the
  stable `@semantic-release/release-notes-generator` (preset 10.x needs writer 9; the stable plugin
  ships writer 8), and only rendering real notes catches that drift.
- Append a new `describe('release.config.js — release notes render under the shipped preset', …)`
  block that pulls the notes-generator plugin config from `releaseConfig.plugins[1]` (the shipped
  object, never a copy) and drives the real plugin:

```ts
describe('release.config.js — release notes render under the shipped preset', () => {
  const [, notesConfig] = releaseConfig.plugins[1] as [string, { preset: string; parserOpts: Record<string, unknown> }];
  const noopLogger = { log() {}, error() {} };

  async function render(headers: string[]): Promise<string> {
    return generateNotes(notesConfig, {
      commits: headers.map((message, index) => ({ hash: String(index).repeat(40), message })),
      logger: noopLogger,
      cwd: process.cwd(),
      env: {},
      options: { repositoryUrl: 'https://github.com/paysdoc/devplatform.git' },
      lastRelease: { version: '1.0.0', gitTag: 'v1.0.0', gitHead: '0'.repeat(40) },
      nextRelease: { version: '1.1.0', gitTag: 'v1.1.0', gitHead: '1'.repeat(40), type: 'minor' },
    });
  }

  it('generateNotes renders agent-prefixed feat/fix commits under Features and Bug Fixes', async () => {
    const notes = await render([
      'build-agent: feat: add forgeProviders assembly',
      'review-patch-agent: fix: correct token resolution',
      'feat: add worktree probe',
    ]);

    expect(notes).toContain('### Features');
    expect(notes).toContain('* add forgeProviders assembly');
    expect(notes).toContain('* add worktree probe');
    expect(notes).toContain('### Bug Fixes');
    expect(notes).toContain('* correct token resolution');
  });

  it('strips the agent prefix from rendered subjects and omits non-releasing chore commits', async () => {
    const notes = await render([
      'build-agent: feat: add forgeProviders assembly',
      'plan-orchestrator: chore: expand README',
    ]);

    expect(notes).not.toContain('build-agent:');
    expect(notes).not.toContain('plan-orchestrator:');
    expect(notes).not.toContain('expand README');
  });
});
```

- Do not assert on the date or the compare-link line of the rendered header — both vary; the
  section headings and bullet subjects are the stable contract.
- Under the committed 10.4.0 preset this block rejects with the `Missing helper` error, which is the
  drift signal; under 9.3.1 both cases pass.

### Step 4: Run the validation commands below and confirm zero regressions
- The unit suite must grow from 874 to 876 tests across 40 files, with no pre-existing test lost.
- Confirm `git status` shows exactly four changed paths: `package.json`, `bun.lock`,
  `src/__tests__/releaseConfig.test.ts`, and the new
  `src/__tests__/semantic-release-release-notes-generator.d.ts`.

## Validation
Execute every command to validate the patch is complete with zero regressions.

- `bun install` — must be a no-op after Step 1 (lockfile already refreshed); then
  `node -p "require('./node_modules/conventional-changelog-conventionalcommits/package.json').version + ' / writer ' + require('./node_modules/conventional-changelog-writer/package.json').version"`
  must print a `9.x` preset alongside writer `8.4.0`.
- `bun run typecheck` — TypeScript strict-mode check across `src/**/*.ts` (including the new `.d.ts`
  shim) plus `release.config.js`; must report zero errors (no linter is configured in this repo).
- `bun run test:unit` — full Vitest suite; expect `Test Files 40 passed`, `Tests 876 passed`,
  including the two new `generateNotes` cases in `src/__tests__/releaseConfig.test.ts`.
- `node --input-type=module -e "const { generateNotes } = await import('@semantic-release/release-notes-generator'); const cfg = (await import('./release.config.js')).default; const notes = await generateNotes(cfg.plugins[1][1], { commits: [{ hash: 'a'.repeat(40), message: 'build-agent: feat: add forgeProviders assembly' }, { hash: 'b'.repeat(40), message: 'review-patch-agent: fix: correct token resolution' }], logger: { log() {}, error() {} }, cwd: process.cwd(), env: {}, options: { repositoryUrl: 'https://github.com/paysdoc/devplatform.git' }, lastRelease: { version: '1.0.0', gitTag: 'v1.0.0', gitHead: '0'.repeat(40) }, nextRelease: { version: '1.1.0', gitTag: 'v1.1.0', gitHead: '1'.repeat(40), type: 'minor' } }); if (!notes.includes('### Features') || !notes.includes('### Bug Fixes')) { console.error('FAIL: notes missing sections\n' + notes); process.exit(1); } console.log('OK: generateNotes renders under the shipped preset\n' + notes);"`
  — the reviewer's offline reproduction, now expected to print the rendered notes instead of the
  `Missing helper` error.
- `bun run build` — `tsc -p tsconfig.build.json` must still emit `dist/` cleanly with no
  `release.config.js` or `__tests__` content leaking in.
- `bun run release:dry-run` — end-to-end `semantic-release --dry-run` against the current branch; it
  must now get past `generateNotes` and print the computed next version (or the explicit
  "no release would be triggered" line for a `chore:`-only branch). Requires network access and a
  `GITHUB_TOKEN`; if unavailable locally, treat the CI `release-dry-run` job on the pull request as
  the authoritative execution and say so explicitly rather than reporting it as passed.

## Patch Scope
**Lines of code to change:** ~100 (1 line in `package.json`, ~6 lines of `bun.lock` churn, ~45 lines
of test, ~40-line `.d.ts` shim)
**Risk level:** low
**Testing required:** `bun run typecheck` and `bun run test:unit` (874 → 876 tests) are the gates;
the offline `generateNotes` one-liner confirms the reviewer's reproduction is fixed, and the CI
`release-dry-run` job on the PR is the authoritative end-to-end proof that the pipeline now reaches
past `generateNotes`.
