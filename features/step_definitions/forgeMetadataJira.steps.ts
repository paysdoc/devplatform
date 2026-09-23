/**
 * Jira steps for issue #16's creation/update metadata scenarios
 * (`feature-16.feature`): a scripted `fetchFn` answers `GET …/rest/api/3/issue/<KEY>`
 * (matched by method and path suffix, query string aside — never by rebuilding
 * the expected URL from the Gherkin's raw instance URL) with a Jira-shaped
 * payload carrying a REST `self` link and no browse URL, so the browse URL
 * the tracker reports can only come from composing the client's normalised
 * instance URL with the issue key. The shared `Then` steps for a fetched
 * issue's `createdAt`/`url` live in `forgeMetadataGitHub.steps.ts`.
 */
import { Given, Then, When } from '@cucumber/cucumber';
import * as assert from 'node:assert/strict';
import { DevPlatformWorld } from '../support/world.js';
import { loadProviders, resolveExport } from '../support/publicSurfaceLoader.js';

/** Matches `JiraApiClientDeps['fetchFn']`, declared locally so no adapter-internal type is imported into the step layer. */
type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

interface FetchedIssue {
  readonly createdAt: string;
  readonly url: string;
}

interface JiraApiClientInstance {
  readonly instanceUrl: string;
  getIssue(issueKey: string): Promise<unknown>;
}

type JiraApiClientCtor = new (instanceUrl: string, auth: { readonly pat: string }, deps?: { readonly fetchFn?: FetchFn }) => JiraApiClientInstance;

interface JiraIssueTrackerInstance {
  fetchIssue(issueNumber: number): Promise<FetchedIssue>;
}

type JiraIssueTrackerCtor = new (client: JiraApiClientInstance, projectKey: string) => JiraIssueTrackerInstance;

interface JiraConfigInput {
  readonly instanceUrl: string;
  readonly projectKey: string;
  readonly auth: { readonly pat: string };
}

type CreateJiraIssueTrackerFn = (config: JiraConfigInput, deps?: { readonly fetchFn?: FetchFn }) => JiraIssueTrackerInstance;

/** A Jira-shaped issue payload: a REST `self` link (never a browse URL), and `created`/`updated` verbatim. */
function jiraIssueResponse(key: string, createdAt: string, updatedAt: string): unknown {
  return {
    id: '1',
    key,
    self: `https://jira.invalid/rest/api/3/issue/${key}`,
    fields: {
      summary: `Summary of ${key}`,
      description: { type: 'doc', content: [] },
      status: { name: 'Open', statusCategory: { id: 1, key: 'new', name: 'To Do' } },
      creator: { displayName: 'Scenario Reporter' },
      labels: [],
      comment: { comments: [], startAt: 0, maxResults: 0, total: 0 },
      created: createdAt,
      updated: updatedAt,
    },
  };
}

/** Answers `GET …/rest/api/3/issue/<key>` (query string aside) with `response`; throws naming any other request. */
function scriptedJiraFetch(key: string, response: unknown): FetchFn {
  return async (url, init) => {
    const path = url.split('?')[0];
    const method = init.method ?? 'GET';
    if (method === 'GET' && path.endsWith(`/rest/api/3/issue/${key}`)) {
      return new Response(JSON.stringify(response), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error(`unexpected Jira request: ${method} ${url}`);
  };
}

// ---------------------------------------------------------------------------
// Given
// ---------------------------------------------------------------------------

Given('Jira holds issue {string} created at {string}, last updated at {string}', function (this: DevPlatformWorld, key: string, createdAt: string, updatedAt: string) {
  this.jiraHeldIssue = { key, createdAt, updatedAt };
});

// ---------------------------------------------------------------------------
// When
// ---------------------------------------------------------------------------

When(
  'a Jira issue tracker for project {string} at {string} created through the providers entry point fetches issue {int}',
  async function (this: DevPlatformWorld, projectKey: string, instanceUrl: string, issueNumber: number) {
    assert.ok(this.jiraHeldIssue, 'no Jira issue was declared for this scenario');
    const fetchFn = scriptedJiraFetch(this.jiraHeldIssue.key, jiraIssueResponse(this.jiraHeldIssue.key, this.jiraHeldIssue.createdAt, this.jiraHeldIssue.updatedAt));
    const providers = await loadProviders();
    const createJiraIssueTracker = resolveExport<CreateJiraIssueTrackerFn>(providers, 'createJiraIssueTracker', 'providers');
    const tracker = createJiraIssueTracker({ instanceUrl, projectKey, auth: { pat: 'scenario-pat' } }, { fetchFn });
    this.fetchedIssue = await tracker.fetchIssue(issueNumber);
  },
);

When('a Jira API client for {string} is constructed through the providers entry point', async function (this: DevPlatformWorld, instanceUrl: string) {
  assert.ok(this.jiraHeldIssue, 'no Jira issue was declared for this scenario');
  const fetchFn = scriptedJiraFetch(this.jiraHeldIssue.key, jiraIssueResponse(this.jiraHeldIssue.key, this.jiraHeldIssue.createdAt, this.jiraHeldIssue.updatedAt));
  const providers = await loadProviders();
  const JiraApiClient = resolveExport<JiraApiClientCtor>(providers, 'JiraApiClient', 'providers');
  this.jiraClient = new JiraApiClient(instanceUrl, { pat: 'scenario-pat' }, { fetchFn });
});

When(
  'a Jira issue tracker constructed from only that client and the project key {string} fetches issue {int}',
  async function (this: DevPlatformWorld, projectKey: string, issueNumber: number) {
    assert.ok(this.jiraClient, 'no Jira API client was constructed for this scenario');
    const providers = await loadProviders();
    const JiraIssueTracker = resolveExport<JiraIssueTrackerCtor>(providers, 'JiraIssueTracker', 'providers');
    const tracker = new JiraIssueTracker(this.jiraClient as JiraApiClientInstance, projectKey);
    this.fetchedIssue = await tracker.fetchIssue(issueNumber);
  },
);

// ---------------------------------------------------------------------------
// Then
// ---------------------------------------------------------------------------

Then('the Jira API client reports the instance URL {string}', function (this: DevPlatformWorld, expected: string) {
  assert.ok(this.jiraClient, 'no Jira API client was constructed for this scenario');
  assert.equal(this.jiraClient.instanceUrl, expected);
});
