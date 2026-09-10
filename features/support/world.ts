/**
 * Shared cucumber World for the scenario suite.
 *
 * Holds the inputs a scenario declares (forge selection, repository identity,
 * per-forge dependency bags, ambient environment and git-config stubs) and the
 * outputs it asserts against (the created credentials, a captured refusal, the
 * last credential environment overlay). Nothing here reads a source file; the
 * steps drive the library's public functions and read what they return.
 */
import { After, Before, setDefaultTimeout, setWorldConstructor, World, type IWorldOptions } from '@cucumber/cucumber';
import { Platform, type RepoIdentifier } from '../../src/providers/types.js';

setDefaultTimeout(30_000);

/** Matches the `exec` seam `readGitConfigIdentity` accepts. */
export type ExecStub = (cmd: string, opts: unknown) => string;

/** Structural stand-in for `GitHubAppConfig` — avoids importing an adapter-internal type into the step layer. */
export interface AppConfigInput {
  readonly appId?: string;
  readonly appSlug?: string;
  readonly privateKeyPath?: string;
}

/** Structural stand-in for `GitLabConfig`. */
export interface GitLabConfigInput {
  readonly token: string;
  readonly instanceUrl: string;
}

/** The shape `createForgeCredentials` returns. */
export interface ForgeCredentials {
  readonly tokenProvider: { credentialEnv(request: { owner: string; repo: string; purpose: string }): NodeJS.ProcessEnv };
  readonly gitIdentity: { authorName: string; authorEmail: string; committerName: string; committerEmail: string };
}

/**
 * Environment keys a scenario is allowed to own. They are cleared before every
 * scenario and restored afterwards, so an implementation that defaults to
 * `process.env` sees exactly what the scenario declared and the developer's own
 * shell identity never leaks into an assertion.
 */
const MANAGED_ENV_KEYS = [
  'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL',
  'GITHUB_APP_ID', 'GITHUB_APP_SLUG', 'GITHUB_APP_PRIVATE_KEY_PATH',
  'GH_TOKEN', 'GITHUB_TOKEN', 'GITLAB_TOKEN',
] as const;

export class DevPlatformWorld extends World {
  identity?: RepoIdentifier;
  codeHost = 'github';
  issueTracker = 'github';

  appConfig: AppConfigInput | null = null;
  pat?: string;
  alternateIdentityPat?: string;
  /** Defaults to "gh is not configured" so no scenario ever spawns the real CLI. */
  ghAuthToken: () => string = () => '';

  gitlabConfig?: GitLabConfigInput;
  gitlabConfigOmitted = false;

  /** The ambient environment the identity chain reads. Empty unless a scenario declares otherwise. */
  env: NodeJS.ProcessEnv = {};
  execStub?: ExecStub;

  credentials?: ForgeCredentials;
  creationError?: unknown;
  credentialEnv?: NodeJS.ProcessEnv;
  requestError?: unknown;

  /** Packaged-consumer scenarios: the installed project and the last subprocess run inside it. */
  consumerDir?: string;
  subprocess?: { readonly status: number | null; readonly stdout: string; readonly stderr: string };

  private savedEnv = new Map<string, string | undefined>();

  constructor(options: IWorldOptions) {
    super(options);
  }

  /** Applies `this.env` to the managed keys of `process.env`, so a `process.env` default behaves like the declared environment. */
  syncProcessEnv(): void {
    for (const key of MANAGED_ENV_KEYS) {
      const value = this.env[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  snapshotProcessEnv(): void {
    for (const key of MANAGED_ENV_KEYS) {
      this.savedEnv.set(key, process.env[key]);
      delete process.env[key];
    }
  }

  restoreProcessEnv(): void {
    for (const [key, value] of this.savedEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    this.savedEnv.clear();
  }

  repoIdentifier(): RepoIdentifier {
    if (!this.identity) throw new Error('no repository identity was declared by this scenario');
    return this.identity;
  }

  requireCredentials(): ForgeCredentials {
    if (this.credentials) return this.credentials;
    throw new Error(`expected forge credentials to have been created, but creation failed: ${String(this.creationError)}`);
  }
}

/** Maps a code-host name onto the domain `Platform`; an unknown name keeps the literal so the factory — not the step layer — decides it is unknown. */
export function platformFor(codeHost: string): Platform {
  if (codeHost === 'gitlab') return Platform.GitLab;
  if (codeHost === 'bitbucket') return Platform.Bitbucket;
  return Platform.GitHub;
}

export function parseRepository(spec: string, platform: Platform): RepoIdentifier {
  const [owner, repo] = spec.split('/');
  if (!owner || !repo) throw new Error(`expected an "owner/repo" repository, got "${spec}"`);
  return { owner, repo, platform };
}

setWorldConstructor(DevPlatformWorld);

Before(function (this: DevPlatformWorld) {
  this.snapshotProcessEnv();
});

After(function (this: DevPlatformWorld) {
  this.restoreProcessEnv();
});
