/**
 * A fixed-string TokenProvider — for tests and fixtures, never a production
 * credential source (production boundaries build a provider through
 * `createForgeCredentials`, `src/providers/forgeCredentials.ts`).
 *
 * Lives in the git core rather than an adapter: it carries no forge *logic* —
 * no resolution order, no App/PAT/CLI chain — only a literal echo, and the
 * core's own tests need it (six suites under `src/git/__tests__/` construct a
 * `GitContext` and need some `TokenProvider`). `src/providers/github/githubTokenProvider.ts`
 * re-exports this same function so no import outside `src/git/__tests__/` had
 * to move.
 *
 * The overlay key stays `GH_TOKEN` — a relocation, not a behaviour change:
 * every fixture in this repository and in ADW asserts that key. Per
 * `./types.js`'s `TokenProvider` docblock, a production provider keeps the
 * credential variable's *name* on the adapter side of the port; this fixture
 * is the one deliberate, documented exception, grandfathered in by the shape
 * every existing test already depends on.
 */
import type { CredentialRequest, TokenProvider } from './types.js';

/**
 * A TokenProvider that serves a fixed credential — `alternateIdentityPat`
 * (when given) for `'alternateIdentity'` requests, `token` otherwise.
 */
export function createLiteralTokenProvider(token: string, alternateIdentityPat?: string): TokenProvider {
  return {
    credentialEnv({ purpose }: CredentialRequest): NodeJS.ProcessEnv {
      return { GH_TOKEN: (purpose === 'alternateIdentity' && alternateIdentityPat) ? alternateIdentityPat : token };
    },
  };
}
