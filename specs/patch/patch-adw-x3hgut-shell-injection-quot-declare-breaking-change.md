# Patch: Declare the argv runner change breaking so semantic-release computes 2.0.0

## Metadata
adwId: `x3hgut-shell-injection-quot`
reviewChangeRequest:
```text
Issue #1: The change is not marked as breaking, so it would ship as a patch. All three branch commits use a plain `fix:` header (e.g. `build-agent: fix: run git and gh commands as argv arrays`), and none has a `BREAKING CHANGE:` footer. Running the repo's own commit-analyzer config (`release.config.js`) over `origin/main..HEAD` gives `patch`, so merging publishes v1.2.1 instead of the 2.0.0 that spec Task 10 and the issue's acceptance criterion ("Release as a minor/major") require. Consumer-facing seams changed shape: `ExecFn`/`GitContext.exec()` and the `commitOps`/`branchOps`/`claimOps`/`worktree*Ops` runners now take argv instead of a command string, as do `WorkspaceExecFn` and `GitConfigIdentityDeps.exec`, and `diff()`/`logSince()` no longer word-split. Any consumer on a `^1` range that injects a command-string runner would get these changes as a patch and break, and a published npm version cannot be replaced.
Resolution: Before merging, add a commit that declares the break. Either use a `!` header, e.g. `build-agent: fix!: run git and gh commands as argv arrays, never through a shell`, or add a `BREAKING CHANGE:` footer that lists the changed seams: `ExecFn`/`GitContext.exec` (`command: string` → `argv: readonly string[]`), the op-module runners `(command, cwd)` → `(argv, cwd)`, `WorkspaceExecFn`, `GitConfigIdentityDeps.exec` (and through it `BootstrapIdentityDeps.exec` and `createForgeCredentials` `deps.exec`), and the single-argument `diff(range)`/`logSince({ pathspec })`. Then confirm `bun run release:dry-run` (the PR's `release-dry-run` job) reports 2.0.0.
```

## Issue Summary
**Original Spec:** `specs/issue-18-adw-x3hgut-shell-injection-quot-sdlc_planner-run-git-gh-as-argv-arrays.md`
(Task 10, "Mark the release as breaking", was never carried out.)

**Issue:** semantic-release would publish `1.2.1`, not `2.0.0`, even though the injectable
executor seams changed shape. It analyzes `v1.2.0..HEAD`: the three branch commits, plus the #20
merge, its `chore:` commit and an untyped ADW-upgrade commit. Only the three plain `fix:` headers
count, and none of them carries `!` or a `BREAKING CHANGE:` footer. Reproduced while planning:

- The repository's own `release.config.js` analyzer over the real `v1.2.0..HEAD` commits returns
  `patch`.
- `bun run release:dry-run` cannot show this locally yet. It exits 1 with `ERELEASEBRANCHES … Your
  configuration for the problematic branches is []`, because semantic-release only accepts a
  release branch that exists on `origin`, and `bugfix-issue-18-run-git-gh-as-argv-arrays` has not
  been pushed.

**Solution:** Add one **empty** commit whose header has `!` and whose last paragraph is a
`BREAKING CHANGE:` footer listing the changed seams. Each part does one job:
- `!` makes the analyzer return `major` (`release.config.js`'s `breakingHeaderPattern`).
- The footer is the text the `conventionalcommits` writer publishes as the v2.0.0 "⚠ BREAKING
  CHANGES" entry. With `!` alone, that entry would only repeat the subject.

No file needs to change. There is no CHANGELOG, because the notes come from commits, and the
existing commits are neither reworded nor rebased, as the reviewer asked. Rehearsed in a throwaway
clone of this branch: with the commit, the analyzer returns `major`, and the rendered notes read
`## 2.0.0` with the full seam list.

Merge note for whoever merges the PR: use *Create a merge commit*, as for every earlier PR (#20,
#17, #14). The repository also allows squash merges. A squash merge replaces the branch commits
with one commit whose message GitHub builds from the PR, so the break survives only if that
message keeps the `!` header or the footer. Otherwise `main` releases `1.2.1`.

## Files to Modify
Use these files to implement the patch:

- None. The patch is a single empty commit; no file in the tree changes.
- Read-only references:
  - `release.config.js`: the optional `<agent-name>: ` prefix must be lowercase-hyphenated, `!`
    maps to major, and the `BREAKING CHANGE:` note keyword comes from the `conventionalcommits`
    preset.
  - `scripts/releaseDryRun.ts` and the `release-dry-run` job in `.github/workflows/ci.yml`.

## Implementation Steps
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Confirm the starting state
- From the repository root, `git diff --cached --quiet` must exit 0. The commit must carry no file
  changes, so do not `git add` anything. Leave any untracked file, such as this patch plan, for
  ADW's own commit step.
- Run Validation command 2. It must print `release type for v1.2.0..HEAD: patch` and exit 1. If it
  already prints `major`, the break has been declared (for example by a resumed run): skip Step 2
  and go to Validation.

### Step 2: Create the breaking-change commit with exactly this message
Run this command verbatim from the repository root. Every line starts in column 0, except the five
seam lines, which start with two spaces so they render as nested bullets in the release notes.

```sh
git commit --allow-empty -F - <<'EOF'
build-agent: fix!: run git and gh commands as argv arrays, never through a shell

BREAKING CHANGE: git and gh commands are argv arrays (`[program, ...args]`) spawned with `execFileSync`, never a command string run through `/bin/sh`. Runners that consumers inject must take argv instead of a command string:
  - `ExecFn` and `GitContext.exec()`: `command: string` -> `argv: readonly string[]`
  - the runner parameter of `commitOps`, `branchOps`, `claimOps` and the `worktree*Ops` namespaces: `(command, cwd)` -> `(argv, cwd)`
  - `cloneRepo`'s `exec` option and `EnsureRepoWorkspaceDeps.exec` (`WorkspaceExecFn`)
  - `GitConfigIdentityDeps.exec`, and through it `BootstrapIdentityDeps.exec` and the `deps.exec` of `createForgeCredentials`
  - `GitContext.diff()` passes `range`, and `GitContext.logSince()` passes `pathspec`, as exactly one argument: no word-splitting, no shell glob expansion
EOF
```

- Keep the quoted heredoc (`<<'EOF'`) with `-F -`. The message contains backticks, and
  `-m "…"` would hand them to the shell for command substitution, which is the bug this branch
  fixes.
- If you change the agent prefix, keep it lowercase and hyphenated (`build-agent`,
  `review-patch-agent`). A camelCase prefix such as `patchAgent:` does not match `headerPattern`.
  The commit then parses as type `patchAgent`, and the release stays `patch` (verified).
- The `BREAKING CHANGE:` footer must be the last paragraph. The parser appends every later line to
  the breaking-change note, so a trailing `Co-Authored-By:` trailer would be published inside the
  v2.0.0 release notes (verified). If an attribution trailer is required, give it its own
  paragraph between the header and the footer.
- Do not amend, reword or rebase the three existing commits, and do not push. ADW pushes the branch
  when it opens the PR.

## Validation
Execute every command to validate the patch is complete with zero regressions.

1. **The new commit is breaking and carries no file changes.** Run this right after Step 2, while
   HEAD is the new commit:
   `git diff --quiet HEAD~1 HEAD && git log -1 --format=%s | grep -qE '^[a-z0-9]+(-[a-z0-9]+)+: fix!: ' && git log -1 --format=%B | grep -q '^BREAKING CHANGE: ' && echo OK`
   It must print `OK`.
2. **The repository's own analyzer computes a major release.** This is the offline equivalent of
   the dry run: the same plugin, the same `release.config.js` and the same commit range. Run it
   verbatim from the repository root (the closing `EOF` must stay in column 0). It must print
   `release type for v1.2.0..HEAD: major` and exit 0. Before Step 2 it prints `patch` and exits 1,
   which is the reviewer's finding. Major from `1.2.0` is `2.0.0`.

```sh
node --input-type=module <<'EOF'
import { execFileSync } from 'node:child_process';
import { analyzeCommits } from '@semantic-release/commit-analyzer';
import config from './release.config.js';
const git = (...args) => execFileSync('git', args, { encoding: 'utf-8' }).trim();
const lastTag = git('describe', '--tags', '--abbrev=0');
const commits = git('log', '--format=%H%x1f%B%x1e', `${lastTag}..HEAD`)
  .split('\x1e').map((s) => s.trim()).filter(Boolean)
  .map((s) => { const [hash, message] = s.split('\x1f'); return { hash, message }; });
const type = await analyzeCommits(config.plugins[0][1], { commits, logger: { log() {}, error() {} }, cwd: process.cwd(), env: {}, options: {} });
console.log(`release type for ${lastTag}..HEAD: ${type}`);
process.exit(type === 'major' ? 0 : 1);
EOF
```

3. **`bun run release:dry-run` reports `==> next release version: 2.0.0`.** This works only once
   the branch exists on `origin`.
   - Locally, before ADW pushes the branch, it exits 1 with `ERELEASEBRANCHES`. That is expected
     and is not a patch failure. Do not push, set `DRY_RUN_BRANCH`, or edit
     `scripts/releaseDryRun.ts` to get past it. Validation 2 already covers the local check.
   - The authoritative check is the PR's `release-dry-run` CI job. It checks out the PR head with
     full history and tags and runs this same command, and its log must contain
     `==> next release version: 2.0.0`.
4. **No regressions:** `bun run test:unit` must pass. The baseline measured while planning was
   47 files and 1004 tests. Because the commit changes no file, the spec's other validation
   commands (`typecheck`, `lint:git-guard`, `test:e2e`, `build`, `@packaging`) are unaffected.

## Patch Scope
**Lines of code to change:** 0 (one empty commit with a 7-line message)
**Risk level:** low. No source, test or config change. The residual risk is at merge time: a squash
merge can drop the marker, so merge with a merge commit.
**Testing required:**
- Check the commit shape.
- Run the offline commit analyzer over `<last tag>..HEAD` and confirm it returns `major`.
- Confirm the PR's `release-dry-run` job reports `2.0.0`.
- Run the unit suite as a regression gate.
