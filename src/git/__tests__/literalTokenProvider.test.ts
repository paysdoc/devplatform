import { describe, it, expect } from 'vitest';
import { createLiteralTokenProvider } from '../index.js';
import type { CredentialRequest } from '../types.js';

function request(overrides: Partial<CredentialRequest> = {}): CredentialRequest {
  return { owner: 'acme', repo: 'webapp', purpose: 'default', ...overrides };
}

describe('createLiteralTokenProvider', () => {
  it("'default' purpose returns the token", () => {
    const provider = createLiteralTokenProvider('token-x');
    expect(provider.credentialEnv(request()).GH_TOKEN).toBe('token-x');
  });

  it("'alternateIdentity' with a PAT returns the PAT", () => {
    const provider = createLiteralTokenProvider('token-x', 'pat-y');
    expect(provider.credentialEnv(request({ purpose: 'alternateIdentity' })).GH_TOKEN).toBe('pat-y');
  });

  it("'alternateIdentity' without a PAT degrades to the primary token", () => {
    const provider = createLiteralTokenProvider('token-x');
    expect(provider.credentialEnv(request({ purpose: 'alternateIdentity' })).GH_TOKEN).toBe('token-x');
  });

  it("'default' never returns the alternateIdentityPat", () => {
    const provider = createLiteralTokenProvider('token-x', 'pat-y');
    expect(provider.credentialEnv(request({ purpose: 'default' })).GH_TOKEN).toBe('token-x');
  });
});
