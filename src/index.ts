/**
 * Root package entry point — forge ports and domain model only.
 *
 * This is the platform-agnostic vocabulary shared by every adapter: the
 * `IssueTracker`/`CodeHost`/`BoardManager` ports, the `Platform`/
 * `RepoIdentifier`/`Issue`/`PullRequest`/`BoardStatus` domain types, and the
 * `BoundProviders`/`RepoContext` assembly shapes. It carries no adapter code
 * and no `forgeProviders` assembly function — those live behind
 * `"./providers"`. The forge-neutral git/worktree core lives behind
 * `"./git"`. An import-graph test guards this separation.
 */
export * from './providers/types.js';
