export { createGitHubIssueTracker, GitHubIssueTracker } from './githubIssueTracker.js';
export type { GitHubIssueTrackerDeps, GitHubLabelDefinition } from './githubIssueTracker.js';
export { createGitHubCodeHost, GitHubCodeHost } from './githubCodeHost.js';
export type { GitHubCodeHostDeps } from './githubCodeHost.js';
export { createGitHubBoardManager } from './githubBoardManager.js';
export type { GitHubBoardManagerDeps } from './githubBoardManager.js';
export type {
  GitHubUser, GitHubLabel, GitHubMilestone, GitHubComment,
  GitHubIssueListItem, GitHubIssue, IssueCommentSummary,
} from './domain/issue.js';
export type { PRReviewComment, PRDetails, PRListItem, RawPR } from './domain/pullRequest.js';
export * from './mappers.js';

// ---------------------------------------------------------------------------
// Credential/identity helpers and the bound repo API view — widened onto this
// barrel by issue #11 for the ADW switchover to @paysdoc/devplatform. Prefer
// `createForgeCredentials` (`src/providers/forgeCredentials.ts`) as the
// forge-neutral route; the names below are the GitHub-specific building
// blocks it composes, exported directly so a caller that already speaks
// GitHub can use them with no behaviour change.
// ---------------------------------------------------------------------------
export { createGitHubTokenProvider } from './githubTokenProvider.js';
export type { GitHubTokenProviderInput } from './githubTokenProvider.js';
export { resolveBootstrapGitIdentity } from './githubIdentity.js';
export type { BootstrapIdentityDeps } from './githubIdentity.js';
export { resolveContextToken } from './tokenResolver.js';
export type { ResolveContextTokenInput } from './tokenResolver.js';
export { ghAuthToken } from './ghAuthToken.js';
export { isGitHubAppConfigured, getInstallationToken } from './appAuth.js';
export { createGhRepoApi } from './ghRepoApi.js';
export type { GhRepoApi } from './ghRepoApi.js';
