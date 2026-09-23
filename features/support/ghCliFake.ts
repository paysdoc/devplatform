/**
 * A projection-aware GitHub CLI fake (issue #16): an `ExecFn` over mutable
 * held state — one issue, a list of pull requests — that answers
 * `gh issue view <n> … --json <fields>` and `gh pr list … --state all --json
 * <fields> …` with the held data projected to exactly the fields a command's
 * `--json` list names, the way the real `gh` CLI does, and refuses any other
 * command by name so an unexpected one fails a scenario loudly instead of
 * silently returning nothing.
 */
import type { ExecFn } from '../../src/git/index.js';

export interface GhFakeIssue {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly state: string;
  readonly author: { readonly login: string };
  readonly assignees: readonly unknown[];
  readonly labels: readonly unknown[];
  readonly milestone: unknown | null;
  readonly comments: readonly unknown[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly closedAt: string | null;
  readonly url: string;
}

export interface GhFakePullRequest {
  readonly number: number;
  readonly body: string;
  readonly state: string;
  readonly mergedAt: string | null;
  readonly updatedAt: string;
  readonly url: string;
}

export interface GhCliFakeState {
  issue?: GhFakeIssue;
  pullRequests: GhFakePullRequest[];
}

/** Fills every field `gh issue view`'s `ISSUE_FIELDS` can project, defaulting what a scenario leaves out to a neutral value. */
export function makeHeldIssue(
  overrides: Partial<GhFakeIssue> & Pick<GhFakeIssue, 'number' | 'createdAt' | 'updatedAt' | 'url'>,
): GhFakeIssue {
  return {
    title: `Issue ${overrides.number}`,
    body: '',
    state: 'OPEN',
    author: { login: 'octocat' },
    assignees: [],
    labels: [],
    milestone: null,
    comments: [],
    closedAt: null,
    ...overrides,
  };
}

/** Fills a held pull request's body from its number, and its merge timestamp only when merged. */
export function makeHeldPullRequest(
  overrides: Partial<GhFakePullRequest> & Pick<GhFakePullRequest, 'number' | 'state' | 'updatedAt' | 'url'>,
): GhFakePullRequest {
  return {
    body: `Body of PR #${overrides.number}`,
    mergedAt: overrides.state === 'MERGED' ? overrides.updatedAt : null,
    ...overrides,
  };
}

function parseJsonFields(command: string): readonly string[] {
  const match = command.match(/--json (\S+)/);
  if (!match) throw new Error(`unexpected gh command (no --json projection): ${command}`);
  return match[1].split(',');
}

function project<T extends object>(source: T, fields: readonly string[]): Partial<T> {
  const result: Partial<T> = {};
  for (const field of fields) {
    if (field in source) {
      (result as Record<string, unknown>)[field] = (source as Record<string, unknown>)[field];
    }
  }
  return result;
}

/** A factory returning an `ExecFn` over fresh, empty held state (`{ pullRequests: [] }`) a scenario's Given steps then fill in. */
export function createGhCliFake(): { readonly exec: ExecFn; readonly state: GhCliFakeState } {
  const state: GhCliFakeState = { pullRequests: [] };

  const exec: ExecFn = (command) => {
    if (command.startsWith('gh issue view ')) {
      if (!state.issue) throw new Error(`unexpected gh command (no issue held): ${command}`);
      return JSON.stringify(project(state.issue, parseJsonFields(command)));
    }
    if (command.startsWith('gh pr list ') && command.includes('--state all')) {
      const fields = parseJsonFields(command);
      return JSON.stringify(state.pullRequests.map((pr) => project(pr, fields)));
    }
    throw new Error(`unexpected gh command: ${command}`);
  };

  return { exec, state };
}
