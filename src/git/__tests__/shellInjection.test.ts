import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { claimOps } from '../claimOps.js';
import { commitOps } from '../commitOps.js';
import { GitContext } from '../gitContext.js';
import { createLiteralTokenProvider } from '../literalTokenProvider.js';
import { killProcessesInDirectory } from '../processCleanup.js';
import type { ExecFn, GitContextOptions, TokenProvider } from '../types.js';

/** All six characters a shell would reinterpret: ' " ` $(...) \ and a newline. */
const HOSTILE = `it's "quoted" \`echo pwned\` $(echo pwned) back\\slash\nsecond line`;
const HOSTILE_PATH = `docs/it's "odd" $(echo pwned).md`;
const CWD = '/srv/adw/repos/acme/webapp/.worktrees/feature-issue-1-foo';

type Argv = readonly string[];

/** Records every argv it is handed. Answers a dirty tree for `git status`; `git check-ignore` exits non-zero (nothing ignored). */
function makeRecordingRunner(): { run: (argv: Argv, cwd: string) => string; calls: Argv[] } {
  const calls: Argv[] = [];
  const run = (argv: Argv): string => {
    calls.push(argv);
    if (argv[1] === 'status') return ' M tracked.txt\n';
    if (argv[1] === 'check-ignore') throw Object.assign(new Error('exit status 1'), { status: 1 });
    return '';
  };
  return { run, calls };
}

function baseOptions(overrides: Partial<GitContextOptions> = {}): GitContextOptions {
  return {
    owner: 'acme',
    repo: 'webapp',
    selfHost: false,
    tokenProvider: createLiteralTokenProvider('gh-token-abc'),
    gitIdentity: {
      authorName: 'ADW Bot',
      authorEmail: 'bot@adw.dev',
      committerName: 'ADW Bot',
      committerEmail: 'bot@adw.dev',
    },
    frameworkRepoRoot: '/srv/adw/framework',
    targetReposDir: '/srv/adw/repos',
    ...overrides,
  };
}

describe('hostile values reach the stand-in runner as exactly one argv element', () => {
  it('commitChanges passes -m and the message as separate elements, unescaped', () => {
    const { run, calls } = makeRecordingRunner();

    commitOps.commitChanges(run, HOSTILE, CWD);

    expect(calls).toEqual([
      ['git', 'status', '--porcelain'],
      ['git', 'add', '-A'],
      ['git', 'commit', '-m', HOSTILE],
    ]);
  });

  it('removeAndCommitPaths keeps the path and the message each in one element', () => {
    const { run, calls } = makeRecordingRunner();

    commitOps.removeAndCommitPaths(run, [HOSTILE_PATH], HOSTILE, CWD);

    expect(calls).toEqual([
      ['git', 'rm', '-f', '--ignore-unmatch', '--', HOSTILE_PATH],
      ['git', 'status', '--porcelain', '--', HOSTILE_PATH],
      ['git', 'commit', '-m', HOSTILE, '--', HOSTILE_PATH],
    ]);
  });

  it('addAndCommitPaths keeps the path and the message each in one element', () => {
    const { run, calls } = makeRecordingRunner();

    commitOps.addAndCommitPaths(run, [HOSTILE_PATH], HOSTILE, CWD);

    expect(calls).toEqual([
      ['git', 'add', '--', HOSTILE_PATH],
      ['git', 'status', '--porcelain', '--', HOSTILE_PATH],
      ['git', 'commit', '-m', HOSTILE, '--', HOSTILE_PATH],
    ]);
  });

  it('commitChanges probes check-ignore and excludes a hostile path as one element each', () => {
    const { run, calls } = makeRecordingRunner();

    commitOps.commitChanges(run, 'm', CWD, { excludePaths: [HOSTILE_PATH] });

    expect(calls).toEqual([
      ['git', 'check-ignore', HOSTILE_PATH],
      ['git', 'status', '--porcelain', '--', '.', `:(exclude)${HOSTILE_PATH}`],
      ['git', 'add', '-A', '--', '.', `:(exclude)${HOSTILE_PATH}`],
      ['git', 'commit', '-m', 'm'],
    ]);
  });

  it('commitAllowEmpty passes -m and the message as separate elements, unescaped', () => {
    const { run, calls } = makeRecordingRunner();

    claimOps.commitAllowEmpty(run, HOSTILE, CWD);

    expect(calls).toEqual([['git', 'commit', '--allow-empty', '-m', HOSTILE]]);
  });
});

describe('GitContext hands the argv to its executor unchanged', () => {
  it('commitChanges reaches the injected ExecFn as the exact git commit argv', () => {
    const argvs: Argv[] = [];
    const exec: ExecFn = (argv) => {
      argvs.push(argv);
      return argv[1] === 'status' ? ' M tracked.txt\n' : '';
    };
    const ctx = new GitContext(baseOptions(), { exec });

    ctx.commitChanges(HOSTILE, `${CWD}/worktree`);

    expect(argvs.at(-1)).toEqual(['git', 'commit', '-m', HOSTILE]);
  });
});

describe('GitContext spawns without a shell', () => {
  const cleanup: string[] = [];

  afterEach(() => {
    for (const dir of cleanup.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });

  /** Isolates the developer's own git configuration (gpgsign, hooks, templates) from the spawned git. */
  const ISOLATION_ENV = { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };

  function isolatedTokenProvider(): TokenProvider {
    return { credentialEnv: () => ({ GH_TOKEN: 'unused', ...ISOLATION_ENV }) };
  }

  function makeTempDir(prefix: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    cleanup.push(dir);
    return dir;
  }

  it('commits a message carrying backticks and a command substitution verbatim, running nothing', () => {
    const repo = makeTempDir('devplatform-shell-injection-');
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo, env: { ...process.env, ...ISOLATION_ENV } });
    fs.writeFileSync(path.join(repo, 'notes.txt'), 'scenario content\n');
    const message =
      'Fix `touch pwned-backtick` and $(touch pwned-subst) in deckerly\'s "brand" \\ colours\nsecond line';
    const ctx = new GitContext(
      baseOptions({ selfHost: true, frameworkRepoRoot: repo, tokenProvider: isolatedTokenProvider() }),
    );

    const committed = ctx.commitChanges(message, repo);

    expect(committed).toBe(true);
    expect(fs.existsSync(path.join(repo, 'pwned-backtick'))).toBe(false);
    expect(fs.existsSync(path.join(repo, 'pwned-subst'))).toBe(false);
    const recorded = execFileSync('git', ['log', '-1', '--format=%B'], {
      cwd: repo,
      encoding: 'utf-8',
      env: { ...process.env, ...ISOLATION_ENV },
    }).trimEnd();
    expect(recorded).toBe(message);
  });

  it('round-trips a hostile argument through the default executor unchanged', () => {
    const dir = makeTempDir('devplatform-shell-argv-');
    const ctx = new GitContext(baseOptions({ selfHost: true, frameworkRepoRoot: dir }));

    const echoed = ctx.exec(['printf', '%s', HOSTILE], { cwd: { kind: 'workspace' }, env: {} });

    expect(echoed).toBe(HOSTILE);
  });

  it('keeps separate argv elements separate through the default executor', () => {
    const dir = makeTempDir('devplatform-shell-argv-');
    const ctx = new GitContext(baseOptions({ selfHost: true, frameworkRepoRoot: dir }));

    const echoed = ctx.exec(['printf', '%s|%s', 'a b', "c'd"], { cwd: { kind: 'workspace' }, env: {} });

    expect(echoed).toBe("a b|c'd");
  });

  it('hands a directory name carrying a command substitution to lsof as one argument, running nothing', () => {
    const dir = makeTempDir('devplatform-shell-lsof-');
    const marker = path.join(dir, 'pwned');
    const hostileDir = path.join(dir, `it's $(touch ${marker}) \`touch ${marker}\``);
    fs.mkdirSync(hostileDir, { recursive: true });

    killProcessesInDirectory(hostileDir);

    expect(fs.existsSync(marker)).toBe(false);
  });
});
