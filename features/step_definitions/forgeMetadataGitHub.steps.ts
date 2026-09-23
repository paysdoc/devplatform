/**
 * GitHub steps for issue #16's creation/update metadata scenarios
 * (`feature-16.feature`): a `GitContext` over the projection-aware CLI fake
 * (`features/support/ghCliFake.ts`) drives `createGitHubIssueTracker` and
 * `createGitHubCodeHost` through the providers entry point. The two `Then`
 * steps for a fetched issue's `createdAt`/`url` are defined here (GitHub's
 * scenario is first in the feature file) and shared verbatim by the Jira
 * scenarios in `forgeMetadataJira.steps.ts`.
 */
import { DataTable, Given, Then, When } from '@cucumber/cucumber';
import * as assert from 'node:assert/strict';
import { GitContext, createLiteralTokenProvider, type ExecFn } from '../../src/git/index.js';
import { Platform, type RepoIdentifier } from '../../src/providers/types.js';
import { DevPlatformWorld } from '../support/world.js';
import { loadProviders, resolveExport } from '../support/publicSurfaceLoader.js';
import { createGhCliFake, makeHeldIssue, makeHeldPullRequest } from '../support/ghCliFake.js';

const TEST_IDENTITY = {
  authorName: 'Scenario Bot', authorEmail: 'scenario-bot@example.com',
  committerName: 'Scenario Bot', committerEmail: 'scenario-bot@example.com',
};

interface FetchedIssue {
  readonly createdAt: string;
  readonly url: string;
}

interface ListedPullRequest {
  readonly number: number;
  readonly body: string;
  readonly state: string;
  readonly mergedAt: string | null;
  readonly updatedAt: string;
  readonly url: string;
}

type CreateGitHubIssueTrackerFn = (ctx: GitContext, repoId: RepoIdentifier) => { fetchIssue(n: number): Promise<FetchedIssue> };
type CreateGitHubCodeHostFn = (ctx: GitContext, repoId: RepoIdentifier) => { listPullRequests(): readonly ListedPullRequest[] };

// ---------------------------------------------------------------------------
// Given
// ---------------------------------------------------------------------------

Given('a git context for {string} whose executor answers like the GitHub CLI, returning only the fields a command requests', function (this: DevPlatformWorld, repository: string) {
  const [owner, repo] = repository.split('/');
  assert.ok(owner && repo, `expected an "owner/repo" repository, got "${repository}"`);
  const { exec, state } = createGhCliFake();
  this.ghFakeState = state;
  this.ghRepoId = { owner, repo, platform: Platform.GitHub };
  const execFn: ExecFn = exec;
  this.ghContext = new GitContext(
    {
      owner,
      repo,
      selfHost: false,
      gitIdentity: TEST_IDENTITY,
      frameworkRepoRoot: '/tmp/devplatform-scenarios-framework-root',
      targetReposDir: '/tmp/devplatform-scenarios-target-repos',
      tokenProvider: createLiteralTokenProvider('scenario-token'),
    },
    { exec: execFn },
  );
});

Given('GitHub holds issue #{int} created at {string}, last updated at {string}, with the URL {string}', function (this: DevPlatformWorld, issueNumber: number, createdAt: string, updatedAt: string, url: string) {
  assert.ok(this.ghFakeState, 'no GitHub CLI fake was declared for this scenario');
  this.ghFakeState.issue = makeHeldIssue({ number: issueNumber, createdAt, updatedAt, url });
});

Given('GitHub holds these pull requests', function (this: DevPlatformWorld, table: DataTable) {
  assert.ok(this.ghFakeState, 'no GitHub CLI fake was declared for this scenario');
  const rows = table.hashes() as { number: string; state: string; updatedAt: string; url: string }[];
  this.ghFakeState.pullRequests = rows.map((row) =>
    makeHeldPullRequest({ number: Number(row.number), state: row.state, updatedAt: row.updatedAt, url: row.url }),
  );
});

// ---------------------------------------------------------------------------
// When
// ---------------------------------------------------------------------------

When('a GitHub issue tracker created through the providers entry point fetches issue #{int}', async function (this: DevPlatformWorld, issueNumber: number) {
  assert.ok(this.ghContext, 'no git context was declared for this scenario');
  assert.ok(this.ghRepoId, 'no repository identity was declared for this scenario');
  const providers = await loadProviders();
  const createGitHubIssueTracker = resolveExport<CreateGitHubIssueTrackerFn>(providers, 'createGitHubIssueTracker', 'providers');
  const tracker = createGitHubIssueTracker(this.ghContext, this.ghRepoId);
  this.fetchedIssue = await tracker.fetchIssue(issueNumber);
});

When('a GitHub code host created through the providers entry point lists every pull request', async function (this: DevPlatformWorld) {
  assert.ok(this.ghContext, 'no git context was declared for this scenario');
  assert.ok(this.ghRepoId, 'no repository identity was declared for this scenario');
  const providers = await loadProviders();
  const createGitHubCodeHost = resolveExport<CreateGitHubCodeHostFn>(providers, 'createGitHubCodeHost', 'providers');
  const codeHost = createGitHubCodeHost(this.ghContext, this.ghRepoId);
  this.listedPullRequests = codeHost.listPullRequests();
});

// ---------------------------------------------------------------------------
// Then — shared by the GitHub and Jira scenarios
// ---------------------------------------------------------------------------

Then('the fetched issue was created at {string}', function (this: DevPlatformWorld, expected: string) {
  assert.ok(this.fetchedIssue, 'no issue was fetched for this scenario');
  assert.equal(this.fetchedIssue.createdAt, expected);
});

Then('the fetched issue\'s URL is {string}', function (this: DevPlatformWorld, expected: string) {
  assert.ok(this.fetchedIssue, 'no issue was fetched for this scenario');
  assert.equal(this.fetchedIssue.url, expected);
});

// ---------------------------------------------------------------------------
// Then — GitHub pull-request listing
// ---------------------------------------------------------------------------

Then('the listed pull requests carry', function (this: DevPlatformWorld, table: DataTable) {
  const records = this.listedPullRequests;
  assert.ok(records, 'no pull requests were listed for this scenario');
  const rows = table.hashes() as { number: string; updatedAt: string; url: string }[];
  for (const row of rows) {
    const number = Number(row.number);
    const matches: ListedPullRequest[] = records.filter((pr) => pr.number === number);
    assert.equal(matches.length, 1, `expected exactly one listed pull request #${number}, got ${matches.length}`);
    assert.equal(matches[0].updatedAt, row.updatedAt);
    assert.equal(matches[0].url, row.url);
  }
});

Then('each listed pull request still carries the body, state and merge timestamp GitHub holds for it', function (this: DevPlatformWorld) {
  const records = this.listedPullRequests;
  assert.ok(records, 'no pull requests were listed for this scenario');
  assert.ok(this.ghFakeState, 'no GitHub CLI fake was declared for this scenario');
  for (const held of this.ghFakeState.pullRequests) {
    const listed: ListedPullRequest | undefined = records.find((pr) => pr.number === held.number);
    assert.ok(listed, `expected a listed pull request #${held.number}`);
    assert.equal(listed.body, held.body);
    assert.equal(listed.state, held.state);
    assert.equal(listed.mergedAt, held.mergedAt);
  }
});
