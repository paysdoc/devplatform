/**
 * Steps for `commitOps`, `isLeaseRejection` and `branchOps` driven directly
 * through `@paysdoc/devplatform/git` (issue #11), against real throwaway git
 * repositories under `os.tmpdir()` (removed in `world.ts`'s `After` hook via
 * `gitCleanupDirs`) — no mocked git.
 *
 * The push-rejection scenario uses a genuine local bare repository as the
 * "remote": a second clone pushes a commit the first repository has never
 * fetched, then `commitOps.pushBranch`'s fetch-then-force-with-lease sequence
 * is genuinely rejected by git with "remote ref updated since checkout"
 * (verified empirically — `--force-if-includes` catches this even though the
 * preceding fetch already refreshed the local remote-tracking ref).
 */
import { Given, Then, When } from '@cucumber/cucumber';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DevPlatformWorld } from '../support/world.js';
import { loadGit, resolveExport } from '../support/publicSurfaceLoader.js';
import { configureCloneIdentity, createThrowawayRepo, makeGitRunner } from '../support/gitFixture.js';

type Runner = (command: string, cwd: string) => string;

interface CommitOpsNamespace {
  commitChanges(run: Runner, message: string, cwd: string): boolean;
  pushBranch(run: Runner, branch: string, cwd: string): void;
}
interface BranchOpsNamespace {
  getCurrentBranch(run: Runner, cwd: string): string;
  deleteLocalBranch(run: Runner, branch: string, cwd: string): boolean;
}
type IsLeaseRejectionFn = (error: unknown) => boolean;

function hasLocalBranch(run: Runner, dir: string, name: string): boolean {
  const output = run('git branch --list', dir);
  return output.split('\n').some((line) => line.replace(/^\*?\s+/, '').trim() === name);
}

// ---------------------------------------------------------------------------
// Given — repository fixtures
// ---------------------------------------------------------------------------

Given('a fresh git repository on branch {string} with one committed file', function (this: DevPlatformWorld, branch: string) {
  this.runner = makeGitRunner();
  this.repoDir = createThrowawayRepo(this.runner, branch);
  this.gitCleanupDirs.push(this.repoDir);
});

Given('the working tree gains an uncommitted file {string}', function (this: DevPlatformWorld, fileName: string) {
  assert.ok(this.repoDir, 'no repository was created for this scenario');
  fs.writeFileSync(path.join(this.repoDir, fileName), 'scenario content\n');
});

Given('the repository checks out a new branch {string}', function (this: DevPlatformWorld, branch: string) {
  assert.ok(this.repoDir, 'no repository was created for this scenario');
  this.runner(`git checkout -b ${branch}`, this.repoDir);
});

Given('the repository also has a local branch {string}', function (this: DevPlatformWorld, branch: string) {
  assert.ok(this.repoDir, 'no repository was created for this scenario');
  this.runner(`git branch ${branch}`, this.repoDir);
});

// ---------------------------------------------------------------------------
// Given — the push-rejection fixture
// ---------------------------------------------------------------------------

Given('the branch {string} is published to a local remote', function (this: DevPlatformWorld, branch: string) {
  assert.ok(this.repoDir, 'no repository was created for this scenario');
  const remoteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devplatform-remote-'));
  this.gitCleanupDirs.push(remoteDir);
  this.runner(`git init --bare -b ${branch}`, remoteDir);
  this.runner(`git remote add origin "${remoteDir}"`, this.repoDir);
  this.runner(`git push -u origin ${branch}`, this.repoDir);
  this.remoteDir = remoteDir;
});

Given('the remote branch {string} gains a commit the local repository has never seen', function (this: DevPlatformWorld, branch: string) {
  assert.ok(this.remoteDir, 'no local remote was published for this scenario');
  const cloneDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devplatform-clone-'));
  this.gitCleanupDirs.push(cloneDir);
  this.runner(`git clone -b ${branch} "${this.remoteDir}" "${cloneDir}"`, os.tmpdir());
  configureCloneIdentity(this.runner, cloneDir);
  fs.writeFileSync(path.join(cloneDir, 'from-other-clone.txt'), 'seen only by the remote\n');
  this.runner('git add -A', cloneDir);
  this.runner('git commit -m "commit the first repo has never seen"', cloneDir);
  this.runner(`git push origin ${branch}`, cloneDir);
  this.remoteAheadSha = this.runner('git rev-parse HEAD', cloneDir);
});

Given('the local branch gains a commit {string}', function (this: DevPlatformWorld, message: string) {
  assert.ok(this.repoDir, 'no repository was created for this scenario');
  fs.writeFileSync(path.join(this.repoDir, 'local-work.txt'), 'local work\n');
  this.runner('git add -A', this.repoDir);
  this.runner(`git commit -m "${message}"`, this.repoDir);
});

// ---------------------------------------------------------------------------
// Given — isLeaseRejection
// ---------------------------------------------------------------------------

Given('a push failure whose stderr reads {string}', function (this: DevPlatformWorld, stderr: string) {
  this.pushFailureStderr = stderr;
});

// ---------------------------------------------------------------------------
// When — commitOps
// ---------------------------------------------------------------------------

When('the commit operations from the git entry point commit the working tree with message {string}', async function (this: DevPlatformWorld, message: string) {
  const git = await loadGit();
  const commitOps = resolveExport<CommitOpsNamespace>(git, 'commitOps', 'git');
  assert.ok(this.repoDir, 'no repository was created for this scenario');
  this.commitReport = commitOps.commitChanges(this.runner, message, this.repoDir);
});

When('the commit operations from the git entry point push the branch {string}', async function (this: DevPlatformWorld, branch: string) {
  const git = await loadGit();
  const commitOps = resolveExport<CommitOpsNamespace>(git, 'commitOps', 'git');
  assert.ok(this.repoDir, 'no repository was created for this scenario');
  this.pushError = undefined;
  try {
    commitOps.pushBranch(this.runner, branch, this.repoDir);
  } catch (error) {
    this.pushError = error;
  }
});

// ---------------------------------------------------------------------------
// When — isLeaseRejection
// ---------------------------------------------------------------------------

When('the failure is classified by the lease-rejection check from the git entry point', async function (this: DevPlatformWorld) {
  const git = await loadGit();
  const isLeaseRejection = resolveExport<IsLeaseRejectionFn>(git, 'isLeaseRejection', 'git');
  this.leaseVerdict = isLeaseRejection({ stderr: this.pushFailureStderr });
});

// ---------------------------------------------------------------------------
// When — branchOps
// ---------------------------------------------------------------------------

When('the branch operations from the git entry point read the current branch', async function (this: DevPlatformWorld) {
  const git = await loadGit();
  const branchOps = resolveExport<BranchOpsNamespace>(git, 'branchOps', 'git');
  assert.ok(this.repoDir, 'no repository was created for this scenario');
  this.currentBranchResult = branchOps.getCurrentBranch(this.runner, this.repoDir);
});

When('the branch operations from the git entry point delete the local branch {string}', async function (this: DevPlatformWorld, branch: string) {
  const git = await loadGit();
  const branchOps = resolveExport<BranchOpsNamespace>(git, 'branchOps', 'git');
  assert.ok(this.repoDir, 'no repository was created for this scenario');
  this.deleteBranchResult = branchOps.deleteLocalBranch(this.runner, branch, this.repoDir);
});

// ---------------------------------------------------------------------------
// Then — commitOps
// ---------------------------------------------------------------------------

Then('the commit operations report a commit was made', function (this: DevPlatformWorld) {
  assert.equal(this.commitReport, true);
});

Then('the commit operations report nothing was committed', function (this: DevPlatformWorld) {
  assert.equal(this.commitReport, false);
});

Then('the repository\'s latest commit message is {string}', function (this: DevPlatformWorld, expected: string) {
  assert.ok(this.repoDir, 'no repository was created for this scenario');
  assert.equal(this.runner('git log -1 --format=%s', this.repoDir), expected);
});

Then('the working tree is clean', function (this: DevPlatformWorld) {
  assert.ok(this.repoDir, 'no repository was created for this scenario');
  assert.equal(this.runner('git status --porcelain', this.repoDir), '');
});

Then('the repository still has exactly one commit', function (this: DevPlatformWorld) {
  assert.ok(this.repoDir, 'no repository was created for this scenario');
  assert.equal(this.runner('git rev-list --count HEAD', this.repoDir), '1');
});

Then('the push is refused with a message naming {string}', function (this: DevPlatformWorld, named: string) {
  assert.ok(this.pushError, 'expected the push to be refused, but it succeeded');
  const message = String((this.pushError as Error)?.message ?? this.pushError);
  assert.ok(message.includes(named), `expected the refusal to name "${named}", got: ${message}`);
});

Then('the refusal names the manual remedy {string}', function (this: DevPlatformWorld, remedy: string) {
  assert.ok(this.pushError, 'expected the push to be refused, but it succeeded');
  const message = String((this.pushError as Error)?.message ?? this.pushError);
  assert.ok(message.includes(remedy), `expected the refusal to name the remedy "${remedy}", got: ${message}`);
});

Then('the remote branch {string} still points at the commit the local repository has never seen', function (this: DevPlatformWorld, branch: string) {
  assert.ok(this.remoteDir, 'no local remote was published for this scenario');
  assert.equal(this.runner(`git rev-parse ${branch}`, this.remoteDir), this.remoteAheadSha);
});

// ---------------------------------------------------------------------------
// Then — isLeaseRejection
// ---------------------------------------------------------------------------

Then('the lease-rejection check reports {string}', function (this: DevPlatformWorld, expected: string) {
  const actual = this.leaseVerdict ? 'a lease rejection' : 'not a lease rejection';
  assert.equal(actual, expected);
});

// ---------------------------------------------------------------------------
// Then — branchOps
// ---------------------------------------------------------------------------

Then('the reported current branch is {string}', function (this: DevPlatformWorld, expected: string) {
  assert.equal(this.currentBranchResult, expected);
});

Then('the branch operations report the branch was not deleted', function (this: DevPlatformWorld) {
  assert.equal(this.deleteBranchResult, false);
});

Then('the branch operations report the branch was deleted', function (this: DevPlatformWorld) {
  assert.equal(this.deleteBranchResult, true);
});

Then('the repository has a local branch {string}', function (this: DevPlatformWorld, branch: string) {
  assert.ok(this.repoDir, 'no repository was created for this scenario');
  assert.ok(hasLocalBranch(this.runner, this.repoDir, branch), `expected a local branch "${branch}"`);
});

Then('the repository has no local branch {string}', function (this: DevPlatformWorld, branch: string) {
  assert.ok(this.repoDir, 'no repository was created for this scenario');
  assert.ok(!hasLocalBranch(this.runner, this.repoDir, branch), `expected no local branch "${branch}"`);
});
