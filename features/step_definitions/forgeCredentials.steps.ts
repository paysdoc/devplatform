/**
 * Steps for the forge-keyed credential factory (issue #9).
 *
 * The factory is resolved through a dynamic `import()` inside the When step so a
 * missing export fails the scenario that needs it with a legible message,
 * instead of aborting the whole run at support-code load time.
 *
 * Every seam a scenario declares (ambient environment, `git config` reader,
 * `gh auth token`) is handed to the factory through its dependency bag *and*
 * mirrored onto `process.env`, so the scenarios assert the resolved credential
 * and identity rather than a particular injection shape.
 */
import { Given, Then, When } from '@cucumber/cucumber';
import * as assert from 'node:assert/strict';
import * as os from 'node:os';
import * as path from 'node:path';
import { DevPlatformWorld, parseRepository, platformFor, type ForgeCredentials } from '../support/world.js';

/** A path that is guaranteed absent, so a mint attempt fails at the signing-key read. */
const UNREADABLE_APP_KEY_PATH = path.join(os.tmpdir(), 'devplatform-scenarios', 'absent-app-key.pem');

interface CredentialFactory {
  (options: { forge: unknown; identity: unknown; deps?: unknown }): ForgeCredentials;
}

async function loadFactory(): Promise<CredentialFactory> {
  const providers = (await import('../../src/providers/index.js')) as Record<string, unknown>;
  const factory = providers['createForgeCredentials'];
  if (typeof factory !== 'function') {
    throw new Error('expected "createForgeCredentials" to be exported from @paysdoc/devplatform/providers');
  }
  return factory as CredentialFactory;
}

/** Assembles the dependency bag: the per-forge bag the issue specifies, plus the forge-neutral environment and git-config seams the identity chain reads. */
function buildDeps(world: DevPlatformWorld): Record<string, unknown> {
  const deps: Record<string, unknown> = { env: world.env, exec: world.execStub };

  if (world.codeHost === 'github') {
    deps['github'] = {
      appConfig: world.appConfig,
      pat: world.pat,
      alternateIdentityPat: world.alternateIdentityPat,
      ghAuthToken: world.ghAuthToken,
      env: world.env,
      exec: world.execStub,
    };
  }

  if (world.codeHost === 'gitlab' && !world.gitlabConfigOmitted) {
    deps['gitlab'] = world.gitlabConfig;
  }

  return deps;
}

// ---------------------------------------------------------------------------
// Given — forge selection and per-forge configuration
// ---------------------------------------------------------------------------

Given('the forge selection names code host {string} for repository {string}', function (this: DevPlatformWorld, codeHost: string, repository: string) {
  this.codeHost = codeHost;
  this.identity = parseRepository(repository, platformFor(codeHost));
});

Given('the GitHub App is configured with app id {string} and slug {string}', function (this: DevPlatformWorld, appId: string, appSlug: string) {
  this.appConfig = { appId, appSlug, privateKeyPath: UNREADABLE_APP_KEY_PATH };
});

Given('the GitHub App cannot mint an installation token', function (this: DevPlatformWorld) {
  assert.ok(this.appConfig, 'this step needs a configured GitHub App');
  this.appConfig = { ...this.appConfig, privateKeyPath: UNREADABLE_APP_KEY_PATH };
});

Given('the GitHub App is not configured', function (this: DevPlatformWorld) {
  this.appConfig = null;
});

Given('a GitHub personal access token {string}', function (this: DevPlatformWorld, pat: string) {
  this.pat = pat;
});

Given('no GitHub personal access token is set', function (this: DevPlatformWorld) {
  this.pat = undefined;
});

Given('an alternate identity personal access token {string}', function (this: DevPlatformWorld, pat: string) {
  this.alternateIdentityPat = pat;
});

Given('the GitHub CLI reports the token {string}', function (this: DevPlatformWorld, token: string) {
  this.ghAuthToken = () => token;
});

Given('the GitHub CLI reports no token', function (this: DevPlatformWorld) {
  this.ghAuthToken = () => '';
});

Given('the GitLab configuration supplies token {string} at {string}', function (this: DevPlatformWorld, token: string, instanceUrl: string) {
  this.gitlabConfig = { token, instanceUrl };
  this.gitlabConfigOmitted = false;
});

Given('no GitLab configuration is supplied', function (this: DevPlatformWorld) {
  this.gitlabConfig = undefined;
  this.gitlabConfigOmitted = true;
});

// ---------------------------------------------------------------------------
// Given — the ambient identity sources
// ---------------------------------------------------------------------------

Given('the environment sets the git author to {string} with email {string}', function (this: DevPlatformWorld, name: string, email: string) {
  this.env = { ...this.env, GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: email };
  this.syncProcessEnv();
});

Given('the environment carries no git author identity', function (this: DevPlatformWorld) {
  const { GIT_AUTHOR_NAME: _n, GIT_AUTHOR_EMAIL: _e, GIT_COMMITTER_NAME: _cn, GIT_COMMITTER_EMAIL: _ce, ...rest } = this.env;
  this.env = rest;
  this.syncProcessEnv();
});

Given('the environment advertises a GitHub App with app id {string} and slug {string}', function (this: DevPlatformWorld, appId: string, appSlug: string) {
  this.env = {
    ...this.env,
    GITHUB_APP_ID: appId,
    GITHUB_APP_SLUG: appSlug,
    GITHUB_APP_PRIVATE_KEY_PATH: UNREADABLE_APP_KEY_PATH,
  };
  this.syncProcessEnv();
});

Given('git config reports user {string} with email {string}', function (this: DevPlatformWorld, name: string, email: string) {
  this.execStub = (cmd: string) => {
    if (cmd.includes('user.name')) return `${name}\n`;
    if (cmd.includes('user.email')) return `${email}\n`;
    throw new Error(`unexpected git command in a scenario stub: ${cmd}`);
  };
});

Given('git config reports no identity', function (this: DevPlatformWorld) {
  this.execStub = (cmd: string) => {
    throw new Error(`git config is unavailable in this scenario: ${cmd}`);
  };
});

// ---------------------------------------------------------------------------
// When
// ---------------------------------------------------------------------------

When('forge credentials are created', async function (this: DevPlatformWorld) {
  const createForgeCredentials = await loadFactory();
  this.syncProcessEnv();
  this.credentials = undefined;
  this.creationError = undefined;
  try {
    this.credentials = createForgeCredentials({
      forge: { codeHost: this.codeHost, issueTracker: this.issueTracker },
      identity: this.repoIdentifier(),
      deps: buildDeps(this),
    });
  } catch (error) {
    this.creationError = error;
  }
});

When('a credential is requested for {string} with purpose {string}', function (this: DevPlatformWorld, repository: string, purpose: string) {
  const { owner, repo } = parseRepository(repository, platformFor(this.codeHost));
  this.credentialEnv = undefined;
  this.requestError = undefined;
  try {
    this.credentialEnv = this.requireCredentials().tokenProvider.credentialEnv({ owner, repo, purpose });
  } catch (error) {
    this.requestError = error;
  }
});

// ---------------------------------------------------------------------------
// Then — credential environment overlays
// ---------------------------------------------------------------------------

Then('the credential environment sets {string} to {string}', function (this: DevPlatformWorld, variable: string, expected: string) {
  assert.equal(this.requestError, undefined, `expected a credential, but the request was refused: ${String(this.requestError)}`);
  assert.ok(this.credentialEnv, 'no credential environment was produced');
  assert.equal(this.credentialEnv[variable], expected);
});

Then('the credential environment carries the token {string}', function (this: DevPlatformWorld, expected: string) {
  assert.equal(this.requestError, undefined, `expected a credential, but the request was refused: ${String(this.requestError)}`);
  assert.ok(this.credentialEnv, 'no credential environment was produced');
  const values = Object.values(this.credentialEnv);
  assert.ok(
    values.includes(expected),
    `expected the credential environment to carry "${expected}", but it carried ${JSON.stringify(this.credentialEnv)}`,
  );
});

// ---------------------------------------------------------------------------
// Then — refusals
// ---------------------------------------------------------------------------

Then('requesting a credential for {string} with purpose {string} is refused with a message naming {string}', function (this: DevPlatformWorld, repository: string, purpose: string, named: string) {
  const { owner, repo } = parseRepository(repository, platformFor(this.codeHost));
  assert.throws(
    () => this.requireCredentials().tokenProvider.credentialEnv({ owner, repo, purpose }),
    (error: unknown) => String((error as Error)?.message ?? error).includes(named),
    `expected the credential request to be refused with a message naming "${named}"`,
  );
});

Then('requesting a credential for {string} with purpose {string} is refused without serving the personal access token', function (this: DevPlatformWorld, repository: string, purpose: string) {
  const { owner, repo } = parseRepository(repository, platformFor(this.codeHost));
  let served: NodeJS.ProcessEnv | undefined;
  try {
    served = this.requireCredentials().tokenProvider.credentialEnv({ owner, repo, purpose });
  } catch {
    return;
  }
  assert.fail(
    `expected the credential request to be refused once the App is configured, but it served ${JSON.stringify(served)}`,
  );
});

Then('creating the credentials is refused with a message naming {string}', function (this: DevPlatformWorld, named: string) {
  assert.ok(this.creationError, 'expected creating the credentials to be refused, but it succeeded');
  const message = String((this.creationError as Error)?.message ?? this.creationError);
  assert.ok(message.includes(named), `expected the refusal to name "${named}", got: ${message}`);
});

// ---------------------------------------------------------------------------
// Then — bootstrap git identity
// ---------------------------------------------------------------------------

Then('the bootstrap git identity is {string} with email {string}', function (this: DevPlatformWorld, name: string, email: string) {
  assert.deepEqual(this.requireCredentials().gitIdentity, {
    authorName: name,
    authorEmail: email,
    committerName: name,
    committerEmail: email,
  });
});

Then('the bootstrap git identity is complete', function (this: DevPlatformWorld) {
  const identity = this.requireCredentials().gitIdentity;
  for (const field of ['authorName', 'authorEmail', 'committerName', 'committerEmail'] as const) {
    assert.ok(identity[field]?.trim(), `expected the bootstrap identity to carry a non-empty ${field}, got ${JSON.stringify(identity)}`);
  }
});
