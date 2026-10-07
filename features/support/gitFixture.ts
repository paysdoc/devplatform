/**
 * Real throwaway git repositories for the `commitOps`/`branchOps` scenarios
 * (issue #11) — no network, no mocked git: a genuine local bare repository
 * plays the role of "remote" so the push-rejection scenario is a real
 * `--force-with-lease --force-if-includes` rejection, not a stubbed one.
 *
 * The runner takes an argv array and spawns it without a shell, as the library
 * does. It isolates the developer's own git configuration
 * (`GIT_CONFIG_GLOBAL`/`GIT_CONFIG_NOSYSTEM`) and throws execFileSync's own
 * error shape on failure — carrying `.stdout`/`.stderr` — which is exactly
 * what `isLeaseRejection` reads.
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export const ISOLATION_ENV = {
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
};

/** An `(argv, cwd) => string` runner matching `commitOps`/`branchOps`'s injected `Runner` shape. */
export function makeGitRunner(): (argv: readonly string[], cwd: string) => string {
  return ([file, ...args], cwd) =>
    execFileSync(file, args, {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...ISOLATION_ENV },
    }).trim();
}

/** Creates a throwaway repository on `branch` with one committed file, returning its directory. */
export function createThrowawayRepo(run: (argv: readonly string[], cwd: string) => string, branch: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devplatform-repo-'));
  run(['git', 'init', '-b', branch], dir);
  run(['git', 'config', 'user.name', 'Scenario Bot'], dir);
  run(['git', 'config', 'user.email', 'scenario-bot@example.com'], dir);
  run(['git', 'config', 'commit.gpgsign', 'false'], dir);
  fs.writeFileSync(path.join(dir, 'README.md'), '# throwaway scenario repository\n');
  run(['git', 'add', '-A'], dir);
  run(['git', 'commit', '-m', 'initial commit'], dir);
  return dir;
}

/** Configures a fresh throwaway clone's identity for commits made from it (the second-clone fixture in the push-rejection scenario). */
export function configureCloneIdentity(run: (argv: readonly string[], cwd: string) => string, dir: string): void {
  run(['git', 'config', 'user.name', 'Other Clone'], dir);
  run(['git', 'config', 'user.email', 'other-clone@example.com'], dir);
  run(['git', 'config', 'commit.gpgsign', 'false'], dir);
}
