# Ubiquitous Language

## Git core

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **GitContext** | The identity-bound authority for "which repo's filesystem," and the single owner of the forge-neutral executor | Repo context, git client |
| **exec()** | GitContext's single spawn site: one env merge, one cwd resolution, one ENOENT rewrap, for every git command | Run command, shell out |
| **Identity** | The mandatory owner/repo/selfHost/tokenProvider/gitIdentity bundle a GitContext is constructed from | Config, credentials |
| **Worktree** | A checked-out working copy of a branch, registered under `.worktrees/`, distinct from the main repo checkout | Clone, checkout |
| **Worktree registration** | A worktree's health state as reported by a probe: `healthy`, `locked`, `prunable`, or `missing` | Worktree status |
| **Takeover (reset)** | The orchestration that reclaims a worktree left in a bad state (e.g. aborts an in-progress merge) so it can be reused | Recovery, cleanup |
| **Bootstrap read** | One of a narrow set of pre-context git reads (origin remote URL, env/git-config identity) that run before a full GitContext exists | Pre-init read |
| **Claim** | A distributed-lock election performed via a detached worktree, an allow-empty nonce commit, and a never-forced push whose rejection is the lock | Election, lock |
| **TokenProvider** | The port a forge adapter implements to hand GitContext a credential for a given purpose, instead of GitContext holding one itself | Credential store, auth provider |
| **Logger port** | The injected logging seam (`Logger`/`LogLevel`, defaulting to `consoleLogger`) that keeps this package free of a dependency on the host's logger | Log sink |

## Forge providers

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **Forge** | A platform that hosts code and/or tracks issues — GitHub, GitLab, or Jira in this codebase | Platform, provider (as a noun for the platform itself) |
| **Adapter** | A forge-specific implementation of one or more provider ports (e.g. the GitHub adapter implements IssueTracker, CodeHost, and BoardManager) | Integration, connector |
| **Port** | A platform-agnostic interface — `IssueTracker`, `CodeHost`, or `BoardManager` — that adapters implement and consumers depend on | Interface (when unqualified), contract |
| **IssueTracker** | The port for issue/ticket operations: fetch, comment, label, close, list, move status | Ticket API |
| **CodeHost** | The port for PR/code-hosting operations: create, fetch, comment, approve, merge, list pull requests | Repo API, VCS host |
| **BoardManager** | The port for project-board discovery, creation, and column configuration | Project API |
| **RepoIdentifier** | The platform-agnostic `{owner, repo, platform}` triple that names a repository | Repo id, repo slug |
| **BoundProviders** | The `{issueTracker, codeHost, boardManager?}` triple returned by `forgeProviders()`, all bound to one identity | Provider set |
| **RepoContext** | A `BoundProviders` plus `{cwd, repoId}`, passed through workflow phases so they stay decoupled from a specific platform | Workflow context |
| **forgeProviders()** | The library's single public assembly function: validates identity, token provider shape, and context binding, then constructs the bound provider triple | Provider factory |
| **ForgeSelection** | The `{codeHost, issueTracker}` pair naming which forge implements each port for a given assembly call | Forge config |
| **UnknownForgeError** | Thrown by `forgeProviders()` when a forge name falls outside the closed union for its port | Invalid forge |
| **BoardStatus** | The canonical, ordered set of board columns — Blocked, Todo, In Progress, Review, Done — shared across board-capable adapters | Board column, status |
| **ForgeActionResult** | A forge mutation's outcome reported as `{success, error?}` rather than thrown | Result, response |

## Relationships

- A **GitContext** is constructed from exactly one **Identity** and exposes **exec()** as the sole spawn site.
- A **Worktree** belongs to exactly one **GitContext**'s base repository and has one **Worktree registration** at any time.
- **forgeProviders()** takes one **ForgeSelection** and one **Identity** and returns one **BoundProviders**.
- A **BoundProviders** contains exactly one **IssueTracker** and one **CodeHost**, and at most one **BoardManager**.
- Each **Adapter** implements one or more **Ports**, but never more than one **Adapter** backs a given **Port** within a single **BoundProviders**.
- A **RepoContext** extends **BoundProviders** with the **RepoIdentifier** and working directory it was assembled for.

## Example dialogue

> **Dev:** "Where does the `gh` CLI call actually happen when we fetch an issue?"
> **Domain expert:** "Inside the GitHub **Adapter**'s **IssueTracker** implementation — it binds a command runner once, over the **GitContext** the caller already holds. The **Adapter** never constructs its own context."
> **Dev:** "And if I ask `forgeProviders()` for GitLab as the code host but don't pass GitLab config?"
> **Dev:** "Right — it throws before constructing anything, because the **Port** contract for CodeHost requires that config for the GitLab **Adapter**."
> **Domain expert:** "Exactly, and if you passed an unsupported forge name entirely, like `bitbucket` for codeHost, you'd get an **UnknownForgeError** instead — the union of valid forges per **Port** is closed."
> **Dev:** "What's the difference between **BoundProviders** and **RepoContext** then?"
> **Domain expert:** "**RepoContext** is **BoundProviders** plus the `cwd` and `RepoIdentifier` — it's what gets threaded through workflow phases so they never touch a platform-specific type directly."

## Flagged ambiguities

- "context" is used for two distinct concepts: **GitContext** (the git/worktree executor) and **RepoContext** (the provider bundle plus identity/cwd). Keep them distinct — a **RepoContext** is built using a **GitContext**, not the other way around.
- "provider" is used both for the **Port** interfaces (`IssueTracker`, `CodeHost`, `BoardManager`) and for forge-specific **Adapters** that implement them. Prefer **Port** for the interface and **Adapter** for the implementation; reserve "provider" for the assembled **BoundProviders**/`forgeProviders()` naming already baked into the code.
