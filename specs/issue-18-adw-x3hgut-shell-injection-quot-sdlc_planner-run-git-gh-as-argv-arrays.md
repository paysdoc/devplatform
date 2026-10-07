# Bug: Shell injection and quoting failures — git and gh commands are built as shell strings and run through `/bin/sh -c`

## Metadata
issueNumber: `18`
adwId: `x3hgut-shell-injection-quot`
issueJson: `{"number":18,"title":"Shell injection / quoting bugs: run git and gh commands as argv arrays, not shell strings","body":"## Problem\n\nEvery git and gh command in this package is built as one string and run through `/bin/sh -c` (`execSync` in `src/git/gitContext.ts`, the package's only spawn site). Values come from issue titles, LLM output, label names and file paths, and they go into that string with partial quoting or none at all. Any of those values can break the command or run code inside it.\n\n### Seen in production\n\nvestmatic/deckerly#52, titled *\"Brand colour selection of deckerly's own: black and white is a brand\"*. `createPRCmd` wrapped the title in single quotes, so the apostrophe ended the quoted string early:\n\n```\ngh pr create --repo vestmatic/deckerly --title 'feat: #52 - Brand colour selection of deckerly's own: ...' --head \"...\" --body-file - --base dev\n/bin/sh: -c: line 0: unexpected EOF while looking for matching `''\n```\n\nADW resumed after each failure, re-ran the full review and failed again. That happened about 25 times over 6 hours before someone killed it by hand.\n\n### Worse: command substitution in commit messages\n\n`commitOps` and `claimOps` escape only `\"`:\n\n```ts\nrun(`git commit -m \"${message.replace(/\"/g, '\\\\\"')}\"`, cwd);\n```\n\nInside double quotes the shell still expands `` ` ``, `$(...)`, `$VAR` and `\\`. Commit messages contain issue titles. A title like ``Fix `foo` crash`` would run `foo`. A title containing `$(curl … | sh)` would execute it on the ADW host. Issue titles are input from outside, so this is a shell injection hole, not just a reliability bug.\n\n## Fix\n\nStop going through the shell. Change the runner to take `(file, args[])` and spawn it with `execFileSync`/`spawnSync`, passing stdin as `input`, the way `appAuth.ts` already does for `curl`. Command builders return `string[]` (or `{ file, args }`) instead of a string. Each array element reaches the program as exactly one `argv` entry, so quoting and escaping stop mattering.\n\n```ts\nexport function createPRCmd(owner, repo, title, headBranch, baseBranch?, labels?): string[] {\n  return [\n    'gh', 'pr', 'create', '--repo', `${owner}/${repo}`,\n    '--title', title, '--head', headBranch, '--body-file', '-',\n    ...(baseBranch ? ['--base', baseBranch] : []),\n    ...(labels ?? []).flatMap(l => ['--label', l]),\n  ];\n}\n```\n\nAvoid the \"just escape `'` as `'\\''`\" patch. It fixes one call site, but the same mistake stays easy to repeat everywhere else.\n\n## Affected call sites\n\n### Must fix: free text from issues, LLM output or users\n\n| File | Function / line | Value | Current quoting | Failure |\n|---|---|---|---|---|\n| `providers/github/commands/prCommands.ts` | `createPRCmd` | `title`, `labels[]` | `'…'` | `'` breaks it (#52) |\n| `providers/github/commands/issueCommands.ts` | `createIssueCmd` | `title` | `'…'` | `'` breaks it |\n| `providers/github/commands/issueCommands.ts` | `addIssueLabelCmd` | `labelName` | **none** | a space or shell metacharacter splits or executes |\n| `providers/github/commands/issueCommands.ts` | `listOpenIssuesCmd` | `opts.search` | `\"…\"` | `$`, `` ` `` and `\"` are expanded or break it |\n| `providers/github/commands/labelCommands.ts` | `createLabelCmd` | `name`, `description` | `'…'` | `'` breaks it |\n| `providers/github/commands/labelCommands.ts` | `applyLabelCmd` | `labelName` | `'…'` | `'` breaks it |\n| `providers/github/commands/boardCommands.ts` | `graphQLCmd` | string `variables` values | `'…'` | `'` breaks it (status names, etc.) |\n| `git/commitOps.ts` | all 3 `git commit -m` calls | `message` | `\"…\"` escaping only `\"` | **command substitution** |\n| `git/claimOps.ts` | `git commit --allow-empty -m` | `message` | `\"…\"` escaping only `\"` | **command substitution** |\n\n### Should fix: paths and refs (usually ADW-generated, but nothing enforces it)\n\n| File | Value | Current quoting | Failure |\n|---|---|---|---|\n| `git/commitOps.ts` | `paths` / `excludePaths` (`check-ignore`, `add`, `rm`, `status`, pathspec) | `'…'` | a path containing `'` breaks it |\n| `git/gitReadOps.ts` | `ref`, `filePath` (`git show`), `range` (`git diff`) | `\"…\"` / **none** | `$` or a space in a path |\n| `git/worktreeCreateOps.ts`, `worktreeRemoveOps.ts`, `worktreeResetOps.ts`, `branchOps.ts`, `remoteOps.ts`, `claimOps.ts` | `branchName`, `baseBranch`, `worktreePath` | `\"…\"` | safe only while branch names stay slugified |\n| `git/repoWorkspace.ts` | `cloneUrl`, `workspacePath` | `\"…\"` | same |\n| `git/processCleanup.ts` | `directoryPath` (`lsof +D`) | `\"…\"` | same |\n\n### Fine as they are\n\nBuilders that take only numbers, `owner/repo` or constant strings (`fetchIssueCmd`, `mergePRCmd`, `fetchPRReviewsCmd`, `gh api repos/...`, the fixed GraphQL query constants, etc.). Converting them anyway keeps one runner signature, but they aren't a risk.\n\n`providers/gitlab/*` uses the HTTP API client, not shell strings, so it isn't affected.\n\n## Acceptance criteria\n\n- [ ] The `GitContext` runner spawns `(file, args)` without a shell; no `execSync(string)` remains in `src/` (`ghAuthToken.ts`'s constant `gh auth token` can stay or move over).\n- [ ] Every builder in the \"Must fix\" table returns an argv array; commit ops pass `-m`, `message` as separate elements.\n- [ ] A regression test drives `createPRCmd`, `createIssueCmd`, the label builders and a commit with values containing `'`, `\"`, `` ` ``, `$(echo pwned)`, `\\` and a newline, and asserts the exact argv reaches the stand-in runner unchanged.\n- [ ] The `checkGitGhGuard`-style lint (or a new one) fails on template-literal commands passed to the runner, so the pattern can't come back.\n- [ ] Release as a minor/major (the runner signature is a breaking change for consumers that inject their own runner, e.g. ADW's regression steps and `test/mocks/ghShadowWrites.ts`).\n\n## Follow-up in ADW (separate issue)\n\n- Bump `@paysdoc/devplatform` and update the gh shadow mocks to parse argv arrays.\n- Add a retry cap: the same `ADW Workflow Error` repeated N times should escalate to `hitl`/Blocked instead of resuming forever.\n- A resume after a PR-creation failure should retry PR creation, not re-run review.\n\n\n## Blocked by\n\n- #19\n","state":"OPEN","author":"paysdoc","labels":["adw:bug"],"createdAt":"2026-10-07T20:11:25Z","comments":[],"actionableComment":null}`

## Bug Description

Every git and gh command this package issues is assembled as one string and handed to
`child_process.execSync`, which always runs it as `/bin/sh -c <string>`. Untrusted values (issue
titles, LLM-written commit messages and PR titles, label names, search queries, branch names,
paths) are spliced into that string with ad-hoc quoting, so the shell parses them as **code**, not
data.

**Symptom 1: a quoting failure that took down a workflow.** vestmatic/deckerly#52 is titled
*"Brand colour selection of deckerly's own: black and white is a brand"*. `createPRCmd` wraps the
title in single quotes, the apostrophe closes the quoted string early, and `/bin/sh` aborts with
`unexpected EOF while looking for matching '`. ADW resumed and failed about 25 times in 6 hours.

**Symptom 2: remote code execution from an issue title.** `commitOps` (3 call sites) and
`claimOps` wrap the commit message in double quotes and escape only `"`. Inside double quotes the
shell still expands `` `…` ``, `$(…)`, `$VAR` and `\`, so a title like ``Fix `foo` crash`` runs
`foo` and `$(curl … | sh)` runs on the ADW host.

**Expected:** every value reaches `git`/`gh` as exactly one argv entry, byte-for-byte, whatever
characters it contains. No shell is involved, so quoting and escaping stop mattering.

**Actual:** values reach the program only after shell parsing. Depending on the call site that
means a syntax error, word-splitting, glob expansion or command execution.

## Problem Statement

1. **The executor contract is a shell string at every layer.** `ExecFn`
   (`src/git/types.ts:17`), `GitContext.exec(command: string, …)` (`src/git/gitContext.ts:226`),
   the private `#run` (`gitContext.ts:249`), every op module's
   `Runner = (command: string, cwd: string) => string`, `GhCommandRunner.run(command: string)`
   (`src/providers/github/ghCommandRunner.ts:16`), `WorkspaceExecFn`
   (`src/git/repoWorkspace.ts:30`) and `GitConfigIdentityDeps.exec`
   (`src/git/bootstrapIdentity.ts:25`) all take a command *string*. The real spawn behind each is
   `execSync(string)`, which means `/bin/sh -c`.
2. **Builders and call sites quote untrusted values inconsistently:** single quotes, double
   quotes that escape only `"`, double quotes with no escaping, or no quoting. Every style is
   breakable or injectable.
3. **Nothing stops the pattern from coming back.** The `git-gh-shellout` guard
   (`scripts/checkGitGhGuard.ts`) checks every directory *except* `src/git` and
   `src/providers/github`, the only two packages that build these strings. Unit tests also pin the
   broken escaping as the contract (`commitOps.test.ts` "escapes double quotes in the commit
   message" ×2, `claimOps.test.ts:69-72`).
4. **Four more shell spawn sites exist** besides `GitContext`: `repoWorkspace.ts` (`git clone`,
   `git fetch`), `processCleanup.ts` (`lsof +D "<dir>"`, `sleep`), `bootstrapIdentity.ts` (three
   git reads) and `ghAuthToken.ts` (`gh auth token`). The acceptance criterion is that no
   `execSync(string)` remains in `src/`.

## Solution Statement

Represent a command as an **argv array** everywhere: a `readonly string[]` whose element 0 is the
program and whose later elements are its arguments. Spawn it with
`execFileSync(argv[0], argv.slice(1), …)`, which uses no shell. This is the issue's `(file, args[])`
spawn, and the builders return `string[]` exactly as in the issue's `createPRCmd` example. One
array then flows unchanged from builder → runner → `ExecFn` → `execFileSync`.

- **Core seam:** `ExecFn = (argv: readonly string[], options) => string`; `GitContext.exec(argv,
  options)`; `#run(argv, opts)`. The default `ExecFn` becomes a thin `execFileSync` wrapper with the
  same `encoding`, `maxBuffer`, `stdio` and `input` handling as today. `exec()` rejects a non-array,
  empty or blank-program argv with a `GitContext:`-prefixed error. It renders
  `argv.join(' ')` only for the existing missing-cwd diagnostic, never for execution.
- **Every git call site** in `src/git/*Ops.ts` and `gitContext.ts` builds an argv array, one value
  per element. All quote characters and the `message.replace(/"/g, '\\"')` escaping disappear.
  Commit ops pass `'-m', message` as two elements.
- **Every gh builder** in `src/providers/github/commands/*.ts` returns `string[]`. The two inline
  commands in `ghRepoApi.ts` become arrays and `GhCommandRunner.run` takes argv. Numbers are
  `String(n)`-ed. GraphQL variables become `-f key=value` / `-F key=value` element pairs, and the
  four fixed-query builders delegate to `graphQLCmd`.
- **The other spawn sites** (`repoWorkspace.ts`, `processCleanup.ts`, `bootstrapIdentity.ts`,
  `ghAuthToken.ts`) switch to `execFileSync`. Their injectable seams (`WorkspaceExecFn`,
  `GitConfigIdentityDeps.exec`) take argv too, so no shell string survives in production `src/`.
- **Guard (prevents regression):**
  - Add a third rule, `shell-command-string`, applied **inside** the two exempt packages. It flags
    any string or template literal that spells a whole `git …`/`gh …` command line
    (`/^(git|gh)\s/`), whether it is a call argument, a builder's return value or an array
    element. The bare program name `'git'`/`'gh'` (argv[0]) never matches.
  - Extend `git-gh-shellout` so it also recognises an argv array literal (`['git', …]`) as a
    call's first argument. Without this, the existing rule would stop seeing `ctx.exec(['gh', …])`
    outside the exempt packages once `exec` takes an array.
- **Regression tests** cover four things:
  - Hostile-value argv tests (`'`, `"`, `` ` ``, `$(echo pwned)`, `\`, newline) through stand-in
    runners for `createPRCmd`, `createIssueCmd`, the label builders, `listOpenIssuesCmd`,
    `graphQLCmd` and every commit op.
  - Two real-spawn tests:
    - A real `git commit` through `GitContext` with `` `touch …` `` and `$(touch …)` in the message
      runs nothing and records the message verbatim.
    - A real `printf` through the default executor echoes a hostile argument back unchanged.
  - Guard tests for both rule changes.
  - The `@adw-18` BDD scenarios in `features/per-issue/feature-18.feature`. They prove the same
    guarantees through the public entry points:
    - The GitHub code host, issue tracker and repository API hand `gh` each hostile value as
      exactly one argument, with the body on stdin.
    - A stub `gh` on `PATH` receives the deckerly#52 title verbatim through the default executor.
    - Real git commits, shows, worktrees and clones keep hostile messages, paths and branch names
      intact.
    - The guard fails a template-literal command handed to a runner.
    - The emitted `.d.ts` accepts an argv runner and rejects a command-string runner.
- Update the existing unit tests and the BDD support layer to argv. Mark the change as breaking so
  semantic-release computes **2.0.0**.

## Steps to Reproduce

1. **The #52 quoting failure.** `src/providers/github/commands/prCommands.ts:47-54` shows that
   `createPRCmd` emits `--title '${title}'`. Ask the shell to *parse only* (`-n`: nothing runs)
   the exact string it builds for the deckerly title:
   `sh -n -c "gh pr create --repo vestmatic/deckerly --title 'feat: #52 - Brand colour selection of deckerly's own: black and white is a brand' --head \"feature-issue-52-brand-colour\" --body-file - --base dev"`
   → `sh: -c: line 0: unexpected EOF while looking for matching `''` (non-zero exit).
2. **Command substitution survives the commit-message quoting.**
   `src/git/commitOps.ts:74,90,106` and `src/git/claimOps.ts:28` use `"…"` and escape only `"`.
   The same wrapping run through the shell with harmless payloads:
   `sh -c "echo \"Fix \`echo INJECTED\` and \$(echo ALSO-INJECTED) crash\""`
   → prints `Fix INJECTED and ALSO-INJECTED crash`. Both payloads executed.
3. **End to end through the library (the RED regression test, written first in Task 1).** In a
   throwaway repository, build a `GitContext` with no injected `exec` (the real default executor),
   dirty the tree, and call the unchanged public method
   `ctx.commitChanges('Fix `touch pwned-backtick` and $(touch pwned-subst) in deckerly\'s "brand" \\ colours\nsecond line', repo)`.
   On the current code, files `pwned-backtick` and `pwned-subst` appear in the repository and
   `git log -1 --format=%B` shows a mangled message. After the fix, neither file exists and the
   recorded message equals the input byte-for-byte. Run with
   `bun run test:unit src/git/__tests__/shellInjection.test.ts`.
4. **Builder level.** `createPRCmd('vestmatic', 'deckerly', "feat: #52 - … deckerly's own: …", 'feature-issue-52-x', 'dev')`
   returns a string with an unbalanced `'` today. After the fix it returns the exact argv array
   asserted in `src/providers/github/__tests__/shellInjection.test.ts`.

## Root Cause Analysis

- **The spawn primitive is a shell.** `defaultExec` (`src/git/gitContext.ts:67-79`) calls
  `execSync(command, …)`, and Node's `execSync` always runs the string through `/bin/sh -c`. Every
  character of every interpolated value is therefore shell source.
- **The string contract runs through every layer**, so no single call site could opt out:
  `ExecFn` (`types.ts:17`) → `GitContext.exec` (`gitContext.ts:226`) → `#run` (`:249`) → op-module
  `Runner`s → builders that return `string` → `GhCommandRunner.run` (`ghCommandRunner.ts:16-26`).
- **The quoting at each site is broken in one of four ways:**
  - **Single quotes:** `createPRCmd` (`prCommands.ts:53` title, `:49` labels), `createIssueCmd`
    (`issueCommands.ts:57`), `createLabelCmd`/`applyLabelCmd` (`labelCommands.ts:4,8`),
    `graphQLCmd` (`boardCommands.ts:20,24`), and the commitOps path tokens
    (`commitOps.ts:35,47,86,102`). A `'` in the value closes the quote (#52); a crafted value such
    as `x' ; touch pwned ; echo '` executes.
  - **Double quotes escaping only `"`:** `commitOps.ts:74,90,106` and `claimOps.ts:28`. Backticks,
    `$(…)`, `$VAR` and `\` stay live, which is command substitution (RCE).
  - **Double quotes with no escaping:** `listOpenIssuesCmd --search` (`issueCommands.ts:15`),
    `findPRByBranchCmd --head` (`prCommands.ts:4`), and every branch, ref and path in the git op
    modules, `repoWorkspace.ts:86` and `processCleanup.ts:11`.
  - **No quoting:** `addIssueLabelCmd` (`issueCommands.ts:53`), `createPRCmd --base`
    (`prCommands.ts:48`), `gitReadOps.diff` (`gitReadOps.ts:21`) and the `logSince` pathspec
    (`gitReadOps.ts:48`). The pathspec is also glob-expanded by `/bin/sh` against the working tree
    before git sees it.
- **No command needs a shell.** Every command is a single program invocation: no pipes,
  redirection, `&&`, or deliberate expansion. stdin already travels through `input`. The quotes
  exist only to survive the shell, so argv spawning is a drop-in replacement. `appAuth.ts:183-188`
  (`execFileSync('curl', args, { input })`) and `gitlabApiClient.ts` (`spawnSync('curl', args)`)
  already use this pattern.
- **Why it shipped:** the only guard against git/gh shell strings deliberately exempts the two
  packages that build them (`checkGitGhGuard.ts:161`), and the unit tests assert the `\"`
  escaping as correct behaviour.

## Relevant Files
Use these files to fix the bug:

**Core executor contract (the root cause)**
- `src/git/types.ts`: `ExecFn` (line 17) and its doc (lines 10-16) become argv. Update the
  `ExecOptions` doc (lines 37-44) that justifies `command` being the first positional parameter.
- `src/git/gitContext.ts`:
  - `import { execSync }` (line 47) and `defaultExec` (lines 67-79) become `execFileSync`.
  - `exec()` (lines 226-239) takes argv, with validation and `argv.join(' ')` for the diagnostic.
  - `#run()` (lines 249-255) takes argv.
  - `remoteUrl`/`remotes`/`gitConfigUser` (lines 421-441) use inline git commands.
  - The module docblock (lines 9-25) and the `exec()` docblock (lines 201-225) mention "command
    string" and the guard's first-argument contract.
- `src/git/workingDirectoryGuard.ts`: the docblock (lines 5-10) says the missing-cwd ENOENT is
  raised "on the shell binary itself" (`spawnSync /bin/sh ENOENT`). After the fix it is raised on
  the spawned program. The logic is unchanged: `WorkingDirectoryContext.command` stays a display
  string.

**Git op modules (every `run(\`git …\`)` call site; each declares its own `Runner` alias)**
- `src/git/commitOps.ts`: the 3 `git commit -m` sites, `pathspecSuffix`, `gitignoredSubset`,
  `removeAndCommitPaths`/`addAndCommitPaths` path tokens, `pushBranch`, `getHeadTreeHash` and
  `hasUncommittedChanges`. The docblock (lines 1-7) describes a `(command, cwd)` runner. Exported
  from `./git`.
- `src/git/claimOps.ts`: `commitAllowEmpty` (line 28) plus `addDetachedWorktree`,
  `pushHeadToBranch` and `removeDetachedWorktree`. Exported from `./git`.
- `src/git/branchOps.ts`: 6 commands, and the docblock's `(cmd, cwd)` runner. Exported from
  `./git`.
- `src/git/remoteOps.ts`: `fetchRemote`, `mergeBranch` (its flags join), `abortMerge`, `lsRemote`.
- `src/git/gitReadOps.ts`: `lsFiles`, `headShort`, `diff` (unquoted `range`), `log`
  (`--format="%aI %s"`), `show` (`ref:filePath`), `logSince` (quoted `--since`/`--grep`, unquoted
  pathspec).
- `src/git/worktreeCreateOps.ts`, `src/git/worktreeRemoveOps.ts`, `src/git/worktreeResetOps.ts`,
  `src/git/worktreeQueryOps.ts` (its `Runner` is `export`ed, line 8), `src/git/worktreeProbeOps.ts`:
  branch, ref and worktree-path commands.

**Other `execSync` spawn sites in `src/`**
- `src/git/repoWorkspace.ts`: `WorkspaceExecFn` (line 30), the default execs (lines 81, 115),
  `git clone "${cloneUrl}" "${workspacePath}"` (line 86) and `git fetch origin` (line 121).
  Exported from `./git`.
- `src/git/processCleanup.ts`: `lsof +D "${directoryPath}" -t` (line 11) and `sleep 0.5`
  (line 23).
- `src/git/bootstrapIdentity.ts`:
  - `readOriginRemoteUrl` (line 39) and `readCurrentBranch` (line 48).
  - `GitConfigIdentityDeps.exec` (line 25) and the `readGitConfigIdentity` default and calls
    (lines 79-82).
  - The seam type flows into `BootstrapIdentityDeps` (`src/providers/github/githubIdentity.ts:22`),
    `createForgeCredentials`' `exec` deps (`src/providers/forgeCredentials.ts:56,66,87,111`) and
    `resolveGitLabBootstrapGitIdentity` (`src/providers/gitlab/gitlabIdentity.ts:36-39`). Those
    files need no source change: the type is derived.
- `src/providers/github/ghAuthToken.ts`: `execSync('gh auth token')` (line 32). Move it to
  `execFileSync('gh', ['auth', 'token'])` so the new guard rule and the "no `execSync`" check hold
  with no exception.

**GitHub adapter (every gh command)**
- `src/providers/github/ghCommandRunner.ts`: `GhCommandRunner.run` (line 16) takes argv. Update
  the docblock ("identity in the command string").
- `src/providers/github/commands/prCommands.ts`: all 13 builders, including `createPRCmd`
  (lines 47-54). Keep its `--head` comment.
- `src/providers/github/commands/issueCommands.ts`: all 14 builders, including `createIssueCmd`,
  `addIssueLabelCmd`, `listOpenIssuesCmd` and `issueCommentsCmd` (`--jq '.comments'`).
- `src/providers/github/commands/labelCommands.ts`: `createLabelCmd`, `applyLabelCmd`.
- `src/providers/github/commands/secretCommands.ts`: `setSecretCmd`.
- `src/providers/github/commands/boardCommands.ts`: `graphQLInputCmd`, `graphQLCmd`
  (lines 17-25), `projectQueryCmd`/`itemQueryCmd`/`fieldQueryCmd`/`moveStatusCmd`
  (lines 27-41). The parsers are unchanged.
- `src/providers/github/ghRepoApi.ts`: the inline `defaultBranch` (line 93) and
  `authenticatedUser` (line 95) commands. Everything else passes builder output through unchanged.
- `src/providers/github/ghIssueApi.ts`, `src/providers/github/ghPrApi.ts`,
  `src/providers/github/githubBoardManager.ts`: read-only context. They pass builder output
  straight to `run`/`this.gh.run` and compile unchanged once the types flip.
- `src/providers/github/appAuth.ts` and `src/providers/gitlab/gitlabApiClient.ts`: read-only
  reference for the target pattern (`execFileSync`/`spawnSync` with an argv array and `input`).

**Guard (regression barrier)**
- `scripts/checkGitGhGuard.ts`: `scanSource` (lines 155-166), `extractGitGhCommand`
  (lines 181-188), `main()` PASS/remedy lines (lines 194-223), and the docblock "Two independent
  rules" (lines 1-38).
- `scripts/guard/violationTypes.ts`: the `ViolationRule` union (line 17) and its docblock.
- `scripts/guard/constructionRule.ts`: read-only module-shape reference for the new rule module.
- `scripts/__tests__/checkGitGhGuard.test.ts`: the AC1 per-rule-exemption test (lines 80-92)
  changes meaning. New cases go here.

**Existing unit tests that assert or parse command strings (must move to argv)**
- `src/git/__tests__/commitOps.test.ts`, `claimOps.test.ts`, `remoteOps.test.ts`,
  `gitReadOps.test.ts`, `gitContext.test.ts`, `gitContextOperations.test.ts`,
  `repoApiCwd.test.ts`, `workingDirectoryGuard.test.ts`, `worktreeLogger.test.ts`,
  `repoWorkspace.test.ts`, `bootstrapIdentity.test.ts`.
- `src/providers/github/__tests__/gitContextFixture.ts` (the shared spy), `ghCommandRunner.test.ts`,
  `ghRepoApi.test.ts`, `ghRepoApiCwd.test.ts`, `githubIssueTracker.test.ts`,
  `githubCodeHost.test.ts`, `githubBoardManager.test.ts`, `githubIssueTrackerLabelPolicy.test.ts`,
  `githubIdentity.test.ts`, and `src/providers/github/commands/__tests__/issueCommands.test.ts`.
- `src/providers/__tests__/forgeProvidersFixture.ts`, `forgeProviders.test.ts`,
  `forgeProviders.deps.test.ts`, `boardManager.test.ts`, `forgeCredentials.test.ts`, and
  `src/providers/gitlab/__tests__/gitlabIdentity.test.ts`.

**BDD support and steps (type-checked by `bun run typecheck`; `features/**` is in `tsconfig.json`)**
- `features/support/world.ts`: the `ExecStub` type (line 19), `execRecorderCalls` (line 138) and
  `runner` (line 147). The recorder must also capture `input`, because feature-18 asserts what
  each `gh pr create`/`gh issue create` received on standard input.
- `features/support/gitFixture.ts`: `makeGitRunner` (an `execSync(command)` runner passed straight
  into `commitOps`/`branchOps`) and the fixture repository commands.
- `features/support/ghCliFake.ts`: dispatches on `command.startsWith('gh issue view ')` and parses
  `--json` by regex.
- `features/support/stubGh.ts`: the comment says `ghAuthToken` "spawns `gh auth token` through the
  shell". It also needs a recording stub for feature-18's real-spawn pull request scenario.
- `features/step_definitions/gitOps.steps.ts`: the `Runner` type and every fixture `this.runner(…)`
  command string.
- `features/step_definitions/ghRepoApi.steps.ts`: the recorder records `command` and the Then step
  checks `call.command.includes(named)`. Feature-18's first rule reuses its two Given steps and
  its "composed through the providers entry point" When step.
- `features/step_definitions/forgeCredentials.steps.ts`: the `execStub = (cmd: string) => …`
  git-config stubs (lines 134-147).
- `features/step_definitions/forgeMetadataGitHub.steps.ts`,
  `features/step_definitions/githubIdentityAndAppConfig.steps.ts`: type flow only (`ExecFn` from
  `createGhCliFake`; `exec?: unknown`). Change only if typecheck demands it.
- `features/support/packagedConsumer.ts` (`typeCheckInConsumer`) and
  `features/step_definitions/packagedConsumer.steps.ts` (`Then the subprocess exits {int}`, which
  reads `world.subprocess`): read-only. Feature-18's guard and `@packaging` steps reuse both.
- `features/per-issue/feature-18.feature`: read-only. These are the `@adw-18` scenarios this change
  must turn green (see Task 8).
- `features/per-issue/feature-9.feature`, `feature-11.feature`, `feature-16.feature`: read-only.
  The scenario phase tagged some of their scenarios `@adw-18` as regression coverage for the
  reworked support layer. They must stay green unchanged:
  - the git-config stubs (feature-9's GitLab fallbacks, feature-11's bootstrap-identity fallbacks);
  - the stub-`gh` `ghAuthToken` reads and the `createGhRepoApi` recorder (feature-11);
  - the real-repository commitOps/branchOps runner (feature-11);
  - the CLI fake (feature-16).

**Documentation (conditional-docs owners of the touched paths)**
- `app_docs/git-worktree-core.md`: owns `src/git/**`. Lines 10, 30, 32 and 40 describe
  `exec(command, options)`, the first-positional `command` and the `(command, cwd) => string`
  runner.
- `app_docs/github-provider.md`: owns `src/providers/github/**`. Lines 9-10 (command strings),
  20 (`ghAuthToken()` "still spawns `gh` through the shell"), 21, 45 ("build shell command
  *strings*, not argv arrays") and 51.
- `app_docs/git-gh-guard.md`: owns `scripts/checkGitGhGuard.ts` and `scripts/guard/**`. Overview
  ("either of two independent violations"), Responsibilities, Contracts, and the `main()`
  PASS-line description.
- `app_docs/bdd-scenarios.md`: owns `features/**`. Line 54 describes gitFixture's
  `(command, cwd) => string` runner.
- `app_docs/feature-9xqejz-release-automation.md` and `release.config.js`: read-only. They confirm
  that `<agent>: fix!: …` (or a `BREAKING CHANGE:` footer) computes a major release.

### New Files
- `src/git/__tests__/shellInjection.test.ts`: the git-side regression suite. It covers the
  hostile-message and hostile-path argv tests for `commitOps`/`claimOps` through a stand-in
  runner, the `GitContext` + spy `ExecFn` pass-through, a real `git commit` through the default
  executor, and a real `printf` argv round-trip.
- `src/providers/github/__tests__/shellInjection.test.ts`: the gh-side regression suite. It covers
  the exact argv returned by `createPRCmd`, `createIssueCmd`, `addIssueLabelCmd`,
  `createLabelCmd`, `applyLabelCmd`, `listOpenIssuesCmd` and `graphQLCmd` for hostile values, plus
  the same operations driven through `createGhRepoApi` over a `GitContext` with a spy `ExecFn`.
- `scripts/guard/shellCommandStringRule.ts`: the new `shell-command-string` guard rule module,
  shaped like `constructionRule.ts`.
- `features/step_definitions/argvCommands.steps.ts`: the step definitions for
  `features/per-issue/feature-18.feature` (see Task 8).

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### 1. Write the regression tests first (RED)
- Create `src/git/__tests__/shellInjection.test.ts` with a shared hostile constant containing all
  six characters the issue names, e.g.
  ``const HOSTILE = `it's "quoted" \`echo pwned\` $(echo pwned) back\\slash\nsecond line`;``
  and a hostile path such as `` `docs/it's "odd" $(echo pwned).md` ``.
  - Stand-in runner tests. Use a recording `(argv, cwd) => string` runner that answers non-empty
    for `git status`.
    - `commitOps.commitChanges(run, HOSTILE, CWD)` issues exactly `['git', 'commit', '-m', HOSTILE]`.
    - `commitOps.removeAndCommitPaths(run, [HOSTILE_PATH], HOSTILE, CWD)` issues
      `['git', 'rm', '-f', '--ignore-unmatch', '--', HOSTILE_PATH]` and
      `['git', 'commit', '-m', HOSTILE, '--', HOSTILE_PATH]`.
    - `commitOps.addAndCommitPaths` issues `['git', 'add', '--', HOSTILE_PATH]` and the scoped
      commit.
    - `commitChanges(run, 'm', CWD, { excludePaths: [HOSTILE_PATH] })` issues
      `['git', 'check-ignore', HOSTILE_PATH]` and
      `['git', 'add', '-A', '--', '.', \`:(exclude)${HOSTILE_PATH}\`]`.
    - `claimOps.commitAllowEmpty(run, HOSTILE, CWD)` issues
      `['git', 'commit', '--allow-empty', '-m', HOSTILE]`.
  - `GitContext` pass-through. Build a `GitContext` with a spy `ExecFn` (`createLiteralTokenProvider`).
    `ctx.commitChanges(HOSTILE, wt)` must hand the spy exactly `['git', 'commit', '-m', HOSTILE]`,
    proving the argv reaches the stand-in runner unchanged through `#run` and `exec()`.
  - Real `git commit`, no shell. Steps:
    1. Create a temp repo with `fs.mkdtempSync` and
       `execFileSync('git', ['init', '-q', '-b', 'main'], { cwd })`, then write a file.
    2. Construct `GitContext` **without** `exec` (`selfHost: true`, `frameworkRepoRoot: repo`). Use
       a test `TokenProvider` whose overlay is
       `{ GH_TOKEN: 'unused', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' }` so the
       developer's global git config (gpgsign, hooks) cannot interfere.
    3. Call
       `ctx.commitChanges('Fix \`touch pwned-backtick\` and $(touch pwned-subst) in deckerly\'s "brand" \\ colours\nsecond line', repo)`.
    4. Assert both `pwned-*` files do not exist, and that
       `execFileSync('git', ['log', '-1', '--format=%B'], …).trimEnd()` equals the message.
    5. Remove the temp dir in `afterEach`.

    This test uses only the unchanged public `commitChanges` signature, so it compiles and fails on
    the current code. It is the before/after reproduction.
  - Real argv round-trip through the default executor:
    `ctx.exec(['printf', '%s', HOSTILE], { cwd: { kind: 'workspace' }, env: {} })` returns
    `HOSTILE` unchanged, and `ctx.exec(['printf', '%s|%s', 'a b', "c'd"], …)` returns `a b|c'd`
    (the elements stay separate).
- Create `src/providers/github/__tests__/shellInjection.test.ts`. Use the #52 title
  `"feat: #52 - Brand colour selection of deckerly's own: black and white is a brand"` plus
  `HOSTILE`. Assert with `toEqual` on full arrays:
  - `createPRCmd('vestmatic', 'deckerly', TITLE_52, 'feature-issue-52-x', 'dev', [HOSTILE])` →
    `['gh', 'pr', 'create', '--repo', 'vestmatic/deckerly', '--title', TITLE_52, '--head', 'feature-issue-52-x', '--body-file', '-', '--base', 'dev', '--label', HOSTILE]`.
  - `createIssueCmd('acme', 'widget', HOSTILE)` →
    `['gh', 'issue', 'create', '--repo', 'acme/widget', '--title', HOSTILE, '--body-file', '-']`.
  - `addIssueLabelCmd('acme', 'widget', 42, HOSTILE)` and `applyLabelCmd(…)` →
    `['gh', 'issue', 'edit', '42', '--repo', 'acme/widget', '--add-label', HOSTILE]`.
  - `createLabelCmd('acme', 'widget', HOSTILE, 'ff0000', HOSTILE)` →
    `['gh', 'label', 'create', HOSTILE, '--repo', 'acme/widget', '--color', 'ff0000', '--description', HOSTILE, '--force']`.
  - `listOpenIssuesCmd('acme', 'widget', { fields: ['number', 'title'], search: HOSTILE, limit: 5 })` →
    `['gh', 'issue', 'list', '--repo', 'acme/widget', '--state', 'open', '--json', 'number,title', '--search', HOSTILE, '--limit', '5']`.
  - `graphQLCmd('query{x}', { status: HOSTILE, n: 5 })` →
    `['gh', 'api', 'graphql', '-f', 'query=query{x}', '-f', \`status=${HOSTILE}\`, '-F', 'n=5']`.
  - Through the stand-in runner (`createGhRepoApi(ctx)` over a `GitContext` with a spy `ExecFn`):
    `createPR(TITLE_52, BODY, head, 'dev', [HOSTILE])`, `createIssue(HOSTILE, BODY)`,
    `addIssueLabel(42, HOSTILE)`, `applyLabel(42, HOSTILE)` and `createLabel(HOSTILE, 'ff0000', HOSTILE)`
    each hand the spy exactly the builder's argv. The body still arrives only as `input`.
- These suites fail now: compile errors on the argv-shaped expectations, plus the real-commit
  test's side-effect assertions. They must pass after Tasks 2-6.

### 2. Flip the core executor contract to argv
- `src/git/types.ts`:
  - Change `ExecFn` to
    `(argv: readonly string[], options: { cwd: string; env: NodeJS.ProcessEnv; input?: string }) => string`.
  - Rewrite its doc to say: element 0 is the program, every later element reaches it as exactly
    one argument, and the default is a thin `execFileSync` wrapper with no shell.
  - Update the `ExecOptions` doc so it says the argv (not `command`) stays the first positional
    parameter of `exec`.
- `src/git/gitContext.ts`:
  - Import `execFileSync` instead of `execSync`. Rewrite `defaultExec` as
    `([file, ...args], options) => execFileSync(file, args, { … })`, keeping both existing
    branches' options exactly: `encoding: 'utf-8'` and `maxBuffer: 10 * 1024 * 1024`, plus
    `input`/`stdio: ['pipe','pipe','pipe']` when input is given. No `as string` cast is needed with
    a string encoding.
  - `exec(argv: readonly string[], options: ExecOptions)`:
    - Throw `GitContext: exec takes an argv array ([program, ...args]), not a command string` when
      `!Array.isArray(argv)`. Untyped or `as never` callers that have not migrated then fail
      clearly instead of spawning a program named `g`.
    - Keep `GitContext: exec command must not be empty` for an empty array or a blank `argv[0]`.
    - Pass `argv` to `#execFn` and `command: argv.join(' ')` to `rewrapMissingWorkingDirectory`.
  - `#run(argv: readonly string[], opts)`. The `(cmd, cwd) => this.#run(cmd, { cwd })` lambdas
    need no change beyond the inferred type (optionally rename `cmd` → `argv`).
  - `remoteUrl` → `['git', 'remote', 'get-url', 'origin']`; `remotes` → `['git', 'remote']`;
    `gitConfigUser` → `['git', 'config', 'user.name']` / `['git', 'config', 'user.email']`.
  - Update the module and `exec()` docblocks:
    - "identity travels in the command string" → "in the argv".
    - The guard paragraph: the argv is the first positional parameter so the guard can read an
      array literal's first element.
- `src/git/workingDirectoryGuard.ts`: update the docblock. A missing cwd now surfaces as an ENOENT
  on the spawned program (e.g. `spawnSync git ENOENT`) rather than on `/bin/sh`. The same code can
  also mean a missing binary, which is why the existing cwd-existence probe decides. No logic
  change.

### 3. Convert the git op modules to argv (one value per element, no quotes, no escaping)
- In every op module change the local alias to
  `type Runner = (argv: readonly string[], cwd: string) => string;`, keeping
  `worktreeQueryOps.ts`'s `export`.
- `src/git/commitOps.ts`:
  - `pathspecSuffix` → `string[]`: `[]`, or `['--', '.', ...excludePaths.map((p) => \`:(exclude)${p}\`)]`.
  - `gitignoredSubset` → `run(['git', 'check-ignore', ...paths], cwd)`.
  - `commitChanges` → `['git', 'status', '--porcelain', ...pathspec]`,
    `['git', 'add', '-A', ...pathspec]` and `['git', 'commit', '-m', message]`.
  - `removeAndCommitPaths` → `['git', 'rm', '-f', '--ignore-unmatch', '--', ...paths]`,
    `['git', 'status', '--porcelain', '--', ...paths]` and
    `['git', 'commit', '-m', message, '--', ...paths]`.
  - `addAndCommitPaths` → `['git', 'add', '--', ...paths]` plus the same status and commit.
  - `pushBranch` → `['git', 'fetch', 'origin', branch]` and
    `['git', 'push', '--force-with-lease', '--force-if-includes', '-u', 'origin', branch]`.
  - `getHeadTreeHash` → `['git', 'rev-parse', 'HEAD^{tree}']`; `hasUncommittedChanges` →
    `['git', 'status', '--porcelain']`.
  - Delete every `message.replace(/"/g, '\\"')` and `'${p}'` token map.
  - Update the docblock's "(command, cwd) => string runner" to an argv runner.
- `src/git/claimOps.ts`:
  - `['git', 'worktree', 'add', '--detach', worktreePath, ref]`
  - `['git', 'commit', '--allow-empty', '-m', message]`
  - `['git', 'push', 'origin', \`HEAD:refs/heads/${branch}\`]`. Keep the never-forced invariant
    comment.
  - `['git', 'worktree', 'remove', '--force', worktreePath]`
- `src/git/branchOps.ts`:
  - `['git', 'branch', '--show-current']`
  - `['git', 'fetch', 'origin', defaultBranch]`
  - `['git', 'merge', \`origin/${defaultBranch}\`, '--no-edit']`
  - `['git', 'reset', '--hard', \`origin/${defaultBranch}\`]`
  - `['git', 'branch', '-D', branch]`
  - `['git', 'push', 'origin', '--delete', branch]`
  - `['git', 'branch', '--list']`
  - Update the docblock runner wording.
- `src/git/remoteOps.ts`:
  - `['git', 'fetch', 'origin', branch]`
  - `mergeBranch` → `['git', 'merge', ...flags, ref]`, where `flags` is built with conditional
    spreads (`...(opts.noCommit ? ['--no-commit'] : [])`, and likewise for `--no-ff` and
    `--no-edit`), in the same order as today.
  - `['git', 'merge', '--abort']`
  - `['git', 'ls-remote', 'origin', branch]`
- `src/git/gitReadOps.ts`:
  - `lsFiles` → `prefix ? ['git', 'ls-files', prefix] : ['git', 'ls-files']`.
  - `headShort` → `['git', 'rev-parse', '--short', 'HEAD']`.
  - `diff` → `['git', 'diff', range]`.
  - `log` → `['git', 'log', branchName, '--format=%aI %s', '--no-merges']`.
  - `show` → `['git', 'show', \`${ref}:${filePath}\`]`.
  - `logSince` builds `['git', 'log', \`--since=${opts.since}\`]`, then appends in today's order
    `\`--grep=${opts.grep}\``, `'--no-merges'`, `'--oneline'`, `'-p'`, and `'--', opts.pathspec`.
- `src/git/worktreeCreateOps.ts`:
  - `['git', 'worktree', 'list', '--porcelain']`
  - `['git', 'status', '--porcelain']`
  - `['git', 'add', '-A']`
  - `['git', 'commit', '-m', 'WIP: auto-commit before switching to worktree']`
  - `['git', 'push', '-u', 'origin', branchName]`
  - `['git', 'rev-parse', '--abbrev-ref', 'origin/HEAD']`
  - `['git', 'checkout', defaultBranch]`
  - `['git', 'rev-parse', '--verify', branchName]` and
    `['git', 'rev-parse', '--verify', \`origin/${branchName}\`]`
  - `['git', 'fetch', 'origin', name]`
  - `['git', 'rev-parse', baseBranch]` and `['git', 'rev-parse', \`origin/${baseBranch}\`]`
  - `['git', 'worktree', 'add', worktreePath, branchName]`
  - `['git', 'worktree', 'add', '-b', branchName, worktreePath, \`origin/${baseBranch}\`]`
  - `['git', 'worktree', 'add', '-b', branchName, worktreePath, base]`
- `src/git/worktreeRemoveOps.ts`: `['git', 'worktree', 'list', '--porcelain']`,
  `['git', 'worktree', 'prune']`, and `['git', 'worktree', 'remove', path, '--force']` at both
  sites.
- `src/git/worktreeResetOps.ts`:
  - `['git', 'rev-parse', '--git-dir']`
  - `['git', 'merge', '--abort']`
  - `['git', 'rebase', '--abort']`
  - `['git', 'fetch', 'origin', branch]`
  - `['git', 'reset', '--hard', \`origin/${branch}\`]`
  - `['git', 'clean', '-fdx']`
- `src/git/worktreeQueryOps.ts`: `['git', 'worktree', 'list', '--porcelain']` at all 5 sites.
- `src/git/worktreeProbeOps.ts`: `['git', 'rev-parse', '--git-dir']`,
  `['git', 'symbolic-ref', '--short', 'HEAD']` and `['git', 'worktree', 'list', '--porcelain']`.

### 4. Remove the remaining shell spawns in `src/git/`
- `src/git/repoWorkspace.ts`:
  - Import `execFileSync` and the `ExecFileSyncOptions` type instead of
    `execSync`/`ExecSyncOptions`.
  - Make `WorkspaceExecFn` = `(argv: readonly string[], opts: { cwd?: string; stdio?: ExecFileSyncOptions['stdio']; encoding?: string }) => void`.
  - Both defaults become `([file, ...args], o) => { execFileSync(file, args, { … }); }`, keeping
    today's option spreads.
  - Commands: `['git', 'clone', cloneUrl, workspacePath]` and `['git', 'fetch', 'origin']`.
- `src/git/processCleanup.ts`: `execFileSync('lsof', ['+D', directoryPath, '-t'], { encoding: 'utf-8' })`
  and `execFileSync('sleep', ['0.5'], { stdio: 'pipe' })`. A non-zero `lsof` exit still throws into
  the existing silent `catch`.
- `src/git/bootstrapIdentity.ts`:
  - `readOriginRemoteUrl` → `execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf-8', cwd })`.
  - `readCurrentBranch` → `execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], …)`.
  - `GitConfigIdentityDeps.exec` → `(argv: readonly string[], opts: { encoding: 'utf-8'; cwd?: string; stdio?: unknown }) => string`.
  - The default becomes `([file, ...args], opts) => execFileSync(file, args, opts as …)`, and the
    calls pass `['git', 'config', 'user.name']` / `['git', 'config', 'user.email']`.

### 5. Convert the GitHub adapter to argv
- `src/providers/github/ghCommandRunner.ts`: change to
  `run(argv: readonly string[], opts?: { input?: string; purpose?: CredentialPurpose }): string`,
  forwarding `argv` to `ctx.exec`. Update the docblock ("identity in the command string" → "in the
  argv").
- `src/providers/github/commands/prCommands.ts`: every builder returns `string[]`. Numbers are
  `String(n)`, `owner/repo` is one element, and nothing is quoted.
  - `findPRByBranchCmd` → `['gh', 'pr', 'list', '--repo', \`${owner}/${repo}\`, '--head', branchName, '--state', 'all', '--json', 'number,state,headRefName,baseRefName,updatedAt,labels', '--limit', '20']`.
  - `createPRCmd` → exactly the issue's shape: `['gh', 'pr', 'create', '--repo', …, '--title', title, '--head', headBranch, '--body-file', '-', ...(baseBranch ? ['--base', baseBranch] : []), ...(labels ?? []).flatMap((l) => ['--label', l])]`.
  - `fetchMergedPRsCmd` → `'--limit', String(limit)`.
  - Keep every other token in today's order (e.g. `fetchAllPRsCmd`'s pinned
    `number,body,state,mergedAt,updatedAt,url`).
- `src/providers/github/commands/issueCommands.ts`: every builder returns `string[]`.
  - `listOpenIssuesCmd` → `['gh', 'issue', 'list', '--repo', …, '--state', opts.state ?? 'open', '--json', opts.fields.join(',')]`,
    plus `'--search', opts.search` when defined and `'--limit', String(opts.limit)` when defined.
  - `issueCommentsCmd` → `…, '--json', 'comments', '--jq', '.comments'`.
  - `addIssueLabelCmd` → `['gh', 'issue', 'edit', String(issueNumber), '--repo', …, '--add-label', labelName]`.
  - `createIssueCmd` → `['gh', 'issue', 'create', '--repo', …, '--title', title, '--body-file', '-']`.
  - `findOpenUpgradeIssueCmd` → `…, '--label', 'adw:upgrade', '--state', 'open', '--json', 'number', '--limit', '1'`.
  - `deleteIssueCommentCmd` → `['gh', 'api', '-X', 'DELETE', \`repos/${owner}/${repo}/issues/comments/${commentId}\`]`.
- `src/providers/github/commands/labelCommands.ts`:
  - `createLabelCmd` → `['gh', 'label', 'create', name, '--repo', …, '--color', color, '--description', description, '--force']`.
  - `applyLabelCmd` → `['gh', 'issue', 'edit', String(issueNumber), '--repo', …, '--add-label', labelName]`.
- `src/providers/github/commands/secretCommands.ts`: `['gh', 'secret', 'set', name, '--repo', …, '--body', '-']`.
  Same tokens as today.
- `src/providers/github/commands/boardCommands.ts`:
  - `graphQLInputCmd` → `['gh', 'api', 'graphql', '--input', '-']`.
  - `graphQLCmd(query, variables?)` →
    `['gh', 'api', 'graphql', '-f', \`query=${query}\`, ...Object.entries(variables ?? {}).flatMap(([k, v]) => typeof v === 'number' ? ['-F', \`${k}=${v}\`] : ['-f', \`${k}=${v}\`])]`.
  - `projectQueryCmd`/`itemQueryCmd`/`fieldQueryCmd`/`moveStatusCmd` delegate:
    - `graphQLCmd(QUERY_PROJECT, { owner, repo })`
    - `graphQLCmd(QUERY_ITEM, { owner, repo, number: issueNumber })`
    - `graphQLCmd(QUERY_FIELD, { projectId })`
    - `graphQLCmd(MUTATION_MOVE, { projectId, itemId, fieldId, optionId })`

    This is the same flag order and `-f`/`-F` choice as today.
- `src/providers/github/ghRepoApi.ts`:
  - `defaultBranch` → `run(['gh', 'repo', 'view', \`${owner}/${repo}\`, '--json', 'defaultBranchRef', '--jq', '.defaultBranchRef.name'])`.
  - `authenticatedUser` → `run(['gh', 'api', 'user'])`.
  - Other operations pass builder output through unchanged. Every `GhRepoApi` method signature
    stays the same.
- `src/providers/github/ghAuthToken.ts`: `execFileSync('gh', ['auth', 'token'], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()`
  in the same `try`/`catch` (a missing `gh` now throws ENOENT instead of exiting 127, and both
  return `''`). Update the docblock line that calls it "a direct spawn" so it no longer implies a
  shell.
- Confirm that `ghIssueApi.ts`, `ghPrApi.ts` and `githubBoardManager.ts` compile unchanged.

### 6. Make the guard reject command-line strings
- Create `scripts/guard/shellCommandStringRule.ts`, mirroring `constructionRule.ts`:
  - Export `flagShellCommandStrings(sourceFile: ts.SourceFile): Violation[]`. It walks every node
    and flags each `StringLiteral`/`NoSubstitutionTemplateLiteral` whose `text`, and each
    `TemplateExpression` whose `head.text`, matches `/^(git|gh)\s/` (rendered like the existing
    rule: `head.text + '${...}'`), with `rule: 'shell-command-string'`.
  - The docblock explains the invariant: inside the packages allowed to run git/gh, a command must
    be an argv array; a literal that spells a whole command line is the injectable shape wherever
    it appears; the bare program name never matches.
- `scripts/guard/violationTypes.ts`: `ViolationRule = 'git-gh-shellout' | 'unsanctioned-construction' | 'shell-command-string'`.
  Update the docblock rule count.
- `scripts/checkGitGhGuard.ts`:
  - In `scanSource`, keep the construction rule unconditional, then
    `if (isExemptPackage(filePath)) violations.push(...flagShellCommandStrings(sourceFile)); else walkNode(…)`.
    The two git/gh rules are complementary and a line is never double-reported.
  - Extend `extractGitGhCommand` with an `ArrayLiteralExpression` branch. When the first element is
    a string or no-substitution template literal whose text is exactly `git` or `gh`, return the
    elements joined by spaces, rendering non-literal elements as `${...}`.
  - In `main()`, add a third PASS line (e.g. `'  ✔ PASS  git/gh commands inside the exempt packages are argv arrays.'`)
    and a `Remedy (shell-command-string)` line. Keep every printed string indented; see the
    invariant in `app_docs/git-gh-guard.md`.
  - Update the header docblock: three rules, and the exempt packages feed argv arrays (not command
    strings) into the executor.
- `scripts/__tests__/checkGitGhGuard.test.ts`:
  - Rewrite the AC1 per-rule-exemption test (lines 80-92):
    - `execSync("git status")` is now one `shell-command-string` violation inside `src/git/` and
      inside `src/providers/github/`, and one `git-gh-shellout` violation in
      `src/providers/jira/…`.
    - The argv form `run(['git', 'status'], cwd)` is zero violations inside both exempt packages
      and one `git-gh-shellout` violation outside.
  - Add these cases:
    - `` run(`git commit -m "${message}"`, cwd) `` in `src/git/commitOps.ts` → 1 `shell-command-string`.
    - `` return `gh pr create --title '${title}'`; `` in `src/providers/github/commands/prCommands.ts`
      → 1 `shell-command-string` (builders are covered, not only call arguments).
    - `execSync('gh auth token')` in `src/providers/github/ghAuthToken.ts` → 1 `shell-command-string`.
    - `execFileSync('gh', ['auth', 'token'])` and `return ['gh', 'pr', 'create', '--title', title];`
      in an exempt file → 0.
    - `ctx.exec(['gh', 'api', 'user'], opts)` in `src/providers/jira/…` → exactly 1
      `git-gh-shellout` whose `command` starts with `gh api user`.
    - `execSync("git status")` in a non-exempt file is still exactly 1 violation (no
      double-report).
  - Keep every existing construction-rule test unchanged.

### 7. Update the existing unit tests to the argv contract
- Recording spies and fakes take `argv: readonly string[]` and record it. Where a suite dispatches
  canned responses by substring (`gitContextFixture.ts`'s `makeSpyExec`, `forgeProvidersFixture.ts`),
  also record `command: argv.join(' ')` as a display and dispatch view. That keeps the
  `toContain('--repo acme/widget')`-style assertions and `Map([['--head', json]])` patterns working.
  Assertions on an exact command become `expect(call.argv).toEqual([...])`.
- Rewrite every expectation that depends on shell quoting to the exact argv, e.g.:
  - `'git fetch origin "main"'` → `['git', 'fetch', 'origin', 'main']`.
  - `"--title 'title'"` → `'--title', 'title'` adjacency (`argv[argv.indexOf('--title') + 1]`).
  - `logSince` → `['git', 'log', '--since=2024-01-01', '--grep=^regression-promotion:', '--no-merges', '--oneline']`
    and `[..., '-p', '--', 'features/per-issue/feature-*.feature']`.
  - `runGraphQL` → `['gh', 'api', 'graphql', '-f', 'query=query{viewer{login}}', '-F', 'limit=5', '-f', 'name=x']`.
  - `repoWorkspace` clone → `['git', 'clone', 'https://github.com/acme/webapp.git', path.join(TARGET_REPOS_DIR, 'acme', 'webapp')]`
    and fetch → `['git', 'fetch', 'origin']`.
- **Replace, do not port,** the tests that pin the broken escaping: `commitOps.test.ts`
  "escapes double quotes in the commit message" (both `removeAndCommitPaths` and
  `addAndCommitPaths` blocks) and `claimOps.test.ts:69-72`. The replacements assert the message
  containing `"` is the single argv element after `-m`, verbatim. Rename
  "probes check-ignore with single-quoted, space-joined path tokens" to assert
  `['git', 'check-ignore', 'a', 'b']`.
- `gitContext.test.ts`:
  - Every `ctx.exec('…')` becomes argv.
  - "passes the command to the fake verbatim" → `ctx.exec(['printf', '%s', 'no-forge-meaning'], …)`
    with `toEqual`.
  - Empty and whitespace commands → `ctx.exec([], …)` and `ctx.exec(['   '], …)` (still
    `/GitContext/`).
  - Add a case: `ctx.exec('git status' as never, …)` throws `/GitContext/`.
  - The `@ts-expect-error usePat` test keeps its directive with an argv first argument.
- `bootstrapIdentity.test.ts`, `githubIdentity.test.ts`, `gitlabIdentity.test.ts` and
  `forgeCredentials.test.ts`: git-config fakes match on argv (e.g. `argv.join(' ') === 'git config user.name'`).
  The real-git fixture `execSync(...)` calls inside these test files may stay; tests are outside
  the production check and the guard's scan.
- `workingDirectoryGuard.test.ts`, `repoApiCwd.test.ts`, `worktreeLogger.test.ts`,
  `ghCommandRunner.test.ts`, `ghRepoApiCwd.test.ts` (the "names the target repository" check works
  on the joined view), `githubIssueTracker.test.ts` (line 27 `createIssue` → argv),
  `githubCodeHost.test.ts` (line 65 `--head "feature-x"` → argv), `ghRepoApi.test.ts`
  (`--search`, `--head`, `--base`, `--label`, graphQL), `issueCommands.test.ts`
  (`--state`/`--search`/`--limit` adjacency), `forgeProviders.deps.test.ts`
  (`command.includes('issue edit')` → argv check) and the rest of the files under Relevant
  Files: let `bun run typecheck` drive each remaining signature fix.

### 8. Update the BDD support layer and steps
- `features/support/gitFixture.ts`:
  - `makeGitRunner()` returns `(argv, cwd) => execFileSync(argv[0], argv.slice(1), { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...ISOLATION_ENV } }).trim()`.
    It still throws the `.stdout`/`.stderr`-carrying error `isLeaseRejection` reads.
  - `createThrowawayRepo`/`configureCloneIdentity` use argv, e.g.
    `['git', 'config', 'user.name', 'Scenario Bot']` and `['git', 'commit', '-m', 'initial commit']`.
  - Update the docblock.
- `features/support/world.ts`:
  - `ExecStub = (argv: readonly string[], opts: unknown) => string`.
  - `execRecorderCalls?: Array<{ argv: readonly string[]; env: NodeJS.ProcessEnv; input?: string }>`.
  - `runner: (argv: readonly string[], cwd: string) => string`.
- `features/support/ghCliFake.ts`:
  - Dispatch on argv: `gh issue view …` is `argv[0] === 'gh' && argv[1] === 'issue' && argv[2] === 'view'`;
    `gh pr list … --state all` is matched the same way, with `argv[argv.indexOf('--state') + 1] === 'all'`.
  - `parseJsonFields(argv)` reads the element after `--json`.
  - Error messages render `argv.join(' ')`.
- `features/support/stubGh.ts`:
  - The comment says `ghAuthToken` spawns `gh` found on `PATH`, not "through the shell". The
    stub's `#!/bin/sh` shebang still works because `execFileSync` resolves `gh` via `PATH`.
  - Add a recording variant next to `installStubGh` for feature-18's second rule. Its script:
    - writes each invocation's arguments to its own file in the stub directory, NUL-separated
      (`printf '%s\0' "$@"`), so quotes and newlines survive;
    - for `pr create`, also saves stdin and prints the configured URL;
    - for anything else, exits 0 with no output. The code host's `gh pr list` pre-check then
      fails to parse and falls through to creation.
- `features/step_definitions/gitOps.steps.ts`:
  - `type Runner = (argv: readonly string[], cwd: string) => string`.
  - `hasLocalBranch` uses `['git', 'branch', '--list']`.
  - Every fixture command becomes argv, e.g.:
    - `['git', 'checkout', '-b', branch]`
    - `['git', 'init', '--bare', '-b', branch]`
    - `['git', 'remote', 'add', 'origin', remoteDir]`
    - `['git', 'clone', '-b', branch, this.remoteDir, cloneDir]`
    - `['git', 'commit', '-m', message]`
    - `['git', 'log', '-1', '--format=%s']`
    - `['git', 'rev-list', '--count', 'HEAD']`
    - `['git', 'rev-parse', branch]`
- `features/step_definitions/ghRepoApi.steps.ts`: `execFn: ExecFn = (argv, options) => this.execRecorder(argv, options)`.
  The recorder pushes `{ argv, env, input: options.input }`. The Then step asserts `call.argv.some((a) => a.includes(named))`
  and renders `call.argv.join(' ')` in its failure message. The feature-11 phrase is unchanged.
  The literal-credential Given also sets `world.ghRepoId`, so feature-18 can build the code host
  and issue tracker over the same context.
- `features/step_definitions/forgeCredentials.steps.ts`: the stubs become
  `(argv) => argv.includes('user.name') ? … : argv.includes('user.email') ? … : throw` with
  `argv.join(' ')` in messages.
- `features/step_definitions/forgeMetadataGitHub.steps.ts`,
  `features/step_definitions/githubIdentityAndAppConfig.steps.ts`: no change unless typecheck flags
  one.
- Add `features/step_definitions/argvCommands.steps.ts` for `features/per-issue/feature-18.feature`.
  Drive only public entry points, and reuse the existing steps: the literal-credential context, the
  recorder, the repository-API composition, the throwaway-repository and working-tree steps in
  `gitOps.steps.ts`, and `the subprocess exits {int}`.
  - **First rule (recorder).**
    - Store the hazard table's values in order.
    - Build the code host and issue tracker over the declared context through the providers entry
      point, as `forgeMetadataGitHub.steps.ts` does.
    - Each When calls one public operation once per value:
      - the code host's `createPullRequest({ title, body, sourceBranch, targetBranch })`;
      - `createPR(title, body, head, base, values)` on the composed repository API;
      - the tracker's `createIssue`, `addLabel` (`adds`), `applyLabel` (`applies`), `ensureLabel`
        and `searchOpenIssues`;
      - `runGraphQL(query, { status: value, number: 52 })` on the composed repository API;
      - the context's `commitChanges`, `addAndCommitPaths`, `removeAndCommitPaths` and
        `commitAllowEmpty`, with any worktree path (the recorder never spawns).
    - The Then steps keep only the recorded calls whose argv starts with the named program and
      subcommand, e.g. `gh pr create`. Other calls, such as the code host's `gh pr list`
      pre-check, are ignored. The steps then assert:
      - the call count;
      - the element after the flag equals the value byte for byte;
      - `input` equals the body;
      - each listed flag is followed by its argument.
  - **Second rule (stub `gh`).**
    - Install the recording stub.
    - Build a `GitContext` with no `exec`. Its `frameworkRepoRoot` must be an existing temporary
      directory, because `gh` runs in the framework-root cwd class.
    - Assert on the recorded arguments and stdin.
  - **Third rule (real git).**
    - Build the context with no `exec`, `selfHost: true`, `frameworkRepoRoot` set to the throwaway
      repository, and a token provider whose overlay carries `GIT_CONFIG_GLOBAL: '/dev/null'` and
      `GIT_CONFIG_NOSYSTEM: '1'` (as in Task 1).
    - "Creates a worktree for the new branch" is `createWorktreeForNewBranch(branch)`. Its base is
      `HEAD`, because the repository has no remote. `removeWorktree(branch)` also deletes the
      local branch.
    - "The git entry point's clone operation" is `cloneRepo(repoDir, workspacePath)` with no
      `exec`, with the workspace under a temporary directory.
    - Read path lists with `-z`, so git's path quoting never changes a comparison.
  - **Fourth rule (guard).**
    - Write the docstring as the only file of a temporary source tree.
    - The guard scans `process.cwd()`. Run it with the repository's own `tsx` binary and that
      tree as `cwd`.
    - Store `{ status, stdout, stderr }` in `world.subprocess`, and assert the report names the
      file.
  - **Fourth rule (`@packaging`).**
    - Generate the consumer module with `typeCheckInConsumer`, as `forgeMetadataPackaging.steps.ts`
      does.
    - "A program and its argument list" is the argv-array runner
      `(argv: readonly string[], …) => string`, whose element 0 is the program. That is the shape
      of `ExecFn` and of the op-module `Runner`. "One command string" is
      `(command: string, …) => string`.
    - Put each `rejects` row under `// @ts-expect-error`. `tsc` then exits 0 only when every
      `accepts` row compiles and every `rejects` row fails to compile.

### 9. Refresh the documentation that the change makes false
Follow `.adw/coding_guidelines.md`: comment only invariants and non-obvious reasons, and never cite
issue numbers in new comments or doc lines added by this change.
- `app_docs/git-worktree-core.md`:
  - `exec()` takes an argv array spawned by `execFileSync`, with no shell.
  - The guard reads the argv literal's first element.
  - Op modules take an `(argv, cwd) => string` runner.
  - `diff(range)` and `logSince({ pathspec })` pass their value as exactly one argument.
- `app_docs/github-provider.md`:
  - Builders return argv arrays and the runner takes argv.
  - Delete the "build shell command *strings*, not argv arrays" gotcha and replace it with the argv
    invariant.
  - `ghAuthToken()` spawns `gh` via `execFileSync`, with no shell.
- `app_docs/git-gh-guard.md`:
  - Three rules: document `shell-command-string` (scope: exempt packages only; any literal
    matching `/^(git|gh)\s/`) and the array-literal extension of `git-gh-shellout`.
  - Update the `main()` PASS-line count.
  - Gotcha: a log or error message inside `src/git`/`src/providers/github` that *starts with*
    `git `/`gh ` is flagged, so reword it.
- `app_docs/bdd-scenarios.md` (line 54): gitFixture's runner is `(argv, cwd) => string`.
- `src/git/index.ts` docblock: "the gh command-string builders" → "the gh argv builders".
- Do **not** edit `README.md`. It already carries unrelated uncommitted edits in this worktree, and
  its executor/guard bullets stay accurate at that level of detail.

### 10. Mark the release as breaking
- The commit that lands this change must declare it breaking, so semantic-release computes
  **2.0.0** from `v1.2.0`. Use a `!` header (e.g. `build-agent: fix!: run git and gh commands as argv arrays, never through a shell`)
  or a `BREAKING CHANGE:` footer naming the changed seams (see Notes).
- Confirm on the PR that the `release-dry-run` job reports `2.0.0`.

### 11. Run the validation commands
- Run every command in `Validation Commands` below, in order. Every one must exit 0.

## Validation Commands
Execute every command to validate the bug is fixed with zero regressions.

- `bun install`: prepare dependencies. No new library is needed.
- `bun run test:unit src/git/__tests__/shellInjection.test.ts src/providers/github/__tests__/shellInjection.test.ts`:
  the bug reproduction. Run it once right after Task 1: it fails then, because the real commit
  creates `pwned-*` and the message comes back mangled, and the argv expectations do not compile.
  After Task 8 it must pass: hostile values reach the stand-in runner unchanged, the real commit
  runs nothing and records the message verbatim, and `printf` echoes the hostile argument back
  unchanged.
- `bun run typecheck`: `src/`, `scripts/` and `features/` all compile against the argv contract.
- `bun run lint:git-guard`: prints three PASS lines. This proves no `git …`/`gh …` command-line
  literal remains in `src/git` or `src/providers/github`, and none of the new argv call sites
  leak outside them.
- `! grep -rn --include='*.ts' --exclude-dir=__tests__ 'execSync' src`: exits 0 only when no
  production file under `src/` still uses `execSync`, which is the acceptance criterion with no
  exceptions.
- `bun run test:unit`: the full unit suite, including the rewritten command assertions and the
  guard tests.
- `bun run test:e2e --tags "@adw-18 and not @packaging"`: the issue's scenarios through the public
  entry points. This covers feature-18's recorder, stub-`gh`, real-git and guard rules, plus the
  `@adw-18`-tagged regression scenarios in features 9, 11 and 16. Run it after Task 8; every
  scenario must pass.
- `bun run test:e2e --tags "not @packaging"`: the hermetic BDD suite. This covers the feature-11
  commitOps, branchOps and push-rejection scenarios against real throwaway repositories through
  the argv runner, the `createGhRepoApi` recorder scenario, the stub-`gh` `ghAuthToken`
  scenarios, the feature-9 and feature-11 git-config identity fallbacks, the feature-16 CLI-fake
  scenarios, and every hermetic `@adw-18` scenario in feature-18.
- `bun run build`: emits `dist/**/*.js` and `.d.ts` with the new signatures.
- `bun run test:e2e --tags "@packaging"`: the packed-tarball scenarios still resolve every exported
  name from the emitted `.d.ts`. Feature-18's runner-shape scenario also shows that the emitted
  declarations accept an argv runner and reject a command-string runner for `GitContext`'s
  executor, `commitOps` and `branchOps`.

## Notes
- **Coding guidelines** (`.adw/coding_guidelines.md`):
  - Comment only what the code cannot say: the no-shell invariant at the spawn site, the
    never-forced claim push, and the explicit-`--head` reason.
  - Do not restate argv elements in comments and add no section banners.
  - Never cite issue numbers in new comments.
- **No new library.** `execFileSync` is `node:child_process`, already used by `appAuth.ts`.
- **Breaking surface.** List these in the `BREAKING CHANGE:` footer and the release notes:
  - `ExecFn` (`@paysdoc/devplatform/git`) and `GitContext.exec()`: `command: string` →
    `argv: readonly string[]` (`[program, ...args]`).
  - The runner parameter of `commitOps`, `branchOps`, `claimOps` and the `worktree*Ops` namespaces:
    `(command, cwd)` → `(argv, cwd)`.
  - `WorkspaceExecFn` (the `exec` dep of `cloneRepo`/`ensureRepoWorkspace`).
  - `GitConfigIdentityDeps['exec']`, and through it `BootstrapIdentityDeps['exec']` and
    `createForgeCredentials`' `deps.exec`.
  - Every `GitContext` method signature (`commitChanges`, `createWorktree`, `diff`, …) and every
    `GhRepoApi` method signature is **unchanged**, as are all export names (`scripts/smokePackage.ts`
    needs no change).
- **Intentional behaviour changes to call out.**
  - `diff(range)` and `logSince({ pathspec })` pass their value as exactly one argument. A value
    containing spaces is no longer word-split, and a glob pathspec is no longer expanded by
    `/bin/sh` against the current working tree. git's own pathspec matching applies instead, which
    also matches paths deleted since (more correct for the per-issue feature-file denominator).
  - A missing `git`/`gh`/`lsof` binary now fails the spawn with `ENOENT` instead of a shell exit 127.
    `rewrapMissingWorkingDirectory` still rewraps only when the cwd itself is missing.
- **Option injection is out of scope.** A value that *starts with* `-` (e.g. a branch named
  `--upload-pack=…`) can still be parsed as an option by git/gh. The shell-string form had the
  same exposure, so argv neither introduces nor fixes it. Adding `--` separators or ref
  validation is a separate hardening step. The commit message is safe either way, because `-m`
  consumes the next argv element whatever it starts with.
- **ADW follow-ups (separate issue):**
  - Bump `@paysdoc/devplatform` and update `test/mocks/ghShadowWrites.ts` and the regression-step
    runners to parse argv arrays.
  - Add a retry cap for a repeated `ADW Workflow Error`.
  - Make a resume after a PR-creation failure retry PR creation instead of re-running review.
- **Blocked by #19.** Confirm #19 has landed (or agree the merge order) before merging this
  breaking release.
- The new guard rule flags any `git `/`gh `-prefixed literal inside the exempt packages, including
  a future log or error message that happens to start that way. That false positive is deliberate
  and conservative; reword the message.
