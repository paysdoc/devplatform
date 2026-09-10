/**
 * Asserts the agent-prefix-aware commit header pattern in `release.config.js`
 * matches both ADW agent-prefixed commits (`build-agent: feat: …`) and plain
 * conventional commits (`feat: …`), and that the pattern actually drives the
 * real `@semantic-release/commit-analyzer` to the release types the issue
 * specifies. Imports the shipped `parserOpts` object directly — never a copy
 * — so a change to `release.config.js` cannot silently diverge from what
 * these tests assert.
 */
import { describe, expect, it } from 'vitest';
import { analyzeCommits } from '@semantic-release/commit-analyzer';
import releaseConfig from '../../release.config.js';

interface AnalyzerPluginConfig {
  preset: string;
  parserOpts: {
    headerPattern: RegExp;
    breakingHeaderPattern: RegExp;
    headerCorrespondence: string[];
  };
}

const [, analyzerEntry] = releaseConfig.plugins[0] as [string, AnalyzerPluginConfig];
const { parserOpts } = analyzerEntry;

const noopLogger = { log() {}, error() {} };

interface CommitFixture {
  header: string;
  body?: string;
}

function toCommit({ header, body }: CommitFixture): { hash: string; message: string } {
  return { hash: '0'.repeat(40), message: body ? `${header}\n\n${body}` : header };
}

async function analyze(fixtures: CommitFixture[]): Promise<string | null> {
  return analyzeCommits(
    { preset: 'conventionalcommits', parserOpts },
    { commits: fixtures.map(toCommit), logger: noopLogger, cwd: process.cwd(), env: {}, options: {} },
  );
}

describe('release.config.js — headerPattern', () => {
  it.each([
    ['build-agent: feat: add forgeProviders assembly', 'feat'],
    ['review-patch-agent: fix: correct token resolution', 'fix'],
    ['plan-orchestrator: chore: expand README', 'chore'],
    ['document-agent: docs: document package build', 'docs'],
    ['feat: add worktree probe', 'feat'],
    ['fix: handle ENOENT', 'fix'],
    ['chore: bump deps', 'chore'],
    ['feat: fix: colon in the subject', 'feat'],
  ])('%s -> type %s', (header, expectedType) => {
    const match = header.match(parserOpts.headerPattern);
    expect(match, `expected "${header}" to match headerPattern`).not.toBeNull();
    expect(match?.[1]).toBe(expectedType);
  });

  it('captures an agent-prefixed scoped subject', () => {
    const match = 'build-agent: feat(git): scoped subject'.match(parserOpts.headerPattern);
    expect(match).not.toBeNull();
    expect(match?.[1]).toBe('feat');
    expect(match?.[2]).toBe('git');
    expect(match?.[3]).toBe('scoped subject');
  });

  it('does not match a merge commit header', () => {
    expect('Merge pull request #6 from paysdoc/branch'.match(parserOpts.headerPattern)).toBeNull();
  });
});

describe('release.config.js — breakingHeaderPattern', () => {
  it('matches an agent-prefixed breaking header', () => {
    expect('build-agent: feat!: drop legacy layer'.match(parserOpts.breakingHeaderPattern)).not.toBeNull();
  });

  it('matches a plain scoped breaking header', () => {
    expect('feat(git)!: rename export'.match(parserOpts.breakingHeaderPattern)).not.toBeNull();
  });

  it('does not match a non-breaking agent-prefixed header', () => {
    expect('build-agent: feat: normal'.match(parserOpts.breakingHeaderPattern)).toBeNull();
  });
});

describe('release.config.js — analyzeCommits release types', () => {
  it('build-agent: feat: … -> minor', async () => {
    expect(await analyze([{ header: 'build-agent: feat: add forgeProviders assembly' }])).toBe('minor');
  });

  it('review-patch-agent: fix: … -> patch', async () => {
    expect(await analyze([{ header: 'review-patch-agent: fix: correct token resolution' }])).toBe('patch');
  });

  it('plan-orchestrator: chore: … -> null', async () => {
    expect(await analyze([{ header: 'plan-orchestrator: chore: expand README' }])).toBeNull();
  });

  it('document-agent: docs: … -> null', async () => {
    expect(await analyze([{ header: 'document-agent: docs: document package build' }])).toBeNull();
  });

  it('plain feat: … -> minor', async () => {
    expect(await analyze([{ header: 'feat: add worktree probe' }])).toBe('minor');
  });

  it('plain fix: … -> patch', async () => {
    expect(await analyze([{ header: 'fix: handle ENOENT' }])).toBe('patch');
  });

  it('plain chore: … -> null', async () => {
    expect(await analyze([{ header: 'chore: bump deps' }])).toBeNull();
  });

  it('build-agent: feat!: … -> major', async () => {
    expect(await analyze([{ header: 'build-agent: feat!: drop legacy layer' }])).toBe('major');
  });

  it('a BREAKING CHANGE footer under an agent-prefixed header -> major', async () => {
    expect(
      await analyze([
        {
          header: 'build-agent: feat: add forgeProviders assembly',
          body: 'BREAKING CHANGE: assembly signature changed',
        },
      ]),
    ).toBe('major');
  });

  it('a mixed set of all release types -> major (highest wins)', async () => {
    expect(
      await analyze([
        { header: 'build-agent: feat: add forgeProviders assembly' },
        { header: 'review-patch-agent: fix: correct token resolution' },
        { header: 'plan-orchestrator: chore: expand README' },
        { header: 'document-agent: docs: document package build' },
        { header: 'build-agent: feat!: drop legacy layer' },
      ]),
    ).toBe('major');
  });

  it('an ADW-only housekeeping batch (chore + docs) -> null, i.e. no publish', async () => {
    expect(
      await analyze([
        { header: 'plan-orchestrator: chore: expand README' },
        { header: 'document-agent: docs: document package build' },
      ]),
    ).toBeNull();
  });
});
