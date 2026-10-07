import { describe, it, expect } from 'vitest';
import { commitOps } from '../commitOps.js';

interface RunnerCall {
  argv: readonly string[];
  cwd: string;
}

const CWD = '/srv/adw/repos/acme/webapp/.worktrees/feature-issue-1-foo';

/** A double quote, a backtick, `$(...)` and a backslash: each is special to a shell inside a double-quoted string. */
const HOSTILE_MESSAGE = 'chore: "quoted" `echo pwned` $(echo pwned) back\\slash';

/**
 * Fake runner keyed by git subcommand (argv[1]). `checkIgnoreOutput` undefined simulates
 * `git check-ignore` exiting non-zero (nothing ignored) by throwing, matching
 * the real runner's throw-on-nonzero-exit contract.
 */
function makeRunner(config: { statusOutput?: string; checkIgnoreOutput?: string } = {}): {
  run: (argv: readonly string[], cwd: string) => string;
  calls: RunnerCall[];
} {
  const calls: RunnerCall[] = [];
  const run = (argv: readonly string[], cwd: string): string => {
    calls.push({ argv, cwd });
    if (argv[1] === 'status') {
      return config.statusOutput ?? ' M .adw/project.md\n';
    }
    if (argv[1] === 'check-ignore') {
      if (config.checkIgnoreOutput === undefined) {
        throw Object.assign(new Error('exit status 1'), { status: 1 });
      }
      return config.checkIgnoreOutput;
    }
    return '';
  };
  return { run, calls };
}

function addArgv(calls: RunnerCall[]): readonly string[] {
  const call = calls.find(c => c.argv[1] === 'add');
  if (!call) throw new Error('no git add command was issued');
  return call.argv;
}

function statusArgv(calls: RunnerCall[]): readonly string[] {
  const call = calls.find(c => c.argv[1] === 'status');
  if (!call) throw new Error('no git status command was issued');
  return call.argv;
}

describe('commitChanges — ignore-safe exclude filter', () => {
  it('omits the :(exclude) token from both add and status when the excluded path is gitignored', () => {
    const { run, calls } = makeRunner({ checkIgnoreOutput: '.claude/commands/adw_init.md\n' });
    commitOps.commitChanges(run, 'chore: regen', CWD, { excludePaths: ['.claude/commands/adw_init.md'] });
    expect(addArgv(calls)).toEqual(['git', 'add', '-A']);
    expect(statusArgv(calls)).toEqual(['git', 'status', '--porcelain']);
  });

  it('retains the :(exclude) token when check-ignore reports nothing ignored (non-zero exit)', () => {
    const { run, calls } = makeRunner();
    commitOps.commitChanges(run, 'chore: regen', CWD, { excludePaths: ['.claude/commands/adw_init.md'] });
    expect(addArgv(calls)).toEqual(['git', 'add', '-A', '--', '.', ':(exclude).claude/commands/adw_init.md']);
  });

  it('drops only the ignored path in a mixed exclude list, keeping the non-ignored one', () => {
    const { run, calls } = makeRunner({ checkIgnoreOutput: 'a\n' });
    commitOps.commitChanges(run, 'chore: regen', CWD, { excludePaths: ['a', 'b'] });
    expect(addArgv(calls)).toEqual(['git', 'add', '-A', '--', '.', ':(exclude)b']);
  });

  it('never invokes git check-ignore and emits a bare git add -A when no excludePaths given', () => {
    const { run, calls } = makeRunner();
    commitOps.commitChanges(run, 'chore: regen', CWD);
    expect(calls.some(c => c.argv[1] === 'check-ignore')).toBe(false);
    expect(addArgv(calls)).toEqual(['git', 'add', '-A']);
  });

  it('probes check-ignore with each exclude path as its own argv element', () => {
    const { run, calls } = makeRunner({ checkIgnoreOutput: '' });
    commitOps.commitChanges(run, 'chore: regen', CWD, { excludePaths: ['a', 'b'] });
    const checkIgnoreCall = calls.find(c => c.argv[1] === 'check-ignore');
    expect(checkIgnoreCall?.argv).toEqual(['git', 'check-ignore', 'a', 'b']);
    expect(checkIgnoreCall?.cwd).toBe(CWD);
  });

  it('returns false and issues no add/commit when status is empty (nothing to commit)', () => {
    const { run, calls } = makeRunner({ statusOutput: '' });
    const result = commitOps.commitChanges(run, 'chore: regen', CWD);
    expect(result).toBe(false);
    expect(calls.some(c => c.argv[1] === 'add')).toBe(false);
    expect(calls.some(c => c.argv[1] === 'commit')).toBe(false);
  });

  it('returns true and issues a commit when there are pending changes', () => {
    const { run, calls } = makeRunner();
    const result = commitOps.commitChanges(run, 'chore: regen', CWD);
    expect(result).toBe(true);
    expect(calls.map(c => c.argv)).toContainEqual(['git', 'commit', '-m', 'chore: regen']);
  });
});

describe('removeAndCommitPaths', () => {
  /** Fake runner for removeAndCommitPaths: scoped `git status --porcelain -- <paths>` is the only branch that matters. */
  function makeRemovalRunner(config: { statusOutput?: string } = {}): {
    run: (argv: readonly string[], cwd: string) => string;
    calls: RunnerCall[];
  } {
    const calls: RunnerCall[] = [];
    const run = (argv: readonly string[], cwd: string): string => {
      calls.push({ argv, cwd });
      if (argv[1] === 'status') {
        return config.statusOutput ?? ' D features/per-issue/feature-1.feature\n';
      }
      return '';
    };
    return { run, calls };
  }

  const PATHS = ['features/per-issue/feature-1.feature', 'features/per-issue/step_definitions/feature-1.steps.ts'];

  it('runs a scoped git rm then a pathspec-scoped commit and returns true when something was staged', () => {
    const { run, calls } = makeRemovalRunner();
    const result = commitOps.removeAndCommitPaths(run, PATHS, 'chore: sweep stale per-issue scenarios (>14d post-merge)', CWD);
    expect(result).toBe(true);
    expect(calls[0]).toEqual({ argv: ['git', 'rm', '-f', '--ignore-unmatch', '--', ...PATHS], cwd: CWD });
    const commitCall = calls.find(c => c.argv[1] === 'commit');
    expect(commitCall?.argv).toEqual([
      'git', 'commit', '-m', 'chore: sweep stale per-issue scenarios (>14d post-merge)', '--', ...PATHS,
    ]);
    expect(commitCall?.cwd).toBe(CWD);
  });

  it('scopes the status probe to the given paths', () => {
    const { run, calls } = makeRemovalRunner();
    commitOps.removeAndCommitPaths(run, PATHS, 'chore: sweep', CWD);
    const statusCall = calls.find(c => c.argv[1] === 'status');
    expect(statusCall?.argv).toEqual(['git', 'status', '--porcelain', '--', ...PATHS]);
  });

  it('passes the message verbatim as the single element after -m, with the pathspec after --', () => {
    const { run, calls } = makeRemovalRunner();
    commitOps.removeAndCommitPaths(run, PATHS, HOSTILE_MESSAGE, CWD);
    const commitCall = calls.find(c => c.argv[1] === 'commit');
    expect(commitCall?.argv).toEqual(['git', 'commit', '-m', HOSTILE_MESSAGE, '--', ...PATHS]);
  });

  it('returns false and issues no commit when the scoped status is empty (nothing to commit)', () => {
    const { run, calls } = makeRemovalRunner({ statusOutput: '' });
    const result = commitOps.removeAndCommitPaths(run, PATHS, 'chore: sweep', CWD);
    expect(result).toBe(false);
    expect(calls.some(c => c.argv[1] === 'commit')).toBe(false);
  });

  it('returns false and issues no git commands when paths is empty', () => {
    const { run, calls } = makeRemovalRunner();
    const result = commitOps.removeAndCommitPaths(run, [], 'chore: sweep', CWD);
    expect(result).toBe(false);
    expect(calls.length).toBe(0);
  });
});

describe('addAndCommitPaths', () => {
  /** Fake runner for addAndCommitPaths: scoped `git status --porcelain -- <paths>` is the only branch that matters. */
  function makeAddRunner(config: { statusOutput?: string } = {}): {
    run: (argv: readonly string[], cwd: string) => string;
    calls: RunnerCall[];
  } {
    const calls: RunnerCall[] = [];
    const run = (argv: readonly string[], cwd: string): string => {
      calls.push({ argv, cwd });
      if (argv[1] === 'status') {
        return config.statusOutput ?? ' M features/per-issue/feature-1.feature\n';
      }
      return '';
    };
    return { run, calls };
  }

  const PATHS = ['features/per-issue/feature-1.feature'];

  it('stages only the named paths and commits scoped to them, returning true when something was staged', () => {
    const { run, calls } = makeAddRunner();
    const result = commitOps.addAndCommitPaths(run, PATHS, 'chore: mark feature-1 promotion-suggested', CWD);
    expect(result).toBe(true);
    expect(calls[0]).toEqual({ argv: ['git', 'add', '--', ...PATHS], cwd: CWD });
    const commitCall = calls.find(c => c.argv[1] === 'commit');
    expect(commitCall?.argv).toEqual(['git', 'commit', '-m', 'chore: mark feature-1 promotion-suggested', '--', ...PATHS]);
    expect(commitCall?.cwd).toBe(CWD);
  });

  it('scopes the status probe to the given paths', () => {
    const { run, calls } = makeAddRunner();
    commitOps.addAndCommitPaths(run, PATHS, 'chore: mark', CWD);
    const statusCall = calls.find(c => c.argv[1] === 'status');
    expect(statusCall?.argv).toEqual(['git', 'status', '--porcelain', '--', ...PATHS]);
  });

  it('passes the message verbatim as the single element after -m, with the pathspec after --', () => {
    const { run, calls } = makeAddRunner();
    commitOps.addAndCommitPaths(run, PATHS, HOSTILE_MESSAGE, CWD);
    const commitCall = calls.find(c => c.argv[1] === 'commit');
    expect(commitCall?.argv).toEqual(['git', 'commit', '-m', HOSTILE_MESSAGE, '--', ...PATHS]);
  });

  it('returns false and issues no commit when the scoped status is empty (nothing to commit)', () => {
    const { run, calls } = makeAddRunner({ statusOutput: '' });
    const result = commitOps.addAndCommitPaths(run, PATHS, 'chore: mark', CWD);
    expect(result).toBe(false);
    expect(calls.some(c => c.argv[1] === 'commit')).toBe(false);
  });

  it('returns false and runs nothing when paths is empty', () => {
    const { run, calls } = makeAddRunner();
    const result = commitOps.addAndCommitPaths(run, [], 'chore: mark', CWD);
    expect(result).toBe(false);
    expect(calls.length).toBe(0);
  });
});
