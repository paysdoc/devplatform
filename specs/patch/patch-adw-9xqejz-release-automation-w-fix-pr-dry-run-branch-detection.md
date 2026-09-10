# Patch: Steer the PR dry-run at the PR head branch and let the push probe succeed

## Metadata
adwId: `9xqejz-release-automation-w`
reviewChangeRequest:
```text
Issue #2: The `release-dry-run` CI job in .github/workflows/ci.yml cannot show the computed next version on pull requests (acceptance criterion 2). (a) env-ci@11.2.0 derives semantic-release's current branch from GITHUB_REF, which on pull_request events is refs/pull/N/merge; `--no-ci` only skips the PR early-return, not branch detection. semantic-release therefore logs "This test run was triggered on the branch refs/pull/99/merge, while semantic-release is configured to only publish from <branch>, therefore a new version won't be published" and exits 0 (reproduced locally with a simulated pull_request environment), so scripts/releaseDryRun.ts prints "no release would be triggered by this branch" and the job passes vacuously on every PR, never computing a version and unable to catch a never-publishing configuration such as issue 1. (b) Once the branch mismatch is fixed, semantic-release still runs `git push --dry-run` via lib/git.js verifyAuth, which index.js calls unconditionally even in dry-run mode and turns into EGITNOPERMISSION when the checkout is at the remote head; with `permissions: contents: read`, GITHUB_TOKEN cannot use git-receive-pack, so the job would then fail on every same-repo PR.
Resolution: In scripts/releaseDryRun.ts, spawn semantic-release with env-ci steered at the PR head branch, e.g. add `GITHUB_EVENT_NAME: 'push'` and `GITHUB_REF: \`refs/heads/${branch}\`` to the child env (alternatively delete GITHUB_ACTIONS from the child env and check out `github.head_ref` by name so env-ci's git fallback resolves it). In .github/workflows/ci.yml give the `release-dry-run` job `permissions: contents: write` so semantic-release's push-permission probe succeeds (the dry run still publishes nothing; note in a comment that fork PRs receive a read-only token and will fail that probe). Then confirm on the pull request that the job log contains `==> next release version: x.y.z` or the explicit no-release line.
```

## Issue Summary
**Original Spec:** `specs/issue-2-adw-9xqejz-release-automation-w-sdlc_planner-release-automation-agent-prefixed-parser.md`

**Issue:** The `release-dry-run` job never computes a version on a pull request, so acceptance
criterion 2 ("PR dry-run job shows the computed next version in the log") is not met and the job
cannot catch a never-publishing configuration.

- (a) `scripts/releaseDryRun.ts` passes `--branches <head_ref>` but leaves the child environment
  untouched. On a `pull_request` event GitHub sets `GITHUB_REF=refs/pull/<n>/merge`, and
  `env-ci@11.2.0` (`node_modules/env-ci/services/github.js`) hands exactly that string to
  semantic-release as the current branch (`prBranch`). `--no-ci` only disables the
  "triggered by a pull request" early return in `node_modules/semantic-release/index.js`; branch
  detection still comes from env-ci. semantic-release then finds no configured branch named
  `refs/pull/<n>/merge`, logs the "configured to only publish from <branch>" line, and returns
  `false` with exit code 0. The wrapper sees no version line and prints
  `==> no release would be triggered by this branch`, so the job is green on every PR without
  analyzing a single commit.
- (b) After the branch check, `run()` in `node_modules/semantic-release/index.js` unconditionally
  calls `verifyAuth`, which is `git push --dry-run --no-verify -- <repositoryUrl> HEAD:<branch>`
  (`node_modules/semantic-release/lib/git.js`). With the job's `permissions: contents: read`, the
  `GITHUB_TOKEN` cannot use `git-receive-pack`, the probe fails, and because the checkout is at the
  PR head sha (equal to the remote tip) `isBranchUpToDate` is true, so semantic-release rethrows as
  `EGITNOPERMISSION` and exits 1. Fixing (a) alone would therefore turn every same-repo PR red.

Reproduced during patch planning against the current tree (semantic-release 25.0.9, env-ci 11.2.0):

- Simulated `pull_request` event (`GITHUB_ACTIONS=true GITHUB_EVENT_NAME=pull_request
  GITHUB_REF=refs/pull/99/merge DRY_RUN_BRANCH=main`): semantic-release logged
  `This test run was triggered on the branch refs/pull/99/merge, while semantic-release is configured
  to only publish from main, therefore a new version won't be published.`, the wrapper printed the
  no-release line, exit 0. This is the vacuous pass.
- Same run with `GITHUB_EVENT_NAME=push GITHUB_REF=refs/heads/main` in the environment (the fix), in
  a throwaway clone whose HEAD equals the remote `main` tip: `Allowed to push to the Git repository`,
  `Found 175 commits since last release`, `Analysis of 175 commits complete: minor release`,
  `There is no previous release, the next release version is 1.0.0`, and the wrapper then failed
  closed with `FAIL: computed next release version is 1.0.0 — the v1.0.0 baseline must never be
  recomputed`. That failure is the spec's baseline guard doing its job: at planning time the remote
  has **no tags at all** (`git ls-remote --tags origin` is empty) and `@paysdoc/devplatform` is not on
  npm (404), i.e. spec step 1 has not happened yet.
- Same fix with a clone-local `v1.0.0` tag on `fee68b9` plus one synthetic `build-agent: feat:` commit:
  `Found git tag v1.0.0 associated with version 1.0.0 on branch main`, `The next release version is
  1.1.0`, `==> next release version: 1.1.0`, exit 0. The remote was not modified (dry-run only).

**Solution:** Two small, targeted changes, exactly as the review proposes:

1. In `scripts/releaseDryRun.ts`, add `GITHUB_EVENT_NAME: 'push'` and
   `GITHUB_REF: \`refs/heads/${branch}\`` to the child environment so env-ci reports the branch the
   wrapper is already passing to `--branches`. Outside GitHub Actions env-ci does not consult these
   variables (its `detect()` keys on `GITHUB_ACTIONS`), so local runs are unaffected.
2. In `.github/workflows/ci.yml`, change the `release-dry-run` job to `permissions: contents: write`
   so the `git push --dry-run` probe succeeds, with a comment explaining why a dry run needs it, that
   nothing is pushed or published, and that fork PRs receive a read-only token and will fail the probe.

Approaches considered and rejected:

- Delete `GITHUB_ACTIONS` from the child env and check out `github.head_ref` by name so env-ci's git
  fallback resolves the branch (the review's alternative): needs a `ci.yml` checkout change plus the
  env deletion, and relies on `git rev-parse --abbrev-ref HEAD` / `origin/*` decorations at runtime.
  The env override is one edit, deterministic, and keeps `GITHUB_ACTION` (singular) intact, which is
  what `lib/get-git-auth-url.js` uses to add the `x-access-token:` prefix to `GITHUB_TOKEN`.
- Avoid `verifyAuth` instead of granting `contents: write`: semantic-release exposes no option to skip
  the probe, and letting it fail only yields the "local branch is behind the remote" vacuous pass
  when the checkout is stale. `contents: write` is the documented requirement; same-repo PR authors
  already hold push rights, so the token grants nothing new, and fork PRs are read-only regardless.

## Files to Modify
Use these files to implement the patch:

- `scripts/releaseDryRun.ts` — extend the `env` object passed to `spawnSync` (currently
  `{ ...process.env, SEMANTIC_RELEASE_DRY_RUN: 'true' }` at line 44) with the two GitHub variables
  and a short comment. No other logic changes; `--no-ci` stays (harmless, and still the documented
  way to run the dry run outside CI).
- `.github/workflows/ci.yml` — in the `release-dry-run` job, change `permissions.contents` from
  `read` to `write` (lines 37–38) and add the explanatory comment above the block. The `if:`,
  checkout, and `bun run release:dry-run` step (including `DRY_RUN_BRANCH: ${{ github.head_ref }}`
  and `GITHUB_TOKEN`) are unchanged.

Do **not** touch `release.config.js`, `release.yml`, the README, the tests, or `package.json` — none
of them are involved, and the README's description of the job ("prints the version the merge would
compute, without publishing anything") remains true.

## Implementation Steps
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Steer env-ci at the dry-run branch in `scripts/releaseDryRun.ts`
- Replace the `env:` line of the `spawnSync` call (line 44) with a multi-line object:

```ts
  const result = spawnSync(
    'node',
    [semanticReleaseBin, '--dry-run', '--no-ci', '--branches', branch],
    {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      env: {
        ...process.env,
        SEMANTIC_RELEASE_DRY_RUN: 'true',
        // On GitHub Actions `pull_request` events GITHUB_REF is `refs/pull/<n>/merge`,
        // and env-ci hands that to semantic-release as the current branch. `--no-ci`
        // only skips the pull-request early return, not branch detection, so the run
        // would end with "configured to only publish from <branch>" and exit 0 without
        // analyzing anything. Steer env-ci at the branch actually being dry-run instead.
        // Outside GitHub Actions env-ci ignores both variables and asks git.
        GITHUB_EVENT_NAME: 'push',
        GITHUB_REF: `refs/heads/${branch}`,
      },
    },
  );
```

- Nothing else in the file changes: branch resolution, output capture, the `1.0.0` baseline guard,
  and the no-release exit path stay as they are.

### Step 2: Grant the push probe `contents: write` in `.github/workflows/ci.yml`
- In the `release-dry-run` job, replace

```yaml
    permissions:
      contents: read
```

  with

```yaml
    # semantic-release verifies push access with `git push --dry-run` before it
    # analyzes a single commit, even in dry-run mode, so GITHUB_TOKEN needs
    # `contents: write` or the job fails with EGITNOPERMISSION. Nothing is pushed
    # or published: release.config.js drops the npm/github plugins under
    # SEMANTIC_RELEASE_DRY_RUN and semantic-release skips tag creation in
    # dry-run mode. Pull requests from forks always receive a read-only token,
    # so this job fails that probe on fork PRs regardless of this block.
    permissions:
      contents: write
```

- Leave `if: github.event_name == 'pull_request'`, the `ref: ${{ github.event.pull_request.head.sha }}`
  checkout, and the run step's `DRY_RUN_BRANCH` / `GITHUB_TOKEN` env exactly as they are.

### Step 3: Prove the branch mismatch is gone with the reviewer's simulation
- Run the simulated `pull_request` environment from the *Validation* section below. Before the patch
  it prints the `refs/pull/99/merge` mismatch line; after the patch it must print
  `Run automated release from branch main on repository … in dry-run mode` and must not print the
  mismatch line.
- From this worktree the run then ends with `The local branch main is behind the remote one, therefore
  a new version won't be published` and the no-release line (exit 0). That is expected locally: the
  worktree HEAD is not a fast-forward of remote `main`, so the push probe is rejected as
  non-fast-forward. In CI the checkout is the PR head at its remote tip, so the probe succeeds and
  commits are analyzed (verified during planning in a clone at the remote tip, see *Issue Summary*).

### Step 4: Confirm on the pull request (authoritative check for acceptance criterion 2)
- No PR exists for this branch yet and the branch is not on the remote, so this step runs after the
  branch is pushed and the PR opened. Open the `Release dry-run` job log (`gh pr checks <PR#>`, then
  `gh run view --job <job-id> --log`) and look for the wrapper's final line.
- Expected outcome depends on the `v1.0.0` baseline, which is spec step 1 and **not** part of this
  patch:
  - While `refs/tags/v1.0.0` is absent on the remote (true at planning time), the job now fails closed
    with `FAIL: computed next release version is 1.0.0 — the v1.0.0 baseline must never be
    recomputed…`. That is the guard working as specified, not a regression; the repository owner must
    push the tag per spec step 1 before the job can go green.
  - Once the tag exists, this PR's commits decide the line: `==> next release version: 1.0.1` if any
    commit on the PR is `fix:`-typed, otherwise `==> no release would be triggered by this branch`
    for a `chore:`/`docs:`-only PR. Either line satisfies the review's request; the former mismatch
    line must no longer appear anywhere in the log.

## Validation
Execute every command to validate the patch is complete with zero regressions.

- `bun run typecheck` — TypeScript strict-mode check across `src/**/*.ts` plus `release.config.js`;
  must report zero errors. (`scripts/` is outside that program, so also run
  `bunx tsc --noEmit --strict --module nodenext --moduleResolution nodenext --target es2022 --types node --skipLibCheck scripts/releaseDryRun.ts`,
  which must exit 0 — it did against the pre-patch file during planning.)
- `bun run test:unit` — full Vitest suite; expect `Test Files 40 passed`, `Tests 876 passed`,
  unchanged by this patch (no test touches the wrapper or the workflow).
- `bun -e "import { YAML } from 'bun'; const wf = YAML.parse(await Bun.file('.github/workflows/ci.yml').text()); const job = wf.jobs['release-dry-run']; if (job.permissions?.contents !== 'write' || job.if !== \"github.event_name == 'pull_request'\") { console.error('FAIL: release-dry-run permissions/trigger', JSON.stringify(job.permissions), job.if); process.exit(1); } console.log('OK: release-dry-run has contents: write and still runs only on pull_request');"`
  — dependency-free YAML assertion (Bun's built-in parser); prints `FAIL … {"contents":"read"}`
  before the patch and `OK` after it.
- `GITHUB_ACTIONS=true GITHUB_ACTION=run GITHUB_EVENT_NAME=pull_request GITHUB_REF=refs/pull/99/merge GITHUB_SHA=$(git rev-parse HEAD) GITHUB_REPOSITORY=paysdoc/devplatform GITHUB_SERVER_URL=https://github.com GITHUB_RUN_ID=1 GITHUB_WORKSPACE=$(pwd) DRY_RUN_BRANCH=main bun run release:dry-run 2>&1 | tee /tmp/adw-9xqejz-dry-run.log | tail -5; if grep -q "triggered on the branch refs/pull/99/merge" /tmp/adw-9xqejz-dry-run.log; then echo "FAIL: branch detection still follows GITHUB_REF"; elif grep -q "Run automated release from branch main" /tmp/adw-9xqejz-dry-run.log; then echo "OK: env-ci steered at the dry-run branch"; else echo "FAIL: unexpected output, inspect /tmp/adw-9xqejz-dry-run.log"; fi`
  — the reviewer's reproduction. Needs network access and local push credentials for
  `github.com/paysdoc/devplatform` (the `git push --dry-run` probe; SSH or the credential helper).
  `DRY_RUN_BRANCH=main` is used because the PR branch is not on the remote yet and semantic-release
  requires configured branches to exist there (`ERELEASEBRANCHES` otherwise — pre-existing, not part
  of this patch). Expect `OK`; the run's own final line is the no-release line for the reason given
  in Step 3.
- After push, the CI `release-dry-run` job on the pull request is the authoritative execution: its
  log must contain `==> next release version: x.y.z`, the explicit
  `==> no release would be triggered by this branch` line, or (until the `v1.0.0` tag is pushed) the
  `FAIL: computed next release version is 1.0.0` baseline guard — and never the
  `refs/pull/<n>/merge` mismatch line or `EGITNOPERMISSION`. Report it that way rather than as
  passed if the tag is still missing.

## Patch Scope
**Lines of code to change:** ~20 (`scripts/releaseDryRun.ts`: +11/-1 including the comment;
`.github/workflows/ci.yml`: +8/-1)
**Risk level:** low
**Testing required:** `bun run typecheck` and `bun run test:unit` must stay green (no functional test
covers the wrapper); the YAML assertion and the simulated `pull_request` run prove both halves
locally; the CI `release-dry-run` job on the PR is the end-to-end proof, read in light of whether
the `v1.0.0` baseline tag exists.
