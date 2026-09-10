# Review Proof Requirements

This file defines the proof requirements the `/review` command reads for `@paysdoc/devplatform`
before it will consider a change verified.

## Proof Type

Project type: **Library/package project** (TypeScript forge-neutral git/worktree core plus
GitHub/GitLab/Jira adapters; no UI, no HTTP server of its own). Produce:

1. Unit test output summary (`bun run test:unit`) showing pass/fail counts for the affected
   modules under `src/git/__tests__/` and/or `src/providers/**/__tests__/`.
2. Type-check verification (`bun run typecheck`) with zero errors.
3. API compatibility check: confirm exported symbols from touched modules' `index.ts` files
   (`src/git/index.ts`, `src/providers/index.ts`, `src/providers/github/index.ts`,
   `src/providers/gitlab/index.ts`, `src/providers/jira/index.ts`) are unchanged, or that any
   intentional signature/shape change is called out explicitly.
4. Code-diff verification: a concise summary of the behavioral change, referencing
   `file_path:line_number` for the key edits.

## Proof Format

Structure proof in the review JSON output as follows:
- `reviewSummary` — overview of what was verified and the outcome (tests passed, typecheck clean,
  exports stable).
- `reviewIssues` — any discrepancies found (test failures, typecheck errors, unintended export
  changes), one entry per issue.
- `screenshots` — not applicable for this project; leave empty (see "What NOT to Do" below).

## Proof Attachment

Proof is attached to the PR via the review JSON's `reviewSummary` (narrative proof), `reviewIssues`
(any problems found), and `screenshots` (left empty for this project). The `/review` command reads
this file to determine what evidence it must gather before writing those fields.

## What NOT to Do

- Do NOT take or reference browser screenshots — this is not a UI project and there is no dev
  server to screenshot.
- Do NOT fabricate curl/HTTP endpoint verification — this library is a client of external
  GitHub/GitLab/Jira APIs, not a server exposing its own HTTP endpoints.
- Do NOT skip the type-check or unit-test evidence — with no linter configured, these are the
  primary correctness signals for this repo.
- Do NOT claim build verification — there is no build/dist pipeline configured yet.
