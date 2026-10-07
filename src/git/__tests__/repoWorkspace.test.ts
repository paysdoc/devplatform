import * as path from 'path';
import { describe, it, expect } from 'vitest';
import {
  getTargetRepoWorkspacePath,
  isRepoCloned,
  ensureRepoWorkspace,
} from '../repoWorkspace.js';
import type { WorkspaceExecFn } from '../repoWorkspace.js';

const TARGET_REPOS_DIR = '/srv/adw/repos';

const isGitClone = (argv: readonly string[]): boolean => argv[0] === 'git' && argv[1] === 'clone';

// ---------------------------------------------------------------------------
// getTargetRepoWorkspacePath
// ---------------------------------------------------------------------------

describe('getTargetRepoWorkspacePath', () => {
  it('composes targetReposDir/owner/repo', () => {
    const result = getTargetRepoWorkspacePath('acme', 'webapp', TARGET_REPOS_DIR);
    expect(result).toBe(path.join(TARGET_REPOS_DIR, 'acme', 'webapp'));
  });

  it('returns different paths for different owner/repo pairs', () => {
    const a = getTargetRepoWorkspacePath('acme', 'webapp', TARGET_REPOS_DIR);
    const b = getTargetRepoWorkspacePath('octo', 'infra', TARGET_REPOS_DIR);
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// isRepoCloned
// ---------------------------------------------------------------------------

describe('isRepoCloned', () => {
  it('returns true when .git exists at the workspace path', () => {
    const result = isRepoCloned('/some/path', { existsSync: (p) => String(p).endsWith('.git') });
    expect(result).toBe(true);
  });

  it('returns false when .git does not exist', () => {
    const result = isRepoCloned('/some/path', { existsSync: () => false });
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ensureRepoWorkspace — clone branch (not cloned)
// ---------------------------------------------------------------------------

describe('ensureRepoWorkspace — not cloned: clones the URL it is given, verbatim (issue #793)', () => {
  it('calls exec with git clone when workspace is absent', () => {
    const execCalls: Array<readonly string[]> = [];
    const fakeExec: WorkspaceExecFn = (argv) => { execCalls.push(argv); };

    ensureRepoWorkspace('acme', 'webapp', 'https://github.com/acme/webapp', {
      targetReposDir: TARGET_REPOS_DIR,
      getDefaultBranch: () => 'main',
      exec: fakeExec,
      fsDeps: { existsSync: () => false, mkdirSync: () => {} },
      log: () => {},
    });

    const cloneCall = execCalls.find(isGitClone);
    expect(cloneCall).toBeDefined();
    expect(cloneCall!).toContain('https://github.com/acme/webapp');
  });

  it('clones a GitHub HTTPS URL verbatim — no rewrite to SSH', () => {
    const execCalls: Array<readonly string[]> = [];
    const fakeExec: WorkspaceExecFn = (argv) => { execCalls.push(argv); };

    ensureRepoWorkspace('acme', 'webapp', 'https://github.com/acme/webapp.git', {
      targetReposDir: TARGET_REPOS_DIR,
      getDefaultBranch: () => 'main',
      exec: fakeExec,
      fsDeps: { existsSync: () => false, mkdirSync: () => {} },
      log: () => {},
    });

    const cloneCall = execCalls.find(isGitClone);
    expect(cloneCall).toEqual(['git', 'clone', 'https://github.com/acme/webapp.git', path.join(TARGET_REPOS_DIR, 'acme', 'webapp')]);
  });

  it('returns the computed workspace path', () => {
    const fakeExec: WorkspaceExecFn = () => {};
    const result = ensureRepoWorkspace('acme', 'webapp', 'https://github.com/acme/webapp', {
      targetReposDir: TARGET_REPOS_DIR,
      getDefaultBranch: () => 'main',
      exec: fakeExec,
      fsDeps: { existsSync: () => false, mkdirSync: () => {} },
      log: () => {},
    });
    expect(result).toBe(path.join(TARGET_REPOS_DIR, 'acme', 'webapp'));
  });
});

// ---------------------------------------------------------------------------
// ensureRepoWorkspace — fetch branch (already cloned)
// ---------------------------------------------------------------------------

describe('ensureRepoWorkspace — already cloned: fetches and reads default branch', () => {
  it('runs git fetch origin when workspace already exists', () => {
    const execCalls: Array<readonly string[]> = [];
    const fakeExec: WorkspaceExecFn = (argv) => { execCalls.push(argv); };

    ensureRepoWorkspace('acme', 'webapp', 'https://github.com/acme/webapp', {
      targetReposDir: TARGET_REPOS_DIR,
      getDefaultBranch: () => 'main',
      exec: fakeExec,
      fsDeps: { existsSync: (p) => String(p).endsWith('.git'), mkdirSync: () => {} },
      log: () => {},
    });

    expect(execCalls).toContainEqual(['git', 'fetch', 'origin']);
  });

  it('calls getDefaultBranch through the injected thunk (bound-auth runner)', () => {
    let defaultBranchCalled = false;
    const getDefaultBranch = () => { defaultBranchCalled = true; return 'main'; };

    ensureRepoWorkspace('acme', 'webapp', 'https://github.com/acme/webapp', {
      targetReposDir: TARGET_REPOS_DIR,
      getDefaultBranch,
      exec: () => {},
      fsDeps: { existsSync: (p) => String(p).endsWith('.git'), mkdirSync: () => {} },
      log: () => {},
    });

    expect(defaultBranchCalled).toBe(true);
  });

  it('does NOT call git clone when workspace already exists', () => {
    const execCalls: Array<readonly string[]> = [];
    const fakeExec: WorkspaceExecFn = (argv) => { execCalls.push(argv); };

    ensureRepoWorkspace('acme', 'webapp', 'https://github.com/acme/webapp', {
      targetReposDir: TARGET_REPOS_DIR,
      getDefaultBranch: () => 'main',
      exec: fakeExec,
      fsDeps: { existsSync: (p) => String(p).endsWith('.git'), mkdirSync: () => {} },
      log: () => {},
    });

    expect(execCalls.some(isGitClone)).toBe(false);
  });
});
