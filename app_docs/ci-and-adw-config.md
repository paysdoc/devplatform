# CI & ADW Configuration

## Overview

Documents `.github/workflows/**` and `.github/adw.yml` — this repository's GitHub Actions CI
pipeline and the ADW guardrails toggle that lives outside `.adw/` so it survives `/adw_init`
regeneration.

## Responsibilities

- `.github/workflows/ci.yml` runs on every `pull_request` and every `push` to `main`, as two
  independent jobs:
  - `check` — `bun install` → `bun run typecheck` → `bun run lint:git-guard` → `bun run
    test:unit`.
  - `package` — `bun install` → `bun run build` → `npm pack --dry-run` → `bun run
    smoke:package`, on `oven-sh/setup-bun@v2` plus `actions/setup-node@v4` so the packed
    tarball is also proven against a real Node consumer, not just Bun.
- `.github/workflows/release.yml` — a release-automation placeholder job; `npm publish` is
  tracked as a separate open issue (see `README.md`).
- `.github/adw.yml` — this repository's ADW guardrails toggle, kept outside `.adw/` so it is
  not overwritten when `/adw_init` regenerates the `.adw/` directory.

## Contracts & Invariants

- `check` runs `bun run lint:git-guard` after `bun run typecheck` and before `bun run
  test:unit`, so a git/gh shell-out or unsanctioned-construction violation fails CI before the
  unit suite runs. See `app_docs/git-gh-guard.md` for the guard itself.
- `package` never runs the guard: the guard is a dev-only tool excluded from the packed
  tarball (`scripts/` is outside `tsconfig.build.json`'s `include` and outside
  `package.json`'s `files` — see
  `app_docs/feature-wdjsgu-package-build-export-package-build.md`).
- No branch protection is configured for this repository — the parent PRD's "Library
  repository" decision rules it out, since ADW's merge path (`gh pr merge --merge`, no
  `--auto`, no check polling) cannot merge under required status checks.

## Configuration

- Runners: `ubuntu-latest` for both jobs; `oven-sh/setup-bun@v2` for both; `actions/setup-node@v4`
  (Node 20) additionally for `package`.
- Triggers (`ci.yml`): `pull_request` (any branch) and `push` to `main`.

## Gotchas

- A new CI check belongs in the `check` job unless it specifically needs the built/packed
  artifact — adding it to `package` instead would leave it unenforced on branches that never
  reach a build.
