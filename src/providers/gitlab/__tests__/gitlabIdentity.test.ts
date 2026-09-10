import { describe, it, expect } from 'vitest';
import { resolveGitLabBootstrapGitIdentity, GITLAB_BOT_FALLBACK_IDENTITY } from '../gitlabIdentity.js';
import type { GitConfigIdentityDeps } from '../../../git/bootstrapIdentity.js';

describe('resolveGitLabBootstrapGitIdentity — resolution order', () => {
  it('environment wins when GIT_AUTHOR_*/GIT_COMMITTER_* are complete', () => {
    const identity = resolveGitLabBootstrapGitIdentity({
      env: { GIT_AUTHOR_NAME: 'Release Bot', GIT_AUTHOR_EMAIL: 'release-bot@example.com' },
    });
    expect(identity).toEqual({
      authorName: 'Release Bot',
      authorEmail: 'release-bot@example.com',
      committerName: 'Release Bot',
      committerEmail: 'release-bot@example.com',
    });
  });

  it('falls back to git config when the environment carries no identity', () => {
    const fakeExec = (cmd: string, _opts: unknown) => {
      if (cmd === 'git config user.name') return 'Local Dev\n';
      if (cmd === 'git config user.email') return 'local-dev@example.com\n';
      throw new Error(`Unexpected: ${cmd}`);
    };
    const identity = resolveGitLabBootstrapGitIdentity({
      env: {},
      exec: fakeExec as unknown as GitConfigIdentityDeps['exec'],
    });
    expect(identity.authorName).toBe('Local Dev');
    expect(identity.authorEmail).toBe('local-dev@example.com');
  });

  it('falls back to the built-in identity when neither environment nor git config resolve', () => {
    const identity = resolveGitLabBootstrapGitIdentity({
      env: {},
      exec: () => { throw new Error('git config is unavailable'); },
    });
    expect(identity).toEqual(GITLAB_BOT_FALLBACK_IDENTITY);
  });

  it('never returns an empty field', () => {
    const identity = resolveGitLabBootstrapGitIdentity({
      env: {},
      exec: () => { throw new Error('git config is unavailable'); },
    });
    for (const field of ['authorName', 'authorEmail', 'committerName', 'committerEmail'] as const) {
      expect(identity[field].trim()).not.toBe('');
    }
  });

  it('derives no bot identity from a GitHub App advertised in the environment', () => {
    const identity = resolveGitLabBootstrapGitIdentity({
      env: {
        GITHUB_APP_ID: '12345',
        GITHUB_APP_SLUG: 'adw-bot',
        GITHUB_APP_PRIVATE_KEY_PATH: '/path/to/key',
      },
      exec: () => { throw new Error('git config is unavailable'); },
    });
    expect(identity).toEqual(GITLAB_BOT_FALLBACK_IDENTITY);
    expect(identity.authorName).not.toContain('[bot]');
  });
});
