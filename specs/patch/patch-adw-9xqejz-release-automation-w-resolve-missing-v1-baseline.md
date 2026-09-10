# Patch: Resolve the missing `v1.0.0` baseline — owner establishes it (recommended) or the guard is dropped

## Metadata
adwId: `9xqejz-release-automation-w`
reviewChangeRequest:
```text
Issue #3: The v1.0.0 baseline that the issue and spec step 1 assume does not exist and step 1 was not completed: `git ls-remote --tags origin` returns no tags, and `npm view @paysdoc/devplatform version` returns 404 Not Found even when authenticated as paysdoc, so there is no hand-published 1.0.0 to protect. Consequences as delivered: the Release workflow's baseline guard fails closed on the first push to main, and the dry-run computes the first release from the full history (observed: "There is no previous release, the next release version is 1.0.0"), so scripts/releaseDryRun.ts fails with the recompute-the-baseline message on every PR. Acceptance criterion 3 (first CI-driven release publishes 1.0.1 or 1.1.0) cannot be met until this is resolved. OIDC trusted publishing is also unproven until a real release run; the npmjs.com trusted publisher must be linked to paysdoc/devplatform + release.yml before then.
Resolution: Owner decision required; do not push a tag or remove the guard automatically. Either (a) perform the manual 1.0.0 publish and push `v1.0.0` on that commit (`git tag v1.0.0 <sha> && git push origin v1.0.0`) before merging, leaving the guard and the 1.0.0 check in place, or (b) decide that the first automated release should be 1.0.0 and remove the v1.0.0 guard step from .github/workflows/release.yml and the `nextVersion === '1.0.0'` failure in scripts/releaseDryRun.ts, updating the README Releasing section accordingly.
```

## Issue Summary
**Original Spec:** `specs/issue-2-adw-9xqejz-release-automation-w-sdlc_planner-release-automation-agent-prefixed-parser.md`

**Issue:** Spec step 1 ("Establish the `v1.0.0` baseline tag") was never carried out, so the two
guards that the rest of the spec builds on are now firing against an empty baseline instead of
protecting a real one. Re-verified during patch planning (2026-09-10):

- `git ls-remote --tags origin` → empty; `git tag -l` → empty; `gh api repos/paysdoc/devplatform/tags`
  → `[]`; `gh release list` → nothing.
- `npm view @paysdoc/devplatform version` → `404 Not Found` while `npm whoami` → `paysdoc`.
- The history holds 68 `feat:`/`fix:`-typed commits out of 173, so with no tag reachable
  semantic-release legitimately computes the first release as `1.0.0`. That is why the
  `release-dry-run` job ends in `FAIL: computed next release version is 1.0.0 …` on every PR, and
  why the `Release` job's "Verify the v1.0.0 baseline tag is reachable" step would exit 1 on the
  first push to `main`.
- No owner decision is recorded anywhere yet: issue #2 carries only ADW bot comments, this branch
  is not on the remote, and no pull request exists for it.

**Solution:** Take the review's option **(a)** — the repository owner performs the one-time manual
`1.0.0` publish and pushes `v1.0.0` on that commit; the guard step and the dry-run `1.0.0` check stay
exactly as delivered. This is a **zero-code-change** patch: everything the patch agent may do is
verify state and report, and everything that changes the world (publish, tag push, npm trusted
publisher link) is an owner-run checklist that the patch agent must **not** execute. Option **(b)**
is written out below as the alternative, to be applied only if the owner explicitly chooses it.

Why (a) is the recommendation, not just the smaller diff:

1. It is what issue #2 and acceptance criteria 3 and 4 literally ask for ("The baseline is the
   hand-pushed `v1.0.0` tag from the first manual publish; the workflow must never recompute 1.0.0").
2. OIDC trusted publishing cannot bootstrap a package that does not exist. npm's trusted-publishers
   documentation configures the publisher on the *package settings* page on npmjs.com, so the package
   must already be on the registry before `release.yml` can be linked. The installed
   `@semantic-release/npm@13.1.5` confirms the consequence: `lib/verify-auth.js` tries the OIDC token
   exchange (`/-/npm/v1/oidc/token/exchange/package/<name>`), falls back to `NPM_TOKEN` when the
   exchange fails, and raises `ENONPMTOKEN` when neither is available. Under option (b) the very first
   automated publish would therefore *require* an `NPM_TOKEN` repository secret — the long-lived
   credential acceptance criterion 4 rules out. Under option (a) the owner's own interactive npm login
   does the one publish and no secret enters the repository.
3. With `v1.0.0` on `fee68b9` (the current `origin/main` tip and the state issue #1 made publishable)
   the two commits on this branch (`1045f15`, `7869b18`, both `chore:`) yield **no release** on
   merge, exactly as the spec's Notes predict, and criterion 3 is met by the first later `feat:`/`fix:`
   merge. The earlier patch plan for review issue #2 already demonstrated this path in a throwaway
   clone: a clone-local `v1.0.0` on `fee68b9` plus one synthetic `build-agent: feat:` commit produced
   `The next release version is 1.1.0` and `==> next release version: 1.1.0`.

Approaches considered and rejected:

- **(b) drop the guard and let CI publish `1.0.0`** — ~15 lines across three files, but it needs an
  `NPM_TOKEN` secret for the first run (see point 2), reinterprets criterion 3, and the review reserves
  this choice for the owner. Kept as the documented alternative in Step 3.
- **(c) make the guard conditional on registry state** (fail only when `npm view` shows a published
  version *and* no `v1.0.0` tag is reachable) — more code in the workflow and the script, a network
  call in the release job, and it still silently decides the question the review says the owner must
  decide.

## Files to Modify
Use these files to implement the patch:

- **Option (a) — recommended, default:** none. `.github/workflows/release.yml`,
  `scripts/releaseDryRun.ts` and `README.md` are already correct for a repository whose baseline tag
  exists; the current failures are those guards doing their job.
- **Option (b) — only on an explicit owner decision** (Step 3):
  - `.github/workflows/release.yml` — delete the "Verify the v1.0.0 baseline tag is reachable" step
    (lines 35–40); extend the header comment with the first-publish `NPM_TOKEN` requirement.
  - `scripts/releaseDryRun.ts` — delete the `nextVersion === '1.0.0'` failure (lines 74–76) and the
    "(or that would recompute the hand-published 1.0.0 baseline)" clause in the header comment
    (lines 3–5).
  - `README.md` — rewrite the baseline sentence at lines 75–77 and drop "v1.0.0 baseline guard, "
    from the `workflows/release.yml` entry at line 95.

Do **not** touch `release.config.js`, `.github/workflows/ci.yml`, `package.json`, `bun.lock`, or the
tests under either option — none of them reference the baseline, and the earlier patches for review
issues #1 and #2 (uncommitted in this worktree) must stay as they are.

## Implementation Steps
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Re-verify the baseline state (read-only)
- Run, from this worktree:

```sh
git ls-remote --tags origin
npm view @paysdoc/devplatform version
```

- Interpret the pair of results:
  - `refs/tags/v1.0.0` listed **and** `npm view` prints `1.0.0` → the owner has completed option (a).
    Make no code change and go to Step 4.
  - Neither exists (the planning-time state) → go to Step 2.
  - Exactly one exists (tag without a publish, or a publish without the tag) → stop and report the
    inconsistency verbatim. Do **not** "complete" it by tagging or publishing; the owner finishes it.

### Step 2: Resolve the owner decision without acting on it
- Look for an explicit decision by `paysdoc`: a comment on issue #2 (`gh issue view 2 --comments`),
  a comment on the pull request once one exists, or an instruction in the patch invocation naming
  option (b). At planning time there is none.
- **If no explicit choice of (b) is recorded, option (a) applies.** Do not modify any file, do not
  push a tag, do not publish, do not post comments. Report the patch as *blocked on the owner* and
  include the checklist below verbatim in the report, then continue at Step 4 (the validation
  commands must still pass so the worktree is proven regression-free).
- Owner checklist for option (a) — **owner-run only**, from a clean checkout of
  `paysdoc/devplatform` with `npm whoami` printing `paysdoc` (2FA prompts are expected; a published
  version number can never be reused on npm, so check the `npm pack --dry-run` file list before
  publishing):

```sh
git fetch origin
git checkout fee68b9344f4fda32eeb6298a5062d7a6859d2c5   # origin/main tip; the state issue #1 made publishable
bun install --frozen-lockfile
npm pkg set version=1.0.0        # working tree only — package.json stays 0.0.0-development in git
npm pack --dry-run               # expect only dist/**, README.md, LICENSE, package.json
npm publish                      # prepack runs `bun run build`; publishConfig.access is already public
git checkout -- package.json
git tag v1.0.0 fee68b9344f4fda32eeb6298a5062d7a6859d2c5
git push origin v1.0.0
git ls-remote --tags origin      # must now list refs/tags/v1.0.0
npm view @paysdoc/devplatform version   # must print 1.0.0
```

- Then, on npmjs.com → package `@paysdoc/devplatform` → Settings → *Trusted Publisher* → GitHub
  Actions: organization/user `paysdoc`, repository `devplatform`, workflow filename `release.yml`,
  environment left empty (the workflow declares none). npm does not allow editing a connection after
  it is created, so enter the filename exactly. Do this **before** merging the pull request: the
  `Release` job on `main` is the first real OIDC run, and until then OIDC remains unproven.
- Finally push this branch / re-run the pull request's `Release dry-run` job. Because `v1.0.0` is an
  ancestor of the branch and every commit after it is `chore:`-typed, the expected wrapper line is
  `==> no release would be triggered by this branch` (exit 0), and merging produces no release —
  correct behaviour per the spec's Notes, not a configuration failure.

### Step 3: Only if the owner explicitly chose option (b) — drop the baseline guard
Skip this step entirely under option (a).

- `.github/workflows/release.yml`: delete the whole step

```yaml
      - name: Verify the v1.0.0 baseline tag is reachable
        run: |
          if ! git rev-parse -q --verify refs/tags/v1.0.0 >/dev/null; then
            echo "::error::refs/tags/v1.0.0 is not reachable after fetching tags. The v1.0.0 baseline tag must exist before semantic-release can run, or it will recompute and try to republish 1.0.0." >&2
            exit 1
          fi
```

  Keep `fetch-depth: 0` and `fetch-tags: true` on the checkout (semantic-release still needs every
  later `v<version>` tag). Append to the header comment:

```yaml
# The first automated release publishes 1.0.0 from the full history. A trusted
# publisher can only be linked to a package that already exists on npmjs.com,
# so that first run needs the NPM_TOKEN secret; link the trusted publisher to
# release.yml afterwards and delete the secret.
```

- `scripts/releaseDryRun.ts`: delete lines 74–76

```ts
  if (nextVersion === '1.0.0') {
    fail('computed next release version is 1.0.0 — the v1.0.0 baseline must never be recomputed. Verify the v1.0.0 tag is reachable.');
  }
```

  and shorten the header comment so lines 2–5 read
  `Runs semantic-release in dry-run mode against a branch and prints the computed next release
  version, so a PR that would never publish is caught before merge.` (drop the parenthetical about
  recomputing the hand-published baseline). `const nextVersion = versionMatch[1];` and the
  `==> next release version:` line stay.

- `README.md`: replace the sentence spanning lines 75–77 (`The release baseline is the `v1.0.0` git
  tag … can never recompute or republish `1.0.0`.`) with:
  `The first automated release is computed from the full history and publishes `1.0.0`; every later
  release is computed from the commits since the previous `v<version>` tag. That first run needs an
  `NPM_TOKEN` secret because npm's trusted publisher can only be linked to a package that already
  exists; link it to `release.yml` afterwards and delete the secret.`
  On line 95 change `(v1.0.0 baseline guard, OIDC + NPM_TOKEN fallback)` to
  `(OIDC + NPM_TOKEN fallback)`.

- Owner prerequisite for (b), outside the patch agent's reach: an `NPM_TOKEN` repository secret
  (granular access token with publish permission on the `@paysdoc` scope, 2FA bypass enabled if the
  account requires 2FA for writes) must exist before the merge. `gh secret list` returns HTTP 403
  for the ADW integration token, so the patch agent cannot verify this; say so in the report.

### Step 4: Run the validation commands
- Run every command in *Validation* below. Under option (a) the tree is unchanged, so this is a
  regression check plus the state assertions; under option (b) it additionally proves the guard is
  gone.

## Validation
Execute every command to validate the patch is complete with zero regressions.

- `bun run typecheck` — TypeScript strict-mode check across `src/**/*.ts` plus `release.config.js`;
  must exit 0 with no output (it did at planning time; no linter is configured in this repository).
- `bun run test:unit` — full Vitest suite; expect `Test Files 40 passed (40)` and
  `Tests 876 passed (876)`, unchanged by either option (no test references the baseline guard; the
  two `fetchIssueLabels … Unexpected end of JSON input` stderr lines are pre-existing test noise).
- Baseline state assertion (both options):
  `if git ls-remote --tags origin | grep -q 'refs/tags/v1.0.0$'; then echo "TAG: v1.0.0 present"; else echo "TAG: v1.0.0 absent"; fi; npm view @paysdoc/devplatform version 2>/dev/null && echo "NPM: published" || echo "NPM: not published (404)"`
  — under option (a) both lines must read *present*/*published* before the pull request can go green;
  if either still reads *absent*/*not published*, report the patch as blocked on the owner rather than
  as passed. Under option (b) both lines are expected to read *absent*/*not published* until the first
  release runs.
- Option (b) only — guard-removal assertion:
  `bun -e "import { YAML } from 'bun'; const wf = YAML.parse(await Bun.file('.github/workflows/release.yml').text()); const names = wf.jobs.release.steps.map(s => s.name ?? s.uses ?? s.run); if (names.some(n => /baseline/i.test(String(n)))) { console.error('FAIL: baseline guard step still present'); process.exit(1); } console.log('OK: no baseline guard step');" && ! grep -n "1\.0\.0\|baseline" scripts/releaseDryRun.ts && ! grep -n "baseline" README.md && echo "OK: no baseline references left"`
  — must print both `OK` lines; any `grep` hit is a missed edit.
- The pull request's `Release dry-run` job log is the authoritative end-to-end check once the branch
  is pushed: under option (a) it must end with `==> no release would be triggered by this branch`;
  under option (b) with `==> next release version: 1.0.0`. Until the owner has completed the
  checklist (option a) the job still ends with `FAIL: computed next release version is 1.0.0 …` —
  report that as *blocked on the owner*, never as a regression or as passed. Acceptance criterion 3
  is only observable after the first `feat:`/`fix:` merge to `main` following this one.

## Patch Scope
**Lines of code to change:** 0 under option (a) (recommended); ~15 under option (b)
(`release.yml` −6/+4, `scripts/releaseDryRun.ts` −4/−1 comment line, `README.md` ~3 lines)
**Risk level:** low for the code under either option. The owner-run publish and tag push are
outward-facing and irreversible (a published npm version number can never be reused), which is
exactly why they stay out of the patch agent's hands.
**Testing required:** `bun run typecheck` and `bun run test:unit` must stay green (no functional test
covers the guard); the baseline state assertion decides whether the patch is complete or blocked on
the owner; the PR's `Release dry-run` job is the end-to-end proof, read in light of which option the
owner chose. OIDC trusted publishing is proven only by the first real `Release` run on `main` after
the trusted publisher is linked — do not report it as working before then.
