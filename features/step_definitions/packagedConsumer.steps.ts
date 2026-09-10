/**
 * Steps for the published-package scenarios (issue #9).
 *
 * These assert the packaging *outcome*, never the source tree: a real tarball is
 * built and installed into a clean project, then a consumer module is run and
 * type-checked against it. The observable evidence is the subprocess exit code
 * and what the consumer prints — not the presence of a name in a file.
 */
import { Given, Then, When } from '@cucumber/cucumber';
import * as assert from 'node:assert/strict';
import { DevPlatformWorld } from '../support/world.js';
import { installedConsumer, runInConsumer, typeCheckInConsumer } from '../support/packagedConsumer.js';

/** Packing, building and installing the tarball is minutes-scale work on a cold cache. */
const PACKAGING_TIMEOUT_MS = 10 * 60 * 1000;

function consumerReport(world: DevPlatformWorld): Record<string, unknown> {
  const stdout = world.subprocess?.stdout ?? '';
  const lastLine = stdout.trim().split('\n').at(-1) ?? '';
  try {
    return JSON.parse(lastLine) as Record<string, unknown>;
  } catch {
    throw new Error(`expected the consumer to print a JSON report, got: ${stdout || '(no output)'}`);
  }
}

Given('the library tarball is installed into a clean consumer project', { timeout: PACKAGING_TIMEOUT_MS }, async function (this: DevPlatformWorld) {
  this.consumerDir = await installedConsumer();
});

When(
  'the consumer runs a module importing {string} from {string} and {string} from {string}',
  { timeout: PACKAGING_TIMEOUT_MS },
  function (this: DevPlatformWorld, factoryName: string, providersSubpath: string, literalName: string, gitSubpath: string) {
    assert.ok(this.consumerDir, 'the consumer project was not installed');
    this.subprocess = runInConsumer(this.consumerDir, 'resolveNames.mjs', [
      `import { ${factoryName} } from '${providersSubpath}';`,
      `import { ${literalName} } from '${gitSubpath}';`,
      '',
      `const provider = ${literalName}('fixed-token');`,
      "const overlay = provider.credentialEnv({ owner: 'paysdoc', repo: 'devplatform', purpose: 'default' });",
      '',
      'console.log(JSON.stringify({',
      `  factory: typeof ${factoryName},`,
      `  literal: typeof ${literalName},`,
      '  credential: Object.values(overlay)[0] ?? null,',
      '}));',
      '',
    ].join('\n'));
  },
);

When(
  'the consumer type-checks a module importing {string} from {string} and {string} from {string}',
  { timeout: PACKAGING_TIMEOUT_MS },
  function (this: DevPlatformWorld, factoryName: string, providersSubpath: string, literalName: string, gitSubpath: string) {
    assert.ok(this.consumerDir, 'the consumer project was not installed');
    this.subprocess = typeCheckInConsumer(this.consumerDir, 'resolveTypes.ts', [
      `import { ${factoryName} } from '${providersSubpath}';`,
      `import { ${literalName} } from '${gitSubpath}';`,
      '',
      `export const factory: typeof ${factoryName} = ${factoryName};`,
      `export const literal: typeof ${literalName} = ${literalName};`,
      '',
    ].join('\n'));
  },
);

Then('the subprocess exits {int}', function (this: DevPlatformWorld, expected: number) {
  assert.ok(this.subprocess, 'no subprocess was run');
  assert.equal(
    this.subprocess.status,
    expected,
    `expected exit ${expected}, got ${this.subprocess.status}\nstdout:\n${this.subprocess.stdout}\nstderr:\n${this.subprocess.stderr}`,
  );
});

Then('the consumer reports both imported names are callable', function (this: DevPlatformWorld) {
  const report = consumerReport(this);
  assert.equal(report['factory'], 'function');
  assert.equal(report['literal'], 'function');
});

Then('the consumer reports the literal credential value {string}', function (this: DevPlatformWorld, expected: string) {
  assert.equal(consumerReport(this)['credential'], expected);
});
