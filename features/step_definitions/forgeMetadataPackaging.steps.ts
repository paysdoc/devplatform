/**
 * The three `@packaging` type-check steps for issue #16
 * (`feature-16.feature`): each generates a `.ts` consumer module and
 * type-checks it against the packed tarball's emitted declarations, reading
 * `tsc`'s exit code as the evidence (`Then the subprocess exits {int}`,
 * reused verbatim from `packagedConsumer.steps.ts`). No scenario inspects a
 * source file.
 */
import { DataTable, When } from '@cucumber/cucumber';
import * as assert from 'node:assert/strict';
import { DevPlatformWorld } from '../support/world.js';
import { typeCheckInConsumer } from '../support/packagedConsumer.js';

/** Packing, building and installing the tarball is minutes-scale work on a cold cache. */
const PACKAGING_TIMEOUT_MS = 10 * 60 * 1000;

When(
  'the consumer type-checks a module that reads these fields from {string} as required strings',
  { timeout: PACKAGING_TIMEOUT_MS },
  function (this: DevPlatformWorld, entryPoint: string, table: DataTable) {
    assert.ok(this.consumerDir, 'the consumer project was not installed');
    const rows = table.hashes() as { type: string; field: string }[];
    const types = [...new Set(rows.map((r) => r.type))];

    const lines: string[] = [`import type { ${types.join(', ')} } from ${JSON.stringify(entryPoint)};`, ''];
    for (const { type, field } of rows) {
      lines.push(`export function read_${type}_${field}(value: ${type}): string {`);
      lines.push(`  return value.${field};`);
      lines.push('}');
    }
    lines.push('');

    this.subprocess = typeCheckInConsumer(this.consumerDir, 'forgeMetadataRequiredStrings.ts', lines.join('\n'));
  },
);

When(
  'the consumer type-checks a module that reads the instance URL of a Jira API client from {string} as a read-only string',
  { timeout: PACKAGING_TIMEOUT_MS },
  function (this: DevPlatformWorld, entryPoint: string) {
    assert.ok(this.consumerDir, 'the consumer project was not installed');
    const lines = [
      `import { JiraApiClient } from ${JSON.stringify(entryPoint)};`,
      '',
      "const client = new JiraApiClient('https://acme.atlassian.net/', { pat: 'x' });",
      'export const url: string = client.instanceUrl;',
      '// @ts-expect-error instanceUrl is read-only',
      "client.instanceUrl = 'https://example.com';",
      '',
    ].join('\n');

    this.subprocess = typeCheckInConsumer(this.consumerDir, 'forgeMetadataJiraInstanceUrlReadOnly.ts', lines);
  },
);

When(
  'the consumer type-checks a module that constructs a Jira issue tracker from {string} with an API client and a project key, with and without a logger',
  { timeout: PACKAGING_TIMEOUT_MS },
  function (this: DevPlatformWorld, entryPoint: string) {
    assert.ok(this.consumerDir, 'the consumer project was not installed');
    const lines = [
      `import { JiraApiClient, JiraIssueTracker } from ${JSON.stringify(entryPoint)};`,
      '',
      "const client = new JiraApiClient('https://acme.atlassian.net/', { pat: 'x' });",
      "export const trackerWithoutLogger = new JiraIssueTracker(client, 'ADW');",
      "export const trackerWithLogger = new JiraIssueTracker(client, 'ADW', (message, level) => { void message; void level; });",
      '',
    ].join('\n');

    this.subprocess = typeCheckInConsumer(this.consumerDir, 'forgeMetadataJiraTrackerConstructor.ts', lines);
  },
);
