# Forge Providers

## Overview

This module is the forge-neutral provider layer: it turns a `ForgeSelection` (which code host, which issue tracker) plus a bound repo identity into concrete adapters, without the consumer ever naming GitHub or GitLab directly. `forgeProviders()` assembles the issue tracker / code host / board manager triple; `createForgeCredentials()` is a sibling factory that resolves the `TokenProvider` and bootstrap `GitIdentity` a consumer needs before it can even build a `GitContext`. `workspaceValidation.ts` and `types.ts` supply the filesystem checks and shared contracts both factories build on.

## Responsibilities

- `forgeProviders()` (`src/providers/forgeProviders.ts`) builds the one `BoundProviders` set (`issueTracker`, `codeHost`, optional `boardManager`) for a given `RepoIdentifier`, dispatching per-port on `forge.issueTracker` (`github` | `jira`) and `forge.codeHost` (`github` | `gitlab`).
- `createForgeCredentials()` (`src/providers/forgeCredentials.ts`) builds the `{ tokenProvider, gitIdentity }` pair for a given `RepoIdentifier`, dispatching on `forge.codeHost` alone (the issue-tracker selection is irrelevant to credentials).
- `types.ts` defines the forge-neutral domain contracts (`Issue`, `PullRequest`, `IssueTracker`, `CodeHost`, `BoardManager`, `BoundProviders`, `RepoContext`, `RepoIdentifier`, `Platform`) that every adapter implements and every consumer programs against.
- `workspaceValidation.ts` provides filesystem-only helpers (`validateWorkingDirectory`, `parseOwnerRepoFromUrl`) used when constructing a `RepoContext` from a working directory and git remote.
- `index.ts` is the module's public barrel, re-exporting `types.js`, the Jira/GitHub/GitLab adapter sub-barrels, `forgeProviders.js`, `forgeCredentials.js`, and `workspaceValidation.js`.

## Contracts & Invariants

- Both factories validate before constructing anything: `validateRepoIdentifier(identity)` runs first, then forge-name validation via `isCodeHostForge`/`isIssueTrackerForge`, raising `UnknownForgeError` (naming the value and the port) for anything outside the closed `CODE_HOST_FORGES` (`github`, `gitlab`) / `ISSUE_TRACKER_FORGES` (`github`, `jira`) unions. A refusal never leaves a partially-built result and never issues a command.
- `forgeProviders()` additionally requires a `tokenProvider` implementing `credentialEnv(request)` and a `gitContext` bound to the same identity (`assertContextBoundTo`), checked before any adapter is constructed.
- The board manager is present only when `forge.codeHost === 'github'`; every other code host omits the `boardManager` member entirely — it is never a refusing stub.
- `createForgeCredentials()` validates only the code host (not the issue tracker) since credentials have no tracker dependency.
- Construction of credentials never resolves a token: the returned `TokenProvider` resolves lazily, unmemoised, on each `credentialEnv` call (the only cache on the path is the GitHub App's expiry-aware installation-token cache in `appAuth.ts`). Construction *does* eagerly perform the bootstrap git-identity read (environment, then `git config` when needed).
- Neither factory reads a file or an environment variable itself for the code-host/tracker dispatch — `forgeProviders()` imports only the executor, the ports, and this package's own adapters, never `adws/core`, `adws/types`, `adws/github`, or `adws/forge`. Environment/config values (PATs, `GitLabConfig`, `JiraConfig`, `GitHubAppConfig`, `env`, `exec`) are always injected by the caller via `deps`.
- The public barrel (`index.ts`) never exports forge-named runtime helpers (`createGitHubTokenProvider`, `resolveContextToken`, `getInstallationToken`, `resolveBootstrapGitIdentity`, `ghAuthToken`, `createGitLabTokenProvider`, `resolveGitLabBootstrapGitIdentity`, etc.) — only `GitHubAppConfig` and `AppAuthDeps` are re-exported as types, so a typed consumer can build `deps.github` without importing an adapter-internal module. `createForgeCredentials` is the only new public runtime name this module adds beyond `forgeProviders`.
- `UnknownForgeError` is shared between the two factories; its `source` parameter (default `'forgeProviders'`) is set to `'createForgeCredentials'` when raised from that factory, so the message always names the entry point that refused.
- `RepoIdentifier` validation (`validateRepoIdentifier`) only checks that `owner`/`repo` are non-empty after trimming; it does not otherwise normalize the identifier.
- `BoundProviders` and its extension `RepoContext` (`cwd` + `repoId` added) are `Readonly`; `forgeProviders()` returns a frozen object (`Object.freeze`).

## Configuration

- No environment variables are read directly by `forgeProviders()` or `createForgeCredentials()`. All forge-specific configuration is passed in via `deps`:
  - `deps.github` (both factories): GitHub-specific seams — `ForgeProviderDeps.github` covers `onStatusMoved`, `resolveLabelDefinition`, `canApprovePullRequests`; `ForgeCredentialDeps.github` (`GitHubCredentialDeps`) covers `appConfig`, `pat`, `alternateIdentityPat`, `ghAuthToken`, `env`, `exec`, `appAuth`.
  - `deps.gitlab` (both factories): a `GitLabConfig`, required when `forge.codeHost === 'gitlab'`.
  - `deps.jira` (`forgeProviders()` only): a `JiraConfig`, required when `forge.issueTracker === 'jira'`.
  - `deps.env` / `deps.exec` (`createForgeCredentials()` only): forge-neutral bootstrap-identity seams applied to whichever code host is selected; overridden by `deps.github.env`/`deps.github.exec` when both are given.
  - `deps.logger` (`forgeProviders()` only): optional `Logger` passed through to every constructed adapter.

## Gotchas

- `forgeProviders()` requires a pre-built `GitContext` and `TokenProvider` bound to the target identity; `createForgeCredentials()` produces the `TokenProvider`/`GitIdentity` a caller needs to build that context in the first place — the two factories are meant to be composed by the launch boundary, not treated as alternatives.
- Passing `forge.codeHost === 'gitlab'` without `deps.gitlab` throws a plain `Error` (not `UnknownForgeError`) from both `buildCodeHost` and `buildGitLabCredentials` — the missing-config error and the unknown-forge error are distinct failure modes.
- `createForgeCredentials()` defaults `deps.github` to `{ appConfig: null }` when omitted, so calling it for GitHub with no deps at all still succeeds but yields a token provider that cannot mint an installation token (any attempt throws "the GitHub App is not configured...").
- The GitHub App config (`appConfig`) is expected to already be resolved from the environment by the caller — `createForgeCredentials` never re-reads it.
- `workspaceValidation.ts` was moved verbatim out of `repoContext.ts` (issue #818) purely to keep that file under a 300-line cap; it has no identity-construction logic of its own and only depends on `fs`/`path`.
- `parseOwnerRepoFromUrl` is host-agnostic by regex (works for any HTTPS or SSH git remote), not limited to GitHub/GitLab.
