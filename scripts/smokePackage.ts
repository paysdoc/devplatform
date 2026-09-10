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

    const importCheck = [
      "import * as root from '@paysdoc/devplatform';",
      "import * as providers from '@paysdoc/devplatform/providers';",
      "import * as git from '@paysdoc/devplatform/git';",
      "if (typeof root.BoardStatus === 'undefined') throw new Error('root entry missing BoardStatus');",
      "if (typeof providers.forgeProviders !== 'function') throw new Error('providers entry missing forgeProviders');",
      "if (typeof git.GitContext !== 'function') throw new Error('git entry missing GitContext');",
      "console.log('OK');",
    ].join('\n');

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
