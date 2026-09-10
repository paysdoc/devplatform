/**
 * Configuration-contract test for `release.config.js`, mirroring
 * `packageExports.test.ts`'s style: asserts the shape of the manifest
 * itself rather than any build output. Confirms the dry-run mode switch
 * (`SEMANTIC_RELEASE_DRY_RUN=true`) drops both plugins that require a
 * credential, so the PR dry-run job can never accidentally publish. The
 * notes-generator block exists because the `conventionalcommits` preset
 * major must match the writer major bundled by the stable
 * `@semantic-release/release-notes-generator` (preset 10.x needs writer 9;
 * the stable plugin ships writer 8), and only rendering real notes catches
 * that drift.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { generateNotes } from '@semantic-release/release-notes-generator';
import releaseConfig from '../../release.config.js';

interface PluginEntry {
  0: string;
  1?: unknown;
}

function pluginNames(plugins: unknown[]): string[] {
  return (plugins as PluginEntry[]).map((entry) => entry[0]);
}

describe('release.config.js — configuration contract', () => {
  it('branches is exactly ["main"]', () => {
    expect(releaseConfig.branches).toEqual(['main']);
  });

  it('tagFormat is "v${version}"', () => {
    expect(releaseConfig.tagFormat).toBe('v${version}');
  });

  it('normal mode plugin list is commit-analyzer, notes-generator, npm, github in order', () => {
    expect(pluginNames(releaseConfig.plugins)).toEqual([
      '@semantic-release/commit-analyzer',
      '@semantic-release/release-notes-generator',
      '@semantic-release/npm',
      '@semantic-release/github',
    ]);
  });

  it('the analyzer and the notes generator receive the same parserOpts object identity', () => {
    const [, analyzerConfig] = releaseConfig.plugins[0] as [string, { parserOpts: unknown }];
    const [, notesConfig] = releaseConfig.plugins[1] as [string, { parserOpts: unknown }];
    expect(analyzerConfig.parserOpts).toBe(notesConfig.parserOpts);
  });

  it('parserOpts.headerCorrespondence is exactly ["type", "scope", "subject"]', () => {
    const [, analyzerConfig] = releaseConfig.plugins[0] as [string, { parserOpts: { headerCorrespondence: string[] } }];
    expect(analyzerConfig.parserOpts.headerCorrespondence).toEqual(['type', 'scope', 'subject']);
  });
});

describe('release.config.js — dry-run mode', () => {
  const originalEnv = process.env.SEMANTIC_RELEASE_DRY_RUN;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.SEMANTIC_RELEASE_DRY_RUN;
    } else {
      process.env.SEMANTIC_RELEASE_DRY_RUN = originalEnv;
    }
  });

  it('drops the npm and github plugins, keeping only analyzer and notes-generator', async () => {
    process.env.SEMANTIC_RELEASE_DRY_RUN = 'true';
    const dryRunModulePath: string = '../../release.config.js?dryrun';
    const dryRunConfig = (await import(dryRunModulePath)).default;

    expect(pluginNames(dryRunConfig.plugins)).toEqual([
      '@semantic-release/commit-analyzer',
      '@semantic-release/release-notes-generator',
    ]);
  });
});

describe('release.config.js — release notes render under the shipped preset', () => {
  const [, notesConfig] = releaseConfig.plugins[1] as [string, { preset: string; parserOpts: Record<string, unknown> }];
  const noopLogger = { log() {}, error() {} };

  async function render(headers: string[]): Promise<string> {
    return generateNotes(notesConfig, {
      commits: headers.map((message, index) => ({ hash: String(index).repeat(40), message })),
      logger: noopLogger,
      cwd: process.cwd(),
      env: {},
      options: { repositoryUrl: 'https://github.com/paysdoc/devplatform.git' },
      lastRelease: { version: '1.0.0', gitTag: 'v1.0.0', gitHead: '0'.repeat(40) },
      nextRelease: { version: '1.1.0', gitTag: 'v1.1.0', gitHead: '1'.repeat(40), type: 'minor' },
    });
  }

  it('generateNotes renders agent-prefixed feat/fix commits under Features and Bug Fixes', async () => {
    const notes = await render([
      'build-agent: feat: add forgeProviders assembly',
      'review-patch-agent: fix: correct token resolution',
      'feat: add worktree probe',
    ]);

    expect(notes).toContain('### Features');
    expect(notes).toContain('* add forgeProviders assembly');
    expect(notes).toContain('* add worktree probe');
    expect(notes).toContain('### Bug Fixes');
    expect(notes).toContain('* correct token resolution');
  });

  it('strips the agent prefix from rendered subjects and omits non-releasing chore commits', async () => {
    const notes = await render([
      'build-agent: feat: add forgeProviders assembly',
      'plan-orchestrator: chore: expand README',
    ]);

    expect(notes).not.toContain('build-agent:');
    expect(notes).not.toContain('plan-orchestrator:');
    expect(notes).not.toContain('expand README');
  });
});
