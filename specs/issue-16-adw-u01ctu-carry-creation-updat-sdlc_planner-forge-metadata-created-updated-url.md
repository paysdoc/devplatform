# Feature: Carry creation/update metadata on the forge domain model — `Issue.createdAt`/`Issue.url` and `PullRequestRecord.updatedAt`/`PullRequestRecord.url`, populated by the GitHub and Jira adapters

## Metadata
issueNumber: `16`
adwId: `u01ctu-carry-creation-updat`
issueJson: `{"number":16,"title":"Carry creation/update metadata on the forge domain model (Issue, PullRequestRecord)","body":"**Parent PRD:** `paysdoc/AI_Dev_Workflow` `specs/prd/gitcontext-library-extraction.md`. Runbook: `specs/runbooks/gitcontext-extraction.md`.\n\n**Why:** the ADW switchover (`paysdoc/AI_Dev_Workflow` #840) is blocked. Four fields its agents read exist on ADW's *in-repo* copy of the provider package — added by its issue #844, merged to `dev` — but never reached this library. #840 deletes that in-repo copy, so the fields vanish with it and the migration fails `tsc` with 19 errors of the form `Property 'createdAt' does not exist on type 'Issue'`.\n\nThis is the whole remaining delta between ADW's `dev` and this repo: exactly two ADW commits (`77cbfcbe`, `ed45b14b`) postdate the last synced source commit here (`f34705f`). Nothing else diverges.\n\n**What to build.** Six source files. Port the change; do not cherry-pick verbatim — this repo uses `.js` import extensions and `src/git/` where ADW has `adws/gitContext/`.\n\n1. `src/providers/types.ts` — `Issue` gains `createdAt: string` and `url: string`; `PullRequestRecord` gains `updatedAt: string` and `url: string`. **All four required, not optional.** Matches the existing required `PullRequest.url` and `IssueComment.createdAt`; `IssueListEntry` is deliberately not the precedent here.\n2. `src/providers/github/mappers.ts` — `mapGitHubIssueToIssue` fills `createdAt: issue.createdAt` and `url: issue.url`. No fetch change needed: `ISSUE_FIELDS` in `commands/issueCommands.ts` already projects `createdAt` and `url`; the mapper was simply dropping them.\n3. `src/providers/github/commands/prCommands.ts` — `fetchAllPRsCmd` projects the two new fields:\n   `--json number,body,state,mergedAt,updatedAt,url`\n4. `src/providers/jira/jiraTypes.ts` — `JiraIssueResponse.fields` gains `readonly created: string` (ISO 8601 creation timestamp).\n5. `src/providers/jira/jiraApiClient.ts` — expose the already-held, already-normalised instance URL as a public readonly member.\n6. `src/providers/jira/jiraIssueTracker.ts` — `toIssue` fills `createdAt: jiraIssue.fields.created` and `url: \\`${…instanceUrl}/browse/${jiraIssue.key}\\``, reading the instance URL from the client (step 5).\n\n**Do NOT add a positional constructor parameter to `JiraIssueTracker`.** It is publicly exported from `./providers`; a third required positional argument is a breaking change and would force 2.0.0. Reading the value from `JiraApiClient` keeps this additive. Do not duplicate the trailing-slash normalisation — `JiraApiClient` already does `instanceUrl.replace(/\\/+$/, '')`.\n\n`GitLabCodeHost.listPullRequests()` is a `throw … not implemented` stub and needs no change.\n\n**Acceptance criteria:**\n- [ ] `Issue` carries required `createdAt`/`url`; `PullRequestRecord` carries required `updatedAt`/`url`\n- [ ] GitHub and Jira adapters populate all four; unit tests assert the values arrive, not that the fields exist\n- [ ] `JiraIssueTracker`'s exported constructor signature is unchanged; no `BREAKING CHANGE` footer, no ` \\! ` commit\n- [ ] The PR's `release-dry-run` job reports the computed next version as **1.2.0**\n- [ ] `bun run typecheck`, `bun run lint:git-guard`, `bun run test:unit`, and the hermetic BDD scenarios are green\n- [ ] A `@packaging` scenario proves all four names resolve from the packed tarball's emitted `.d.ts`\n\n**Out of scope:** any other export widening. ADW's remaining gaps (`readLocalRepoInfo`, `parseGitHubIssue`, `selectPreferredPR`, `convertToSshUrl`, `GitLabApiClient`) were resolved on ADW's side by its #844 and must not be re-added here.\n","state":"OPEN","author":"paysdoc","labels":["adw:feature"],"createdAt":"2026-09-23T16:45:15Z","comments":[],"actionableComment":null}`

## Feature Description

The forge-neutral domain model in `src/providers/types.ts` is the vocabulary every consumer of
`@paysdoc/devplatform` programs against. Two of its records are missing metadata that ADW's agents
read on every run:

| Record | Today | After this feature |
|---|---|---|
| `Issue` | `id`, `number`, `title`, `body`, `state`, `author`, `labels`, `comments` | + `createdAt: string` (ISO 8601 creation timestamp), + `url: string` (the forge-published issue URL) |
| `PullRequestRecord` | `number`, `body`, `state`, `mergedAt` | + `updatedAt: string` (ISO 8601 last-update timestamp — the "newest first" key for preferred-PR selection), + `url: string` (the forge-published PR URL) |

All four are **required**, following the existing required `PullRequest.url` and
`IssueComment.createdAt` rather than the optional projection fields of `IssueListEntry` (which is a
"project only what was asked for" shape and is explicitly not the precedent).

Both adapters that implement these records populate the new fields from data they already hold:

- **GitHub issue tracker** — `fetchIssueCmd` already projects `createdAt` and `url`
  (`ISSUE_FIELDS` in `src/providers/github/commands/issueCommands.ts`), `parseGitHubIssue`
  already carries them onto `GitHubIssue`, and `mapGitHubIssueToIssue` was simply dropping them.
  The mapper copies them through.
- **GitHub code host** — `listPullRequests()` returns `gh pr list --state all`'s parsed JSON
  unchanged, so the only change is widening `fetchAllPRsCmd`'s `--json` projection to
  `number,body,state,mergedAt,updatedAt,url`. GitHub's CLI returns only the fields a command
  requests, so without the projection change the records can never carry them.
- **Jira issue tracker** — the Jira REST v3 issue payload carries `fields.created` (Jira's
  millisecond `+0000` form, passed through verbatim like `IssueComment.createdAt` already is);
  the type gains it, and `toIssue` maps it to `createdAt`. Jira's payload carries a REST `self`
  link, not a browse URL, so the issue URL is composed as `<instanceUrl>/browse/<KEY>` from the
  instance URL `JiraApiClient` already holds in trailing-slash-normalised form, exposed as a
  public readonly member — so `JiraIssueTracker`'s exported constructor `(client, projectKey,
  logger?)` is **unchanged** and the change stays additive (a minor release, `1.2.0`, not `2.0.0`).
- **GitLab code host** — `listPullRequests()` is a refusing stub and is untouched.

This is a faithful port of the provider-package slice of ADW's two commits `77cbfcbe` and
`ed45b14b` (verified against the local `paysdoc/AI_Dev_Workflow` checkout), with two deliberate
departures: this repo's `.js` import extensions and `src/git/` paths, and — per the issue — the
Jira instance URL is read from the client instead of ADW's third positional constructor argument.

The feature also ports the companion edits ADW made to the existing unit suites (fixture fields and
value assertions), implements the step definitions for the `@adw-16` scenarios in
`features/per-issue/feature-16.feature` (7 hermetic scenarios driving both adapters through the
providers entry point over forge fakes, plus 4 `@packaging` scenarios type-checking a consumer
module against the packed tarball's emitted `.d.ts`), and refreshes the docs that describe these
records.

## User Story

As the ADW switchover (`paysdoc/AI_Dev_Workflow` #840) consuming `@paysdoc/devplatform` from npm
I want `Issue` to carry `createdAt`/`url` and `PullRequestRecord` to carry `updatedAt`/`url`,
populated by the GitHub and Jira adapters
So that deleting ADW's in-repo provider copy compiles cleanly (no `Property 'createdAt' does not
exist on type 'Issue'` errors) and the agents that read issue age, issue links, preferred-PR
ordering, and PR links keep working unchanged.

## Problem Statement

1. ADW's in-repo provider package (its `adws/providers/`) gained the four fields in ADW issue
   #844, merged to `dev`, but they never reached this library. ADW #840 deletes that in-repo copy;
   the migration then fails `tsc` with 19 errors because the library's `Issue` and
   `PullRequestRecord` lack the fields. These two ADW commits are the *entire* remaining delta
   between ADW's `dev` and this repo's last synced source commit.
2. The GitHub adapter already fetches the data (`ISSUE_FIELDS` projects `createdAt,url`;
   `GitHubIssue` carries both) but `mapGitHubIssueToIssue` drops it, and `fetchAllPRsCmd` does not
   ask `gh` for `updatedAt`/`url` at all, so `listPullRequests()` records cannot carry them.
3. The Jira adapter neither types `fields.created` nor exposes its instance URL, so `toIssue`
   has nothing to map `createdAt`/`url` from. ADW solved this with a third positional constructor
   argument on `JiraIssueTracker` — a breaking change for this library, whose `JiraIssueTracker`
   class is publicly exported from `./providers`.
4. There is no committed proof that a consumer of the packed tarball sees the four fields as
   required `string` members in the emitted `.d.ts`, from either entry point that exports them.

## Solution Statement

Widen the two interfaces in `src/providers/types.ts` with the four required, documented fields.
Copy `createdAt`/`url` through `mapGitHubIssueToIssue`. Add `updatedAt,url` to `fetchAllPRsCmd`'s
`--json` projection (the code host's `listPullRequests()` needs no change — it returns the parsed
array). Add `readonly created: string` to `JiraIssueFields`; make `JiraApiClient.instanceUrl` a
public readonly member (already normalised in the constructor — no second `replace`); have
`JiraIssueTracker.toIssue` fill `createdAt: jiraIssue.fields.created` and
`url: \`${this.client.instanceUrl}/browse/${jiraIssue.key}\``, keeping the constructor and
`createJiraIssueTracker` signatures exactly as they are.

Port ADW's companion test edits into the existing suites so they assert the *values* arrive
(the exact timestamps and URLs from the stubbed transport/executor), not merely that the keys
exist; leave the `refusalStubs` suite untouched (it constructs the tracker with two positional
arguments — that is the signature proof). Implement the step definitions for
`features/per-issue/feature-16.feature`: a projection-aware GitHub CLI fake behind a `GitContext`
executor drives `createGitHubIssueTracker`/`createGitHubCodeHost`; a scripted `fetchFn` drives
`createJiraIssueTracker` (and a directly constructed `JiraIssueTracker` over a `JiraApiClient`);
every `Then` reads the returned domain objects or the client's public member. The `@packaging`
steps type-check consumer modules against the real tarball: the four fields read as required
strings from both `@paysdoc/devplatform` and `@paysdoc/devplatform/providers`, the Jira client's
instance URL read as a read-only string, and the Jira tracker constructed with and without a
logger. Refresh `app_docs/forge-providers.md`, `app_docs/github-provider.md`,
`app_docs/bdd-scenarios.md`, `README.md`, `.adw/project.md` and the glossary. Land as
`build-agent: feat: …` (no `!`, no `BREAKING CHANGE` footer) so semantic-release computes
**1.2.0** from the published `v1.1.0`.

## Relevant Files

Use these files to implement the feature:

**The six source files (the port):**
- `src/providers/types.ts` — the forge-neutral domain model; `Issue` (line 53) gains
  `createdAt`/`url`, `PullRequestRecord` (line 144) gains `updatedAt`/`url`. Exported from both
  the root entry (`src/index.ts` → `export * from './providers/types.js'`) and `./providers`.
- `src/providers/github/mappers.ts` — `mapGitHubIssueToIssue` (line 28) copies
  `issue.createdAt`/`issue.url` from the already-populated `GitHubIssue`.
- `src/providers/github/commands/prCommands.ts` — `fetchAllPRsCmd` (line 39) gets the widened
  `--json number,body,state,mergedAt,updatedAt,url` projection.
- `src/providers/jira/jiraTypes.ts` — `JiraIssueFields` (line 37) gains
  `readonly created: string`.
- `src/providers/jira/jiraApiClient.ts` — `private readonly instanceUrl` (line 41) becomes a
  public readonly member; the constructor's `replace(/\/+$/, '')` (line 47) is the one and only
  normalisation.
- `src/providers/jira/jiraIssueTracker.ts` — `toIssue` (line 78) fills `createdAt` and `url`
  from `jiraIssue.fields.created` and `this.client.instanceUrl`; the constructor (line 54) and
  `createJiraIssueTracker` (line 287) are untouched.

**Read-only context (no change expected):**
- `src/providers/github/commands/issueCommands.ts` — `ISSUE_FIELDS` (line 3) already projects
  `createdAt` and `url`; proves no fetch change is needed on the issue path. The CLI fake in the
  step layer answers `fetchIssueCmd`'s exact `--json` list.
- `src/providers/github/ghIssueParsers.ts` — `transformIssueResponse` already carries
  `createdAt`/`url` onto `GitHubIssue` (lines 101–105) with no defaulting; `parseGitHubIssue` is
  what `fetchIssue` feeds the mapper.
- `src/providers/github/domain/issue.ts` — `GitHubIssue.createdAt`/`url` are already required
  (lines 80, 85), so the mapper copy is type-safe with no fallback.
- `src/providers/github/githubIssueTracker.ts` — `fetchIssue` (line 79) is
  `mapGitHubIssueToIssue(parseGitHubIssue(this.gh.fetchIssue(n)))`; unchanged.
- `src/providers/github/githubCodeHost.ts` — `listPullRequests()` (line 231) returns the parsed
  `gh pr list` array as `PullRequestRecord[]`; unchanged — the projection change is what makes
  the records carry the fields.
- `src/providers/github/ghPrApi.ts` — `fetchAllPRs` (line 60) binds `fetchAllPRsCmd`; unchanged.
- `src/providers/gitlab/gitlabCodeHost.ts` — `listPullRequests()` (line 112) is a
  `throw … not implemented` stub; unchanged.
- `src/providers/forgeProviders.ts` — `createJiraIssueTracker(deps.jira, { logger })` (line 111)
  must keep compiling unchanged (the "no new constructor parameter" proof at the assembly site).
- `src/providers/jira/index.ts`, `src/providers/index.ts`, `src/providers/github/index.ts`,
  `src/index.ts` — the barrels; nothing is added or removed (no export widening is in scope).
  `JiraApiClient`, `JiraIssueTracker`, `createJiraIssueTracker`, `createGitHubIssueTracker`,
  `createGitHubCodeHost` are already on `./providers`; `Issue`/`PullRequestRecord` are already
  on both `.` and `./providers`.
- `scripts/smokePackage.ts` — its `EXPECTED_EXPORTS` table is runtime-only; types cannot be
  checked there, so it stays untouched (the `.d.ts` proof is the `@packaging` scenarios).

**Existing unit suites the port touches (existing files only — no new test files):**
- `src/providers/jira/__tests__/jiraIssueTracker.test.ts` — the `ISSUE_NEW` fixture (line 27)
  must gain `created` (typecheck breaks otherwise); the `fetchIssue` test (line 86) gains the
  `createdAt`/`url` value assertions ADW added.
- `src/providers/jira/__tests__/jiraApiClient.test.ts` — `INSTANCE` already carries a trailing
  slash (line 32); one assertion that the public `instanceUrl` member is the normalised value.
- `src/providers/github/__tests__/githubCodeHost.test.ts` — the `listPullRequests` test
  (lines 158–164) pins the exact command string and raw fixture; both change as in ADW.
- `src/providers/github/__tests__/githubIssueTracker.test.ts` — the `fetchIssue` test (line 33)
  already stubs `createdAt: '2026-01-01T00:00:00Z'` and `url: 'https://x'`; add the assertions
  that they arrive on the mapped `Issue`.
- `src/providers/__tests__/refusalStubs.test.ts` — constructs `new JiraIssueTracker({} as
  JiraApiClient, 'ADW')` (lines 35, 40); must keep compiling **unchanged** (do not port ADW's
  third-argument edit — it is the constructor-signature proof).
- `src/providers/github/__tests__/gitContextFixture.ts` — `makeCtx`/`makeSpyExec` fixture the
  GitHub suites use; read-only.

**BDD suite (the `@adw-16` contract and its steps):**
- `features/per-issue/feature-16.feature` — the scenario file for this issue, written by the
  scenario phase and on the branch: 7 hermetic scenarios (GitHub issue fetch; a 4-row Jira
  instance-URL outline; Jira tracker constructed from only a client and a project key; GitHub
  pull-request listing) and 4 `@packaging` scenarios (a 2-row entry-point outline reading the four
  fields as required strings; the Jira client's instance URL as a read-only string; the Jira
  tracker constructor with and without a logger). Its header carries the fixture notes for the
  step layer. It is the contract for Step 7.
- `features/support/world.ts` — `DevPlatformWorld`; gains the slots the new steps need.
- `features/step_definitions/ghRepoApi.steps.ts` — pattern reference for building a
  `GitContext` in the step layer with `createLiteralTokenProvider` and an `exec` indirection (its
  Given phrases are *not* reused — `feature-16` declares its own CLI-fake Given).
- `features/support/publicSurfaceLoader.ts` — `loadProviders`/`resolveExport` dynamic-import
  loader every new `When` step uses.
- `features/step_definitions/packagedConsumer.steps.ts`,
  `features/step_definitions/publicSurfacePackaging.steps.ts`,
  `features/support/packagedConsumer.ts` — `Given the library tarball is installed into a clean
  consumer project` and `Then the subprocess exits {int}` are reused verbatim; `typeCheckInConsumer`
  is the helper for the three new type-check `When` steps.
- `features/regression/vocabulary.md` — rot-detection rules every new phrase must satisfy
  (assert outputs: fetched records, the client's public member, subprocess exit codes).
- `features/per-issue/feature-11.feature`, `features/per-issue/feature-9.feature` — style
  reference for header comments, tags and phrase shapes.

**Documentation to update (conditional-docs owners of the touched paths):**
- `app_docs/forge-providers.md` — owns `src/providers/types.ts`; the Responsibilities/Contracts
  entries for the domain contracts must describe the four new required fields.
- `app_docs/github-provider.md` — owns `src/providers/github/**`; the command-string and mapper
  responsibilities mention the widened `fetchAllPRsCmd` projection and the mapper copy.
- `app_docs/bdd-scenarios.md` — owns `features/**`; add `feature-16.feature`, the new step
  modules and the CLI-fake support module.
- `README.md` — the "Forge-neutral provider interfaces" / "Jira adapter" bullets and the Project
  Structure lines that describe `types.ts` and `features/per-issue/`.
- `.adw/project.md` — the `src/providers/…types.ts` and `src/providers/jira/` bullets.
- `UBIQUITOUS_LANGUAGE.md` — optional glossary rows for `Issue` and `PullRequestRecord`.
- `app_docs/feature-9xqejz-release-automation.md` — read-only: how `bun run release:dry-run` /
  the `release-dry-run` job compute the next version (the `1.2.0` criterion).
- No conditional-docs entry owns `src/providers/jira/**`; the Jira behaviour is documented in
  the README bullet and the `forge-providers.md` contract line (no new app doc is required).

### New Files
- `features/support/ghCliFake.ts` — the projection-aware GitHub CLI fake the two GitHub
  scenarios share: holds one issue (every field `gh issue view` can project, neutral defaults
  for what the Gherkin leaves out) and a list of pull requests (each with a body of its own and
  a `mergedAt` only when `MERGED`), answers `gh issue view <n> … --json <fields>` and
  `gh pr list … --state all --json <fields> …` with the held data projected to exactly
  `<fields>`, and throws naming any other command.
- `features/step_definitions/forgeMetadataGitHub.steps.ts` — the GitHub Given/When/Then steps
  of `feature-16.feature` (git context over the CLI fake, held issue / held pull requests, tracker
  and code host created through the providers entry point, fetched-issue and listed-record
  assertions).
- `features/step_definitions/forgeMetadataJira.steps.ts` — the Jira steps (held issue behind a
  scripted `fetchFn`, tracker via the factory for a given instance URL, client + tracker
  constructed directly, the client's reported instance URL).
- `features/step_definitions/forgeMetadataPackaging.steps.ts` — the three `@packaging`
  type-check `When` steps (required-string field reads from an entry point, read-only instance
  URL, tracker constructor with and without a logger).
- `specs/issue-16-adw-u01ctu-carry-creation-updat-sdlc_planner-forge-metadata-created-updated-url.md`
  — this plan.

## Implementation Plan

### Phase 1: Foundation
Widen the domain model first (`src/providers/types.ts`) with the four required, documented fields.
This immediately turns `bun run typecheck` red at every site that builds an `Issue` or
`PullRequestRecord` without them — the two adapter mappers and the Jira fixture in the existing
unit suite — which is the complete, compiler-enumerated list of follow-up sites (no other
`Issue`/`PullRequestRecord` literal exists in `src/`, `scripts/` or `features/`). Widen the Jira
raw type (`JiraIssueFields.created`) and expose `JiraApiClient.instanceUrl` in the same pass, so
the tracker has typed sources for both fields.

### Phase 2: Core Implementation
Make each adapter populate the fields from data it already holds: the GitHub issue mapper copies
`createdAt`/`url`; `fetchAllPRsCmd` projects `updatedAt,url` so `listPullRequests()`'s parsed
records carry them; `JiraIssueTracker.toIssue` maps `fields.created` and composes
`<instanceUrl>/browse/<KEY>` from the client's normalised URL — never through a new constructor
argument. Port ADW's companion edits into the existing unit suites so they assert the values
arrive, and typecheck/unit-test are green again.

### Phase 3: Integration
Implement the `@adw-16` step definitions against `feature-16.feature`: a projection-aware GitHub
CLI fake and a scripted Jira transport drive both adapters through the providers entry point, and
every assertion reads the returned domain objects (fetched issue, listed records, the client's
public instance URL); the `@packaging` steps type-check consumer modules against the real tarball
for the four required-string fields from both entry points, the read-only Jira instance URL, and
the unchanged Jira tracker constructor. Update the documentation set, and land the branch as a
`feat:` commit so the PR's `release-dry-run` job prints `1.2.0`.

## Step by Step Tasks
Execute every step in order, top to bottom.

### 1. Confirm the green baseline, the RED scenario baseline, and the release state
- `bun install`.
- `bun run typecheck` → clean. `bun run lint:git-guard` → both rules PASS.
- `bun run test:unit` → **45 files / 961 tests** green (verified 2026-09-23). No new unit-test
  *file* is added by this plan; the count rises only by the assertions added inside existing
  suites (Step 6), and the file count must stay 45.
- `bun run test:e2e --tags "not @packaging"` → **42 scenarios / 298 steps** green (the `@adw-9`
  and `@adw-11` hermetic suites).
- `features/per-issue/feature-16.feature` is on the branch (scenario phase output).
  `bun run test:e2e --tags "@adw-16"` reports all **11** of its scenarios (7 hermetic + 4
  `@packaging`; outline rows count individually) as undefined and exits non-zero under
  `strict: true` — that is the RED baseline, and why CI's `check` job is red on this branch until
  Step 7 lands. Once Step 7's steps exist and before Steps 2–4 land, the GitHub issue scenario
  fails on the mapping that drops `createdAt`/`url`, the PR-listing scenario fails because the
  CLI fake returns only the fields the old projection requests, the Jira scenarios fail on the
  missing `createdAt`/`url`, the required-strings `@packaging` outline fails on the four missing
  members, and the read-only `@packaging` scenario fails on the private `instanceUrl` — each for
  the reason the issue names. Two expected non-reds: the hermetic `Then the Jira API client
  reports the instance URL …` step already passes (TypeScript's `private` is erased at runtime,
  so that scenario goes red on its browse-URL step, not on the client read), and the
  constructor `@packaging` scenario is green from the start — it guards the unchanged
  `(client, projectKey, logger?)` signature rather than driving a change.
- Release state (verified 2026-09-23): `origin` tags are `v1.0.0` and `v1.1.0` (the latter on
  the PR #14 merge commit `9981481`); npm has `1.0.0` and `1.1.0`; the only commits on `main`
  since `v1.1.0` are a `ci:` commit and a merge. So the next `feat:` computes **1.2.0** — exactly
  the issue's criterion. Do not create tags or touch `release.config.js`.
- Confirm the port's source of truth once (read-only): in the local
  `/Users/martin/projects/paysdoc/AI_Dev_Workflow` checkout, `git show 77cbfcbe -- adws/providers`
  and `git show ed45b14b -- adws/providers` are the provider-package diffs being ported (types,
  GitHub mapper, `prCommands`, Jira types/tracker, and the three test files). Port; never
  cherry-pick — paths and `.js` extensions differ, and the Jira constructor edit is *not* ported.

### 2. Widen the domain model — `src/providers/types.ts`
- `Issue` (line 53): append two required members, each with a one-line docblock:
  ```ts
  /** ISO 8601 creation timestamp — read by ADW's plan/scenario agent prompts (ADW #844). */
  createdAt: string;
  /** The forge-published issue URL — read by ADW's build agent prompt (ADW #844). */
  url: string;
  ```
- `PullRequestRecord` (line 144): append two required members:
  ```ts
  /** ISO 8601 last-update timestamp — the "newest first" ordering key for preferred-PR selection (ADW #844). */
  updatedAt: string;
  /** The forge-published pull-request URL (ADW #844). */
  url: string;
  ```
- Refresh the `PullRequestRecord` docblock (line 143) so it no longer says the record is
  projected to "what issue-link detection needs" only: it now also carries the update timestamp
  and URL the HITL board notifier reads.
- Both stay non-optional (`string`, not `string | undefined`, not `?:`); `IssueListEntry`,
  `MergedPullRequestRecord`, `PullRequestSummary`, `IssueSummary` are untouched. Timestamps are
  passed through in each forge's own format (GitHub `Z`-suffixed, Jira millisecond `+0000`) —
  no reformatting anywhere.
- Checkpoint: `bun run typecheck` now fails at exactly the sites Phase 1 predicts —
  `src/providers/github/mappers.ts` (`mapGitHubIssueToIssue`) and
  `src/providers/jira/jiraIssueTracker.ts` (`toIssue`) — and nowhere else. Anything else that
  turns red is an unexpected literal and must be fixed in Steps 3–6, never by making a field
  optional.

### 3. GitHub adapter — mapper and PR projection
- `src/providers/github/mappers.ts`, `mapGitHubIssueToIssue`: add `createdAt: issue.createdAt`
  and `url: issue.url` to the returned object. No fallback (`GitHubIssue.createdAt`/`url` are
  required; `transformIssueResponse` never defaults them). Read `createdAt` from `createdAt`,
  never from `updatedAt` (the scenario's held issue was updated after it was created, so the
  wrong source fails). Update the function docblock to say the creation timestamp and URL are
  carried through.
- `src/providers/github/commands/prCommands.ts`, `fetchAllPRsCmd`: the command becomes exactly
  `gh pr list --repo ${owner}/${repo} --state all --json number,body,state,mergedAt,updatedAt,url --limit 200`
  (field order as written — the unit test pins the literal string).
- `githubCodeHost.ts` `listPullRequests()` stays `JSON.parse(this.gh.fetchAllPRs()) as
  PullRequestRecord[]` — the parsed objects now carry `updatedAt`/`url` because `gh` was asked
  for them. Do not add a mapper or a filter (the OPEN filter ADW added lives in ADW's notifier,
  not in the port); `body`, `state` and `mergedAt` keep arriving as before.
- `fetchMergedPRsCmd`, `findPRByBranchCmd`, `fetchPRListCmd` are untouched.
- Checkpoint: `bun run typecheck` — the GitHub mapper error is gone.

### 4. Jira adapter — raw type, client member, tracker mapping
- `src/providers/jira/jiraTypes.ts`, `JiraIssueFields`: add
  `/** ISO 8601 creation timestamp. */ readonly created: string;` (required, like `summary`).
- `src/providers/jira/jiraApiClient.ts`: change `private readonly instanceUrl: string;` to a
  public readonly member with a docblock:
  ```ts
  /** The trailing-slash-normalised Jira instance URL every request is built on (issue #16: also the base of the `…/browse/<KEY>` issue URL). */
  readonly instanceUrl: string;
  ```
  Keep the constructor's single `instanceUrl.replace(/\/+$/, '')` (it strips *every* trailing
  slash, so `https://acme.atlassian.net//` normalises too, and a context path such as
  `https://jira.example.com/jira/` keeps its path); add no second normalisation anywhere.
  `auth`, `logger`, `fetchFn` stay private. Refresh the module docblock's stale
  `adws/gitContext/types.ts` reference to `src/git/types.ts` while there.
- `src/providers/jira/jiraIssueTracker.ts`, `toIssue`: add
  `createdAt: jiraIssue.fields.created,` and
  `url: \`${this.client.instanceUrl}/browse/${jiraIssue.key}\`,`. Read the URL from the client at
  call time; add **no** field, **no** constructor parameter, **no** change to
  `createJiraIssueTracker`'s body or signature, and no change to `JiraConfig`.
- `validateJiraConfig` already rejects a blank `instanceUrl`, so a tracker built through the
  factory always has a non-empty base; a tracker constructed directly with a client is bound to
  whatever the client was given (the refusal-stub tests construct one with `{} as JiraApiClient`
  and never call `toIssue`).
- Checkpoint: `bun run typecheck` is clean again except for the Jira unit fixture
  (`jiraIssueTracker.test.ts` `ISSUE_NEW` lacks `created`), fixed in Step 6.

### 5. Confirm no other construction site exists
- `grep -rn -E "PullRequestRecord|: Issue\b|<Issue>" src features scripts` — every hit is one of
  the files above (types, the two adapters, the GitLab stub, the tracker port signature). Nothing
  in `features/` or `scripts/` builds either record today.
- `git diff --stat -- src/providers/index.ts src/providers/jira/index.ts
  src/providers/github/index.ts src/index.ts package.json` must be empty: no export widening,
  no manifest change.

### 6. Port the companion edits into the existing unit suites (values, not keys)
- `src/providers/jira/__tests__/jiraIssueTracker.test.ts`:
  - `ISSUE_NEW.fields` gains `created: '2026-01-01T00:00:00.000Z'` (typecheck requires it;
    `ISSUE_DONE` spreads it).
  - In `fetchIssue maps the response using the injected projectKey` (line 86), add
    `expect(issue.createdAt).toBe('2026-01-01T00:00:00.000Z');` and
    `expect(issue.url).toBe('https://acme.atlassian.net/browse/ADW-7');` — the URL is composed
    from `INSTANCE` (`https://acme.atlassian.net`, no trailing slash) and the key.
  - Add one test in the same `describe`: a tracker created with
    `instanceUrl: 'https://acme.atlassian.net/'` (trailing slash) still reports
    `issue.url === 'https://acme.atlassian.net/browse/ADW-7'` — proving the client's single
    normalisation is what the tracker reads (no double slash, no second `replace`).
- `src/providers/jira/__tests__/jiraApiClient.test.ts`: add one test asserting
  `new JiraApiClient('https://acme.atlassian.net/', CLOUD_AUTH, { fetchFn }).instanceUrl` equals
  `'https://acme.atlassian.net'` (the public member is the normalised value).
- `src/providers/github/__tests__/githubCodeHost.test.ts`, `listPullRequests spawns the exact
  all-state command…` (line 158): the raw fixture becomes
  `[{ number: 1, body: 'Closes #1', state: 'MERGED', mergedAt: '2024-01-01', updatedAt: '2024-01-01T00:00:00Z', url: 'https://github.com/acme/widget/pull/1' }]`,
  the pinned command string becomes
  `'gh pr list --repo acme/widget --state all --json number,body,state,mergedAt,updatedAt,url --limit 200'`,
  and — beyond `toEqual(raw)` — assert `result[0].updatedAt` and `result[0].url` are the exact
  fixture values (a `PullRequestRecord`-typed read, so the compiler proves the fields exist and
  the runtime proves the values arrive).
- `src/providers/github/__tests__/githubIssueTracker.test.ts`, `fetchIssue maps a raw payload to
  Issue…` (line 33): add `expect(issue.createdAt).toBe('2026-01-01T00:00:00Z');` and
  `expect(issue.url).toBe('https://x');` (the stub payload already carries both, with a distinct
  `updatedAt`, so a mapper reading the wrong source fails).
- `src/providers/__tests__/refusalStubs.test.ts`: **no edit** — `new JiraIssueTracker({} as
  JiraApiClient, 'ADW')` compiling unchanged is the constructor-signature proof. If it does not
  compile, the implementation broke the signature; fix the implementation.
- Checkpoint: `bun run typecheck` clean; `bun run test:unit` green with **45 files** and
  961 + the added tests (report the new count); `bun run lint:git-guard` unchanged (the test
  edits contain command *strings* inside `src/providers/github/`, an exempt package).

### 7. Implement the step definitions for the `@adw-16` scenarios
- `features/per-issue/feature-16.feature` is the contract (7 hermetic scenarios including the
  4-row Jira outline, plus 4 `@packaging` including the 2-row entry-point outline); its header's
  "Fixture notes for the step layer" are binding. Implement steps for it; when a scenario stays
  red, fix the implementation, not the scenario — report a genuine Gherkin bug rather than editing
  the feature file silently. Reuse verbatim the two shared phrases `Given the library tarball is
  installed into a clean consumer project` and `Then the subprocess exits {int}`
  (`packagedConsumer.steps.ts`); every other phrase in the file is new (cucumber rejects duplicate
  patterns, so do not redefine those two).
- **Loading**: every `When` step resolves the factory/class it needs
  (`createGitHubIssueTracker`, `createGitHubCodeHost`, `createJiraIssueTracker`, `JiraApiClient`,
  `JiraIssueTracker`) through `loadProviders()` + `resolveExport()`
  (`features/support/publicSurfaceLoader.ts`) so a wrong or missing export fails only that
  scenario with a legible message. `GitContext` and `createLiteralTokenProvider` may be imported
  statically from `src/git/index.js` as `ghRepoApi.steps.ts` does. Every assertion reads an
  *output* — a fetched `Issue`, a listed `PullRequestRecord`, the client's public `instanceUrl`,
  or a consumer subprocess's exit code — never a source file.
- **GitHub CLI fake** (`features/support/ghCliFake.ts`): a factory returning an `ExecFn` over a
  mutable held state `{ issue?, pullRequests }`. It parses the `--json <fields>` list out of the
  command; for a command starting `gh issue view <n>` it returns the held issue projected to
  exactly those fields (JSON object); for `gh pr list … --state all` it returns the held pull
  requests projected to those fields (JSON array); any other command throws
  `Error('unexpected gh command: …')`. The held issue carries every field `ISSUE_FIELDS` can
  project (`number,title,body,state,author,assignees,labels,milestone,comments,createdAt,updatedAt,closedAt,url`)
  with neutral defaults (`title: 'Issue 42'`, `body: ''`, `state: 'OPEN'`, `author: { login:
  'octocat' }`, empty `assignees`/`labels`/`comments`, `milestone: null`, `closedAt: null`) and
  the Gherkin-declared `createdAt`, `updatedAt`, `url`. Each held pull request gets `body:
  \`Body of PR #${number}\`` and `mergedAt` only when `state === 'MERGED'` (else `null`).
- **`Given a git context for {string} whose executor answers like the GitHub CLI, returning only
  the fields a command requests`**: build a `GitContext` for the repository (`selfHost: false`,
  `createLiteralTokenProvider('scenario-token')`, a complete test identity, temp
  `frameworkRepoRoot`/`targetReposDir`) with `deps.exec` bound to the fake; store the fake's
  held state and the parsed `RepoIdentifier` (`Platform.GitHub`) on the World.
- **`Given GitHub holds issue #{int} created at {string}, last updated at {string}, with the URL
  {string}`** / **`Given GitHub holds these pull requests`** (table `number|state|updatedAt|url`):
  fill the held state.
- **`When a GitHub issue tracker created through the providers entry point fetches issue
  #{int}`**: `createGitHubIssueTracker(ctx, repoId)` then `await fetchIssue(n)` → `world.fetchedIssue`.
- **`When a GitHub code host created through the providers entry point lists every pull
  request`**: `createGitHubCodeHost(ctx, repoId).listPullRequests()` → `world.listedPullRequests`.
- **`Then the fetched issue was created at {string}`** / **`Then the fetched issue's URL is
  {string}`**: strict-equal against `world.fetchedIssue.createdAt` / `.url` (shared by the
  GitHub and Jira scenarios — define once).
- **`Then the listed pull requests carry`** (table `number|updatedAt|url`): match listed records
  to rows by `number`, expect exactly one listed record per row, compare only the named columns.
  **`Then each listed pull request still carries the body, state and merge timestamp GitHub holds
  for it`**: compare `body`, `state`, `mergedAt` (null when not merged) against the held state.
- **Jira fake**: a scripted `fetchFn` answering `GET …/rest/api/3/issue/ADW-7` (the feature
  file's wording) — match the method and a URL whose path, query string aside, ends
  `/rest/api/3/issue/ADW-7`; never rebuild the expected URL from the Gherkin's raw instance URL.
  The client requests `<normalised instance URL>/rest/api/3/issue/ADW-7?expand=renderedFields`,
  so a match built from `https://acme.atlassian.net/`, `…net//` or `https://jira.example.com/jira/`
  would miss and fail those outline rows for the wrong reason. Answer with a
  `JiraIssueResponse`-shaped payload (`id`, `key: 'ADW-7'`, `fields: { summary, description (ADF
  doc), status { name, statusCategory { id, key: 'new', name } }, creator { displayName },
  labels: [], comment, created: <declared>, updated: <declared> }`, plus a REST `self` link and
  *no* browse URL), and throw on anything else; global `fetch` is never reached. `updated` is
  an extra key the type does not declare — fine for a scripted payload (cast via `unknown`) and
  it makes a `createdAt` read from the wrong field fail.
- **`Given Jira holds issue {string} created at {string}, last updated at {string}`**: store the
  held issue on the World. **`When a Jira issue tracker for project {string} at {string} created
  through the providers entry point fetches issue {int}`**: `createJiraIssueTracker({ instanceUrl,
  projectKey, auth: { pat: 'scenario-pat' } }, { fetchFn })` then `await fetchIssue(7)` →
  `world.fetchedIssue` (the same slot the shared `Then` steps read).
- **`When a Jira API client for {string} is constructed through the providers entry point`**:
  `new JiraApiClient(instanceUrl, { pat: 'scenario-pat' }, { fetchFn })` → `world.jiraClient`.
  **`When a Jira issue tracker constructed from only that client and the project key {string}
  fetches issue {int}`**: `new JiraIssueTracker(client, projectKey)` — two positional arguments —
  then `await fetchIssue(7)`. **`Then the Jira API client reports the instance URL {string}`**:
  strict-equal against `world.jiraClient.instanceUrl` (structurally typed on the World as
  `{ readonly instanceUrl: string }`).
- **World slots** (`features/support/world.ts`): `ghFakeState?`, `ghRepoId?`, `fetchedIssue?:
  { createdAt: string; url: string }`, `listedPullRequests?: readonly { number: number; body:
  string; state: string; mergedAt: string | null; updatedAt: string; url: string }[]`,
  `jiraHeldIssue?`, `jiraClient?: { readonly instanceUrl: string }`, `jiraFetchFn?`; keep types
  structural (no adapter-internal type imports into the step layer beyond what `world.ts` already
  does). `ghContext` already exists and can be reused.
- **`@packaging` steps** (`features/step_definitions/forgeMetadataPackaging.steps.ts`), all via
  `typeCheckInConsumer()` and asserting only through `Then the subprocess exits 0`:
  - **`When the consumer type-checks a module that reads these fields from {string} as required
    strings`** (table `type|field`): generate a `.ts` module that imports the table's distinct
    `type` names as types from `<entryPoint>` (for this table, `import type { Issue,
    PullRequestRecord } from '<entryPoint>'`) and, per row, exports a function returning the field
    where a `string` is expected under `strict` — e.g.
    `export function read_Issue_createdAt(value: Issue): string { return value.createdAt; }` —
    so a missing member, an optional member (`string | undefined`) or a non-string member fails
    the check. Run once per outline row (`@paysdoc/devplatform`, `@paysdoc/devplatform/providers`).
  - **`When the consumer type-checks a module that reads the instance URL of a Jira API client
    from {string} as a read-only string`**: a module that constructs `new JiraApiClient('https://acme.atlassian.net/', { pat: 'x' })`,
    exports `const url: string = client.instanceUrl`, and adds a `// @ts-expect-error instanceUrl
    is read-only` guarded reassignment `client.instanceUrl = '…'` — if the member is writable the
    unused directive fails the check; if it is missing or not a string the read fails.
  - **`When the consumer type-checks a module that constructs a Jira issue tracker from {string}
    with an API client and a project key, with and without a logger`**: a module that builds
    `new JiraIssueTracker(client, 'ADW')` and `new JiraIssueTracker(client, 'ADW', (message,
    level) => { void message; void level; })` — the emitted declarations must accept both (the
    surface property behind the "no breaking change / 1.2.0" criterion).
- Run `bun run test:e2e --tags "@adw-16 and not @packaging"` → 7 scenarios green;
  `bun run test:e2e --tags "@packaging"` → the 2 `@adw-9`, 4 `@adw-11` and 4 `@adw-16` packaging
  scenarios green; `bun run test:e2e` → everything green with no undefined/pending steps
  (`strict: true`).
- `bun run typecheck` must stay clean (`tsconfig.json` includes `features/**/*.ts`); keep every
  step/support module under the 300-line cap.

### 8. Update the documentation set
- `app_docs/forge-providers.md`: in Responsibilities (`types.ts` bullet) and Contracts, state
  that `Issue` carries required `createdAt`/`url` and `PullRequestRecord` carries required
  `updatedAt`/`url` (issue #16), that both adapters populate them and pass timestamps through in
  the forge's own format, that `IssueListEntry` remains the only "optional projection" shape,
  and that the Jira issue URL is `<instanceUrl>/browse/<KEY>` composed from
  `JiraApiClient.instanceUrl` (public readonly, normalised once) so `JiraIssueTracker`'s
  constructor stayed unchanged.
- `app_docs/github-provider.md`: in the command-string bullet note `fetchAllPRsCmd` projects
  `number,body,state,mergedAt,updatedAt,url`; in the port-implementations bullet note
  `mapGitHubIssueToIssue` carries `createdAt`/`url` through (no fetch change — `ISSUE_FIELDS`
  already projected them); in Contracts/Gotchas note `listPullRequests()` returns `gh`'s parsed
  records unchanged, so the projection is the contract.
- `app_docs/bdd-scenarios.md`: add `feature-16.feature`, the three new step modules and
  `features/support/ghCliFake.ts` to the Responsibilities list; note that the packaging steps
  prove required-ness through `string`-typed reads and read-only-ness through an
  `@ts-expect-error`-guarded reassignment.
- `README.md`: in "What it does", extend the "Forge-neutral provider interfaces" bullet (or the
  domain-model mention) with the creation/update metadata and the "Jira adapter" bullet with the
  `…/browse/<KEY>` issue URL; update the Project Structure line for `features/per-issue/`
  (`feature-16.feature`) and `features/support/` (the CLI fake) if it lists files.
- `.adw/project.md`: extend the `src/providers/…types.ts` and `src/providers/jira/` bullets
  accordingly (optionally correct the stale "v1.1.0 release run failed" sentence in the overview:
  `1.1.0` is published; the next release is `1.2.0`).
- `UBIQUITOUS_LANGUAGE.md` (optional): rows for **Issue** (the forge-neutral issue record,
  including `createdAt`/`url`; aliases to avoid: ticket, GitHub issue) and **PullRequestRecord**
  (every-PR projection with `state`, `mergedAt`, `updatedAt`, `url`; aliases to avoid: PR summary).
- `.adw/conditional_docs.md` needs no new entry (every touched file already has an owner, or —
  for `src/providers/jira/**` — deliberately none).

### 9. Commit as an additive `feat:` and open the PR
- Commit header: `build-agent: feat: carry creation/update metadata on Issue and
  PullRequestRecord` (or plain `feat: …`). **No `!`**, **no `BREAKING CHANGE:` footer**, in any
  commit on the branch — `release.config.js`'s parser turns either into a major.
- The PR description must call out the API change for the reviewer (`.adw/review_proof.md`):
  four required fields added to two exported interfaces; `JiraApiClient` gains a public readonly
  `instanceUrl`; `JiraIssueTracker`'s constructor and every barrel are unchanged; additive —
  minor release.
- On the PR, the `release-dry-run` job must print `==> next release version: 1.2.0`. Locally,
  `bun run release:dry-run` (needs push access to `origin`) shows the same.

### 10. Run the validation commands
- Execute every command under `## Validation Commands`; each must exit zero. Report the
  unit-test counts (45 files; tests = 961 + the assertions added in Step 6), the scenario counts
  (42 hermetic baseline + 7 `@adw-16` = 49; 6 packaging baseline + 4 `@adw-16` = 10), and the
  dry-run version (`1.2.0`).

## Testing Strategy

### Unit Tests
Deviation, stated openly: `.adw/project.md` has no `## Unit Tests` section, which by the planning
rules means "plan no unit-test work". This issue's acceptance criteria, however, explicitly require
that "unit tests assert the values arrive, not that the fields exist" and that `bun run test:unit`
is green — and widening a required field necessarily changes existing fixtures and pinned command
strings in the current suites (`bun run typecheck` covers `src/**/__tests__/**`). The issue is the
arbiter, so this plan ports ADW's companion test edits into the **existing** suites and creates
**no new unit-test file**; a maintainer who wants future plans to include unit tests without this
tension should add `## Unit Tests: enabled` to `.adw/project.md`.

- `jiraIssueTracker.test.ts` — `fetchIssue` yields `createdAt === '2026-01-01T00:00:00.000Z'`
  and `url === 'https://acme.atlassian.net/browse/ADW-7'` from the scripted payload; a
  trailing-slash `instanceUrl` yields the same `url` (single normalisation, read from the client).
- `jiraApiClient.test.ts` — the public `instanceUrl` member is the normalised value.
- `githubCodeHost.test.ts` — `listPullRequests()` spawns the widened projection string exactly,
  and the returned records carry the fixture's `updatedAt`/`url` values.
- `githubIssueTracker.test.ts` — `fetchIssue` yields the stub payload's `createdAt` and `url`.
- `refusalStubs.test.ts` — unchanged and still compiling with two positional constructor
  arguments (signature proof).
- The suite's file count stays 45; the test count rises by the added assertions only.

### BDD Scenarios (`features/per-issue/feature-16.feature`, tag `@adw-16`)
The feature file is the contract; this section mirrors it. Every scenario builds an adapter from
`@paysdoc/devplatform/providers` over a forge fake and asserts the values that arrive on the
returned domain objects — never merely that a field exists, never a source file. Adapters are
built with their own factories (and, for Jira, the tracker's constructor) rather than through
`forgeProviders()`, whose Jira path has no transport seam.

Hermetic — 7 scenarios (`bun run test:e2e --tags "@adw-16 and not @packaging"`):
- **GitHub issue** — a git context for `paysdoc/devplatform` whose executor answers like the
  GitHub CLI (only the requested `--json` fields), holding issue #42 created at
  `2026-09-01T10:15:00Z`, last updated `2026-09-22T16:40:00Z`, URL
  `https://github.com/paysdoc/devplatform/issues/42`: the tracker created through the providers
  entry point fetches #42 and the fetched issue was created at the creation timestamp (not the
  update one) with that URL.
- **Jira issue, 4-row instance-URL outline** — Jira holds `ADW-7` created at
  `2026-09-01T10:15:00.000+0000` (updated later): the tracker for project `ADW` at
  `https://acme.atlassian.net`, `https://acme.atlassian.net/`, `https://acme.atlassian.net//`,
  and `https://jira.example.com/jira/` fetches issue 7; `createdAt` is the Jira timestamp
  verbatim and `url` is `https://acme.atlassian.net/browse/ADW-7` for the first three and
  `https://jira.example.com/jira/browse/ADW-7` for the context-path instance.
- **Jira tracker from only a client and a project key** — a `JiraApiClient` for
  `https://acme.atlassian.net/` constructed through the providers entry point reports the
  instance URL `https://acme.atlassian.net`; a `JiraIssueTracker` constructed from only that
  client and `ADW` fetches issue 7 with URL `https://acme.atlassian.net/browse/ADW-7` — no new
  constructor argument needed.
- **GitHub pull-request records** — GitHub holds PRs #14 (OPEN), #13 (MERGED), #12 (CLOSED) with
  distinct `updatedAt`/`url`: the code host created through the providers entry point lists
  every pull request; each listed record carries the row's `updatedAt` and `url` (matched by
  number, exactly one record per row), and still carries the body, state and merge timestamp
  GitHub holds for it.

`@packaging` — 4 scenarios (`bun run test:e2e --tags "@packaging"`; real tarball, clean consumer,
`tsc` exit code is the evidence):
- **Required strings from `@paysdoc/devplatform` and from `@paysdoc/devplatform/providers`**
  (outline) — a consumer module reads `Issue.createdAt`, `Issue.url`,
  `PullRequestRecord.updatedAt`, `PullRequestRecord.url` where a `string` is expected under
  `strict`; exit 0 (a missing, optional or non-string member would fail).
- **Read-only Jira instance URL** — a module reads `JiraApiClient#instanceUrl` as a `string` and
  carries an `@ts-expect-error`-guarded reassignment; exit 0 (a writable member would fail).
- **Unchanged Jira tracker constructor** — a module constructs `JiraIssueTracker` from a client
  and a project key, with and without a logger; exit 0.

Deliberately not scenario-covered (per the feature file's header): the `feat:` commit without
`!`/`BREAKING CHANGE` and the `release-dry-run` computing `1.2.0` are release-process outcomes
(Steps 9–10); `GitLabCodeHost.listPullRequests()` stays a refusing stub; the names ADW resolved on
its own side are out of scope and their absence is not pinned.

Step vocabulary: reuse `Given the library tarball is installed into a clean consumer project` and
`Then the subprocess exits {int}`; every other phrase is new (no registry gate is configured) and
asserts outputs (`features/regression/vocabulary.md` rot rules) — fetched domain objects, the
client's public member, subprocess exit codes.

### Edge Cases
- **Required, not optional** — `createdAt`/`url`/`updatedAt` are `string`; never `?:` or
  `| undefined`. The compiler-enumerated construction sites (two mappers, one Jira fixture) are
  the complete follow-up list; the `@packaging` required-string reads prove it to a consumer from
  both entry points that export the types.
- **`IssueListEntry` is not the precedent** — its `createdAt?`/`updatedAt?` stay optional (a
  caller-chosen projection); do not "harmonise" it.
- **Jira trailing slashes and context paths** — `JiraApiClient` normalises once in its
  constructor with `replace(/\/+$/, '')`, which strips one *or more* trailing slashes and keeps a
  context path; `toIssue` reads `this.client.instanceUrl` and must not `replace` again.
  `https://acme.atlassian.net`, `…net/` and `…net//` all produce `https://acme.atlassian.net/browse/ADW-7`;
  `https://jira.example.com/jira/` produces `https://jira.example.com/jira/browse/ADW-7`.
- **Jira key parsing is unchanged** — `number` still comes from the key's last `-` segment;
  `url` uses the whole key (`ADW-7`), never the parsed number, so a project key containing a
  hyphen still links correctly. Jira's payload has a REST `self` link, never a browse URL — the
  URL is always composed, never read from the payload.
- **Timestamp formats pass through verbatim** — GitHub's `Z`-suffixed ISO 8601 and Jira's
  `.000+0000` form; no parsing, no reformatting (as `IssueComment.createdAt` already does).
  `createdAt` must come from the creation field, not the update field — every held fixture is
  updated after it is created so the wrong source fails.
- **`{} as JiraApiClient` in the refusal-stub tests** — the tracker reads the client's
  `instanceUrl` lazily inside `toIssue`, so a stub client never reaches it (the stubs throw first).
- **GitHub `listPullRequests()` is pass-through** — records are whatever `gh` returns, and `gh`
  returns only the requested `--json` fields (the CLI fake mimics that), so the projection string
  *is* the contract; `updatedAt` and `url` are long-standing `gh pr list` fields.
- **`fetchAllPRsCmd` field order** — the unit test pins the literal
  `number,body,state,mergedAt,updatedAt,url`; keep it exactly so the pinned string does not drift.
- **`mapGitHubIssueToIssue` has no fallback** — `GitHubIssue.createdAt`/`url` are required and
  `transformIssueResponse` copies them raw; a `gh` payload missing them would surface as
  `undefined` at runtime (same behaviour as `GitHubIssue` today); no new defaulting is added.
- **The CLI fake refuses unknown commands** — `createGitHubIssueTracker`/`createGitHubCodeHost`
  issue no command at construction (`assertContextBoundTo` + `createGhRepoApi` are pure), so only
  the one `gh issue view` / `gh pr list` command reaches the fake per scenario.
- **`@ts-expect-error` semantics** — the read-only packaging module relies on `tsc` failing on an
  *unused* `@ts-expect-error` directive; the member must therefore be `readonly` in the emitted
  `.d.ts` (a public field declared `readonly` emits as `readonly instanceUrl: string;`).
- **No export widening** — `Issue`/`PullRequestRecord` were already exported from `.` and
  `./providers`; `JiraApiClient`/`JiraIssueTracker` were already exported from `./providers`; no
  barrel changes. `readLocalRepoInfo`, `parseGitHubIssue`, `selectPreferredPR`, `convertToSshUrl`,
  `GitLabApiClient` stay off the barrels.
- **`GitLabCodeHost.listPullRequests()`** stays a refusing stub — its return type widens with the
  interface and it still throws before building any record.
- **Release arithmetic** — `v1.1.0` is published and tagged on `9981481`; nothing releasable sits
  between it and `main`'s head, so one `feat:` yields `1.2.0`. A `!` or `BREAKING CHANGE:` on
  *any* commit in the branch would flip the dry-run to `2.0.0` and fail the issue's criterion.

## Acceptance Criteria
- `src/providers/types.ts`: `Issue` has required `createdAt: string` and `url: string`;
  `PullRequestRecord` has required `updatedAt: string` and `url: string`; no other interface
  changes.
- `mapGitHubIssueToIssue` returns `createdAt`/`url` copied from `GitHubIssue`;
  `fetchAllPRsCmd(owner, repo)` returns exactly
  `gh pr list --repo <owner>/<repo> --state all --json number,body,state,mergedAt,updatedAt,url --limit 200`;
  `GitHubCodeHost.listPullRequests()` records carry `updatedAt`/`url` alongside `body`, `state`,
  `mergedAt`.
- `JiraIssueFields.created: string` exists; `JiraApiClient.instanceUrl` is a public readonly
  member holding the once-normalised URL; `JiraIssueTracker.toIssue` yields
  `createdAt === fields.created` and `url === \`${client.instanceUrl}/browse/${key}\``.
- `JiraIssueTracker`'s constructor is still `(client: JiraApiClient, projectKey: string, logger?:
  Logger)`; `createJiraIssueTracker(config, deps?)` is unchanged; `refusalStubs.test.ts` is
  unmodified and green; `git diff origin/main -- src/providers/index.ts src/providers/jira/index.ts
  src/providers/github/index.ts src/index.ts package.json` is empty.
- Unit suites assert the values: the exact timestamps and URLs from the stubbed transport /
  executor arrive on the mapped `Issue` and on the listed `PullRequestRecord`s (GitHub and Jira);
  `bun run test:unit` is green with 45 files.
- All 11 `@adw-16` scenarios pass with no undefined or pending steps: the 7 hermetic ones in
  `bun run test:e2e --tags "not @packaging"` alongside the 42 existing, and the 4 `@packaging`
  ones proving a typed consumer of the real tarball reads all four fields as required strings
  from both `@paysdoc/devplatform` and `@paysdoc/devplatform/providers`, reads the Jira client's
  instance URL as a read-only string, and still constructs the Jira tracker with and without a
  logger.
- `bun run typecheck`, `bun run lint:git-guard`, `bun run test:unit`,
  `bun run test:e2e --tags "not @packaging"` all pass; `bun run build` emits the four members in
  `dist/providers/types.d.ts` and `readonly instanceUrl: string` in
  `dist/providers/jira/jiraApiClient.d.ts`.
- The branch's commits are `feat:` (agent-prefixed allowed) with no `!` and no `BREAKING CHANGE:`
  footer; the PR's `release-dry-run` job prints `next release version: 1.2.0`.
- `app_docs/forge-providers.md`, `app_docs/github-provider.md`, `app_docs/bdd-scenarios.md`,
  `README.md` and `.adw/project.md` describe the four fields and the Jira URL composition.

## Validation Commands
Execute every command to validate the feature works correctly with zero regressions.

- `bun install` — no new dependency is needed.
- `bun run typecheck` — `tsc --noEmit` over `src/**` (including `__tests__`), `scripts/**`,
  `features/**`; zero errors.
- `bun run lint:git-guard` — both rules PASS; sanctioned construction sites still exactly one
  (`src/providers/forgeProviders.ts`).
- `bun run test:unit` — green; 45 files; tests ≥ 961 (report the exact count).
- `bunx vitest run src/providers/jira src/providers/github/__tests__/githubCodeHost.test.ts src/providers/github/__tests__/githubIssueTracker.test.ts src/providers/__tests__/refusalStubs.test.ts` —
  the suites touched by the port, in isolation.
- `bun run test:e2e --tags "@adw-16 and not @packaging"` — all 7 hermetic #16 scenarios pass.
- `bun run test:e2e --tags "not @packaging"` — the 42 existing hermetic scenarios plus the 7 new
  ones pass (49), no undefined/pending steps.
- `bun run build && grep -nE "createdAt|updatedAt|url" dist/providers/types.d.ts && grep -n "readonly instanceUrl: string" dist/providers/jira/jiraApiClient.d.ts` —
  the emitted declaration for `Issue` shows `createdAt: string;` and `url: string;`, for
  `PullRequestRecord` shows `updatedAt: string;` and `url: string;` (no `?`), and the Jira client
  exposes the read-only member.
- `node --input-type=module -e "const { fetchAllPRsCmd } = await import('./dist/providers/github/commands/prCommands.js'); const cmd = fetchAllPRsCmd('acme','widget'); if (cmd !== 'gh pr list --repo acme/widget --state all --json number,body,state,mergedAt,updatedAt,url --limit 200') { console.error('projection drifted:', cmd); process.exit(1); } console.log('projection OK');"` —
  the built projection string is exact.
- `git diff origin/main --quiet -- src/providers/index.ts src/providers/jira/index.ts src/providers/github/index.ts src/index.ts package.json src/providers/__tests__/refusalStubs.test.ts && echo "barrels, manifest and refusal-stub suite unchanged"` —
  no export widening, no manifest change, constructor-signature proof untouched.
- `grep -n "constructor(client: JiraApiClient, projectKey: string, logger: Logger = consoleLogger)" src/providers/jira/jiraIssueTracker.ts && grep -c "replace(/\\\\/+\$/, '')" src/providers/jira/jiraIssueTracker.ts | grep -q '^0$' && echo "Jira constructor unchanged; no duplicate normalisation"` —
  the two Jira constraints from the issue.
- `git log origin/main..HEAD --format='%s%n%b' | grep -nE "^[a-z0-9-]+(: )?[a-z]+(\(.*\))?!:|BREAKING CHANGE" ; test $? -eq 1 && echo "no breaking-change marker on the branch"` —
  no `!` header and no `BREAKING CHANGE` footer.
- `npm pack --dry-run` — the tarball still lists only `dist/`, `README.md`, `LICENSE`.
- `bun run smoke:package` — build, pack, Node + Bun dynamic-import key check still pass (table
  unchanged — no runtime name was added).
- `bun run test:e2e --tags "@packaging"` — the 2 `@adw-9`, 4 `@adw-11` and 4 `@adw-16` packaging
  scenarios pass (10). Needs `node` and `npm`; slowest step.
- `bun run test:e2e` — the whole suite passes with no undefined or pending steps.
- `bun run release:dry-run` — prints `==> next release version: 1.2.0` (needs push access to
  `origin`; the PR's `release-dry-run` job is the authoritative run).

## Notes
- No `.adw/coding_guidelines.md` (nor `guidelines/coding_guidelines.md`) exists. Match the
  surrounding style: a *why*-docblock on every touched member, explicit `.js` extensions on every
  relative specifier (`moduleResolution: NodeNext`), `readonly` on raw-payload types, files under
  the 300-line cap, no decorators, no new abstractions. No new library is needed
  (`bun add` is not used).
- **Port, don't cherry-pick.** The upstream diffs (`git show 77cbfcbe -- adws/providers`,
  `git show ed45b14b -- adws/providers` in the local `AI_Dev_Workflow` checkout) are the
  reference for the four fields, the mapper copy, the projection string and the test value
  assertions. Two things are deliberately *not* ported: ADW's third positional
  `JiraIssueTracker` constructor argument (and its `refusalStubs`/factory edits), replaced by the
  public `JiraApiClient.instanceUrl` read; and ADW's non-provider files (agents, notifier,
  wiring), which are ADW's side of #844.
- **Why a public readonly member and not a getter or a new config field.** The issue asks for
  "the already-held, already-normalised instance URL as a public readonly member"; `readonly
  instanceUrl: string` on the class is the smallest additive change, emits as
  `readonly instanceUrl: string;` in the `.d.ts` (which the read-only `@packaging` scenario
  depends on), and is what `toIssue` reads. A getter would also be additive but adds nothing; a
  tracker-side field or constructor parameter would duplicate state or break the signature.
- **Why `listPullRequests()` gets no mapper.** The port keeps the code host's pass-through
  (`JSON.parse(...) as PullRequestRecord[]`) exactly as ADW did; the widened `--json` projection
  is what makes the records carry the fields. Filtering (e.g. OPEN-only) belongs to consumers.
- **Unit-test rule deviation** — see the Testing Strategy preamble: the issue's acceptance
  criteria explicitly require value assertions in unit tests, and the required-field widening
  forces fixture/command-string edits in the existing suites anyway; no new unit-test file is
  created. Consider adding `## Unit Tests: enabled` to `.adw/project.md` (the repo has 45 vitest
  suites and `.adw/review_proof.md` demands their output).
- **Scenario/plan ordering.** The ADW SDLC runs the plan and scenario phases in parallel, then a
  single-pass alignment, then the build; `feature-16.feature` landed while this plan was being
  written and the plan was reconciled to it (phrases, fixtures, counts). Step 7 implements what
  the file says after alignment; the issue is the arbiter if they disagree.
- **Release facts (2026-09-23)**: npm `@paysdoc/devplatform` latest is `1.1.0`; `origin` tags
  `v1.0.0`, `v1.1.0`; the `Release` workflow succeeded on the `v1.1.0` `workflow_dispatch` and on
  the PR #15 merge (no release); the README/`.adw/project.md` sentence saying the v1.1.0 run
  failed is stale. This branch's `feat:` computes `1.2.0`.
- **Git/gh guard**: the only new `gh` literal is inside `src/providers/github/commands/`, an
  exempt package; the step layer's CLI fake lives under `features/`, which the guard prunes; the
  Jira change spawns nothing; no construction site is added — never touch
  `SANCTIONED_CONSTRUCTION_SITES`.
- **Docs ownership gap**: `src/providers/jira/**` has no `app_docs` owner in
  `.adw/conditional_docs.md`; this plan documents the Jira behaviour in `README.md` and
  `app_docs/forge-providers.md` rather than creating a new app doc (the document phase may choose
  to add one — out of this plan's scope).
