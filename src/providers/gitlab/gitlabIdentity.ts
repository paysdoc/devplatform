/**
 * GitLab bootstrap identity resolution (issue #9) — the GitLab half of what
 * `githubIdentity.ts`'s `resolveBootstrapGitIdentity` does for GitHub, minus
 * bot derivation: GitLab credentials carry no App-style bot identity to
 * derive, by design. Composes the core's generic readers
 * (`readEnvGitIdentity`, `readGitConfigIdentity`) rather than shelling out
 * itself. Adapter-internal — `createForgeCredentials` is the public name.
 */

import type { GitIdentity } from '../../git/types.js';
import { readEnvGitIdentity, readGitConfigIdentity, type GitConfigIdentityDeps } from '../../git/bootstrapIdentity.js';

/**
 * The built-in default when nothing else resolves. Deliberately forge-shaped
 * and deliberately not in the core (same reasoning as GitHub's
 * `ADW_BOT_FALLBACK_IDENTITY`) — the scenario only asserts a *complete*
 * fallback, so this address is this library's decision, not the issue's.
 */
export const GITLAB_BOT_FALLBACK_IDENTITY: GitIdentity = {
  authorName: 'ADW Bot',
  authorEmail: 'adw-bot@users.noreply.gitlab.com',
  committerName: 'ADW Bot',
  committerEmail: 'adw-bot@users.noreply.gitlab.com',
};

/**
 * Resolves a complete git author/committer identity before a GitContext
 * exists. Resolution order:
 *   1. GIT_AUTHOR_* / GIT_COMMITTER_* env vars (the core's `readEnvGitIdentity`)
 *   2. `git config user.name / user.email` (the core's `readGitConfigIdentity`)
 *   3. Built-in fallback (never returns empty fields)
 *
 * No bot-identity step — GitLab has none to derive, unlike the GitHub App
 * bot identity `resolveBootstrapGitIdentity` derives first.
 */
export function resolveGitLabBootstrapGitIdentity(deps: GitConfigIdentityDeps = {}): GitIdentity {
  const env = deps.env ?? process.env;
  return readEnvGitIdentity(env)
    ?? readGitConfigIdentity({ env, exec: deps.exec })
    ?? GITLAB_BOT_FALLBACK_IDENTITY;
}
