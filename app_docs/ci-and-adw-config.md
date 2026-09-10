# CI Pipeline and ADW Guardrails Configuration

## Overview

GitHub Actions workflow definitions for this repository (`.github/workflows/*.yml`) plus the ADW guardrails toggle (`.github/adw.yml`) that lives outside `.adw/` so it survives ADW template regeneration.

## Responsibilities

- `.github/workflows/ci.yml` — runs on every `pull_request` and push to `main`, as three jobs:
  - `check` — `bun install` → `bun run typecheck` → `bun run lint:git-guard` → `bun run test:unit` → `bun run test:e2e --tags "not @packaging"`. See `app_docs/git-gh-guard.md` for the guard itself, and `app_docs/bdd-scenarios.md` for the BDD scenario suite.
  - `package` — builds, `npm pack --dry-run`, smoke-tests the tarball (`bun run smoke:package`) under Node + Bun, then runs `bun run test:e2e --tags "@packaging"` (the committed tarball-pack-and-install BDD scenarios) against the same build.
  - `release-dry-run` — `pull_request`-only; runs `bun run release:dry-run` so a commit-header configuration that would never trigger a release is caught before merge. See `app_docs/feature-9xqejz-release-automation.md` for the release logic this job exercises.
- `.github/workflows/release.yml` — runs on push to `main` (and `workflow_dispatch`): verifies the `v1.0.0` baseline tag is reachable, then runs the real `semantic-release` binary. See `app_docs/feature-9xqejz-release-automation.md` for the release-config/parser details.
- `.github/adw.yml` — toggles injection of the target-repo agent guardrails (`--settings` deny list + framework hooks) on every ADW agent spawn against this repository. Kept outside `.adw/` specifically so `/adw_init` regeneration never overwrites it.

## Contracts & Invariants

- `check` runs `bun run lint:git-guard` after `bun run typecheck` and before `bun run test:unit`, so a git/gh shell-out or unsanctioned-construction violation fails CI before the unit suite runs. See `app_docs/git-gh-guard.md` for the guard itself.
- `package` never runs the guard: the guard is a dev-only tool excluded from the packed tarball (`scripts/` is outside `tsconfig.build.json`'s `include` and outside `package.json`'s `files` — see `app_docs/feature-wdjsgu-package-build-export-package-build.md`).
- The BDD scenario suite (`bun run test:e2e`, `app_docs/bdd-scenarios.md`) is split across both jobs by the same rule the Gotchas section states below: the hermetic (`not @packaging`) scenarios need nothing built, so they run in `check` right after the unit suite; the `@packaging` scenarios `npm pack`+`npm install` the real tarball into a throwaway consumer, so they need Node + npm and run in `package`, after `bun run smoke:package` builds and packs it.
- The npm trusted publisher on npmjs.com is linked to this exact workflow filename (`release.yml`) — renaming it silently breaks OIDC trusted publishing.
- `release.yml` hard-fails before running semantic-release if `refs/tags/v1.0.0` is not reachable after `fetch-tags: true`, so the hand-published `1.0.0` baseline can never be recomputed.
- `release.yml` sets `concurrency: { group: release, cancel-in-progress: false }` so overlapping pushes to `main` queue rather than race or cancel a run mid-publish.
- `release-dry-run` in `ci.yml` needs `permissions.contents: write` (not just `read`) because semantic-release probes push access with `git push --dry-run` even in dry-run mode; the job still publishes nothing since `release.config.js` drops the npm/github plugins under `SEMANTIC_RELEASE_DRY_RUN` and semantic-release skips tag creation in dry-run mode regardless.
- No branch protection is configured for this repository — the parent PRD's "Library repository" decision rules it out, since ADW's merge path (`gh pr merge --merge`, no `--auto`, no check polling) cannot merge under required status checks.
- `guardrails: true` in `.github/adw.yml` is the only setting; its absence/false disables guardrail injection for ADW agent spawns against this repo.

## Configuration

- Secrets consumed by `release.yml`: `GITHUB_TOKEN`, `NPM_TOKEN` (fallback only — OIDC trusted publishing via `permissions.id-token: write` is preferred).
- Secrets consumed by `ci.yml`'s `release-dry-run` job: `GITHUB_TOKEN`.
- Runners: `ubuntu-latest` for all jobs; `oven-sh/setup-bun@v2` for all; `actions/setup-node@v4` additionally for `package` (Node 20) and `release-dry-run`/`release.yml` (Node 22).
- Triggers (`ci.yml`): `pull_request` (any branch) and `push` to `main`.
- `.github/adw.yml`: `guardrails: <bool>`.

## Gotchas

- Pull requests from forks always receive a read-only `GITHUB_TOKEN`, so `release-dry-run` fails its push-access probe on fork PRs regardless of the `contents: write` permission block — this is expected, not a bug to fix.
- `.github/adw.yml` is intentionally outside `.adw/`; do not move ADW-guardrail configuration into `.adw/` or it will be silently clobbered on the next template regeneration.
- A new CI check belongs in the `check` job unless it specifically needs the built/packed artifact — adding it to `package` instead would leave it unenforced on branches that never reach a build.
