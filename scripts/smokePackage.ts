/**
 * Builds the package, verifies the packed tarball ships no `src/`, then
 * installs the real tarball into a clean temp consumer and resolves all
 * three public subpaths under both Node and Bun. Dependency-free (Node
 * built-ins only) so it runs on a bare CI runner. Run via `bun run smoke:package`.
 */
import { execFileSync, execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

interface PackEntry {
  filename: string;
  files: Array<{ path: string }>;
}

function run(cmd: string, cwd: string = REPO_ROOT): string {
  return execSync(cmd, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function assertFileExists(absPath: string, label: string): void {
  if (!fs.existsSync(absPath)) fail(`expected ${label} to exist`);
}

/** Every public name the packed tarball must resolve, keyed by entry-point subpath. Widening a barrel is a one-line change here (issue #11). */
const EXPECTED_EXPORTS: Readonly<Record<string, readonly string[]>> = {
  '@paysdoc/devplatform': ['BoardStatus'],
  '@paysdoc/devplatform/providers': [
    'forgeProviders',
    'createForgeCredentials',
    'createGitHubTokenProvider',
    'resolveBootstrapGitIdentity',
    'resolveContextToken',
    'ghAuthToken',
    'isGitHubAppConfigured',
    'getInstallationToken',
    'createGhRepoApi',
  ],
  '@paysdoc/devplatform/git': [
    'GitContext',
    'createLiteralTokenProvider',
    'commitOps',
    'branchOps',
    'isLeaseRejection',
  ],
};

/**
 * Builds a dependency-free ESM script that dynamically imports every subpath
 * in `table` and verifies every listed key resolves to a defined value,
 * printing `OK` or exiting 1 naming each `subpath.key` miss. Types cannot be
 * checked at runtime — that is what the `@packaging` type-check scenario is
 * for. Runnable under both `node --input-type=module -e` and `bun -e`; wrapped
 * in an async IIFE with an explicit `process.exit(1)` on rejection since a
 * bare top-level throw's exit behaviour differs subtly between the two.
 */
function buildDynamicImportKeyCheck(table: Readonly<Record<string, readonly string[]>>): string {
  return [
    '(async () => {',
    `  const expected = ${JSON.stringify(table)};`,
    '  const missing = [];',
    '  for (const [subpath, names] of Object.entries(expected)) {',
    '    const mod = await import(subpath);',
    '    for (const name of names) {',
    '      if (mod[name] === undefined) missing.push(`${subpath}.${name}`);',
    '    }',
    '  }',
    '  if (missing.length > 0) {',
    "    console.error('MISSING', missing);",
    '    process.exit(1);',
    '  }',
    "  console.log('OK');",
    '})().catch((error) => {',
    '  console.error(error);',
    '  process.exit(1);',
    '});',
  ].join('\n');
}

function main(): void {
  console.log('==> bun run build');
  run('bun run build');

  console.log('==> asserting dist/ entry points and declarations exist');
  for (const relPath of [
    'dist/index.js',
    'dist/index.d.ts',
    'dist/providers/index.js',
    'dist/providers/index.d.ts',
    'dist/git/index.js',
    'dist/git/index.d.ts',
  ]) {
    assertFileExists(path.join(REPO_ROOT, relPath), relPath);
  }

  console.log('==> npm pack --dry-run --json');
  const dryRun = JSON.parse(run('npm pack --dry-run --json')) as PackEntry[];
  const packedPaths = dryRun[0]?.files.map((f) => f.path) ?? [];
  const srcOffenders = packedPaths.filter((p) => p.startsWith('src/'));
  if (srcOffenders.length > 0) fail(`tarball would include src/ files: ${srcOffenders.join(', ')}`);
  if (!packedPaths.includes('README.md')) fail('tarball is missing README.md');
  if (!packedPaths.includes('LICENSE')) fail('tarball is missing LICENSE');

  const packDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devplatform-pack-'));
  const consumerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devplatform-consumer-'));

  try {
    console.log('==> npm pack --pack-destination <tmpdir>');
    const packed = JSON.parse(run(`npm pack --pack-destination "${packDir}" --json`)) as PackEntry[];
    const tarballName = packed[0]?.filename;
    if (!tarballName) fail('npm pack did not report a tarball filename');
    const tarballPath = path.join(packDir, tarballName);
    assertFileExists(tarballPath, tarballPath);

    console.log(`==> installing tarball into fresh consumer at ${consumerDir}`);
    fs.writeFileSync(
      path.join(consumerDir, 'package.json'),
      JSON.stringify({ name: 'devplatform-smoke-consumer', version: '0.0.0', private: true, type: 'module' }, null, 2),
    );
    run(`npm install "${tarballPath}"`, consumerDir);

    const importCheck = buildDynamicImportKeyCheck(EXPECTED_EXPORTS);

    console.log('==> node consumer (node --input-type=module -e ...)');
    const nodeOut = execFileSync('node', ['--input-type=module', '-e', importCheck], { cwd: consumerDir, encoding: 'utf-8' });
    if (!nodeOut.includes('OK')) fail(`node consumer did not print OK: ${nodeOut}`);

    console.log('==> bun consumer (bun -e ...)');
    const bunOut = execFileSync('bun', ['-e', importCheck], { cwd: consumerDir, encoding: 'utf-8' });
    if (!bunOut.includes('OK')) fail(`bun consumer did not print OK: ${bunOut}`);

    console.log('OK: build, pack, and Node + Bun consumer smoke checks all passed');
  } finally {
    fs.rmSync(consumerDir, { recursive: true, force: true });
    fs.rmSync(packDir, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
