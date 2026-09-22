/**
 * Packaging steps for issue #11's widened public surface — real tarball,
 * real consumer subprocess, never a source-file inspection. `Given the
 * library tarball is installed into a clean consumer project` and
 * `Then the subprocess exits {int}` are reused verbatim from
 * `packagedConsumer.steps.ts` (issue #9); the two multi-name data-table
 * steps here live alongside that file's two-name steps rather than bending
 * them, and the two single-name "driven" steps prove a re-export cannot
 * merely resolve while pointing at the wrong implementation.
 */
import { DataTable, Then, When } from '@cucumber/cucumber';
import * as assert from 'node:assert/strict';
import { DevPlatformWorld } from '../support/world.js';
import { runInConsumer, typeCheckInConsumer } from '../support/packagedConsumer.js';

/** Packing, building and installing the tarball is minutes-scale work on a cold cache. */
const PACKAGING_TIMEOUT_MS = 10 * 60 * 1000;

interface NameRow {
  name: string;
  from: string;
  kind: string;
}

function consumerReport(world: DevPlatformWorld): Record<string, unknown> {
  const stdout = world.subprocess?.stdout ?? '';
  const lastLine = stdout.trim().split('\n').at(-1) ?? '';
  try {
    return JSON.parse(lastLine) as Record<string, unknown>;
  } catch {
    throw new Error(`expected the consumer to print a JSON report, got: ${stdout || '(no output)'}`);
  }
}

function groupBySubpath(rows: readonly NameRow[]): Map<string, string[]> {
  const bySubpath = new Map<string, string[]>();
  for (const row of rows) {
    const names = bySubpath.get(row.from) ?? [];
    names.push(row.name);
    bySubpath.set(row.from, names);
  }
  return bySubpath;
}

// ---------------------------------------------------------------------------
// When — runtime resolution of every widened name, with its kind
// ---------------------------------------------------------------------------

When(
  'the consumer runs a module that dynamically imports the following names',
  { timeout: PACKAGING_TIMEOUT_MS },
  function (this: DevPlatformWorld, table: DataTable) {
    assert.ok(this.consumerDir, 'the consumer project was not installed');
    const rows = table.hashes() as unknown as NameRow[];
    this.expectedKindRows = rows.map(({ name, kind }) => ({ name, kind }));

    const lines: string[] = ['(async () => {', '  const report = {};'];
    for (const [subpath, names] of groupBySubpath(rows)) {
      lines.push(`  { const mod = await import(${JSON.stringify(subpath)});`);
      for (const name of names) {
        lines.push(`    report[${JSON.stringify(name)}] = typeof mod[${JSON.stringify(name)}];`);
      }
      lines.push('  }');
    }
    lines.push('  console.log(JSON.stringify(report));');
    lines.push('})().catch((error) => { console.error(error); process.exit(1); });');

    this.subprocess = runInConsumer(this.consumerDir, 'resolveAllNames.mjs', lines.join('\n'));
  },
);

Then('the consumer reports every imported name with its declared kind', function (this: DevPlatformWorld) {
  assert.ok(this.expectedKindRows, 'no expected name/kind table was declared for this scenario');
  const report = consumerReport(this);
  for (const { name, kind } of this.expectedKindRows) {
    assert.equal(report[name], kind, `expected "${name}" to report kind "${kind}", got ${JSON.stringify(report[name])}`);
  }
});

// ---------------------------------------------------------------------------
// When — .d.ts coverage of every widened name and type
// ---------------------------------------------------------------------------

When(
  'the consumer type-checks a module importing the following names',
  { timeout: PACKAGING_TIMEOUT_MS },
  function (this: DevPlatformWorld, table: DataTable) {
    assert.ok(this.consumerDir, 'the consumer project was not installed');
    const rows = table.hashes() as unknown as NameRow[];
    const valueRows = rows.filter((r) => r.kind !== 'type');
    const typeRows = rows.filter((r) => r.kind === 'type');

    const lines: string[] = [];
    for (const [subpath, names] of groupBySubpath(valueRows)) {
      lines.push(`import { ${names.join(', ')} } from ${JSON.stringify(subpath)};`);
    }
    for (const [subpath, names] of groupBySubpath(typeRows)) {
      lines.push(`import type { ${names.join(', ')} } from ${JSON.stringify(subpath)};`);
    }
    lines.push('');
    for (const { name } of valueRows) {
      lines.push(`export const _${name}: typeof ${name} = ${name};`);
    }
    for (const { name } of typeRows) {
      lines.push(`export type _${name} = ${name};`);
    }

    this.subprocess = typeCheckInConsumer(this.consumerDir, 'resolveAllTypes.ts', lines.join('\n'));
  },
);

// ---------------------------------------------------------------------------
// When — one name driven (not merely resolved) from each entry point
// ---------------------------------------------------------------------------

When(
  'the consumer runs a module that builds a GitHub token provider from {string} with the personal access token {string} and requests a credential for {string}',
  { timeout: PACKAGING_TIMEOUT_MS },
  function (this: DevPlatformWorld, providersSubpath: string, pat: string, repository: string) {
    assert.ok(this.consumerDir, 'the consumer project was not installed');
    const [owner, repo] = repository.split('/');
    const source = [
      `import { createGitHubTokenProvider } from '${providersSubpath}';`,
      '',
      'const provider = createGitHubTokenProvider({',
      `  pat: ${JSON.stringify(pat)},`,
      '  isAppConfigured: () => false,',
      "  mintInstallationToken: () => { throw new Error('no GitHub App configured in this scenario'); },",
      "  ghAuthToken: () => '',",
      '});',
      '',
      `const overlay = provider.credentialEnv({ owner: ${JSON.stringify(owner)}, repo: ${JSON.stringify(repo)}, purpose: 'default' });`,
      'console.log(JSON.stringify(overlay));',
    ].join('\n');
    this.subprocess = runInConsumer(this.consumerDir, 'tokenProviderFromTarball.mjs', source);
  },
);

Then('the consumer reports the credential environment sets {string} to {string}', function (this: DevPlatformWorld, variable: string, expected: string) {
  assert.equal(consumerReport(this)[variable], expected);
});

When(
  'the consumer runs a module that classifies the push failure {string} with the lease-rejection check from {string}',
  { timeout: PACKAGING_TIMEOUT_MS },
  function (this: DevPlatformWorld, stderrText: string, gitSubpath: string) {
    assert.ok(this.consumerDir, 'the consumer project was not installed');
    const source = [
      `import { isLeaseRejection } from '${gitSubpath}';`,
      '',
      `const verdict = isLeaseRejection({ stderr: ${JSON.stringify(stderrText)} });`,
      'console.log(JSON.stringify({ leaseRejection: verdict }));',
    ].join('\n');
    this.subprocess = runInConsumer(this.consumerDir, 'leaseRejectionFromTarball.mjs', source);
  },
);

Then('the consumer reports the failure is a lease rejection', function (this: DevPlatformWorld) {
  assert.equal(consumerReport(this)['leaseRejection'], true);
});
