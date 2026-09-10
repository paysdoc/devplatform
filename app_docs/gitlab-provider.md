# GitLab Provider

## Overview

The GitLab provider (`src/providers/gitlab/**`) is the GitLab forge adapter for the platform-agnostic `CodeHost`, `BoardManager`, and `TokenProvider` ports. It talks to the GitLab REST API v4 over synchronous `curl` calls, maps GitLab's wire types onto the core's forge-agnostic types, and supplies GitLab-flavoured credential and bootstrap-identity resolution for the forge-keyed credential factory (`createForgeCredentials`).

## Responsibilities

- `gitlabApiClient.ts` — `GitLabApiClient`, a low-level, synchronous REST v4 client (`spawnSync` + `curl`) covering: get project, create/get merge request, create note, list discussions, list merge requests.
- `gitlabCodeHost.ts` — `GitLabCodeHost` / `createGitLabCodeHost`, the `CodeHost` implementation bound to one repository, delegating all API calls to `GitLabApiClient` and mapping responses via `mappers.ts`.
- `gitlabBoardManager.ts` — `createGitLabBoardManager`, a stub `BoardManager` whose methods all throw, since GitLab board management is not yet supported.
- `mappers.ts` — pure functions translating GitLab wire shapes (`GitLabMergeRequest`, `GitLabNote`, `GitLabDiscussion`) into the core's `PullRequest` / `ReviewComment`, plus `toProjectPath` for building a GitLab `owner/repo` project path from a `RepoIdentifier`.
- `gitlabTypes.ts` — internal TypeScript interfaces mirroring the subset of the GitLab REST v4 response shapes the client and mappers consume.
- `gitlabTokenProvider.ts` — `createGitLabTokenProvider`, the adapter-internal `TokenProvider` implementation that overlays a single `GITLAB_TOKEN` environment entry.
- `gitlabIdentity.ts` — `resolveGitLabBootstrapGitIdentity`, the adapter-internal bootstrap git author/committer identity resolver used before a `GitContext` exists.
- `index.ts` — the module's public surface: `createGitLabCodeHost`, `GitLabCodeHost`, `GitLabConfig`, `createGitLabBoardManager`, and the mapper functions.

## Contracts & Invariants

- **Injected configuration only.** `GitLabConfig` (`{ token, instanceUrl }`) is passed in explicitly by the caller; nothing in `gitlabApiClient.ts` or `gitlabCodeHost.ts` reads `process.env` directly. ADW's wiring (`repoContext.ts`) is responsible for sourcing `GITLAB_TOKEN` / `GITLAB_INSTANCE_URL` from the environment and constructing `GitLabConfig`.
- **Synchronous transport.** `GitLabApiClient` uses `spawnSync('curl', …)` to match the synchronous `CodeHost` interface contract; there is no async/await in the request path.
- **Hermetic test seam.** `GitLabApiClientDeps.runCurl` (type `CurlRunner`) lets tests inject a recorder in place of the real `curl` process; production defaults to `defaultCurlRunner`, a thin `spawnSync` wrapper.
- **Error classification.** `GitLabApiClient`'s private `request` method throws on: a `curl` spawn error, a non-zero curl exit status, or a parsed response body carrying `error`/`message` whose text indicates `401`/`unauthorized` or a literal `404 Not Found`. All thrown messages are also logged via the injected `Logger` (default `consoleLogger`) at `'error'` level before throwing.
- **Construction-time validation.** `createGitLabCodeHost` validates the `RepoIdentifier` (`validateRepoIdentifier`) and the `GitLabConfig` (non-empty `token` and `instanceUrl`) before constructing anything; a blank token or instance URL throws immediately rather than surfacing later as an API failure.
- **`iid` is the PR/MR number.** GitLab's project-scoped `iid` (not the global `id`) is used as `PullRequest.number` throughout the mappers and the code host.
- **Linked issue extraction.** `mapGitLabMRToPullRequest` derives `linkedIssueNumber` from the MR description by matching `closes|fixes|resolves #<n>` (case-insensitive) first, falling back to the first standalone `#<n>` if no closing keyword is present; if the description is empty, `linkedIssueNumber` is `undefined`.
- **Partial `CodeHost` implementation.** `GitLabCodeHost` implements `getDefaultBranch`, `fetchPullRequest`, `commentOnPullRequest`, `fetchReviewComments`, `listOpenPullRequests`, and `createPullRequest`. All other `CodeHost` members (`findPullRequestByBranch`, `isPullRequestApproved`, `approvePullRequest`, `mergePullRequest`, `setSecret`, `listMergedPullRequests`, `listPullRequests`, `getAuthenticatedUser`, `canApprovePullRequests`) throw `"GitLabCodeHost.<method> is not implemented"`.
- **`BoardManager` is entirely a stub.** Every method of `createGitLabBoardManager()`'s returned instance throws `'BoardManager not implemented for GitLab'`.
- **Token provider is adapter-internal.** `createGitLabTokenProvider` is not part of `index.ts`'s public export list; the only supported way to obtain a GitLab `TokenProvider` is through `createForgeCredentials` in `src/providers/forgeCredentials.ts`.
- **One credential, two purposes.** GitLab has no App/PAT/CLI resolution chain and no bot-vs-personal identity split. `createGitLabTokenProvider(config).credentialEnv(request)` returns `{ GITLAB_TOKEN: config.token }` for both `'default'` and `'alternateIdentity'` `CredentialRequest` purposes — the `request` argument is accepted but not branched on.
- **Fail fast on a blank token.** `createGitLabTokenProvider` throws `"createGitLabTokenProvider: GitLabConfig.token must not be empty"` at construction time if `config.token.trim()` is empty — never deferred to first `credentialEnv` call.
- **Bootstrap identity resolution order.** `resolveGitLabBootstrapGitIdentity` resolves, in order: (1) `GIT_AUTHOR_*` / `GIT_COMMITTER_*` env vars via the core's `readEnvGitIdentity`; (2) `git config user.name` / `user.email` via the core's `readGitConfigIdentity`; (3) the built-in `GITLAB_BOT_FALLBACK_IDENTITY`. It never returns a partially-empty identity, and it performs no bot-identity derivation step (unlike GitHub's `resolveBootstrapGitIdentity`, which derives an App-style bot identity first) because GitLab credentials carry no such identity to derive.
- **Pure mappers.** All functions in `mappers.ts` are pure — no side effects, no reads of global/module state.

## Configuration

- `GitLabConfig.token` — a GitLab personal access token with `api` scope, injected by the caller (sourced by ADW's wiring from the `GITLAB_TOKEN` environment variable).
- `GitLabConfig.instanceUrl` — the GitLab instance origin, e.g. `https://gitlab.com` (sourced by ADW's wiring from `GITLAB_INSTANCE_URL`); trailing slashes are stripped by `GitLabApiClient`'s constructor.
- `GitLabApiClientDeps.logger` — optional `Logger` (from `src/git/types.js`); defaults to `consoleLogger`.
- `GitLabApiClientDeps.runCurl` — optional `CurlRunner` transport seam; defaults to a real `curl` via `spawnSync`.
- `GITLAB_TOKEN` — the environment variable key that `createGitLabTokenProvider`'s `TokenProvider.credentialEnv` overlays (matches the `glab` CLI's expected variable). This key is adapter-owned; the core credential port never learns of it directly.
- `GitConfigIdentityDeps` (`env`, `exec`) — optional overrides `resolveGitLabBootstrapGitIdentity` passes through to the core's `readGitConfigIdentity`; `env` defaults to `process.env`.

## Gotchas

- The API client is entirely synchronous and shells out to `curl` for every call; there is no connection pooling, retry, or pagination handling — `listMergeRequests`/`listDiscussions` return whatever GitLab's default page contains.
- Error detection on API responses is heuristic: it only recognizes `401`/`unauthorized` and the exact string `404 Not Found` inside a JSON `error`/`message` field. Other GitLab error shapes (e.g. 422 validation errors) pass through as ordinary parsed JSON without being classified as errors.
- `extractLinkedIssueNumber`'s fallback regex matches *any* `#<digits>` in the description, not just ones near closing keywords, so an MR description that merely mentions `#123` in passing (with no `closes`/`fixes`/`resolves`) will still populate `linkedIssueNumber`.
- Most of `GitLabCodeHost` (approvals, merging, secrets, listing merged/all PRs, authenticated-user lookup, approval capability, find-by-branch) and all of `GitLabBoardManager` are unimplemented stubs that throw synchronously — callers relying on forge-agnostic parity with the GitHub adapter will hit these gaps.
- `createGitLabTokenProvider` and `resolveGitLabBootstrapGitIdentity` are not re-exported from `index.ts`; consumers should go through `createForgeCredentials` (`src/providers/forgeCredentials.ts`) rather than importing `gitlabTokenProvider.ts` / `gitlabIdentity.ts` directly.
- Because a single token serves both `'default'` and `'alternateIdentity'` credential requests, GitLab cannot express an "act as a different identity" credential the way a multi-credential forge (e.g. GitHub App bot vs. personal PAT) can — both purposes resolve to the same `GITLAB_TOKEN` value.
