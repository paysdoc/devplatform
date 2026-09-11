/**
 * Steps for `getInstallationToken` and `ghAuthToken` driven directly through
 * `@paysdoc/devplatform/providers` (issue #11).
 *
 * `getInstallationToken`'s mint scenario injects a real freshly generated RSA
 * signing key (so the JWT is genuinely signed) and a recording `runCurl` stub
 * that answers the installation lookup and token exchange without curl or
 * the network — the same `AppAuthDeps` seam the adapter documents. The
 * module-level per-repository token cache is why this scenario mints for
 * `paysdoc/devplatform-mint`, a repository no other scenario mints for.
 *
 * `ghAuthToken` spawns `gh auth token` through the shell, so its two reader
 * scenarios put a stub `gh` executable first on `PATH` for the scenario's
 * duration (`stubGh.ts`; restored in `world.ts`'s `After` hook).
 */
import { Given, Then, When } from '@cucumber/cucumber';
import * as assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DevPlatformWorld, parseRepository, platformFor } from '../support/world.js';
import { loadProviders, resolveExport } from '../support/publicSurfaceLoader.js';
import { installStubGh } from '../support/stubGh.js';

interface AppConfigLike {
  readonly appId?: string;
  readonly appSlug?: string;
  readonly privateKeyPath?: string;
}
/** Structural stand-in for `AppAuthDeps` — avoids importing an adapter-internal type into the step layer. */
interface AppAuthDepsLike {
  apiBaseUrl?: string;
  runCurl?: (args: readonly string[], stdinConfig: string) => string;
}
type GetInstallationTokenFn = (config: AppConfigLike, owner: string, repo: string, deps?: AppAuthDepsLike) => string;
type GhAuthTokenFn = () => string;

// ---------------------------------------------------------------------------
// Given — getInstallationToken
// ---------------------------------------------------------------------------

Given('the GitHub App is configured with app id {string} and slug {string} and a freshly generated signing key', function (this: DevPlatformWorld, appId: string, appSlug: string) {
  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  const keyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devplatform-signing-key-'));
  const keyPath = path.join(keyDir, 'app.pem');
  fs.writeFileSync(keyPath, privateKey);
  this.generatedKeyPaths.push(keyDir);
  this.appConfigUnderTest = { appId, appSlug, privateKeyPath: keyPath };
});

Given('the GitHub API stub answers installation lookups for {string} with installation {string} and issues the token {string}', function (this: DevPlatformWorld, repository: string, installationId: string, token: string) {
  const calls: string[] = [];
  this.githubApiStubCalls = calls;
  this.mintDeps = {
    runCurl: (_args, stdinConfig) => {
      const url = stdinConfig.match(/url = "([^"]+)"/)?.[1] ?? '';
      if (url.endsWith(`/repos/${repository}/installation`)) {
        calls.push(`installation-lookup:${repository}`);
        return `${JSON.stringify({ id: Number(installationId) })}\n200`;
      }
      if (url.endsWith(`/app/installations/${installationId}/access_tokens`)) {
        calls.push(`token-exchange:${installationId}`);
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        return `${JSON.stringify({ token, expires_at: expiresAt })}\n201`;
      }
      throw new Error(`unexpected GitHub API URL in a scenario stub: ${url}`);
    },
  };
});

// ---------------------------------------------------------------------------
// Given — ghAuthToken
// ---------------------------------------------------------------------------

Given('a stub GitHub CLI on the PATH prints the token {string}', function (this: DevPlatformWorld, token: string) {
  installStubGh(this, `printf '%s\\n' ${JSON.stringify(token)}`);
});

Given('a stub GitHub CLI on the PATH exits with an error', function (this: DevPlatformWorld) {
  installStubGh(this, 'exit 1');
});

// ---------------------------------------------------------------------------
// When
// ---------------------------------------------------------------------------

When('an installation token is minted through the providers entry point for {string}', async function (this: DevPlatformWorld, repository: string) {
  const providers = await loadProviders();
  const getInstallationToken = resolveExport<GetInstallationTokenFn>(providers, 'getInstallationToken', 'providers');
  assert.ok(this.appConfigUnderTest, 'no GitHub App configuration was declared for this scenario');
  const { owner, repo } = parseRepository(repository, platformFor('github'));

  this.mintedToken = undefined;
  this.mintError = undefined;
  try {
    this.mintedToken = getInstallationToken(this.appConfigUnderTest, owner, repo, this.mintDeps ?? {});
  } catch (error) {
    this.mintError = error;
  }
});

When('the GitHub CLI token is read through the providers entry point', async function (this: DevPlatformWorld) {
  const providers = await loadProviders();
  const ghAuthToken = resolveExport<GhAuthTokenFn>(providers, 'ghAuthToken', 'providers');
  this.readToken = ghAuthToken();
});

// ---------------------------------------------------------------------------
// Then
// ---------------------------------------------------------------------------

Then('the minted token is {string}', function (this: DevPlatformWorld, expected: string) {
  assert.equal(this.mintError, undefined, `expected a minted token, but minting was refused: ${String(this.mintError)}`);
  assert.equal(this.mintedToken, expected);
});

Then('the GitHub API stub recorded an installation lookup for {string} followed by a token exchange for installation {string}', function (this: DevPlatformWorld, repository: string, installationId: string) {
  assert.deepEqual(this.githubApiStubCalls, [`installation-lookup:${repository}`, `token-exchange:${installationId}`]);
});

Then('the mint is refused with a message naming {string}', function (this: DevPlatformWorld, named: string) {
  assert.ok(this.mintError, 'expected minting to be refused, but it succeeded');
  const message = String((this.mintError as Error)?.message ?? this.mintError);
  assert.ok(message.includes(named), `expected the refusal to name "${named}", got: ${message}`);
});

Then('the read token is {string}', function (this: DevPlatformWorld, expected: string) {
  assert.equal(this.readToken, expected);
});

Then('the read token is empty', function (this: DevPlatformWorld) {
  assert.equal(this.readToken, '');
});
