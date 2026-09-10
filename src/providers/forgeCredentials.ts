/**
 * createForgeCredentials() — the forge-keyed credential factory (issue #9),
 * a sibling of `forgeProviders()`. Resolves a `TokenProvider` and a
 * bootstrap `GitIdentity` from a forge name alone, dispatching on
 * `forge.codeHost` the same way `forgeProviders()` dispatches for the
 * tracker, code host and board — the consumer never names GitHub or GitLab.
 *
 * The published barrels never carry the GitHub-named helpers that build
 * these values today (`createGitHubTokenProvider`, `resolveContextToken`,
 * `getInstallationToken`, `resolveBootstrapGitIdentity`, `ghAuthToken`, …):
 * putting them on a barrel would leak forge vocabulary into every consumer,
 * contradicting the forge-neutral contract `forgeProviders()` established.
 * This factory composes them internally and is the only new public runtime
 * name; only the `GitHubAppConfig`/`AppAuthDeps` *types* are re-exported, so
 * a typed consumer can build `deps.github` without importing an
 * adapter-internal module.
 *
 * Side-effect contract: construction never resolves a token — the returned
 * `TokenProvider` resolves per `credentialEnv` call, unmemoised, exactly as
 * `createGitHubTokenProvider`/`createGitLabTokenProvider` do on their own
 * (the only cache on the path is `appAuth.ts`'s expiry-aware
 * installation-token cache). Construction DOES perform the bootstrap
 * identity reads (environment, then `git config` when needed) eagerly,
 * exactly as `resolveBootstrapGitIdentity`/`resolveGitLabBootstrapGitIdentity`
 * do today.
 */

import type { GitIdentity, TokenProvider } from '../git/types.js';
import type { GitConfigIdentityDeps } from '../git/bootstrapIdentity.js';
import { type RepoIdentifier, validateRepoIdentifier } from './types.js';
import { CODE_HOST_FORGES, isCodeHostForge, UnknownForgeError, type ForgeSelection } from './forgeProviders.js';
import { createGitHubTokenProvider } from './github/githubTokenProvider.js';
import { resolveBootstrapGitIdentity } from './github/githubIdentity.js';
import { isGitHubAppConfigured, getInstallationToken } from './github/appAuth.js';
import type { GitHubAppConfig, AppAuthDeps } from './github/appAuth.js';
import { ghAuthToken as defaultGhAuthToken } from './github/ghAuthToken.js';
import { createGitLabTokenProvider } from './gitlab/gitlabTokenProvider.js';
import { resolveGitLabBootstrapGitIdentity } from './gitlab/gitlabIdentity.js';
import type { GitLabConfig } from './gitlab/gitlabApiClient.js';

export type { GitHubAppConfig, AppAuthDeps };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** What the launch boundary currently injects by hand for the GitHub branch. */
export interface GitHubCredentialDeps {
  /** Already resolved from the environment by the caller — never re-read here. */
  readonly appConfig: GitHubAppConfig | null;
  readonly pat?: string;
  readonly alternateIdentityPat?: string;
  /** Test seam; production default is the adapter's `gh auth token` reader. */
  readonly ghAuthToken?: () => string;
  readonly env?: NodeJS.ProcessEnv;
  readonly exec?: GitConfigIdentityDeps['exec'];
  /** The `runCurl`/`apiBaseUrl` transport seam of `getInstallationToken`; production default is real curl against `api.github.com`. */
  readonly appAuth?: AppAuthDeps;
}

/** Mirrors `ForgeProviderDeps`: forge-neutral seams at the top, one per-forge bag each. */
export interface ForgeCredentialDeps {
  /** Forge-neutral bootstrap-identity seam, applies to whichever code host is selected. Overridden by `github.env` when both are given. */
  readonly env?: NodeJS.ProcessEnv;
  /** Forge-neutral bootstrap-identity seam. Overridden by `github.exec` when both are given. */
  readonly exec?: GitConfigIdentityDeps['exec'];
  readonly github?: GitHubCredentialDeps;
  /** Required when `forge.codeHost === 'gitlab'`. */
  readonly gitlab?: GitLabConfig;
}

export interface ForgeCredentialsOptions {
  readonly forge: ForgeSelection;
  readonly identity: RepoIdentifier;
  readonly deps?: ForgeCredentialDeps;
}

export type ForgeCredentials = Readonly<{
  tokenProvider: TokenProvider;
  gitIdentity: GitIdentity;
}>;

// ---------------------------------------------------------------------------
// Per-code-host builders
// ---------------------------------------------------------------------------

function buildGitHubCredentials(github: GitHubCredentialDeps, topEnv: NodeJS.ProcessEnv | undefined, topExec: GitConfigIdentityDeps['exec'] | undefined): ForgeCredentials {
  const appConfig = github.appConfig;
  const appConfigured = appConfig !== null && isGitHubAppConfigured(appConfig);
  const env = github.env ?? topEnv;
  const exec = github.exec ?? topExec;

  const tokenProvider = createGitHubTokenProvider({
    pat: github.pat,
    alternateIdentityPat: github.alternateIdentityPat,
    isAppConfigured: () => appConfigured,
    mintInstallationToken: (owner: string, repo: string) => {
      if (appConfig === null) {
        throw new Error('createForgeCredentials: the GitHub App is not configured, so no installation token can be minted');
      }
      return getInstallationToken(appConfig, owner, repo, github.appAuth);
    },
    ghAuthToken: github.ghAuthToken ?? defaultGhAuthToken,
  });

  const gitIdentity = resolveBootstrapGitIdentity({ env, exec, appConfig });

  return Object.freeze({ tokenProvider, gitIdentity });
}

function buildGitLabCredentials(config: GitLabConfig | undefined, topEnv: NodeJS.ProcessEnv | undefined, topExec: GitConfigIdentityDeps['exec'] | undefined): ForgeCredentials {
  if (!config) {
    throw new Error('createForgeCredentials: code host "gitlab" needs deps.gitlab (GitLabConfig)');
  }
  const tokenProvider = createGitLabTokenProvider(config);
  const gitIdentity = resolveGitLabBootstrapGitIdentity({ env: topEnv, exec: topExec });
  return Object.freeze({ tokenProvider, gitIdentity });
}

// ---------------------------------------------------------------------------
// The factory
// ---------------------------------------------------------------------------

/**
 * Builds the one `{ tokenProvider, gitIdentity }` pair for `identity`. Guard
 * clauses run in `forgeProviders()`'s order — identity, then the code host
 * — entirely before any credential source is touched, so a refusal never
 * partially resolves a token. Only the code host is validated; the tracker
 * selection is irrelevant to credentials.
 */
export function createForgeCredentials(options: ForgeCredentialsOptions): ForgeCredentials {
  const { forge, identity, deps = {} } = options;

  validateRepoIdentifier(identity);

  if (!isCodeHostForge(forge.codeHost)) {
    throw new UnknownForgeError(forge.codeHost, 'code host', CODE_HOST_FORGES, 'createForgeCredentials');
  }

  if (forge.codeHost === 'github') {
    return buildGitHubCredentials(deps.github ?? { appConfig: null }, deps.env, deps.exec);
  }

  return buildGitLabCredentials(deps.gitlab, deps.env, deps.exec);
}
