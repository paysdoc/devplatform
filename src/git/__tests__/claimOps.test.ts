import { describe, it, expect } from 'vitest';
import { claimOps } from '../claimOps.js';

interface RunnerCall {
  argv: readonly string[];
  cwd: string;
}

function makeRunner(
  stdout = '',
): { run: (argv: readonly string[], cwd: string) => string; calls: RunnerCall[] } {
  const calls: RunnerCall[] = [];
  const run = (argv: readonly string[], cwd: string): string => {
    calls.push({ argv, cwd });
    return stdout;
  };
  return { run, calls };
}

function makeThrowingRunner(): (argv: readonly string[], cwd: string) => string {
  return () => { throw new Error('runner failed'); };
}

const BASE_CWD = '/srv/adw/repos/acme/webapp';
const TMPDIR = '/tmp/adw-claim-abc123';

/** A double quote, a backtick, `$(...)` and a backslash: each is special to a shell inside a double-quoted string. */
const HOSTILE_MESSAGE = 'say "hello" `echo pwned` $(echo pwned) back\\slash';

// ── addDetachedWorktree ──────────────────────────────────────────────────────

describe('addDetachedWorktree', () => {
  it('issues git worktree add --detach with the path and ref as separate arguments', () => {
    const { run, calls } = makeRunner();
    claimOps.addDetachedWorktree(run, TMPDIR, 'origin/main', BASE_CWD);
    expect(calls[0].argv).toEqual(['git', 'worktree', 'add', '--detach', TMPDIR, 'origin/main']);
    expect(calls[0].cwd).toBe(BASE_CWD);
  });

  it('passes the correct cwd', () => {
    const { run, calls } = makeRunner();
    claimOps.addDetachedWorktree(run, TMPDIR, 'origin/dev', '/other/path');
    expect(calls[0].cwd).toBe('/other/path');
  });

  it('propagates runner errors', () => {
    expect(() =>
      claimOps.addDetachedWorktree(makeThrowingRunner(), TMPDIR, 'origin/main', BASE_CWD),
    ).toThrow('runner failed');
  });
});

// ── commitAllowEmpty ─────────────────────────────────────────────────────────

describe('commitAllowEmpty', () => {
  it('issues git commit --allow-empty -m with the given message', () => {
    const { run, calls } = makeRunner();
    claimOps.commitAllowEmpty(run, 'ADW upgrade in progress: abc123 [nonce1]', TMPDIR);
    expect(calls[0].argv).toEqual([
      'git', 'commit', '--allow-empty', '-m', 'ADW upgrade in progress: abc123 [nonce1]',
    ]);
    expect(calls[0].cwd).toBe(TMPDIR);
  });

  it('includes --allow-empty in the command', () => {
    const { run, calls } = makeRunner();
    claimOps.commitAllowEmpty(run, 'msg', TMPDIR);
    expect(calls[0].argv).toContain('--allow-empty');
  });

  it('passes the message verbatim as the single element after -m', () => {
    const { run, calls } = makeRunner();
    claimOps.commitAllowEmpty(run, HOSTILE_MESSAGE, TMPDIR);
    expect(calls[0].argv).toEqual(['git', 'commit', '--allow-empty', '-m', HOSTILE_MESSAGE]);
  });

  it('passes the correct cwd', () => {
    const { run, calls } = makeRunner();
    claimOps.commitAllowEmpty(run, 'msg', '/other/tmpdir');
    expect(calls[0].cwd).toBe('/other/tmpdir');
  });

  it('propagates runner errors', () => {
    expect(() =>
      claimOps.commitAllowEmpty(makeThrowingRunner(), 'msg', TMPDIR),
    ).toThrow('runner failed');
  });
});

// ── pushHeadToBranch ─────────────────────────────────────────────────────────

describe('pushHeadToBranch', () => {
  it('issues git push origin HEAD:refs/heads/<branch>', () => {
    const { run, calls } = makeRunner();
    claimOps.pushHeadToBranch(run, 'adw-upgrade-deadbeef', TMPDIR);
    expect(calls[0].argv).toEqual(['git', 'push', 'origin', 'HEAD:refs/heads/adw-upgrade-deadbeef']);
    expect(calls[0].cwd).toBe(TMPDIR);
  });

  it('does NOT contain --force (lock-correctness guard)', () => {
    const { run, calls } = makeRunner();
    claimOps.pushHeadToBranch(run, 'adw-upgrade-deadbeef', TMPDIR);
    expect(calls[0].argv.join(' ')).not.toContain('--force');
  });

  it('does NOT contain --force-with-lease (lock-correctness guard)', () => {
    const { run, calls } = makeRunner();
    claimOps.pushHeadToBranch(run, 'adw-upgrade-deadbeef', TMPDIR);
    expect(calls[0].argv.join(' ')).not.toContain('--force-with-lease');
  });

  it('passes the correct cwd', () => {
    const { run, calls } = makeRunner();
    claimOps.pushHeadToBranch(run, 'adw-upgrade-deadbeef', '/other/tmpdir');
    expect(calls[0].cwd).toBe('/other/tmpdir');
  });

  it('propagates runner errors', () => {
    expect(() =>
      claimOps.pushHeadToBranch(makeThrowingRunner(), 'adw-upgrade-deadbeef', TMPDIR),
    ).toThrow('runner failed');
  });
});

// ── removeDetachedWorktree ───────────────────────────────────────────────────

describe('removeDetachedWorktree', () => {
  it('issues git worktree remove --force with the given path', () => {
    const { run, calls } = makeRunner();
    claimOps.removeDetachedWorktree(run, TMPDIR, BASE_CWD);
    expect(calls[0].argv).toEqual(['git', 'worktree', 'remove', '--force', TMPDIR]);
    expect(calls[0].cwd).toBe(BASE_CWD);
  });

  it('swallows runner errors (missing worktree is benign)', () => {
    expect(() =>
      claimOps.removeDetachedWorktree(makeThrowingRunner(), TMPDIR, BASE_CWD),
    ).not.toThrow();
  });

  it('passes the correct cwd', () => {
    const { run, calls } = makeRunner();
    claimOps.removeDetachedWorktree(run, TMPDIR, '/other/base');
    expect(calls[0].cwd).toBe('/other/base');
  });
});
