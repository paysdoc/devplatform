/**
 * checkGitGhGuard.test.ts — scanFiles behavioural assertions for the ported
 * git/gh guard (two rules: 'git-gh-shellout', 'unsanctioned-construction').
 *
 * Drives the exported scanFiles() over in-memory fixture paths + sources,
 * proving both directions per rule: a violation is caught, a legal shape
 * passes. Ported from ADW's adws/__tests__/checkGitGhGuard.test.ts with
 * paths remapped to this repo; the cwd-derived-identity, extraction-scope,
 * and stale-sanctioned-entry blocks are dropped along with the rules they
 * exercise (see scripts/checkGitGhGuard.ts's docblock).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

vi.mock('node:fs');

import { scanFiles, EXEMPT_PACKAGES, isExemptPackage } from '../checkGitGhGuard.js';
import { isSanctionedConstructionSite, SANCTIONED_CONSTRUCTION_SITES } from '../guard/constructionRule.js';

const mockReadFileSync = vi.mocked(fs.readFileSync);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('scanFiles — git-gh-shellout rule', () => {
  it('reports a violation for a raw execSync(git …) call in a non-exempt file', () => {
    mockReadFileSync.mockReturnValue('const x = execSync("git status");\n');

    const { violations, scannedCount } = scanFiles(['src/providers/gitlab/gitlabCodeHost.ts'], '/repo');

    expect(scannedCount).toBe(1);
    expect(violations).toHaveLength(1);
    expect(violations[0].command).toBe('git status');
    expect(violations[0].file).toBe('src/providers/gitlab/gitlabCodeHost.ts');
    expect(violations[0].rule).toBe('git-gh-shellout');
  });

  it('reports a violation for a raw execSync(gh …) call', () => {
    mockReadFileSync.mockReturnValue('execSync(`gh pr create --title "foo"`);\n');

    const { violations } = scanFiles(['src/providers/jira/jiraApiClient.ts'], '/repo');

    expect(violations).toHaveLength(1);
    expect(violations[0].command).toMatch(/^gh/);
    expect(violations[0].rule).toBe('git-gh-shellout');
  });

  it('returns no violations when the source has no git/gh call', () => {
    mockReadFileSync.mockReturnValue('const x = execSync("ls -la");\n');

    const { violations, scannedCount } = scanFiles(['src/providers/jira/jiraApiClient.ts'], '/repo');

    expect(scannedCount).toBe(1);
    expect(violations).toHaveLength(0);
  });

  it('scans all provided paths — no allowlist skip reduces scannedCount', () => {
    mockReadFileSync.mockReturnValue('// clean file\n');

    const paths = [
      'src/providers/gitlab/gitlabBoardManager.ts',
      'src/providers/jira/jiraBoardManager.ts',
      'src/providers/jira/adfConverter.ts',
    ];
    const { scannedCount } = scanFiles(paths, '/repo');

    expect(scannedCount).toBe(paths.length);
    expect(mockReadFileSync).toHaveBeenCalledTimes(paths.length);
  });

  it('scanFiles signature accepts no allowlist parameter — only relPaths and repoRoot', () => {
    // TypeScript enforces this at compile-time; this assertion documents the contract.
    expect(scanFiles.length).toBe(2);
  });
});

describe('scanFiles — the per-rule exemption (AC1)', () => {
  it('the same execSync("git status") source is zero violations inside src/git/ and inside src/providers/github/, but one violation elsewhere', () => {
    mockReadFileSync.mockReturnValue('const x = execSync("git status");\n');

    const atGitCore = scanFiles(['src/git/branchOps.ts'], '/repo');
    const atGitHubAdapter = scanFiles(['src/providers/github/ghCommandRunner.ts'], '/repo');
    const atJira = scanFiles(['src/providers/jira/jiraApiClient.ts'], '/repo');

    expect(atGitCore.violations).toHaveLength(0);
    expect(atGitHubAdapter.violations).toHaveLength(0);
    expect(atJira.violations).toHaveLength(1);
    expect(atJira.violations[0].rule).toBe('git-gh-shellout');
  });

  it('a gh call site in src/github/ (name contains "github" but is not the exempt adapter package) yields exactly one violation', () => {
    mockReadFileSync.mockReturnValue("execSync('gh issue view 1');\n");

    const { violations } = scanFiles(['src/github/someNewApi.ts'], '/repo');

    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe('git-gh-shellout');
  });
});

describe('EXEMPT_PACKAGES — the closed, named, two-entry exempt set', () => {
  it('names exactly two packages: the git core and the GitHub forge adapter', () => {
    expect(EXEMPT_PACKAGES).toHaveLength(2);
    const dirs = EXEMPT_PACKAGES.map((p) => p.dir);
    expect(dirs).toContain('src/git');
    expect(dirs).toContain('src/providers/github');
  });

  it('each entry names a role', () => {
    for (const pkg of EXEMPT_PACKAGES) {
      expect(typeof pkg.role).toBe('string');
      expect(pkg.role.length).toBeGreaterThan(0);
    }
  });
});

describe('isExemptPackage — matches the directory itself or any path beneath it', () => {
  it('is true for the git core package directory itself', () => {
    expect(isExemptPackage('src/git')).toBe(true);
  });

  it('is true for a file beneath the git core package', () => {
    expect(isExemptPackage('src/git/gitContext.ts')).toBe(true);
  });

  it('is true for the GitHub forge adapter directory itself', () => {
    expect(isExemptPackage('src/providers/github')).toBe(true);
  });

  it('is true for a file beneath the GitHub forge adapter', () => {
    expect(isExemptPackage('src/providers/github/ghCommandRunner.ts')).toBe(true);
  });

  it('is false for src/github/ — the name contains "github" but it is not the adapter package', () => {
    expect(isExemptPackage('src/github/issueApi.ts')).toBe(false);
  });

  it("is false for the adapter's GitLab sibling package", () => {
    expect(isExemptPackage('src/providers/gitlab/gitlabCodeHost.ts')).toBe(false);
  });

  it('is false for an ordinary consumer file', () => {
    expect(isExemptPackage('src/providers/jira/jiraIssueTracker.ts')).toBe(false);
  });

  it("is false for the adapter's parent directory file — one directory above the adapter is not exempt", () => {
    expect(isExemptPackage('src/providers/forgeProviders.ts')).toBe(false);
  });
});

describe('scanFiles — unsanctioned-construction rule', () => {
  describe('flags deliberate violations', () => {
    it('flags a bare createGitHubIssueTracker(...) call in a non-allowlisted file', () => {
      mockReadFileSync.mockReturnValue(
        "const t = createGitHubIssueTracker(gitContext, { owner: 'acme', repo: 'typo' });\n",
      );

      const { violations } = scanFiles(['src/providers/jira/jiraApiClient.ts'], '/repo');

      expect(violations).toHaveLength(1);
      expect(violations[0].rule).toBe('unsanctioned-construction');
    });

    it('flags a bare createGitLabCodeHost(...) call in a non-allowlisted file', () => {
      mockReadFileSync.mockReturnValue('const h = createGitLabCodeHost(repoId, config);\n');

      const { violations } = scanFiles(['src/providers/jira/jiraApiClient.ts'], '/repo');

      expect(violations).toHaveLength(1);
      expect(violations[0].rule).toBe('unsanctioned-construction');
    });

    it('flags a bare createJiraIssueTracker(...) call in a non-allowlisted file', () => {
      mockReadFileSync.mockReturnValue('const t = createJiraIssueTracker(config);\n');

      const { violations } = scanFiles(['src/providers/gitlab/gitlabCodeHost.ts'], '/repo');

      expect(violations).toHaveLength(1);
      expect(violations[0].rule).toBe('unsanctioned-construction');
    });

    it('flags a bare forgeProviders(...) call in a non-allowlisted file', () => {
      mockReadFileSync.mockReturnValue(
        'const p = forgeProviders({ forge, identity, tokenProvider, gitContext });\n',
      );

      const { violations } = scanFiles(['src/providers/jira/jiraApiClient.ts'], '/repo');

      expect(violations).toHaveLength(1);
      expect(violations[0].rule).toBe('unsanctioned-construction');
    });

    it('flags new GitContext(...) in a non-allowlisted file, naming it in `command`', () => {
      mockReadFileSync.mockReturnValue('const ctx = new GitContext({ owner, repo, selfHost: false });\n');

      const { violations } = scanFiles(['src/providers/jira/jiraApiClient.ts'], '/repo');

      expect(violations).toHaveLength(1);
      expect(violations[0].rule).toBe('unsanctioned-construction');
      expect(violations[0].command).toContain('new GitContext');
    });

    it('flags two constructions in one file as two violations, one per line', () => {
      mockReadFileSync.mockReturnValue(
        'const t = createGitHubIssueTracker(gitContext, repoId);\nconst h = createGitHubCodeHost(gitContext, repoId);\n',
      );

      const { violations } = scanFiles(['src/providers/jira/jiraApiClient.ts'], '/repo');

      expect(violations).toHaveLength(2);
      expect(violations[0].line).toBe(1);
      expect(violations[1].line).toBe(2);
      expect(violations.every((v) => v.rule === 'unsanctioned-construction')).toBe(true);
    });
  });

  describe('the whole-tree walk reaches the exempt packages too (AC2)', () => {
    it('flags a bare createGitHubIssueTracker(...) call inside src/providers/github/ itself', () => {
      mockReadFileSync.mockReturnValue(
        "const t = createGitHubIssueTracker(gitContext, { owner: 'acme', repo: 'typo' });\n",
      );

      const { violations } = scanFiles(['src/providers/github/somethingNew.ts'], '/repo');

      expect(violations).toHaveLength(1);
      expect(violations[0].rule).toBe('unsanctioned-construction');
    });

    it('flags new GitContext(...) inside src/git/ itself', () => {
      mockReadFileSync.mockReturnValue('const ctx = new GitContext({ owner, repo, selfHost: false });\n');

      const { violations } = scanFiles(['src/git/somethingNew.ts'], '/repo');

      expect(violations).toHaveLength(1);
      expect(violations[0].rule).toBe('unsanctioned-construction');
      expect(violations[0].command).toContain('new GitContext');
    });
  });

  describe('does not flag sanctioned sites or legal shapes', () => {
    it('permits createGitHubIssueTracker(...) at the permanent assembly-module file', () => {
      mockReadFileSync.mockReturnValue(
        "const t = createGitHubIssueTracker(gitContext, { owner: 'acme', repo: 'typo' });\n",
      );

      const { violations } = scanFiles(['src/providers/forgeProviders.ts'], '/repo');

      expect(violations).toHaveLength(0);
    });

    it('permits deps.forgeProviders(...) and d.forgeProviders(...) — injected seams, not bypasses', () => {
      mockReadFileSync.mockReturnValue(
        'function a(deps) { return deps.forgeProviders(opts); }\nfunction b(d) { return d.forgeProviders(opts); }\n',
      );

      const { violations } = scanFiles(['src/providers/jira/jiraApiClient.ts'], '/repo');

      expect(violations).toHaveLength(0);
    });

    it('permits createGhCommandRunner/createGitHubTokenProvider/createIssueCmd — the flagged set is explicit names, never a create* pattern', () => {
      mockReadFileSync.mockReturnValue(
        'const runner = createGhCommandRunner(ctx);\nconst tp = createGitHubTokenProvider({ pat });\nconst cmd = createIssueCmd(o, r, t);\n',
      );

      const { violations } = scanFiles(['src/providers/jira/jiraApiClient.ts'], '/repo');

      expect(violations).toHaveLength(0);
    });

    it('permits a createGitHubCodeHost function declaration — declarations are never flagged, only calls', () => {
      mockReadFileSync.mockReturnValue(
        'export function createGitHubCodeHost(repoId) {\n  return new GitHubCodeHostImpl(repoId);\n}\n',
      );

      const { violations } = scanFiles(['src/providers/jira/jiraApiClient.ts'], '/repo');

      expect(violations).toHaveLength(0);
    });

    it('a git shell-out in a construction-sanctioned file is still exactly one git-gh-shellout violation — the construction allowlist does not leak into the other rule', () => {
      mockReadFileSync.mockReturnValue('const x = execSync("git status");\n');

      const { violations } = scanFiles(['src/providers/forgeProviders.ts'], '/repo');

      expect(violations).toHaveLength(1);
      expect(violations[0].rule).toBe('git-gh-shellout');
    });
  });
});

describe('isSanctionedConstructionSite — the one-entry permanent allowlist', () => {
  it('is true for the assembly module', () => {
    expect(isSanctionedConstructionSite('src/providers/forgeProviders.ts')).toBe(true);
  });

  it('is false for an unlisted file', () => {
    expect(isSanctionedConstructionSite('src/providers/index.ts')).toBe(false);
  });

  it('is false for a declaration site of one of the flagged factories', () => {
    expect(isSanctionedConstructionSite('src/providers/github/githubIssueTracker.ts')).toBe(false);
  });

  it('is false for a directory prefix — a whole directory is never sanctioned, only exact files', () => {
    expect(isSanctionedConstructionSite('src/providers')).toBe(false);
  });

  it('the allowlist is exactly one entry', () => {
    expect(SANCTIONED_CONSTRUCTION_SITES).toHaveLength(1);
  });
});

describe('guarded factory names still exist', () => {
  const cases: { name: string; file: string; declPattern: RegExp }[] = [
    { name: 'forgeProviders', file: 'src/providers/forgeProviders.ts', declPattern: /export function forgeProviders\(/ },
    { name: 'createGitHubIssueTracker', file: 'src/providers/github/githubIssueTracker.ts', declPattern: /export function createGitHubIssueTracker\(/ },
    { name: 'createGitHubCodeHost', file: 'src/providers/github/githubCodeHost.ts', declPattern: /export function createGitHubCodeHost\(/ },
    { name: 'createGitHubBoardManager', file: 'src/providers/github/githubBoardManager.ts', declPattern: /export function createGitHubBoardManager\(/ },
    { name: 'createGitLabCodeHost', file: 'src/providers/gitlab/gitlabCodeHost.ts', declPattern: /export function createGitLabCodeHost\(/ },
    { name: 'createGitLabBoardManager', file: 'src/providers/gitlab/gitlabBoardManager.ts', declPattern: /export function createGitLabBoardManager\(/ },
    { name: 'createJiraIssueTracker', file: 'src/providers/jira/jiraIssueTracker.ts', declPattern: /export function createJiraIssueTracker\(/ },
    { name: 'createJiraBoardManager', file: 'src/providers/jira/jiraBoardManager.ts', declPattern: /export function createJiraBoardManager\(/ },
    { name: 'GitContext', file: 'src/git/gitContext.ts', declPattern: /export class GitContext\b/ },
    { name: 'GitContext barrel', file: 'src/git/index.ts', declPattern: /export \{ GitContext \} from '\.\/gitContext\.js'/ },
  ];

  // fs is mocked at module scope (see `vi.mock('node:fs')` above) — read each owning
  // source file through the real fs module as plain text, matching its declaration.
  it.each(cases)('$name is still declared in $file', async ({ name, file, declPattern }) => {
    const realFs = await vi.importActual<typeof import('node:fs')>('node:fs');
    const source = realFs.readFileSync(path.join(process.cwd(), file), 'utf-8');

    expect(
      declPattern.test(source),
      `Expected to find "${name}"'s declaration in ${file} — was it renamed? Update ` +
      'PROVIDER_CONSTRUCTORS/CONTEXT_CONSTRUCTORS/GIT_CONTEXT_CLASS_NAME in scripts/guard/constructionRule.ts accordingly.',
    ).toBe(true);
  });
});
