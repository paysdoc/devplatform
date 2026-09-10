import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createForgeCredentials } from '../forgeCredentials.js';
import type { ForgeCredentials, ForgeCredentialDeps } from '../forgeCredentials.js';
import { UnknownForgeError, type CodeHostForge, type ForgeSelection } from '../forgeProviders.js';
import { clearAppAuthCaches } from '../github/appAuth.js';
import type { RunCurl, GitHubAppConfig } from '../github/appAuth.js';
import { ADW_BOT_FALLBACK_IDENTITY } from '../github/githubIdentity.js';
import { GITLAB_BOT_FALLBACK_IDENTITY } from '../gitlab/gitlabIdentity.js';
import { Platform } from '../types.js';
import type { CredentialRequest } from '../../git/types.js';
import { makeRepoId } from './forgeProvidersFixture.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function request(overrides: Partial<CredentialRequest> = {}): CredentialRequest {
  return { owner: 'acme', repo: 'webapp', purpose: 'default', ...overrides };
}

interface RecordedCall { args: readonly string[]; config: string }
interface CannedResponse { status: number; body: string }

/** Records every {args, config} pair and replays canned `${body}\n${status}` responses in order — copied from appAuth.test.ts. */
function makeRunCurl(responses: readonly CannedResponse[]): { runCurl: RunCurl; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  let index = 0;
  const runCurl: RunCurl = (args, stdinConfig) => {
    calls.push({ args, config: stdinConfig });
    const next = responses[index++];
    if (!next) throw new Error(`makeRunCurl: no canned response queued for call #${index}`);
    return `${next.body}\n${next.status}`;
  };
  return { runCurl, calls };
}

const GITHUB_SELECTION: ForgeSelection = { codeHost: 'github', issueTracker: 'github' };
const GITLAB_SELECTION: ForgeSelection = { codeHost: 'gitlab', issueTracker: 'github' };

let scratchDir: string;
let completeAppConfig: GitHubAppConfig;

beforeAll(() => {
  scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adw-forgecred-'));
  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  const keyPath = path.join(scratchDir, 'throwaway-key.pem');
  fs.writeFileSync(keyPath, privateKey, 'utf-8');
  completeAppConfig = { appId: '12345', appSlug: 'my-app', privateKeyPath: keyPath };
});

afterAll(() => {
  fs.rmSync(scratchDir, { recursive: true, force: true });
});

// Ambient GH_TOKEN must never leak (tokenResolver.test.ts precedent), and the
// installation-token cache must never survive across tests.
const SENTINEL = 'sentinel-gh-token-must-not-leak';
beforeEach(() => {
  process.env.GH_TOKEN = SENTINEL;
  clearAppAuthCaches();
});
afterEach(() => { delete process.env.GH_TOKEN; });

// ---------------------------------------------------------------------------
// github
// ---------------------------------------------------------------------------

describe('createForgeCredentials — github', () => {
  it('a complete App config mints an installation token, ignoring a supplied PAT and never calling the gh auth token seam', () => {
    const futureIso = new Date(Date.now() + 3600_000).toISOString();
    const { runCurl } = makeRunCurl([
      { status: 200, body: '{"id":4711}' },
      { status: 201, body: `{"token":"ghs_minted","expires_at":"${futureIso}"}` },
    ]);
    let ghAuthCalled = false;
    const credentials = createForgeCredentials({
      forge: GITHUB_SELECTION,
      identity: makeRepoId(),
      deps: {
        github: {
          appConfig: completeAppConfig,
          pat: 'ghp_must_not_be_used',
          ghAuthToken: () => { ghAuthCalled = true; return 'gh-cli-must-not-be-used'; },
          appAuth: { runCurl },
        },
      },
    });
    const env = credentials.tokenProvider.credentialEnv(request());
    expect(env.GH_TOKEN).toBe('ghs_minted');
    expect(env.GH_TOKEN).not.toBe(SENTINEL);
    expect(ghAuthCalled).toBe(false);
  });

  it('the App-bot identity derives from the injected config even with an empty environment', () => {
    const credentials = createForgeCredentials({
      forge: GITHUB_SELECTION,
      identity: makeRepoId(),
      deps: { env: {}, github: { appConfig: completeAppConfig, env: {} } },
    });
    expect(credentials.gitIdentity).toEqual({
      authorName: 'my-app[bot]',
      authorEmail: '12345+my-app[bot]@users.noreply.github.com',
      committerName: 'my-app[bot]',
      committerEmail: '12345+my-app[bot]@users.noreply.github.com',
    });
  });

  it('a complete App config with an absent key file: construction succeeds, and credentialEnv refuses rather than substituting the PAT', () => {
    const absentKeyPath = path.join(os.tmpdir(), 'devplatform-forgecred-tests', 'absent-key.pem');
    let credentials!: ForgeCredentials;
    expect(() => {
      credentials = createForgeCredentials({
        forge: GITHUB_SELECTION,
        identity: makeRepoId(),
        deps: {
          github: {
            appConfig: { appId: '12345', appSlug: 'my-app', privateKeyPath: absentKeyPath },
            pat: 'ghp_must_not_be_substituted',
          },
        },
      });
    }).not.toThrow();

    let thrown: Error | undefined;
    try {
      credentials.tokenProvider.credentialEnv(request());
    } catch (error) {
      thrown = error as Error;
    }
    expect(thrown).toBeDefined();
    expect(thrown!.message).not.toContain('ghp_must_not_be_substituted');
  });

  it('appConfig: null serves the PAT, and gitIdentity resolves from the environment', () => {
    const credentials = createForgeCredentials({
      forge: GITHUB_SELECTION,
      identity: makeRepoId(),
      deps: {
        github: {
          appConfig: null,
          pat: 'ghp_from_pat',
          env: { GIT_AUTHOR_NAME: 'CI Bot', GIT_AUTHOR_EMAIL: 'ci@test.dev' },
        },
      },
    });
    expect(credentials.tokenProvider.credentialEnv(request()).GH_TOKEN).toBe('ghp_from_pat');
    expect(credentials.gitIdentity.authorName).toBe('CI Bot');
    expect(credentials.gitIdentity.authorEmail).toBe('ci@test.dev');
  });

  it('appConfig: null, no PAT: the ghAuthToken seam serves the token, and gitIdentity resolves via the top-level exec seam', () => {
    const fakeExec = (cmd: string) => {
      if (cmd === 'git config user.name') return 'Config Bot\n';
      if (cmd === 'git config user.email') return 'config@bot.dev\n';
      throw new Error(`unexpected git command in test stub: ${cmd}`);
    };
    const credentials = createForgeCredentials({
      forge: GITHUB_SELECTION,
      identity: makeRepoId(),
      deps: {
        env: {},
        exec: fakeExec as unknown as ForgeCredentialDeps['exec'],
        github: { appConfig: null, ghAuthToken: () => 'ghs-from-cli' },
      },
    });
    expect(credentials.tokenProvider.credentialEnv(request()).GH_TOKEN).toBe('ghs-from-cli');
    expect(credentials.gitIdentity.authorName).toBe('Config Bot');
    expect(credentials.gitIdentity.authorEmail).toBe('config@bot.dev');
  });

  it('appConfig: null, nothing available: construction succeeds, credentialEnv refuses naming the repo, gitIdentity falls back to the ADW Bot default', () => {
    const credentials = createForgeCredentials({
      forge: GITHUB_SELECTION,
      identity: makeRepoId(),
      deps: {
        env: {},
        exec: () => { throw new Error('git config is unavailable'); },
        github: { appConfig: null, ghAuthToken: () => '' },
      },
    });
    expect(() => credentials.tokenProvider.credentialEnv(request())).toThrow(/no veracious token for acme\/webapp/);
    expect(credentials.gitIdentity).toEqual(ADW_BOT_FALLBACK_IDENTITY);
  });

  it("alternateIdentityPat is served only for 'alternateIdentity' requests, without minting", () => {
    const { runCurl, calls } = makeRunCurl([]);
    const credentials = createForgeCredentials({
      forge: GITHUB_SELECTION,
      identity: makeRepoId(),
      deps: {
        github: { appConfig: completeAppConfig, alternateIdentityPat: 'ghp_reviewer', appAuth: { runCurl } },
      },
    });
    const env = credentials.tokenProvider.credentialEnv(request({ purpose: 'alternateIdentity' }));
    expect(env.GH_TOKEN).toBe('ghp_reviewer');
    expect(calls).toHaveLength(0);
  });

  it('a whitespace-only alternateIdentityPat degrades to default resolution', () => {
    const futureIso = new Date(Date.now() + 3600_000).toISOString();
    const { runCurl } = makeRunCurl([
      { status: 200, body: '{"id":4712}' },
      { status: 201, body: `{"token":"ghs_minted2","expires_at":"${futureIso}"}` },
    ]);
    const credentials = createForgeCredentials({
      forge: GITHUB_SELECTION,
      identity: makeRepoId(),
      deps: { github: { appConfig: completeAppConfig, alternateIdentityPat: '   ', appAuth: { runCurl } } },
    });
    const env = credentials.tokenProvider.credentialEnv(request({ purpose: 'alternateIdentity' }));
    expect(env.GH_TOKEN).toBe('ghs_minted2');
  });

  it('the deps.github seams win over the top-level seams when both are given', () => {
    const credentials = createForgeCredentials({
      forge: GITHUB_SELECTION,
      identity: makeRepoId(),
      deps: {
        env: { GIT_AUTHOR_NAME: 'Top Level', GIT_AUTHOR_EMAIL: 'top@example.com' },
        github: { appConfig: null, env: { GIT_AUTHOR_NAME: 'Per Forge', GIT_AUTHOR_EMAIL: 'per-forge@example.com' } },
      },
    });
    expect(credentials.gitIdentity.authorName).toBe('Per Forge');
  });

  it('an incomplete appConfig is not configured: PAT path, no bot identity', () => {
    const credentials = createForgeCredentials({
      forge: GITHUB_SELECTION,
      identity: makeRepoId(),
      deps: {
        github: {
          appConfig: { appId: '1' },
          pat: 'ghp_from_pat',
          env: { GIT_AUTHOR_NAME: 'CI Bot', GIT_AUTHOR_EMAIL: 'ci@test.dev' },
        },
      },
    });
    expect(credentials.tokenProvider.credentialEnv(request()).GH_TOKEN).toBe('ghp_from_pat');
    expect(credentials.gitIdentity.authorName).toBe('CI Bot');
  });

  it('deps.github omitted: construction succeeds with a complete, non-empty gitIdentity and no credentialEnv call needed', () => {
    const credentials = createForgeCredentials({
      forge: GITHUB_SELECTION,
      identity: makeRepoId(),
      deps: { env: {}, exec: () => { throw new Error('git config is unavailable'); } },
    });
    for (const field of ['authorName', 'authorEmail', 'committerName', 'committerEmail'] as const) {
      expect(credentials.gitIdentity[field].trim()).not.toBe('');
    }
  });
});

// ---------------------------------------------------------------------------
// gitlab
// ---------------------------------------------------------------------------

describe('createForgeCredentials — gitlab', () => {
  it('serves the configured token for both credential purposes, with an overlay of exactly GITLAB_TOKEN', () => {
    const credentials = createForgeCredentials({
      forge: GITLAB_SELECTION,
      identity: makeRepoId({ platform: Platform.GitLab }),
      deps: {
        env: { GIT_AUTHOR_NAME: 'Release Bot', GIT_AUTHOR_EMAIL: 'release-bot@example.com' },
        gitlab: { token: 'glpat-configured', instanceUrl: 'https://gitlab.com' },
      },
    });
    const defaultEnv = credentials.tokenProvider.credentialEnv(request());
    const altEnv = credentials.tokenProvider.credentialEnv(request({ purpose: 'alternateIdentity' }));
    expect(Object.keys(defaultEnv)).toEqual(['GITLAB_TOKEN']);
    expect(defaultEnv.GITLAB_TOKEN).toBe('glpat-configured');
    expect(altEnv.GITLAB_TOKEN).toBe('glpat-configured');
    expect(credentials.gitIdentity.authorName).toBe('Release Bot');
  });

  it('resolves identity via git config through the top-level exec seam', () => {
    const fakeExec = (cmd: string) => {
      if (cmd === 'git config user.name') return 'Local Dev\n';
      if (cmd === 'git config user.email') return 'local-dev@example.com\n';
      throw new Error(`unexpected git command in test stub: ${cmd}`);
    };
    const credentials = createForgeCredentials({
      forge: GITLAB_SELECTION,
      identity: makeRepoId({ platform: Platform.GitLab }),
      deps: {
        env: {},
        exec: fakeExec as unknown as ForgeCredentialDeps['exec'],
        gitlab: { token: 'glpat-configured', instanceUrl: 'https://gitlab.com' },
      },
    });
    expect(credentials.gitIdentity.authorName).toBe('Local Dev');
  });

  it('falls back to a complete built-in identity when nothing resolves, deriving no bot identity from a GitHub App in the environment', () => {
    const credentials = createForgeCredentials({
      forge: GITLAB_SELECTION,
      identity: makeRepoId({ platform: Platform.GitLab }),
      deps: {
        env: { GITHUB_APP_ID: '12345', GITHUB_APP_SLUG: 'adw-bot', GITHUB_APP_PRIVATE_KEY_PATH: '/path/to/key' },
        exec: () => { throw new Error('git config is unavailable'); },
        gitlab: { token: 'glpat-configured', instanceUrl: 'https://gitlab.com' },
      },
    });
    expect(credentials.gitIdentity).toEqual(GITLAB_BOT_FALLBACK_IDENTITY);
  });

  it('a missing deps.gitlab is refused, naming gitlab and deps.gitlab', () => {
    expect(() => createForgeCredentials({
      forge: GITLAB_SELECTION,
      identity: makeRepoId({ platform: Platform.GitLab }),
      deps: {},
    })).toThrow(/gitlab.*deps\.gitlab/i);
  });

  it('a blank token is refused at construction, naming the field', () => {
    expect(() => createForgeCredentials({
      forge: GITLAB_SELECTION,
      identity: makeRepoId({ platform: Platform.GitLab }),
      deps: { gitlab: { token: '   ', instanceUrl: 'https://gitlab.com' } },
    })).toThrow(/token/);
  });

  it('a deps.github bag passed alongside a GitLab code host is ignored — its throwing seam is never invoked', () => {
    const credentials = createForgeCredentials({
      forge: GITLAB_SELECTION,
      identity: makeRepoId({ platform: Platform.GitLab }),
      deps: {
        gitlab: { token: 'glpat-configured', instanceUrl: 'https://gitlab.com' },
        github: { appConfig: null, ghAuthToken: () => { throw new Error('must not be called for a GitLab code host'); } },
      },
    });
    expect(credentials.tokenProvider.credentialEnv(request()).GITLAB_TOKEN).toBe('glpat-configured');
  });
});

// ---------------------------------------------------------------------------
// unknown / wrong-port code host
// ---------------------------------------------------------------------------

describe('createForgeCredentials — unknown/wrong-port code host', () => {
  it('an unknown code host throws UnknownForgeError naming the value, the port and createForgeCredentials, before any seam runs', () => {
    let ghAuthCalled = false;
    let execCalled = false;
    let error: unknown;
    try {
      createForgeCredentials({
        forge: { codeHost: 'bananas' as CodeHostForge, issueTracker: 'github' },
        identity: makeRepoId(),
        deps: {
          exec: () => { execCalled = true; return ''; },
          github: { appConfig: null, ghAuthToken: () => { ghAuthCalled = true; return ''; } },
        },
      });
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(UnknownForgeError);
    expect((error as Error).name).toBe('UnknownForgeError');
    expect((error as Error).message).toMatch(/bananas/);
    expect((error as Error).message).toMatch(/code host/);
    expect((error as Error).message).toMatch(/createForgeCredentials/);
    expect(ghAuthCalled).toBe(false);
    expect(execCalled).toBe(false);
  });

  it('a wrong-port forge name ("jira" as a code host) is refused the same way', () => {
    expect(() => createForgeCredentials({
      forge: { codeHost: 'jira' as CodeHostForge, issueTracker: 'github' },
      identity: makeRepoId(),
    })).toThrow(UnknownForgeError);
  });
});

// ---------------------------------------------------------------------------
// identity validation and result shape
// ---------------------------------------------------------------------------

describe('createForgeCredentials — identity validation and result shape', () => {
  it('an empty repo throws through validateRepoIdentifier before any seam runs', () => {
    expect(() => createForgeCredentials({
      forge: GITHUB_SELECTION,
      identity: makeRepoId({ repo: '' }),
    })).toThrow(/repo/);
  });

  it('returns a frozen result whose tokenProvider implements credentialEnv', () => {
    const credentials = createForgeCredentials({
      forge: GITHUB_SELECTION,
      identity: makeRepoId(),
      deps: { env: {}, exec: () => { throw new Error('git config is unavailable'); } },
    });
    expect(Object.isFrozen(credentials)).toBe(true);
    expect(typeof credentials.tokenProvider.credentialEnv).toBe('function');
  });
});
