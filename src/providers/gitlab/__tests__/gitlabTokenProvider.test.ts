import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createGitLabTokenProvider, GITLAB_TOKEN_ENV_VAR } from '../gitlabTokenProvider.js';
import type { GitLabConfig } from '../gitlabApiClient.js';
import type { CredentialRequest } from '../../../git/types.js';

function config(overrides: Partial<GitLabConfig> = {}): GitLabConfig {
  return { token: 'glpat-configured', instanceUrl: 'https://gitlab.com', ...overrides };
}

function request(overrides: Partial<CredentialRequest> = {}): CredentialRequest {
  return { owner: 'acme', repo: 'webapp', purpose: 'default', ...overrides };
}

// Ambient environment must never leak into the overlay — same precedent as
// gitlabApiClient.test.ts's "ambient environment is ignored" suite.
const SENTINEL = 'sentinel-gitlab-token-must-not-leak';

beforeEach(() => { process.env.GITLAB_TOKEN = SENTINEL; });
afterEach(() => { delete process.env.GITLAB_TOKEN; });

describe('createGitLabTokenProvider', () => {
  it("'default' purpose returns the configured token", () => {
    const provider = createGitLabTokenProvider(config());
    const env = provider.credentialEnv(request());
    expect(env.GITLAB_TOKEN).toBe('glpat-configured');
    expect(env.GITLAB_TOKEN).not.toBe(SENTINEL);
  });

  it("'alternateIdentity' purpose returns the same configured token (no bot-self-approval split on GitLab)", () => {
    const provider = createGitLabTokenProvider(config());
    const env = provider.credentialEnv(request({ purpose: 'alternateIdentity' }));
    expect(env.GITLAB_TOKEN).toBe('glpat-configured');
  });

  it('the overlay carries exactly the GITLAB_TOKEN key', () => {
    const provider = createGitLabTokenProvider(config());
    const env = provider.credentialEnv(request());
    expect(Object.keys(env)).toEqual([GITLAB_TOKEN_ENV_VAR]);
  });

  it('returns a fresh object on every call', () => {
    const provider = createGitLabTokenProvider(config());
    const first = provider.credentialEnv(request());
    const second = provider.credentialEnv(request());
    expect(first).not.toBe(second);
  });

  it('a blank token is refused at construction, naming the field', () => {
    expect(() => createGitLabTokenProvider(config({ token: '' }))).toThrow(/token/);
  });

  it('a whitespace-only token is refused at construction', () => {
    expect(() => createGitLabTokenProvider(config({ token: '   ' }))).toThrow(/token/);
  });
});
