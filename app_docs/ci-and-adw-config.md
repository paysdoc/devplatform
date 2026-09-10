# CI Pipeline and ADW Guardrails Configuration

## Overview

GitHub Actions workflow definitions for this repository (`.github/workflows/*.yml`) plus the ADW guardrails toggle (`.github/adw.yml`) that lives outside `.adw/` so it survives ADW template regeneration.

## Responsibilities

- `.github/workflows/ci.yml` — runs on every `pull_request` and push to `main`:
  - `check` — `bun install`, `bun run typecheck`, `bun run test:unit`.
  - `package` — builds, `npm pack --dry-run`, and smoke-tests the tarball (`bun run smoke:package`) under Node + Bun.
  - `release-dry-run` — `pull_request`-only; runs `bun run release:dry-run` so a commit-header configuration that would never trigger a release is caught before merge. See `app_docs/feature-9xqejz-release-automation.md` for the release logic this job exercises.
- `.github/workflows/release.yml` — runs on push to `main` (and `workflow_dispatch`): verifies the `v1.0.0` baseline tag is reachable, then runs the real `semantic-release` binary. See `app_docs/feature-9xqejz-release-automation.md` for the release-config/parser details.
- `.github/adw.yml` — toggles injection of the target-repo agent guardrails (`--settings` deny list + framework hooks) on every ADW agent spawn against this repository. Kept outside `.adw/` specifically so `/adw_init` regeneration never overwrites it.

## Contracts & Invariants

- The npm trusted publisher on npmjs.com is linked to this exact workflow filename (`release.yml`) — renaming it silently breaks OIDC trusted publishing.
- `release.yml` hard-fails before running semantic-release if `refs/tags/v1.0.0` is not reachable after `fetch-tags: true`, so the hand-published `1.0.0` baseline can never be recomputed.
- `release.yml` sets `concurrency: { group: release, cancel-in-progress: false }` so overlapping pushes to `main` queue rather than race or cancel a run mid-publish.
- `release-dry-run` in `ci.yml` needs `permissions.contents: write` (not just `read`) because semantic-release probes push access with `git push --dry-run` even in dry-run mode; the job still publishes nothing since `release.config.js` drops the npm/github plugins under `SEMANTIC_RELEASE_DRY_RUN` and semantic-release skips tag creation in dry-run mode regardless.
- `guardrails: true` in `.github/adw.yml` is the only setting; its absence/false disables guardrail injection for ADW agent spawns against this repo.

## Configuration

- Secrets consumed by `release.yml`: `GITHUB_TOKEN`, `NPM_TOKEN` (fallback only — OIDC trusted publishing via `permissions.id-token: write` is preferred).
- Secrets consumed by `ci.yml`'s `release-dry-run` job: `GITHUB_TOKEN`.
- `.github/adw.yml`: `guardrails: <bool>`.

## Gotchas

- Pull requests from forks always receive a read-only `GITHUB_TOKEN`, so `release-dry-run` fails its push-access probe on fork PRs regardless of the `contents: write` permission block — this is expected, not a bug to fix.
- `.github/adw.yml` is intentionally outside `.adw/`; do not move ADW-guardrail configuration into `.adw/` or it will be silently clobbered on the next template regeneration.
