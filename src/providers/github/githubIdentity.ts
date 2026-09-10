/**
 * GitHub identity conventions — the forge half of bootstrap identity
 * resolution (issue #793, PRD story 15). Owns GitHub naming conventions on
 * behalf of the core: remote-URL parsing (including the SCP-style
 * `git@github.com:owner/repo` form) and GitHub App bot-identity derivation.
 *
 * Composes the core's generic readers (`readOriginRemoteUrl`,
 * `readEnvGitIdentity`, `readGitConfigIdentity`) rather than shelling out
 * itself — after #792 only `adws/gitContext` may run a git command.
 */

import type { GitIdentity } from '../../git/types.js';
import { readOriginRemoteUrl, readEnvGitIdentity, readGitConfigIdentity } from '../../git/bootstrapIdentity.js';
import type { GitConfigIdentityDeps } from '../../git/bootstrapIdentity.js';
import { Platform, type RepoIdentifier } from '../types.js';
import { isGitHubAppConfigured, type GitHubAppConfig } from './appAuth.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BootstrapIdentityDeps extends GitConfigIdentityDeps {
  isAppConfigured?: () => boolean;
  /**
   * The App configuration the caller already resolved (issue #9's
   * `createForgeCredentials`). Three states, each distinct:
   *   - present and complete (`isGitHubAppConfigured`) → the bot identity
   *     derives from `appConfig.appId`/`appConfig.appSlug`, regardless of
   *     what the environment carries;
   *   - `null` → the caller has established "no App"; bot derivation is
   *     skipped even if the environment carries `GITHUB_APP_*`;
   *   - `undefined` (the default) → today's behaviour: the `GITHUB_APP_*`
   *     environment triple decides.
   * An explicitly injected `isAppConfigured` still wins over this — it is
   * the finer-grained seam and existing call sites rely on it.
   */
  appConfig?: GitHubAppConfig | null;
}

/** Resolves the App-bot decision and its appId/appSlug from the injected config or, absent one, the environment. */
function resolveAppIdentitySource(deps: BootstrapIdentityDeps, env: NodeJS.ProcessEnv): { configured: boolean; appId?: string; appSlug?: string } {
  if (deps.appConfig !== undefined) {
    if (deps.appConfig !== null && isGitHubAppConfigured(deps.appConfig)) {
      return { configured: true, appId: deps.appConfig.appId, appSlug: deps.appConfig.appSlug };
    }
    return { configured: false };
  }
  return {
    configured: Boolean(env['GITHUB_APP_ID'] && env['GITHUB_APP_SLUG'] && env['GITHUB_APP_PRIVATE_KEY_PATH']),
    appId: env['GITHUB_APP_ID'],
    appSlug: env['GITHUB_APP_SLUG'],
  };
}

// ---------------------------------------------------------------------------
// parseGitHubRemoteUrl
// ---------------------------------------------------------------------------

/**
 * HTTPS-style GitHub remote: `https://github.com/owner/repo[.git][/]`.
 * Also matches credential-bearing (`https://x-access-token:…@github.com/…`)
 * and `ssh://git@github.com/…` forms.
 *
 * The repo group is lazy and the pattern is end-anchored so the optional
 * `.git` strips a *trailing* suffix only — a greedy or dot-excluding group
 * would truncate dotted names such as `paysdoc.nl` (issue #779).
 */
const HTTPS_REMOTE_RE = /github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/;

/** SCP-style SSH GitHub remote: `git@github.com:owner/repo[.git]`. */
const SSH_REMOTE_RE = /git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/;

/**
 * Parses a `RepoIdentifier` out of a GitHub remote URL (HTTPS or SSH).
 * Returns null when the URL is not a parseable GitHub remote, leaving the
 * error contract to each caller.
 *
 * Pure — the single source of truth for GitHub remote-URL parsing.
 */
export function parseGitHubRemoteUrl(remoteUrl: string): RepoIdentifier | null {
  const url = remoteUrl.trim();
  const match = url.match(HTTPS_REMOTE_RE) ?? url.match(SSH_REMOTE_RE);
  if (!match) return null;
  return { owner: match[1], repo: match[2], platform: Platform.GitHub };
}

// ---------------------------------------------------------------------------
// readLocalRepoInfo
// ---------------------------------------------------------------------------

/**
 * Reads the local git remote URL (through the core's `readOriginRemoteUrl`)
 * and parses owner/repo from it. Supports both HTTPS and SSH GitHub URL
 * formats. Throws if the remote URL cannot be parsed.
 *
 * The try/catch spans BOTH the core read and the parse, so a non-GitHub
 * remote's inner `Could not parse GitHub URL: …` message is still wrapped
 * in the same outer `Failed to get repo info: …` a merged `@adw-779`
 * scenario asserts on.
 */
export function readLocalRepoInfo(cwd?: string): RepoIdentifier {
  try {
    const remoteUrl = readOriginRemoteUrl(cwd);
    const info = parseGitHubRemoteUrl(remoteUrl);
    if (!info) {
      throw new Error(`Could not parse GitHub URL: ${remoteUrl}`);
    }
    return info;
  } catch (error) {
    throw new Error(`Failed to get repo info: ${error}`);
  }
}

// ---------------------------------------------------------------------------
// resolveBootstrapGitIdentity
// ---------------------------------------------------------------------------

/** The built-in default when nothing else resolves — deliberately forge-shaped, and deliberately not in the core (issue #793). */
export const ADW_BOT_FALLBACK_IDENTITY: GitIdentity = {
  authorName: 'ADW Bot',
  authorEmail: 'adw-bot@users.noreply.github.com',
  committerName: 'ADW Bot',
  committerEmail: 'adw-bot@users.noreply.github.com',
};

/** Derives the GitHub App's bot identity from its id/slug. */
function deriveAppBotIdentity(appId: string, appSlug: string): GitIdentity {
  const botName = `${appSlug}[bot]`;
  const botEmail = `${appId}+${appSlug}[bot]@users.noreply.github.com`;
  return { authorName: botName, authorEmail: botEmail, committerName: botName, committerEmail: botEmail };
}

/**
 * Resolves a complete git author/committer identity before a GitContext exists.
 * Resolution order:
 *   1. GitHub App bot identity (if App configured)
 *   2. GIT_AUTHOR_* / GIT_COMMITTER_* env vars (the core's `readEnvGitIdentity`)
 *   3. `git config user.name / user.email` (the core's `readGitConfigIdentity`)
 *   4. Built-in ADW Bot default (never returns empty fields)
 *
 * Same exported name, same deps shape and defaults as the pre-#793 resolver
 * this replaces, so every call site and every existing assertion survives
 * unchanged.
 */
export function resolveBootstrapGitIdentity(deps: BootstrapIdentityDeps = {}): GitIdentity {
  const env = deps.env ?? process.env;
  const derived = resolveAppIdentitySource(deps, env);
  const isAppConfigured = deps.isAppConfigured ?? (() => derived.configured);

  if (isAppConfigured()) {
    const appId = derived.appId ?? env['GITHUB_APP_ID'];
    const appSlug = derived.appSlug ?? env['GITHUB_APP_SLUG'];
    if (appId && appSlug) {
      return deriveAppBotIdentity(appId, appSlug);
    }
  }

  return readEnvGitIdentity(env)
    ?? readGitConfigIdentity({ env, exec: deps.exec })
    ?? ADW_BOT_FALLBACK_IDENTITY;
}
