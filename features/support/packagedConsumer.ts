/**
 * Packed-tarball consumer fixture.
 *
 * Builds and packs the library exactly as `npm publish` would (`npm pack` runs
 * the `prepack` build), installs the resulting tarball into a throwaway project
 * with no other dependencies, and hands scenarios a directory they can run or
 * type-check a consumer module in. The install happens once per cucumber
 * process and is shared by every `@packaging` scenario.
 */
import { execSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export interface SubprocessResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

let consumerDirPromise: Promise<string> | undefined;

/**
 * The environment child processes get. `NODE_OPTIONS` is dropped because the
 * suite itself runs under `--import tsx`, and the consumer project — a clean
 * install of nothing but the tarball — cannot resolve `tsx`.
 */
function childEnv(): NodeJS.ProcessEnv {
  const { NODE_OPTIONS: _dropped, ...rest } = process.env;
  return rest;
}

function run(command: string, cwd: string): string {
  return execSync(command, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], env: childEnv() });
}

async function packAndInstall(): Promise<string> {
  const packDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devplatform-pack-'));
  const consumerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devplatform-consumer-'));

  const packed = JSON.parse(run(`npm pack --pack-destination "${packDir}" --json`, REPO_ROOT)) as Array<{ filename: string }>;
  const tarballName = packed[0]?.filename;
  if (!tarballName) throw new Error('npm pack did not report a tarball filename');

  fs.writeFileSync(
    path.join(consumerDir, 'package.json'),
    `${JSON.stringify({ name: 'devplatform-scenario-consumer', version: '0.0.0', private: true, type: 'module' }, null, 2)}\n`,
  );
  run(`npm install "${path.join(packDir, tarballName)}"`, consumerDir);

  return consumerDir;
}

/** The consumer project with the real tarball installed. Packed once, reused by every packaging scenario. */
export function installedConsumer(): Promise<string> {
  consumerDirPromise ??= packAndInstall();
  return consumerDirPromise;
}

/** Runs an ESM module in the consumer project under Node, capturing its exit code and streams. */
export function runInConsumer(consumerDir: string, fileName: string, source: string): SubprocessResult {
  fs.writeFileSync(path.join(consumerDir, fileName), source);
  const result = spawnSync(process.execPath, [fileName], { cwd: consumerDir, encoding: 'utf-8', env: childEnv() });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/**
 * Type-checks a TypeScript module in the consumer project against the tarball's
 * emitted declarations, using the repository's own `tsc` under NodeNext
 * resolution — the same resolution a real consumer gets.
 */
export function typeCheckInConsumer(consumerDir: string, fileName: string, source: string): SubprocessResult {
  fs.writeFileSync(path.join(consumerDir, fileName), source);
  fs.writeFileSync(
    path.join(consumerDir, 'tsconfig.json'),
    `${JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        types: ['node'],
        typeRoots: [path.join(REPO_ROOT, 'node_modules', '@types')],
      },
      include: [fileName],
    }, null, 2)}\n`,
  );

  const tsc = path.join(REPO_ROOT, 'node_modules', 'typescript', 'lib', 'tsc.js');
  const result = spawnSync(process.execPath, [tsc, '-p', 'tsconfig.json'], { cwd: consumerDir, encoding: 'utf-8', env: childEnv() });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}
