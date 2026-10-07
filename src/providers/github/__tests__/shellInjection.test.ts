import { describe, expect, it } from 'vitest';
import type { ExecFn } from '../../../git/index.js';
import { GitContext } from '../../../git/index.js';
import { graphQLCmd } from '../commands/boardCommands.js';
import { addIssueLabelCmd, createIssueCmd, listOpenIssuesCmd } from '../commands/issueCommands.js';
import { applyLabelCmd, createLabelCmd } from '../commands/labelCommands.js';
import { createPRCmd } from '../commands/prCommands.js';
import { createGhRepoApi } from '../ghRepoApi.js';
import { validOptions } from './gitContextFixture.js';

/** All six characters a shell would reinterpret: ' " ` $(...) \ and a newline. */
const HOSTILE = `it's "quoted" \`echo pwned\` $(echo pwned) back\\slash\nsecond line`;
const TITLE_52 = "feat: #52 - Brand colour selection of deckerly's own: black and white is a brand";
const BODY = 'Implements #52.';

describe('gh command builders return one argv element per value', () => {
  it('createPRCmd keeps the deckerly#52 title, the head, the base and each label whole', () => {
    expect(createPRCmd('vestmatic', 'deckerly', TITLE_52, 'feature-issue-52-x', 'dev', [HOSTILE])).toEqual([
      'gh', 'pr', 'create', '--repo', 'vestmatic/deckerly',
      '--title', TITLE_52,
      '--head', 'feature-issue-52-x',
      '--body-file', '-',
      '--base', 'dev',
      '--label', HOSTILE,
    ]);
  });

  it('createPRCmd omits --base and --label when neither is given', () => {
    expect(createPRCmd('acme', 'widget', HOSTILE, 'feature-x')).toEqual([
      'gh', 'pr', 'create', '--repo', 'acme/widget',
      '--title', HOSTILE,
      '--head', 'feature-x',
      '--body-file', '-',
    ]);
  });

  it('createPRCmd emits one --label pair per label', () => {
    expect(createPRCmd('acme', 'widget', 't', 'h', undefined, ['a b', HOSTILE])).toEqual([
      'gh', 'pr', 'create', '--repo', 'acme/widget',
      '--title', 't',
      '--head', 'h',
      '--body-file', '-',
      '--label', 'a b',
      '--label', HOSTILE,
    ]);
  });

  it('createIssueCmd keeps the title whole', () => {
    expect(createIssueCmd('acme', 'widget', HOSTILE)).toEqual([
      'gh', 'issue', 'create', '--repo', 'acme/widget', '--title', HOSTILE, '--body-file', '-',
    ]);
  });

  it('addIssueLabelCmd and applyLabelCmd keep the label name whole', () => {
    const expected = ['gh', 'issue', 'edit', '42', '--repo', 'acme/widget', '--add-label', HOSTILE];

    expect(addIssueLabelCmd('acme', 'widget', 42, HOSTILE)).toEqual(expected);
    expect(applyLabelCmd('acme', 'widget', 42, HOSTILE)).toEqual(expected);
  });

  it('createLabelCmd keeps the name and the description whole', () => {
    expect(createLabelCmd('acme', 'widget', HOSTILE, 'ff0000', HOSTILE)).toEqual([
      'gh', 'label', 'create', HOSTILE,
      '--repo', 'acme/widget',
      '--color', 'ff0000',
      '--description', HOSTILE,
      '--force',
    ]);
  });

  it('listOpenIssuesCmd keeps the search query whole', () => {
    expect(listOpenIssuesCmd('acme', 'widget', { fields: ['number', 'title'], search: HOSTILE, limit: 5 })).toEqual([
      'gh', 'issue', 'list', '--repo', 'acme/widget',
      '--state', 'open',
      '--json', 'number,title',
      '--search', HOSTILE,
      '--limit', '5',
    ]);
  });

  it('graphQLCmd sends a string variable as -f key=value and a number as -F key=value', () => {
    expect(graphQLCmd('query{x}', { status: HOSTILE, n: 5 })).toEqual([
      'gh', 'api', 'graphql',
      '-f', 'query=query{x}',
      '-f', `status=${HOSTILE}`,
      '-F', 'n=5',
    ]);
  });
});

describe('the repository API hands the builders\' argv to the executor unchanged', () => {
  interface Call { argv: readonly string[]; input?: string }

  function makeApi(): { api: ReturnType<typeof createGhRepoApi>; calls: Call[] } {
    const calls: Call[] = [];
    const exec: ExecFn = (argv, options) => {
      calls.push({ argv, input: options.input });
      return '';
    };
    const api = createGhRepoApi(new GitContext(validOptions(), { exec }));
    return { api, calls };
  }

  it('createPR sends the deckerly#52 title and a hostile label as single arguments, with the body on stdin', () => {
    const { api, calls } = makeApi();

    api.createPR(TITLE_52, BODY, 'feature-issue-52-x', 'dev', [HOSTILE]);

    expect(calls).toEqual([{
      argv: [
        'gh', 'pr', 'create', '--repo', 'acme/widget',
        '--title', TITLE_52,
        '--head', 'feature-issue-52-x',
        '--body-file', '-',
        '--base', 'dev',
        '--label', HOSTILE,
      ],
      input: BODY,
    }]);
  });

  it('createIssue sends the title as one argument and the body only on stdin', () => {
    const { api, calls } = makeApi();

    api.createIssue(HOSTILE, BODY);

    expect(calls).toEqual([{
      argv: ['gh', 'issue', 'create', '--repo', 'acme/widget', '--title', HOSTILE, '--body-file', '-'],
      input: BODY,
    }]);
  });

  it('addIssueLabel and applyLabel send the label name as one argument', () => {
    const { api, calls } = makeApi();

    api.addIssueLabel(42, HOSTILE);
    api.applyLabel(42, HOSTILE);

    const expected = ['gh', 'issue', 'edit', '42', '--repo', 'acme/widget', '--add-label', HOSTILE];
    expect(calls.map((c) => c.argv)).toEqual([expected, expected]);
  });

  it('createLabel sends the name and the description as single arguments', () => {
    const { api, calls } = makeApi();

    api.createLabel(HOSTILE, 'ff0000', HOSTILE);

    expect(calls.map((c) => c.argv)).toEqual([[
      'gh', 'label', 'create', HOSTILE,
      '--repo', 'acme/widget',
      '--color', 'ff0000',
      '--description', HOSTILE,
      '--force',
    ]]);
  });

  it('listOpenIssues sends the search query as one argument', () => {
    const { api, calls } = makeApi();

    api.listOpenIssues({ fields: ['number'], search: HOSTILE });

    expect(calls.map((c) => c.argv)).toEqual([[
      'gh', 'issue', 'list', '--repo', 'acme/widget',
      '--state', 'open',
      '--json', 'number',
      '--search', HOSTILE,
    ]]);
  });

  it('runGraphQL sends a hostile string variable as one -f argument', () => {
    const { api, calls } = makeApi();

    api.runGraphQL('query{x}', { status: HOSTILE, n: 5 });

    expect(calls.map((c) => c.argv)).toEqual([[
      'gh', 'api', 'graphql',
      '-f', 'query=query{x}',
      '-f', `status=${HOSTILE}`,
      '-F', 'n=5',
    ]]);
  });
});
