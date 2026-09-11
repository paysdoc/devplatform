/**
 * Steps for `createGhRepoApi` driven through `@paysdoc/devplatform/providers`
 * (issue #11). `GitContext` and `createLiteralTokenProvider` are pre-existing,
 * stable `./git` exports (unaffected by this issue), so they are imported
 * statically; only `createGhRepoApi` — the name this issue widens onto the
 * providers barrel — is resolved through the dynamic-import loader, so a
 * wrong re-export target fails this scenario with a legible message.
 *
 * The context's `exec` is bound at construction time, but the Gherkin
 * declares the git context before the recorder that will answer its
 * commands — so the constructor is given a thin indirection that always
 * calls through to `world.execRecorder`, which the later Given step
 * replaces.
 */
import { Given, Then, When } from '@cucumber/cucumber';
import * as assert from 'node:assert/strict';
import { GitContext, createLiteralTokenProvider, type ExecFn } from '../../src/git/index.js';
import { DevPlatformWorld, parseRepository, platformFor } from '../support/world.js';
import { loadProviders, resolveExport } from '../support/publicSurfaceLoader.js';

type CreateGhRepoApiFn = (ctx: GitContext) => { defaultBranch(): string };

const TEST_IDENTITY = {
  authorName: 'Scenario Bot', authorEmail: 'scenario-bot@example.com',
  committerName: 'Scenario Bot', committerEmail: 'scenario-bot@example.com',
};

// ---------------------------------------------------------------------------
// Given
// ---------------------------------------------------------------------------

Given('a git context for {string} with the literal credential {string}', function (this: DevPlatformWorld, repository: string, token: string) {
  const { owner, repo } = parseRepository(repository, platformFor('github'));
  const execFn: ExecFn = (command, options) => this.execRecorder(command, options);
  this.ghContext = new GitContext(
    {
      owner,
      repo,
      selfHost: false,
      gitIdentity: TEST_IDENTITY,
      frameworkRepoRoot: '/tmp/devplatform-scenarios-framework-root',
      targetReposDir: '/tmp/devplatform-scenarios-target-repos',
      tokenProvider: createLiteralTokenProvider(token),
    },
    { exec: execFn },
  );
});

Given('the context\'s executor is a recorder that answers every command with {string}', function (this: DevPlatformWorld, answer: string) {
  const calls: Array<{ command: string; env: NodeJS.ProcessEnv }> = [];
  this.execRecorderCalls = calls;
  this.execRecorder = (command, options) => {
    calls.push({ command, env: options.env });
    return answer;
  };
});

// ---------------------------------------------------------------------------
// When
// ---------------------------------------------------------------------------

When('a repository API is composed over the context through the providers entry point', async function (this: DevPlatformWorld) {
  const providers = await loadProviders();
  const createGhRepoApi = resolveExport<CreateGhRepoApiFn>(providers, 'createGhRepoApi', 'providers');
  assert.ok(this.ghContext, 'no git context was declared for this scenario');
  this.ghRepoApiInstance = createGhRepoApi(this.ghContext);
});

When('the repository API is asked for the default branch', function (this: DevPlatformWorld) {
  assert.ok(this.ghRepoApiInstance, 'no repository API was composed for this scenario');
  this.ghRepoApiDefaultBranchResult = this.ghRepoApiInstance.defaultBranch();
});

// ---------------------------------------------------------------------------
// Then
// ---------------------------------------------------------------------------

Then('the repository API reports the default branch {string}', function (this: DevPlatformWorld, expected: string) {
  assert.equal(this.ghRepoApiDefaultBranchResult, expected);
});

Then('the recorder captured exactly one command', function (this: DevPlatformWorld) {
  assert.equal(this.execRecorderCalls?.length, 1);
});

Then('the captured command names {string} and carries {string} set to {string}', function (this: DevPlatformWorld, named: string, envVar: string, envValue: string) {
  const call = this.execRecorderCalls?.[0];
  assert.ok(call, 'no command was captured');
  assert.ok(call.command.includes(named), `expected the captured command to name "${named}", got: ${call.command}`);
  assert.equal(call.env[envVar], envValue);
});
