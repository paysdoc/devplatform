/**
 * Steps for `createGitHubTokenProvider` and `resolveContextToken` driven
 * directly through `@paysdoc/devplatform/providers` (issue #11) — as opposed
 * to through `createForgeCredentials`, which `forgeCredentials.steps.ts`
 * already covers. Every Given/Then phrase these scenarios share with
 * `feature-9.feature` is reused verbatim from that file; only the two `When`
 * steps that construct/invoke the widened names directly are new.
 */
import { Then, When } from '@cucumber/cucumber';
import * as assert from 'node:assert/strict';
import { DevPlatformWorld, parseRepository, platformFor, type ForgeCredentials } from '../support/world.js';
import { loadProviders, resolveExport } from '../support/publicSurfaceLoader.js';

type GetInstallationTokenFn = (config: { appId?: string; appSlug?: string; privateKeyPath?: string }, owner: string, repo: string) => string;
type IsGitHubAppConfiguredFn = (config: { appId?: string; appSlug?: string; privateKeyPath?: string }) => boolean;

interface GitHubTokenProviderInput {
  pat?: string | undefined;
  alternateIdentityPat?: string | undefined;
  isAppConfigured: () => boolean;
  mintInstallationToken: (owner: string, repo: string) => string;
  ghAuthToken: () => string;
}
type CreateGitHubTokenProviderFn = (input: GitHubTokenProviderInput) => ForgeCredentials['tokenProvider'];

interface ResolveContextTokenInput {
  owner: string;
  repo: string;
  pat?: string | undefined;
  isAppConfigured: () => boolean;
  mintInstallationToken: (owner: string, repo: string) => string;
  ghAuthToken: () => string;
}
type ResolveContextTokenFn = (input: ResolveContextTokenInput) => string;

/** A tokenProvider/gitIdentity pair is required by `ForgeCredentials`, but these scenarios only exercise the token side — the identity half is never read. */
const PLACEHOLDER_IDENTITY: ForgeCredentials['gitIdentity'] = {
  authorName: 'placeholder', authorEmail: 'placeholder@example.com',
  committerName: 'placeholder', committerEmail: 'placeholder@example.com',
};

/** Builds the `mintInstallationToken` seam: an explicit override wins (for scenarios that only care the mint result wins the resolution order); otherwise it composes the real `getInstallationToken` over the declared App config, so a mint failure is a genuine thrown error. */
function buildMintInstallationToken(world: DevPlatformWorld, getInstallationToken: GetInstallationTokenFn): (owner: string, repo: string) => string {
  return (owner, repo) => {
    if (world.mintInstallationTokenResult !== undefined) return world.mintInstallationTokenResult;
    if (!world.appConfig) throw new Error('mintInstallationToken should not be called when the GitHub App is not configured');
    return getInstallationToken(world.appConfig, owner, repo);
  };
}

// ---------------------------------------------------------------------------
// Given
// ---------------------------------------------------------------------------

When('the GitHub App mints the installation token {string}', function (this: DevPlatformWorld, token: string) {
  this.mintInstallationTokenResult = token;
});

// ---------------------------------------------------------------------------
// When — createGitHubTokenProvider
// ---------------------------------------------------------------------------

When('a GitHub token provider is created through the providers entry point', async function (this: DevPlatformWorld) {
  const providers = await loadProviders();
  const createGitHubTokenProvider = resolveExport<CreateGitHubTokenProviderFn>(providers, 'createGitHubTokenProvider', 'providers');
  const isGitHubAppConfigured = resolveExport<IsGitHubAppConfiguredFn>(providers, 'isGitHubAppConfigured', 'providers');
  const getInstallationToken = resolveExport<GetInstallationTokenFn>(providers, 'getInstallationToken', 'providers');
  const appConfigured = this.appConfig !== null && isGitHubAppConfigured(this.appConfig);

  const tokenProvider = createGitHubTokenProvider({
    pat: this.pat,
    alternateIdentityPat: this.alternateIdentityPat,
    isAppConfigured: () => appConfigured,
    mintInstallationToken: buildMintInstallationToken(this, getInstallationToken),
    ghAuthToken: this.ghAuthToken,
  });
  this.credentials = { tokenProvider, gitIdentity: PLACEHOLDER_IDENTITY };
});

// ---------------------------------------------------------------------------
// When — resolveContextToken
// ---------------------------------------------------------------------------

When('a context token is resolved through the providers entry point for {string}', async function (this: DevPlatformWorld, repository: string) {
  const providers = await loadProviders();
  const resolveContextToken = resolveExport<ResolveContextTokenFn>(providers, 'resolveContextToken', 'providers');
  const isGitHubAppConfigured = resolveExport<IsGitHubAppConfiguredFn>(providers, 'isGitHubAppConfigured', 'providers');
  const getInstallationToken = resolveExport<GetInstallationTokenFn>(providers, 'getInstallationToken', 'providers');
  const { owner, repo } = parseRepository(repository, platformFor(this.codeHost));
  const appConfigured = this.appConfig !== null && isGitHubAppConfigured(this.appConfig);

  this.resolvedToken = undefined;
  this.tokenResolutionError = undefined;
  try {
    this.resolvedToken = resolveContextToken({
      owner,
      repo,
      pat: this.pat,
      isAppConfigured: () => appConfigured,
      mintInstallationToken: buildMintInstallationToken(this, getInstallationToken),
      ghAuthToken: this.ghAuthToken,
    });
  } catch (error) {
    this.tokenResolutionError = error;
  }
});

// ---------------------------------------------------------------------------
// Then
// ---------------------------------------------------------------------------

Then('the resolved token is {string}', function (this: DevPlatformWorld, expected: string) {
  assert.equal(this.tokenResolutionError, undefined, `expected a token, but resolution was refused: ${String(this.tokenResolutionError)}`);
  assert.equal(this.resolvedToken, expected);
});

Then('the token resolution is refused with a message naming {string}', function (this: DevPlatformWorld, named: string) {
  assert.ok(this.tokenResolutionError, 'expected token resolution to be refused, but it succeeded');
  const message = String((this.tokenResolutionError as Error)?.message ?? this.tokenResolutionError);
  assert.ok(message.includes(named), `expected the refusal to name "${named}", got: ${message}`);
});
