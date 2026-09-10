# Release Automation

## Overview

Computes and publishes npm releases from commit history via [semantic-release](https://semantic-release.gitbook.io/), using a commit parser that understands this repository's ADW agent-prefixed commit headers (`build-agent: feat: …`) in addition to plain conventional-commit headers. A PR-time dry run and a hard-fail baseline guard keep the automation from silently never publishing or from recomputing the hand-published `1.0.0` release.

## Responsibilities

- Defines `parserOpts` (`release.config.js`) — a single `headerPattern`/`breakingHeaderPattern` pair shared by `@semantic-release/commit-analyzer` and `@semantic-release/release-notes-generator`, so analysis and notes-rendering can never diverge.
- Accepts an optional `<agent-name>: ` prefix ahead of the conventional type. The prefix must match `[a-z0-9]+(?:-[a-z0-9]+)+` (hyphenated, lowercase, no capture needed beyond discarding it) so it can never be confused with a bare conventional type — none of `feat`, `fix`, `chore`, `docs`, `perf`, `refactor`, `test`, `build`, `ci`, `style`, `revert` contain a hyphen.
- Maps commit types to release severity via the `conventionalcommits` preset: `feat` → minor, `fix` → patch, `!`-suffixed headers or a `BREAKING CHANGE:` footer → major, everything else (`chore`, `docs`, …) → no release.
- Toggles the plugin list on `SEMANTIC_RELEASE_DRY_RUN=true`: only `commit-analyzer` and `release-notes-generator` run (no credentials needed); `@semantic-release/npm` and `@semantic-release/github` are added for real runs.
- `scripts/releaseDryRun.ts` (`bun run release:dry-run`) shells out to `semantic-release --dry-run --no-ci` against a branch (`DRY_RUN_BRANCH` env var, falling back to the current git branch), pins `env-ci`'s branch detection to that branch via synthetic `GITHUB_EVENT_NAME=push` / `GITHUB_REF` env vars, prints the computed next version, and hard-fails if that version is `1.0.0` (the baseline must never be recomputed).
- The `release-dry-run` job in `.github/workflows/ci.yml` runs `bun run release:dry-run` on every `pull_request`, so a commit-header configuration that would never trigger a release is visible before merge, without publishing anything.
- The `Release` job in `.github/workflows/release.yml` runs the real `semantic-release` binary on every push to `main`, guarded by a step that hard-fails if `refs/tags/v1.0.0` is not reachable after fetching tags.

## Contracts & Invariants

- `release.config.js`'s `parserOpts` object is the single source of truth: `src/__tests__/releaseParser.test.ts` and `src/__tests__/releaseConfig.test.ts` import it directly (`import releaseConfig from '../../release.config.js'`) rather than a copy, so a test can never pass against a pattern the release does not use.
- The agent-name prefix is a non-capturing group — `headerCorrespondence` (`['type', 'scope', 'subject']`) is identical to the stock `conventionalcommits` preset's, so no downstream plugin needs to know agents exist.
- Dry-run mode never needs secrets: `SEMANTIC_RELEASE_DRY_RUN=true` drops `@semantic-release/npm` and `@semantic-release/github` from the plugin list before semantic-release loads them.
- `scripts/releaseDryRun.ts` exits non-zero if the computed next version is `1.0.0`, and the `Release` job separately hard-fails if `refs/tags/v1.0.0` is unreachable — two independent guards against recomputing the hand-published baseline.
- Publishing uses npm OIDC trusted publishing (`permissions.id-token: write` in `release.yml`); `NPM_TOKEN` is only a fallback credential, consumed by `@semantic-release/npm` when the OIDC trusted publisher isn't linked or the secret is present.
- `tagFormat` is `v${version}` and `branches` is exactly `['main']`.

## Configuration

- `SEMANTIC_RELEASE_DRY_RUN` — `'true'` strips the publish plugins from `release.config.js`.
- `DRY_RUN_BRANCH` — branch `scripts/releaseDryRun.ts` dry-runs against; defaults to the current git branch (`git rev-parse --abbrev-ref HEAD`) when unset.
- `GITHUB_TOKEN` — required by the `release-dry-run` CI job (needs `contents: write`, since semantic-release probes push access with `git push --dry-run` even in dry-run mode) and by the real `Release` job.
- `NPM_TOKEN` — optional fallback publish credential; OIDC trusted publishing is preferred.
- `bun run release:dry-run` — runs `scripts/releaseDryRun.ts` via `bunx tsx`.
- `tsconfig.json` sets `allowJs: true` and includes `release.config.js` so `src/__tests__/*.test.ts` can import it under typecheck; `tsconfig.build.json` keeps its own `src/**/*.ts`-only `include`, so the config file never leaks into `dist/`.
- `src/__tests__/semantic-release-commit-analyzer.d.ts` and `src/__tests__/semantic-release-release-notes-generator.d.ts` are hand-written ambient type declarations (these two semantic-release plugins ship none) covering only the `analyzeCommits`/`generateNotes` export shapes the tests exercise.

## Gotchas

- On GitHub Actions `pull_request` events, `GITHUB_REF` is `refs/pull/<n>/merge`, and `env-ci` (which semantic-release uses for branch detection) hands that straight through. `--no-ci` only skips the pull-request early return, not branch detection, so without steering `GITHUB_EVENT_NAME`/`GITHUB_REF` at the branch actually being dry-run, the run would end with "configured to only publish from `<branch>`" and exit 0 without analyzing anything.
- Pull requests from forks always receive a read-only `GITHUB_TOKEN`, so the `release-dry-run` job's push-access probe fails on fork PRs regardless of the `contents: write` permission block.
- `@semantic-release/release-notes-generator`'s stable release ships `conventional-changelog-writer` 8.x, but the `conventionalcommits` preset major used here needs writer 9.x-shaped options; `releaseConfig.test.ts`'s "release notes render under the shipped preset" suite exists specifically to catch that drift by rendering real notes rather than only asserting the plugin list shape.
- There are no tags in the repository until the `v1.0.0` baseline is manually pushed once; until then the `Release` workflow's baseline-guard step intentionally hard-fails every run rather than letting semantic-release compute `1.0.0` on its own.
