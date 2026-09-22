/**
 * Steps for `resolveBootstrapGitIdentity` and `isGitHubAppConfigured` driven
 * directly through `@paysdoc/devplatform/providers` (issue #11).
 *
 * `resolveBootstrapGitIdentity`'s three `appConfig` states map onto the
 * World's `appConfig`/`appConfigInjected` pair: the shared Givens from
 * `forgeCredentials.steps.ts` ("the GitHub App is configured …" / "… is not
 * configured") set `appConfig` to a value or `null`, leaving
 * `appConfigInjected` at its default `true` — so `deps.appConfig` is always
 * passed, even when `null`. This scenario suite's own
 * "no GitHub App configuration is injected" Given flips `appConfigInjected`
 * to `false`, so the `deps.appConfig` key is omitted entirely and the
 * function's own `GITHUB_APP_*` environment fallback decides.
 */
import { Given, Then, When } from '@cucumber/cucumber';
import * as assert from 'node:assert/strict';
import { DevPlatformWorld, type ForgeCredentials } from '../support/world.js';
import { loadProviders, resolveExport } from '../support/publicSurfaceLoader.js';

interface AppConfigLike {
  readonly appId?: string;
  readonly appSlug?: string;
  readonly privateKeyPath?: string;
}
interface BootstrapIdentityDepsLike {
  env?: NodeJS.ProcessEnv;
  exec?: unknown;
  appConfig?: AppConfigLike | null;
}
type ResolveBootstrapGitIdentityFn = (deps: BootstrapIdentityDepsLike) => ForgeCredentials['gitIdentity'];
type IsGitHubAppConfiguredFn = (config: AppConfigLike) => boolean;

/** These scenarios only exercise the identity half of `ForgeCredentials`; the token side is never read. */
const PLACEHOLDER_PROVIDER: ForgeCredentials['tokenProvider'] = {
  credentialEnv: () => {
    throw new Error('placeholder token provider was not meant to be invoked');
  },
};

// ---------------------------------------------------------------------------
// Given
// ---------------------------------------------------------------------------

Given('no GitHub App configuration is injected', function (this: DevPlatformWorld) {
  this.appConfigInjected = false;
});

Given('the GitHub App configuration carries app id {string}, slug {string} and private key path {string}', function (this: DevPlatformWorld, appId: string, appSlug: string, keyPath: string) {
  this.appConfigUnderTest = { appId, appSlug, privateKeyPath: keyPath };
});

// ---------------------------------------------------------------------------
// When
// ---------------------------------------------------------------------------

When('the bootstrap git identity is resolved through the providers entry point', async function (this: DevPlatformWorld) {
  const providers = await loadProviders();
  const resolveBootstrapGitIdentity = resolveExport<ResolveBootstrapGitIdentityFn>(providers, 'resolveBootstrapGitIdentity', 'providers');
  this.syncProcessEnv();

  const deps: BootstrapIdentityDepsLike = { env: this.env, exec: this.execStub };
  if (this.appConfigInjected) {
    deps.appConfig = this.appConfig;
  }
  const identity = resolveBootstrapGitIdentity(deps);
  this.credentials = { tokenProvider: PLACEHOLDER_PROVIDER, gitIdentity: identity };
});

When('the App configuration is checked through the providers entry point', async function (this: DevPlatformWorld) {
  const providers = await loadProviders();
  const isGitHubAppConfigured = resolveExport<IsGitHubAppConfiguredFn>(providers, 'isGitHubAppConfigured', 'providers');
  assert.ok(this.appConfigUnderTest, 'no GitHub App configuration was declared for this scenario');
  this.appConfiguredVerdict = isGitHubAppConfigured(this.appConfigUnderTest);
});

// ---------------------------------------------------------------------------
// Then
// ---------------------------------------------------------------------------

Then('the App configuration check reports {string}', function (this: DevPlatformWorld, expected: string) {
  const actual = this.appConfiguredVerdict ? 'configured' : 'not configured';
  assert.equal(actual, expected);
});
