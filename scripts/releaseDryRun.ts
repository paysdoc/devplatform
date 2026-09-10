/**
 * Runs semantic-release in dry-run mode against a branch and prints the
 * computed next release version, so a PR that would never publish (or that
 * would recompute the hand-published 1.0.0 baseline) is caught before
 * merge. Dependency-free (Node built-ins only) so it runs on a bare CI
 * runner. Run via `bun run release:dry-run`.
 */
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function resolveBranch(): string {
  const envBranch = process.env.DRY_RUN_BRANCH;
  if (envBranch && envBranch.trim()) return envBranch.trim();

  const result = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
  });
  if (result.status !== 0 || !result.stdout.trim()) {
    fail(`could not resolve current branch: ${result.stderr}`);
  }
  return result.stdout.trim();
}

function main(): void {
  const branch = resolveBranch();
  console.log(`==> semantic-release --dry-run against branch "${branch}"`);

  const semanticReleaseBin = path.join(REPO_ROOT, 'node_modules', 'semantic-release', 'bin', 'semantic-release.js');
  const result = spawnSync(
    'node',
    [semanticReleaseBin, '--dry-run', '--no-ci', '--branches', branch],
    {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      env: { ...process.env, SEMANTIC_RELEASE_DRY_RUN: 'true' },
    },
  );

  const combinedOutput = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');

  if (result.status !== 0) {
    fail(`semantic-release --dry-run exited with status ${result.status}`);
  }

  const versionMatch = combinedOutput.match(/the next release version is (\d+\.\d+\.\d+)/i);
  if (!versionMatch) {
    console.log('==> no release would be triggered by this branch');
    process.exit(0);
  }

  const nextVersion = versionMatch[1];
  if (nextVersion === '1.0.0') {
    fail('computed next release version is 1.0.0 — the v1.0.0 baseline must never be recomputed. Verify the v1.0.0 tag is reachable.');
  }

  console.log(`==> next release version: ${nextVersion}`);
}

main();
