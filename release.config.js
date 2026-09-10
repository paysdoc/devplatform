/**
 * semantic-release configuration.
 *
 * This repository's commits are produced by ADW agents and carry an agent
 * name before the conventional type, e.g. `build-agent: feat: add X` or
 * `plan-orchestrator: chore: expand README`. The stock conventional-commits
 * header pattern does not match that prefix, so every agent commit would
 * parse as `type: null` and never trigger a release. `parserOpts` below
 * extends the standard pattern with an optional `<agent-name>: ` prefix.
 *
 * The prefix is constrained to a hyphenated lowercase token
 * (`[a-z0-9]+(?:-[a-z0-9]+)+`) so it can never swallow a bare conventional
 * type (`feat`, `fix`, `chore`, ... contain no hyphen) — a header like
 * `feat: fix: something` still parses as type `feat`, not agent `feat`.
 * The prefix is a non-capturing group, so `headerCorrespondence` stays
 * identical to the `conventionalcommits` preset's and no downstream plugin
 * needs to know agents exist.
 */
const parserOpts = {
  headerPattern: /^(?:[a-z0-9]+(?:-[a-z0-9]+)+: )?(\w*)(?:\((.*)\))?!?: (.*)$/,
  breakingHeaderPattern: /^(?:[a-z0-9]+(?:-[a-z0-9]+)+: )?(\w*)(?:\((.*)\))?!: (.*)$/,
  headerCorrespondence: ['type', 'scope', 'subject'],
};

const isDryRun = process.env.SEMANTIC_RELEASE_DRY_RUN === 'true';

const plugins = [
  ['@semantic-release/commit-analyzer', { preset: 'conventionalcommits', parserOpts }],
  ['@semantic-release/release-notes-generator', { preset: 'conventionalcommits', parserOpts }],
];

if (!isDryRun) {
  plugins.push(
    ['@semantic-release/npm', {}],
    ['@semantic-release/github', { successComment: false, failComment: false }],
  );
}

export default {
  branches: ['main'],
  tagFormat: 'v${version}',
  plugins,
};
