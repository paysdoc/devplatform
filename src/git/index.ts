/**
 * GitContext package — standalone, importable public surface.
 *
 * Primary export: GitContext class and its public types. The public surface
 * includes the forge-neutral executor primitive (`GitContext.exec` plus the
 * `ExecWorkingDirectory`/`ExecOptions` types), the TokenProvider port
 * types (`TokenProvider`/`CredentialRequest`/`CredentialPurpose`) — the seam
 * a forge adapter built on this package implements instead of the core
 * holding a credential — and the `Logger` port (`Logger`/`LogLevel`,
 * defaulting to `consoleLogger`), so the package carries no dependency on
 * the host application's logger. Also exports `createLiteralTokenProvider`,
 * a fixed-string TokenProvider for tests and fixtures — the one
 * implementation that lives here rather than in a forge adapter, since it
 * carries no forge logic. Every *production* TokenProvider implementation
 * (`createGitHubTokenProvider`), the gh command-string builders, GitHub App
 * authentication, token resolution, GitHub remote-URL parsing, bot-identity
 * derivation, clone-URL construction and `gh auth token` all live in the
 * GitHub forge adapter (`adws/providers/github/`, #792/#793), not here. The
 * forge-keyed `createForgeCredentials` factory (`src/providers/forgeCredentials.ts`,
 * issue #9) is the public way to obtain a production TokenProvider without
 * naming a forge.
 *
 * Also exports the worktree lifecycle op namespaces (create/remove/query/
 * probe/reset) and the distributed-lock `claimOps`, alongside the
 * `repoWorkspace` workspace ops — the full forge-neutral git/worktree
 * surface this package ships (issue #1). None of it imports from
 * `src/providers/`; that boundary is enforced by a committed import-graph
 * test.
 *
 * Bootstrap exceptions (issue #700, narrowed by #793): the functions below
 * are the ONLY legitimate pre-context git reads in the codebase — generic
 * git reads only, no forge vocabulary. They live inside this structurally-
 * exempt package (guard skips adws/gitContext/ by directory) rather than on
 * the ALLOWLIST. The GitHub forge adapter composes them rather than
 * shelling out itself.
 */

export { GitContext } from './gitContext.js';
export type {
  GitIdentity, GitContextOptions, ExecFn, GitContextDeps, FsDeps, ExecWorkingDirectory, ExecOptions,
  TokenProvider, CredentialPurpose, CredentialRequest, Logger, LogLevel,
} from './types.js';
export { consoleLogger } from './consoleLogger.js';
export { createLiteralTokenProvider } from './literalTokenProvider.js';
export { killProcessesInDirectory } from './processCleanup.js';
export { claimOps } from './claimOps.js';
export { worktreeCreateOps } from './worktreeCreateOps.js';
export { worktreeRemoveOps } from './worktreeRemoveOps.js';
export { worktreeQueryOps } from './worktreeQueryOps.js';
export { worktreeProbeOps } from './worktreeProbeOps.js';
export { worktreeResetOps } from './worktreeResetOps.js';
export type { WorktreeForIssueResult } from './worktreeQueryOps.js';
export type { WorktreeRegistration } from './worktreeProbeOps.js';
export type { LogSinceOptions } from './gitReadOps.js';

// Bootstrap — absorbed pre-context primitives (issue #700), generic git reads only (#793)
export { readOriginRemoteUrl, readCurrentBranch, readEnvGitIdentity, readGitConfigIdentity } from './bootstrapIdentity.js';
export type { GitConfigIdentityDeps } from './bootstrapIdentity.js';
export {
  getTargetRepoWorkspacePath,
  isRepoCloned,
  cloneRepo,
  ensureRepoWorkspace,
} from './repoWorkspace.js';
export type { EnsureRepoWorkspaceDeps } from './repoWorkspace.js';
