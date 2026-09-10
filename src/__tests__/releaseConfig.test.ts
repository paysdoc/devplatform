/**
 * Configuration-contract test for `release.config.js`, mirroring
 * `packageExports.test.ts`'s style: asserts the shape of the manifest
 * itself rather than any build output. Confirms the dry-run mode switch
 * (`SEMANTIC_RELEASE_DRY_RUN=true`) drops both plugins that require a
 * credential, so the PR dry-run job can never accidentally publish.
 */
import { afterEach, describe, expect, it } from 'vitest';
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
