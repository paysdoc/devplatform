/**
 * Steps for `feature-18.feature`: git and gh commands reach their program as an
 * argument list, never through a shell.
 *
 * A command's argv is observed three ways, one per rule of the feature:
 *  - the executor recorder `ghRepoApi.steps.ts` installs behind a `GitContext`;
 *  - a recording `gh` first on `PATH`, behind the default executor;
 *  - real throwaway git repositories, behind the default executor.
 * Only public entry points are driven. The Then steps that count and compare
 * invocations read whichever source the scenario set up (`recordedInvocations`).
 */
import { DataTable, Given, Then, When } from '@cucumber/cucumber';
import * as assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { GitContext, createLiteralTokenProvider, type TokenProvider } from '../../src/git/index.js';
import type { CodeHost, IssueTracker, RepoIdentifier } from '../../src/providers/types.js';
import { DevPlatformWorld, parseRepository, platformFor } from '../support/world.js';
import { loadGit, loadProviders, resolveExport } from '../support/publicSurfaceLoader.js';
import { ISOLATION_ENV } from '../support/gitFixture.js';
import { installRecordingStubGh, readStubGhInvocations, type RecordedInvocation } from '../support/stubGh.js';
import { REPO_ROOT, childEnv, typeCheckInConsumer } from '../support/packagedConsumer.js';

/** Packing, building and installing the tarball is minutes-scale work on a cold cache. */
const PACKAGING_TIMEOUT_MS = 10 * 60 * 1000;

const TEST_IDENTITY = {
  authorName: 'Scenario Bot', authorEmail: 'scenario-bot@example.com',
  committerName: 'Scenario Bot', committerEmail: 'scenario-bot@example.com',
};

/** A worktree path the recorder scenarios hand to the context; nothing is spawned there. */
const RECORDED_WORKTREE = '/tmp/devplatform-scenarios-worktree';

type CreateCodeHostFn = (ctx: GitContext, repoId: RepoIdentifier) => CodeHost;
type CreateIssueTrackerFn = (ctx: GitContext, repoId: RepoIdentifier) => IssueTracker;
type CloneRepoFn = (cloneUrl: string, workspacePath: string) => void;

/** The two `GhRepoApi` operations these scenarios drive; a structural stand-in keeps the adapter-internal type out of the step layer. */
interface RepoApiLike {
  createPR(title: string, body: string, headBranch: string, baseBranch?: string, labels?: readonly string[]): string;
  runGraphQL(query: string, variables?: Record<string, string | number>): string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function contextOf(world: DevPlatformWorld): GitContext {
  assert.ok(world.ghContext, 'no git context was declared for this scenario');
  return world.ghContext;
}

function repoDirOf(world: DevPlatformWorld): string {
  assert.ok(world.repoDir, 'no repository was created for this scenario');
  return world.repoDir;
}

async function codeHostOf(world: DevPlatformWorld): Promise<CodeHost> {
  assert.ok(world.ghRepoId, 'no repository identity was declared for this scenario');
  const providers = await loadProviders();
  const createGitHubCodeHost = resolveExport<CreateCodeHostFn>(providers, 'createGitHubCodeHost', 'providers');
  return createGitHubCodeHost(contextOf(world), world.ghRepoId);
}

async function issueTrackerOf(world: DevPlatformWorld): Promise<IssueTracker> {
  assert.ok(world.ghRepoId, 'no repository identity was declared for this scenario');
  const providers = await loadProviders();
  const createGitHubIssueTracker = resolveExport<CreateIssueTrackerFn>(providers, 'createGitHubIssueTracker', 'providers');
  return createGitHubIssueTracker(contextOf(world), world.ghRepoId);
}

/** Every command the scenario's executor saw: the recording stub's saved invocations when it is installed, otherwise the executor recorder's. */
function recordedInvocations(world: DevPlatformWorld): readonly RecordedInvocation[] {
  if (world.stubGhRecording) {
    assert.ok(world.stubGhDir, 'the recording stub GitHub CLI was not installed');
    return readStubGhInvocations(world.stubGhDir);
  }
  assert.ok(world.execRecorderCalls, 'no executor recorder was configured for this scenario');
  return world.execRecorderCalls;
}

/** The recorded invocations of one command, named by its leading words, such as "gh pr create". */
function invocationsOf(world: DevPlatformWorld, command: string): readonly RecordedInvocation[] {
  const words = command.split(' ');
  return recordedInvocations(world).filter((call) => words.every((word, i) => call.argv[i] === word));
}

function describeRecorded(world: DevPlatformWorld): string {
  return JSON.stringify(recordedInvocations(world).map((call) => call.argv));
}

/** The element straight after the first occurrence of `flag`. */
function argumentAfter(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

/** True when `flag` appears in `argv` immediately followed by `argument` — for flags such as `-f` that repeat. */
function hasFlagWith(argv: readonly string[], flag: string, argument: string): boolean {
  return argv.some((element, i) => element === flag && argv[i + 1] === argument);
}

function expectOncePerValue(world: DevPlatformWorld, command: string): readonly RecordedInvocation[] {
  const calls = invocationsOf(world, command);
  assert.equal(
    calls.length,
    world.hazardValues.length,
    `expected "${command}" to run once for each of the ${world.hazardValues.length} values, recorded: ${describeRecorded(world)}`,
  );
  return calls;
}

function expectOnce(world: DevPlatformWorld, command: string): RecordedInvocation {
  const calls = invocationsOf(world, command);
  assert.equal(calls.length, 1, `expected "${command}" to run once, recorded: ${describeRecorded(world)}`);
  return calls[0];
}

/** NUL-separated (`-z`) git output split into entries, so git's own path quoting never changes a comparison. */
function nulList(output: string): string[] {
  return output.split('\0').filter((entry) => entry !== '');
}

// ---------------------------------------------------------------------------
// Given
// ---------------------------------------------------------------------------

Given('these values, each carrying characters a shell would reinterpret', function (this: DevPlatformWorld, table: DataTable) {
  this.hazardValues = table.hashes().map((row) => row['value']);
});

Given('a stub GitHub CLI on the PATH records each invocation and answers pull request creation with {string}', function (this: DevPlatformWorld, pullRequestUrl: string) {
  installRecordingStubGh(this, pullRequestUrl);
});

Given('a git context for {string} that runs commands through its default executor', function (this: DevPlatformWorld, repository: string) {
  const identity = parseRepository(repository, platformFor('github'));
  const frameworkRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devplatform-framework-root-'));
  this.gitCleanupDirs.push(frameworkRoot);
  this.ghRepoId = identity;
  this.ghContext = new GitContext({
    owner: identity.owner,
    repo: identity.repo,
    selfHost: false,
    gitIdentity: TEST_IDENTITY,
    frameworkRepoRoot: frameworkRoot,
    targetReposDir: path.join(frameworkRoot, 'target-repos'),
    tokenProvider: createLiteralTokenProvider('fixed-token'),
  });
});

Given('a git context over that repository that runs commands through its default executor', function (this: DevPlatformWorld) {
  const tokenProvider: TokenProvider = { credentialEnv: () => ({ GH_TOKEN: 'unused', ...ISOLATION_ENV }) };
  this.ghContext = new GitContext({
    owner: 'vestmatic',
    repo: 'deckerly',
    selfHost: true,
    gitIdentity: TEST_IDENTITY,
    frameworkRepoRoot: repoDirOf(this),
    targetReposDir: path.join(os.tmpdir(), 'devplatform-scenarios-target-repos'),
    tokenProvider,
  });
});

Given('the repository commits a file {string} containing {string}', function (this: DevPlatformWorld, fileName: string, content: string) {
  const dir = repoDirOf(this);
  fs.writeFileSync(path.join(dir, fileName), content);
  this.runner(['git', 'add', '--', fileName], dir);
  this.runner(['git', 'commit', '-m', `add ${fileName}`], dir);
});

Given('a source tree whose {string} holds the call', function (this: DevPlatformWorld, file: string, call: string) {
  const tree = fs.mkdtempSync(path.join(os.tmpdir(), 'devplatform-guard-tree-'));
  this.gitCleanupDirs.push(tree);
  const target = path.join(tree, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${call}\n`);
  this.guardTreeDir = tree;
});

// ---------------------------------------------------------------------------
// When — values handed through public entry points to the executor recorder
// ---------------------------------------------------------------------------

When('a GitHub code host created through the providers entry point opens a pull request from {string} into {string} with the body {string} once per value, with that value as its title', async function (this: DevPlatformWorld, sourceBranch: string, targetBranch: string, body: string) {
  const codeHost = await codeHostOf(this);
  for (const title of this.hazardValues) {
    codeHost.createPullRequest({ title, body, sourceBranch, targetBranch });
  }
});

When('the repository API opens a pull request from {string} into {string} titled {string} with the body {string}, labelled with every value', function (this: DevPlatformWorld, headBranch: string, baseBranch: string, title: string, body: string) {
  assert.ok(this.ghRepoApiInstance, 'no repository API was composed for this scenario');
  (this.ghRepoApiInstance as unknown as RepoApiLike).createPR(title, body, headBranch, baseBranch, this.hazardValues);
});

When('a GitHub issue tracker created through the providers entry point creates an issue with the body {string} once per value, with that value as its title', async function (this: DevPlatformWorld, body: string) {
  const tracker = await issueTrackerOf(this);
  for (const title of this.hazardValues) {
    tracker.createIssue(title, body);
  }
});

When('a GitHub issue tracker created through the providers entry point {word} a label to issue #{int} once per value, with that value as the label name', async function (this: DevPlatformWorld, verb: string, issueNumber: number) {
  const tracker = await issueTrackerOf(this);
  for (const labelName of this.hazardValues) {
    if (verb === 'adds') tracker.addLabel(issueNumber, labelName);
    else if (verb === 'applies') tracker.applyLabel(issueNumber, labelName);
    else assert.fail(`unknown label verb "${verb}"`);
  }
});

When('a GitHub issue tracker created through the providers entry point ensures a label coloured {string} once per value, with that value as both its name and its description', async function (this: DevPlatformWorld, color: string) {
  const tracker = await issueTrackerOf(this);
  for (const value of this.hazardValues) {
    tracker.ensureLabel(value, color, value);
  }
});

When('a GitHub issue tracker created through the providers entry point searches open issues once per value, with that value as the search query', async function (this: DevPlatformWorld) {
  const tracker = await issueTrackerOf(this);
  for (const query of this.hazardValues) {
    tracker.searchOpenIssues(query, 10);
  }
});

When('the repository API runs the GraphQL query {string} once per value, with that value as the string variable {string} and {int} as the number variable {string}', function (this: DevPlatformWorld, query: string, stringVariable: string, numberValue: number, numberVariable: string) {
  assert.ok(this.ghRepoApiInstance, 'no repository API was composed for this scenario');
  const api = this.ghRepoApiInstance as unknown as RepoApiLike;
  for (const value of this.hazardValues) {
    api.runGraphQL(query, { [stringVariable]: value, [numberVariable]: numberValue });
  }
});

When('the git context commits its dirty working tree once per value, with that value as the commit message', function (this: DevPlatformWorld) {
  for (const message of this.hazardValues) contextOf(this).commitChanges(message, RECORDED_WORKTREE);
});

When('the git context adds and commits {string} once per value, with that value as the commit message', function (this: DevPlatformWorld, fileName: string) {
  for (const message of this.hazardValues) contextOf(this).addAndCommitPaths([fileName], message, RECORDED_WORKTREE);
});

When('the git context removes and commits {string} once per value, with that value as the commit message', function (this: DevPlatformWorld, fileName: string) {
  for (const message of this.hazardValues) contextOf(this).removeAndCommitPaths([fileName], message, RECORDED_WORKTREE);
});

When('the git context makes an empty claim commit once per value, with that value as the commit message', function (this: DevPlatformWorld) {
  for (const message of this.hazardValues) contextOf(this).commitAllowEmpty(message, RECORDED_WORKTREE);
});

// ---------------------------------------------------------------------------
// When — the default executor
// ---------------------------------------------------------------------------

When('a GitHub code host created through the providers entry point opens a pull request from {string} into {string} with the body {string}, titled', async function (this: DevPlatformWorld, sourceBranch: string, targetBranch: string, body: string, title: string) {
  const codeHost = await codeHostOf(this);
  this.pullRequestTitle = title;
  this.codeHostPullRequest = codeHost.createPullRequest({ title, body, sourceBranch, targetBranch });
});

When('the git context commits the working tree with the message', function (this: DevPlatformWorld, message: string) {
  this.committedMessage = message;
  contextOf(this).commitChanges(message, repoDirOf(this));
});

When('the git context adds and commits these paths with the message {string}', function (this: DevPlatformWorld, message: string, table: DataTable) {
  const paths = table.hashes().map((row) => row['path']);
  contextOf(this).addAndCommitPaths(paths, message, repoDirOf(this));
});

When('the git context removes and commits {string} with the message {string}', function (this: DevPlatformWorld, fileName: string, message: string) {
  contextOf(this).removeAndCommitPaths([fileName], message, repoDirOf(this));
});

When('the git context commits the working tree with the message {string}, excluding {string}', function (this: DevPlatformWorld, message: string, excludedPath: string) {
  contextOf(this).commitChanges(message, repoDirOf(this), { excludePaths: [excludedPath] });
});

When('the git context shows {string} at {string}', function (this: DevPlatformWorld, fileName: string, ref: string) {
  this.shownContent = contextOf(this).show(ref, fileName, repoDirOf(this));
});

When('the git context creates a worktree for the new branch {string}', function (this: DevPlatformWorld, branch: string) {
  this.worktreePath = contextOf(this).createWorktreeForNewBranch(branch);
});

When('the git context removes the worktree for branch {string}', function (this: DevPlatformWorld, branch: string) {
  contextOf(this).removeWorktree(branch);
});

When('the git entry point\'s clone operation clones that repository into the workspace {string}', async function (this: DevPlatformWorld, workspace: string) {
  const git = await loadGit();
  const cloneRepo = resolveExport<CloneRepoFn>(git, 'cloneRepo', 'git');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'devplatform-workspaces-'));
  this.gitCleanupDirs.push(root);
  this.clonedWorkspacePath = path.join(root, workspace);
  cloneRepo(repoDirOf(this), this.clonedWorkspacePath);
});

When('the git and gh guard runs over that source tree', function (this: DevPlatformWorld) {
  assert.ok(this.guardTreeDir, 'no source tree was declared for this scenario');
  const tsx = path.join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const guard = path.join(REPO_ROOT, 'scripts', 'checkGitGhGuard.ts');
  const result = spawnSync(process.execPath, [tsx, guard], { cwd: this.guardTreeDir, encoding: 'utf-8', env: childEnv() });
  this.subprocess = { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
});

When(
  'the consumer type-checks a module that injects these runners through {string}',
  { timeout: PACKAGING_TIMEOUT_MS },
  function (this: DevPlatformWorld, entryPoint: string, table: DataTable) {
    assert.ok(this.consumerDir, 'the consumer project was not installed');
    const rows = table.hashes() as { seam: string; 'runner takes': string; compiler: string }[];

    const runnerFor = (seam: string, takes: string): string => {
      const argvList = takes === 'a program and its argument list';
      assert.ok(argvList || takes === 'one command string', `unknown runner shape "${takes}"`);
      const first = argvList ? 'argv: readonly string[]' : 'command: string';
      return seam === "GitContext's executor" ? `(${first}): string => ''` : `(${first}, cwd: string): string => ''`;
    };
    const injection = (seam: string, runner: string): string => {
      if (seam === "GitContext's executor") return `new GitContext(options, { exec: ${runner} })`;
      if (seam === 'commitOps') return `commitOps.hasUncommittedChanges(${runner}, '/tmp')`;
      if (seam === 'branchOps') return `branchOps.getCurrentBranch(${runner}, '/tmp')`;
      return assert.fail(`unknown seam "${seam}"`);
    };

    const lines = [
      `import { GitContext, commitOps, branchOps, type GitContextOptions } from ${JSON.stringify(entryPoint)};`,
      '',
      'declare const options: GitContextOptions;',
      '',
    ];
    rows.forEach((row, i) => {
      assert.ok(row.compiler === 'accepts' || row.compiler === 'rejects', `unknown compiler verdict "${row.compiler}"`);
      if (row.compiler === 'rejects') lines.push('// @ts-expect-error the runner takes a command string, not an argument list');
      lines.push(`export const injected${i} = ${injection(row.seam, runnerFor(row.seam, row['runner takes']))};`);
    });
    lines.push('');

    this.subprocess = typeCheckInConsumer(this.consumerDir, 'injectedRunners.ts', lines.join('\n'));
  },
);

// ---------------------------------------------------------------------------
// Then — recorded invocations
// ---------------------------------------------------------------------------

Then('{string} ran once per value, receiving that value unchanged as the argument after {string}', function (this: DevPlatformWorld, command: string, flag: string) {
  const calls = expectOncePerValue(this, command);
  this.hazardValues.forEach((value, i) => {
    assert.equal(argumentAfter(calls[i].argv, flag), value, `"${command}" #${i + 1} did not receive its value after "${flag}": ${JSON.stringify(calls[i].argv)}`);
  });
});

Then('{string} ran once per value, receiving {string} followed by that value unchanged as the argument after {string}', function (this: DevPlatformWorld, command: string, prefix: string, flag: string) {
  const calls = expectOncePerValue(this, command);
  this.hazardValues.forEach((value, i) => {
    assert.ok(hasFlagWith(calls[i].argv, flag, `${prefix}${value}`), `"${command}" #${i + 1} did not receive "${prefix}" + its value after "${flag}": ${JSON.stringify(calls[i].argv)}`);
  });
});

Then('{string} ran once, receiving each value unchanged as the argument after its own {string}', function (this: DevPlatformWorld, command: string, flag: string) {
  const { argv } = expectOnce(this, command);
  const received = argv.flatMap((element, i) => (element === flag ? [argv[i + 1]] : []));
  assert.deepEqual(received, this.hazardValues, `"${command}" did not receive every value after its own "${flag}": ${JSON.stringify(argv)}`);
});

Then('{string} ran once, receiving that title unchanged as the argument after {string}', function (this: DevPlatformWorld, command: string, flag: string) {
  const { argv } = expectOnce(this, command);
  assert.ok(this.pullRequestTitle, 'no pull request title was declared for this scenario');
  assert.equal(argumentAfter(argv, flag), this.pullRequestTitle, `"${command}" did not receive the title after "${flag}": ${JSON.stringify(argv)}`);
});

Then('every {string} invocation received {string} on standard input', function (this: DevPlatformWorld, command: string, expected: string) {
  const calls = invocationsOf(this, command);
  assert.ok(calls.length > 0, `expected at least one "${command}" invocation, recorded: ${describeRecorded(this)}`);
  for (const call of calls) {
    assert.equal(call.input, expected, `"${command}" received the wrong standard input: ${JSON.stringify(call.input)}`);
  }
});

Then('every {string} invocation also received', function (this: DevPlatformWorld, command: string, table: DataTable) {
  const calls = invocationsOf(this, command);
  assert.ok(calls.length > 0, `expected at least one "${command}" invocation, recorded: ${describeRecorded(this)}`);
  for (const call of calls) {
    for (const row of table.hashes()) {
      assert.ok(hasFlagWith(call.argv, row['flag'], row['argument']), `"${command}" did not receive ${row['flag']} ${row['argument']}: ${JSON.stringify(call.argv)}`);
    }
  }
});

Then('the code host reports pull request #{int} at {string}', function (this: DevPlatformWorld, number: number, url: string) {
  assert.deepEqual(this.codeHostPullRequest, { url, number });
});

// ---------------------------------------------------------------------------
// Then — real git
// ---------------------------------------------------------------------------

Then('the repository\'s latest commit message is exactly that message', function (this: DevPlatformWorld) {
  assert.ok(this.committedMessage !== undefined, 'no commit message was declared for this scenario');
  assert.equal(this.runner(['git', 'log', '-1', '--format=%B'], repoDirOf(this)), this.committedMessage);
});

Then('the repository\'s latest commit changes exactly these paths', function (this: DevPlatformWorld, table: DataTable) {
  const expected = table.hashes().map((row) => row['path']).sort();
  const actual = nulList(this.runner(['git', 'diff-tree', '--no-commit-id', '--name-only', '-r', '-z', 'HEAD'], repoDirOf(this))).sort();
  assert.deepEqual(actual, expected);
});

Then('the working tree still has the uncommitted file {string}', function (this: DevPlatformWorld, fileName: string) {
  const untracked = nulList(this.runner(['git', 'ls-files', '--others', '--exclude-standard', '-z'], repoDirOf(this)));
  assert.ok(untracked.includes(fileName), `expected "${fileName}" to be untracked, untracked files: ${JSON.stringify(untracked)}`);
});

Then('the repository no longer tracks {string}', function (this: DevPlatformWorld, fileName: string) {
  const tracked = nulList(this.runner(['git', 'ls-files', '-z'], repoDirOf(this)));
  assert.ok(!tracked.includes(fileName), `expected "${fileName}" to be untracked, tracked files: ${JSON.stringify(tracked)}`);
});

Then('the shown content is {string}', function (this: DevPlatformWorld, expected: string) {
  assert.equal(this.shownContent, expected);
});

Then('the new worktree is checked out on branch {string}', function (this: DevPlatformWorld, branch: string) {
  assert.ok(this.worktreePath, 'no worktree was created for this scenario');
  assert.equal(this.runner(['git', 'branch', '--show-current'], this.worktreePath), branch);
});

Then('the workspace {string} is a clone of that repository at the same commit', function (this: DevPlatformWorld, workspace: string) {
  const cloned = this.clonedWorkspacePath;
  assert.ok(cloned, 'no repository was cloned for this scenario');
  assert.ok(cloned.endsWith(workspace), `expected the clone to be in a workspace ending "${workspace}", got ${cloned}`);
  assert.equal(
    this.runner(['git', 'rev-parse', 'HEAD'], cloned),
    this.runner(['git', 'rev-parse', 'HEAD'], repoDirOf(this)),
  );
});

// ---------------------------------------------------------------------------
// Then — the guard
// ---------------------------------------------------------------------------

Then('the guard report names {string}', function (this: DevPlatformWorld, file: string) {
  assert.ok(this.subprocess, 'the guard was not run');
  assert.ok(this.subprocess.stdout.includes(file), `expected the guard report to name "${file}", got:\n${this.subprocess.stdout}${this.subprocess.stderr}`);
});
