/**
 * TokenProvider port — GitLab implementation (issue #9).
 *
 * GitLab has no App/PAT/CLI resolution chain and no bot-versus-personal
 * identity split to express: `GitLabConfig.token` is the one credential the
 * caller injects, so `credentialEnv` serves it for both `'default'` and
 * `'alternateIdentity'` requests. Adapter-internal — `createForgeCredentials`
 * (`src/providers/forgeCredentials.ts`) is the only public way to obtain one.
 *
 * The overlay key `GITLAB_TOKEN` is adapter-owned (the core never learns
 * it); it matches the `glab` CLI and the `GITLAB_TOKEN` variable
 * `gitlabCodeHost.ts`'s factory docblock already reads for `GitLabConfig`.
 */

import type { CredentialRequest, TokenProvider } from '../../git/types.js';
import type { GitLabConfig } from './gitlabApiClient.js';

/** The credential environment variable a GitLab TokenProvider overlays. Exported for tests. */
export const GITLAB_TOKEN_ENV_VAR = 'GITLAB_TOKEN';

/** Builds the port's GitLab implementation. Throws at construction on a blank token — never at first use. */
export function createGitLabTokenProvider(config: GitLabConfig): TokenProvider {
  if (!config.token.trim()) {
    throw new Error('createGitLabTokenProvider: GitLabConfig.token must not be empty');
  }
  const token = config.token;
  return {
    credentialEnv(_request: CredentialRequest): NodeJS.ProcessEnv {
      return { [GITLAB_TOKEN_ENV_VAR]: token };
    },
  };
}
