# Chore: Port the git/gh guard into the library's CI

## Metadata
issueNumber: `3`
adwId: `ot3exy-port-the-git-gh-guar`
issueJson: `{"number":3,"title":"Port the git/gh guard","body":"**Parent PRD:** `paysdoc/AI_Dev_Workflow` `specs/prd/gitcontext-library-extraction.md`\n\n\n**What to build:** Bring `checkGitGhGuard.ts` and the `guard/` module over\nwith two rules; wire into CI.\n\n- **Shell-out rule**, exempt set = `src/git/` (the git core, the only package\n  that may run git commands) and `src/providers/github/` (the GitHub adapter,\n  whose `gh` command strings feed the core executor). This mirrors ADW's\n  two-entry `EXEMPT_PACKAGES`. The adapter holds over 60 `gh …` string\n  literals across 13 files; an exempt set of the core alone would flag every\n  one of them.\n- **Construction rule**, walked over the whole tree (ADW prunes the two\n  packages from this rule; the library must not), with a sanctioned-site\n  allowlist of exactly one file: `src/providers/forgeProviders.ts`. Verified\n  2026-09-10: it is the only non-test call site of the adapter factories in\n  the two packages, and nothing in them calls `new GitContext` outside tests.\n- The identity rule is **not** ported: it guards consumers composing\n  cwd-derived identity into `forgeProviders`, and nothing inside the library\n  calls `forgeProviders` outside tests.\n- The extraction-readiness rule is **not** ported: it has nothing to guard\n  once the packages are the whole repo.\n\n**Acceptance criteria:**\n- [ ] A `git`/`gh` shell-out anywhere but `src/git/` and `src/providers/github/` fails CI; both exempt packages pass\n- [ ] A call to an adapter factory or `new GitContext` from any non-test file other than `forgeProviders.ts` fails CI\n- [ ] Guard test suite (both directions) relocated and green\n- [ ] `bun run lint:git-guard` in CI\n\n**User stories:** 22.\n\n\n## Blocked by\n\n- #1\n","state":"OPEN","author":"paysdoc","labels":[],"createdAt":"2026-09-10T10:25:55Z","comments":[],"actionableComment":null}`

## Chore Description

Port ADW's AST-based git/gh CI guard (`adws/checkGitGhGuard.ts` + `adws/guard/`) into this
library so that agents modifying `@paysdoc/devplatform` cannot erode the spawn chokepoint.
Two of ADW's four rules are ported; two are deliberately dropped.

**Rule 1 — `git-gh-shellout` (ported).** AST walk over every scannable `.ts`/`.tsx` file;
flags any call expression whose *first argument* is a string/template literal matching
`/^(git|gh)(\s|$)/`. Exempt set is exactly two packages, ported from ADW's two-entry
`EXEMPT_PACKAGES` with paths remapped:

| ADW path | library path | role |
| --- | --- | --- |
| `adws/gitContext` | `src/git` | git core — the only package that may run git commands |
| `adws/providers/github` | `src/providers/github` | GitHub forge adapter — the only package whose `gh` call sites may feed the core executor |

**Rule 2 — `unsanctioned-construction` (ported, with a structural change).** Flags a
`new GitContext(…)` expression or a bare-identifier call to one of the seven adapter
factories / `forgeProviders`, anywhere outside a file-scoped allowlist. In ADW this rule
never saw the two exempt packages, because a single walk pruned them before any rule ran.
**In this library it must walk the whole tree** — the two packages *are* the repo, so
pruning them would leave the rule guarding almost nothing.

That forces the one real design change of this port: the exemption moves from *discovery*
to *the shell-out rule itself*. One whole-tree walk collects every file; `scanSource`
applies the shell-out rule only when `!isExemptPackage(relPath)`, and applies the
construction rule always (subject to its own allowlist). `collectTsFiles` stops taking a
prune-on-exempt-package descend predicate.

Sanctioned-site allowlist: exactly one permanent entry, `src/providers/forgeProviders.ts`.
Verified against the tree on 2026-09-10 (see **Notes** for the audit) — it is the only
non-test call site of the adapter factories, and no non-test file calls `new GitContext`.

**Rule 3 — `cwd-derived-identity` (NOT ported).** It guards a *consumer* composing
cwd-derived identity into a context/provider factory. Nothing in this library calls
`forgeProviders` outside tests, and `readLocalRepoInfo` lives inside the exempt adapter.
`adws/guard/identityRule.ts` is not brought over.

**Rule 4 — `extraction-readiness` (NOT ported).** It asserted the extractable packages
import nothing from the rest of the ADW framework. Here the extractable packages are the
whole repo, so the rule has nothing to guard. `adws/guard/extractionRule.ts`,
`printExtractionScope`, `scanExtractionScope`, `collectExtractionScopeFiles` and
`collectScopeEntry` are not brought over.

**Also dropped: the sunset/stale-entry ratchet.** ADW's allowlist carried transitional
entries tagged with an `owner` field, plus `hasGuardedConstruction`,
`findStaleSanctionedEntries`, `collectConstructionSeenFiles` and the permanent/sunset split
in `printSanctionedConstructionSites`, to make transitional entries self-cleaning. This port
has exactly one permanent entry and the contract is that nothing may ever be added, so the
ratchet would be unreachable code guarding an empty set. It is not ported; the allowlist
entries carry only `{ file, reason }`.

**Placement.** The guard is a dev tool and must never ship in `dist/`. It goes in
`scripts/` alongside `smokePackage.ts` (`package.json`'s `files` allow-list is
`["dist", "README.md", "LICENSE"]`, and `tsconfig.build.json` includes only `src/**/*.ts`,
so `scripts/` is excluded from both the tarball and the build by construction). Two config
widenings are needed as a consequence: `tsconfig.json`'s `include` (so the guard is
typechecked) and `vitest.config.ts`'s `test.include` (so the guard's tests run).

**Wiring.** A `lint:git-guard` npm script (`bunx tsx scripts/checkGitGhGuard.ts`) plus a
step in the existing `.github/workflows/ci.yml` `check` job.

## Relevant Files

Use these files to resolve the chore:

**Source material (read-only reference — a different repository, do not modify):**
- `/Users/martin/projects/paysdoc/AI_Dev_Workflow/adws/checkGitGhGuard.ts` — the guard entry
  point being ported: `EXEMPT_PACKAGES`, `isExemptPackage`, `EXEMPT_DIR_NAMES`, `GIT_GH_RE`,
  `collectTsFiles`/`visitDir`/`isScannable`, `scanFiles`/`scanSource`, `walkNode`/
  `extractGitGhCommand`, and `main()`.
- `/Users/martin/projects/paysdoc/AI_Dev_Workflow/adws/guard/constructionRule.ts` — the
  construction rule: `PROVIDER_CONSTRUCTORS`, `CONTEXT_CONSTRUCTORS`,
  `GIT_CONTEXT_CLASS_NAME`, `SANCTIONED_CONSTRUCTION_SITES`, `isSanctionedConstructionSite`,
  `describeUnsanctionedConstructionNode`, `flagUnsanctionedConstruction`.
- `/Users/martin/projects/paysdoc/AI_Dev_Workflow/adws/guard/violationTypes.ts` — the
  cross-rule `Violation` / `ViolationRule` types.
- `/Users/martin/projects/paysdoc/AI_Dev_Workflow/adws/guard/guardReport.ts` —
  `printSanctionedConstructionSites` stdout block.
- `/Users/martin/projects/paysdoc/AI_Dev_Workflow/adws/__tests__/checkGitGhGuard.test.ts` —
  the 721-line guard suite. Port the `scanFiles — ALLOWLIST removed`, `EXEMPT_PACKAGES`,
  `isExemptPackage`, `a third-package gh call site fails the guard`,
  `scanFiles — unsanctioned-construction rule`, `isSanctionedConstructionSite` and
  `guarded factory names still exist` blocks. Skip the two `cwd-derived-identity` blocks,
  the `scanExtractionScope` block, and the `findStaleSanctionedEntries` block.
- `/Users/martin/projects/paysdoc/AI_Dev_Workflow/.github/workflows/git-cli-guard.yml` and
  `package.json` (`"lint:git-guard": "bunx tsx adws/checkGitGhGuard.ts"`) — the CI wiring
  precedent.
- `/Users/martin/projects/paysdoc/AI_Dev_Workflow/specs/prd/gitcontext-library-extraction.md` —
  parent PRD; story 22 and the "Library repository" implementation decision fix this port's
  scope (shell-out exempt set: git core + GitHub adapter; construction allowlist:
  `forgeProviders.ts` only; identity and extraction-readiness rules not ported).

**Files in this repository that the chore reads or changes:**
- `src/providers/forgeProviders.ts` — the single sanctioned construction site; the only
  non-test file that calls the adapter factories (lines 102, 111, 116, 124, 130). Read-only
  for this chore, but its path is hard-coded in the allowlist and asserted by a test.
- `src/providers/github/`, `src/git/` — the two structurally-exempt packages. Read-only;
  their paths are hard-coded in `EXEMPT_PACKAGES` and asserted by tests.
- `src/providers/github/githubIssueTracker.ts`, `githubCodeHost.ts`, `githubBoardManager.ts`,
  `src/providers/gitlab/gitlabCodeHost.ts`, `gitlabBoardManager.ts`,
  `src/providers/jira/jiraIssueTracker.ts`, `jiraBoardManager.ts`, `src/git/gitContext.ts`,
  `src/git/index.ts` — the declaration sites the "guarded factory names still exist" test
  asserts against, so a rename can never silently blind the rule.
- `package.json` — add the `lint:git-guard` script. Do **not** add `scripts/` to `files`.
- `tsconfig.json` — `include` is currently `["src/**/*.ts"]`; widen to cover `scripts/**/*.ts`
  so `bun run typecheck` covers the guard. Verified 2026-09-10 that `scripts/smokePackage.ts`
  already typechecks clean under these compiler options, so the widening adds no pre-existing
  errors.
- `tsconfig.build.json` — read-only confirmation: `include`/`rootDir` are `src`-only, so the
  guard is excluded from `dist/` with no change needed.
- `vitest.config.ts` — `test.include` is `['src/**/__tests__/**/*.test.ts']`; widen to also
  match `scripts/**/__tests__/**/*.test.ts`.
- `.github/workflows/ci.yml` — add a `bun run lint:git-guard` step to the `check` job.
- `README.md` — add the guard to the "What it does" list and to the Project Structure tree
  (README.md is its own conditional-docs owner).
- `.adw/project.md`, `.adw/commands.md`, `.adw/conditional_docs.md` — project config; the
  guard is a new module with no conditional-docs owner (see **Notes**).
- `app_docs/ci-and-adw-config.md` — conditional-docs owner of `.github/workflows/**`; update
  it for the new CI step.
- `app_docs/feature-wdjsgu-package-build-export-package-build.md` — conditional-docs owner of
  `package.json`, `tsconfig.json`, `tsconfig.build.json` and `scripts/smokePackage.ts`; update
  it for the widened `include` and the new script.

### New Files
- `scripts/checkGitGhGuard.ts` — guard entry point: `EXEMPT_PACKAGES`, `isExemptPackage`,
  `collectTsFiles`, `scanFiles`, `scanSource`, the `git-gh-shellout` rule, `main()`.
- `scripts/guard/violationTypes.ts` — `Violation` / `ViolationRule` (two-rule union).
- `scripts/guard/constructionRule.ts` — the `unsanctioned-construction` rule.
- `scripts/guard/guardReport.ts` — `printSanctionedConstructionSites`.
- `scripts/__tests__/checkGitGhGuard.test.ts` — the ported guard suite, both directions.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### 1. Confirm the ported rules' preconditions against the current tree

- Confirm no non-test file outside `src/providers/forgeProviders.ts` calls one of the seven
  adapter factories or `new GitContext`:
  `grep -rn "createGitHubIssueTracker(\|createGitHubCodeHost(\|createGitHubBoardManager(\|createGitLabCodeHost(\|createGitLabBoardManager(\|createJiraIssueTracker(\|createJiraBoardManager(\|forgeProviders(\|new GitContext(" src | grep -v __tests__`
- Expect only: import specifiers, `export {…} from` re-exports in the three adapter
  `index.ts` barrels, `export function create…(` declarations, string-literal arguments to
  `assertContextBoundTo`, a docblock mention in `src/git/types.ts:122`, and the five real
  calls inside `forgeProviders.ts`. None of the non-`forgeProviders.ts` shapes is a
  bare-identifier call expression or a `new` expression, so none is flagged.
- Confirm no `git …`/`gh …` command literal exists outside the two exempt packages:
  `grep -rn "'gh \|\"gh \|\`gh \|'git \|\"git \|\`git " src scripts | grep -v "^src/git/" | grep -v "^src/providers/github/" | grep -v __tests__`
- If either grep turns up a genuine violation, stop and report it: the port would land red,
  and fixing the call site is a separate decision, not part of this chore.

### 2. Create `scripts/guard/violationTypes.ts`

- Port verbatim from ADW, narrowing the union to the two ported rules:
  `export type ViolationRule = 'git-gh-shellout' | 'unsanctioned-construction';`
- Keep `export type Violation = { file: string; line: number; command: string; rule: ViolationRule };`
- Rewrite the docblock to name this repo's paths (`scripts/checkGitGhGuard.ts`,
  `scripts/guard/constructionRule.ts`) and to state the two-rule scope.

### 3. Create `scripts/guard/constructionRule.ts`

- Port `PROVIDER_CONSTRUCTORS` unchanged — all seven names exist in this repo.
- Port `CONTEXT_CONSTRUCTORS` reduced to a single entry, `'forgeProviders'`. Drop ADW's
  retired names (`createRepoContext`, `mintBoundProviders`, `gitContextFor`,
  `gitContextForSync`, `gitContextForRepo`): they never existed in this library, and the
  "keep the retired name" argument (a boundary-free path reintroduced under a familiar name)
  applied to ADW's own history, not to a fresh package.
- Port `GIT_CONTEXT_CLASS_NAME = 'GitContext'` unchanged.
- `SANCTIONED_CONSTRUCTION_SITES` becomes exactly one entry, with no `owner` field:
  `{ file: 'src/providers/forgeProviders.ts', reason: 'the assembly module: the only site that calls the adapter factories' }`.
  Keep ADW's "NOTHING MAY EVER BE ADDED TO THIS LIST" contract in the docblock — a new
  construction site must call `forgeProviders`, not join the list.
- Port `isSanctionedConstructionSite` (exact path match, never a directory prefix),
  `isFlaggedProviderOrContextCallee`, `isGitContextClassCallee`,
  `describeUnsanctionedConstructionNode` and `flagUnsanctionedConstruction` verbatim.
- Do **not** port `hasGuardedConstruction` or `findStaleSanctionedEntries` (see Chore
  Description).
- Rewrite the module docblock: it must state the structural change — that unlike in ADW,
  this rule is walked over the whole tree including `src/git/` and `src/providers/github/`,
  and that those packages do not get an allowlist entry because they do not call the
  factories outside tests. Keep ADW's two behavioural carve-outs verbatim in the docblock:
  the flagged set is an explicit name set (never a `create*` pattern — `createGhCommandRunner`,
  `createGitHubTokenProvider`, `createIssueCmd` must not match), and only bare-identifier
  call/new expressions are flagged (a property-access callee such as
  `deps.forgeProviders(…)` is an injected seam and is deliberately unflagged; declarations
  are never flagged).

### 4. Create `scripts/guard/guardReport.ts`

- Port `printSanctionedConstructionSites` with the permanent/sunset split removed — print
  `Sanctioned construction sites — N:` followed by one `file — reason` line per entry.
- Do not port `printExtractionScope`.
- Keep ADW's docblock warning: this block must never emit the substring `allowlisted`, which
  is reserved for the entry point's `(0 allowlisted)` capstone line.

### 5. Create `scripts/checkGitGhGuard.ts`

- Port `EXEMPT_DIR_NAMES` unchanged (`node_modules`, `dist`, `.worktrees`, `.claude`,
  `features`, `test`).
- Port `EXEMPT_PACKAGES` as a two-entry `as const` array with this repo's paths:
  `{ dir: 'src/git', role: 'git core — the only package that may run git commands' }` and
  `{ dir: 'src/providers/github', role: 'GitHub forge adapter — the only package whose gh call sites may feed the core executor' }`.
- Port `isExemptPackage`, `GIT_GH_RE`, `isScannable` and `visitDir` unchanged.
- **Structural change:** `collectTsFiles(startDir, repoRoot)` now performs one whole-tree
  walk pruning only `EXEMPT_DIR_NAMES`. Delete `pruneExemptPackages`, `descendIntoScope`, and
  `visitDir`'s `descend` parameter — a single prune predicate on `EXEMPT_DIR_NAMES` is all
  that is left. Note in the docblock that the exempt packages are now *scanned* and filtered
  per-rule, not pruned from discovery.
- Port `scanFiles(relPaths, repoRoot)` unchanged in signature and `ScanResult` shape.
- `scanSource(filePath, source)` becomes:
  - always run `flagUnsanctionedConstruction(sourceFile, filePath)`;
  - run the `git-gh-shellout` walk (`walkNode`) only when `!isExemptPackage(filePath)`.
- Port `walkNode` and `extractGitGhCommand` verbatim (string literal,
  no-substitution template literal, and template expression whose head matches — reported as
  `head + '${...}'`).
- Do not port `scanExtractionScope`, `collectExtractionScopeFiles`, `collectScopeEntry` or
  `collectConstructionSeenFiles`.
- Port `main()`, reduced to two rules:
  - `const repoRoot = process.cwd();`
  - `collectTsFiles(repoRoot, repoRoot)` → `scanFiles(...)`;
  - print the `Git/GH CLI Guard — scanned N files (0 allowlisted)` capstone, the
    `Exempt packages (2):` block, then `printSanctionedConstructionSites()`;
  - on zero violations print the two PASS lines (shell-out clean; construction confined to
    the assembly module) and `process.exit(0)`;
  - otherwise print each `file:line  [rule]  command` and the two remedy lines — shell-out:
    route through `GitContext`, or place the code inside `src/git` (git) or
    `src/providers/github` (gh); unsanctioned-construction: receive providers from
    `forgeProviders(...)` instead of constructing them — then `process.exit(1)`.
  - **Important:** every remedy/console string must not begin with `git `/`gh ` at position 0,
    or the guard flags itself. ADW's strings already start with two spaces; preserve that.
- Keep the script-vs-module entry check: `if (process.argv[1]?.includes('checkGitGhGuard')) main();`
- Use NodeNext-compliant relative imports with explicit `.js` extensions
  (`./guard/constructionRule.js`), matching the rest of this repo. Import `typescript`
  (already a devDependency) and `node:fs`/`node:path`.

### 6. Widen `tsconfig.json` and `vitest.config.ts`

- `tsconfig.json`: `"include": ["src/**/*.ts", "scripts/**/*.ts"]`. Leave `tsconfig.build.json`
  untouched — its own `include`/`rootDir` keep `scripts/` out of `dist/`.
- `vitest.config.ts`: `include: ['src/**/__tests__/**/*.test.ts', 'scripts/**/__tests__/**/*.test.ts']`.
- Run `bun run typecheck` here as an early checkpoint: the widening now typechecks
  `scripts/smokePackage.ts` for the first time (verified clean on 2026-09-10) plus the new
  guard files.

### 7. Port the guard test suite (`scripts/__tests__/checkGitGhGuard.test.ts`)

Port from ADW's suite with paths remapped, keeping both directions (a violation is caught,
a legal shape passes). `vi.mock('fs')` at module scope with
`vi.mocked(fs.readFileSync)` driving in-memory sources, exactly as ADW does.

- **`scanFiles` — shell-out rule:** a raw `execSync("git status")` in a non-exempt file
  (e.g. `src/providers/gitlab/gitlabCodeHost.ts`) is one `git-gh-shellout` violation naming
  the command and file; a `` execSync(`gh pr create --title "foo"`) `` likewise; a clean
  `execSync("ls -la")` is zero; every provided path is scanned (no allowlist skip reduces
  `scannedCount`); `scanFiles.length === 2` documents the no-allowlist-parameter contract.
- **New, and the AC's core assertion — the per-rule exemption:** the *same*
  `execSync("git status")` source at `src/git/branchOps.ts` and at
  `src/providers/github/ghCommandRunner.ts` yields **zero** violations, while at
  `src/providers/jira/jiraApiClient.ts` it yields one. This replaces ADW's
  "a whole-repo walk never hands it to scanFiles" counterpart assertion, which no longer
  holds here — the exempt packages are now scanned and filtered inside `scanSource`.
- **`EXEMPT_PACKAGES`:** exactly two entries; the dirs are `src/git` and
  `src/providers/github`; each entry names a non-empty role.
- **`isExemptPackage`:** true for each package directory itself and for a file beneath it;
  false for `src/providers/gitlab/gitlabCodeHost.ts`, false for
  `src/providers/forgeProviders.ts` (one directory above the adapter is not exempt), false
  for `src/providers/jira/jiraIssueTracker.ts`, and false for a path such as
  `src/github/something.ts` whose name merely contains `github`.
- **`scanFiles` — construction rule, flags deliberate violations:** a bare
  `createGitHubIssueTracker(...)`, a bare `createGitLabCodeHost(...)`, a bare
  `createJiraIssueTracker(...)` and a bare `forgeProviders(...)` in a non-allowlisted file
  each yield one `unsanctioned-construction` violation; `new GitContext({...})` yields one
  whose `command` contains `new GitContext`; two constructions in one file yield two
  violations on lines 1 and 2.
- **New — the whole-tree walk:** a bare `createGitHubIssueTracker(...)` at
  `src/providers/github/somethingNew.ts` and a `new GitContext({...})` at
  `src/git/somethingNew.ts` are each **one** `unsanctioned-construction` violation. This is
  the assertion that pins the divergence from ADW, where these files were pruned before the
  rule ran.
- **`scanFiles` — construction rule, does not flag legal shapes:** the same
  `createGitHubIssueTracker(...)` source at `src/providers/forgeProviders.ts` is zero;
  `deps.forgeProviders(...)` and `d.forgeProviders(...)` are zero (injected seams);
  `createGhCommandRunner(ctx)` / `createGitHubTokenProvider({pat})` / `createIssueCmd(o,r,t)`
  are zero (explicit name set, never a `create*` pattern); an
  `export function createGitHubCodeHost(repoId) {…}` declaration is zero.
- **Rule independence:** a `execSync("git status")` inside the construction-sanctioned
  `src/providers/forgeProviders.ts` is still exactly one `git-gh-shellout` violation — the
  construction allowlist must not leak into the shell-out rule.
- **`isSanctionedConstructionSite`:** true for `src/providers/forgeProviders.ts`; false for
  `src/providers/index.ts`, false for `src/providers/github/githubIssueTracker.ts`, false for
  a directory prefix such as `src/providers`; and `SANCTIONED_CONSTRUCTION_SITES` has exactly
  one entry.
- **`guarded factory names still exist`:** port ADW's `it.each` table, remapped to this repo,
  reading each owning source file through `await vi.importActual<typeof import('fs')>('fs')`
  (module-scope `vi.mock('fs')` makes the plain import a mock). Assert the declaration of
  `forgeProviders` in `src/providers/forgeProviders.ts`, `createGitHubIssueTracker` /
  `createGitHubCodeHost` / `createGitHubBoardManager` in their `src/providers/github/` files,
  `createGitLabCodeHost` / `createGitLabBoardManager` in `src/providers/gitlab/`,
  `createJiraIssueTracker` / `createJiraBoardManager` in `src/providers/jira/`,
  `export class GitContext` in `src/git/gitContext.ts`, and the `GitContext` re-export in
  `src/git/index.ts`. The failure message must point at
  `PROVIDER_CONSTRUCTORS`/`CONTEXT_CONSTRUCTORS`/`GIT_CONTEXT_CLASS_NAME` in
  `scripts/guard/constructionRule.ts`. Confirm each `declPattern` against the real file
  before asserting it — check `src/git/index.ts`'s actual `GitContext` export form and
  `src/git/gitContext.ts`'s actual class declaration rather than copying ADW's regexes.
- Do **not** port: the two `cwd-derived-identity` describe blocks, the
  `scanExtractionScope` block, or the `findStaleSanctionedEntries` block.

### 8. Wire the guard into `package.json` and CI

- `package.json` scripts: add `"lint:git-guard": "bunx tsx scripts/checkGitGhGuard.ts"`.
- Leave `files` as `["dist", "README.md", "LICENSE"]` — `scripts/` must not ship.
- `.github/workflows/ci.yml`: add `- run: bun run lint:git-guard` to the `check` job, after
  `bun run typecheck` and before `bun run test:unit`. Adding it to the existing job (rather
  than porting ADW's standalone `git-cli-guard.yml`) keeps one checkout/install for the
  three gates; the ACs require the command in CI, not a dedicated workflow.
- Do not introduce branch protection — the PRD's "Library repository" decision explicitly
  rules it out.

### 9. Run the guard against the real tree and confirm it is green

- `bun run lint:git-guard` from the repo root. It must exit 0 and print the two-entry exempt
  block and the one-entry sanctioned-sites block.
- Confirm the guard scans itself without self-flagging: `scripts/checkGitGhGuard.ts` and
  `scripts/guard/*.ts` are inside the walk and outside both exempt packages. The flagged-name
  sets are string literals inside `new Set([...])`, not call expressions, and the remedy
  strings are indented — neither shape trips a rule. If the guard flags its own output
  strings, re-indent the string rather than weakening `GIT_GH_RE`.
- Sanity-check the live-tree outcome by hand once: temporarily add
  `const x = execSync("git status");` to a scratch file under `src/providers/jira/`, confirm
  the guard exits 1 naming it, then delete the scratch file. Do not commit it.

### 10. Update documentation

- `README.md`: add a "What it does" bullet for the CI git/gh guard (two rules, two-entry
  exempt set, one-entry construction allowlist) and add `scripts/checkGitGhGuard.ts` +
  `scripts/guard/` to the Project Structure tree. Mention the guard in the CI bullet.
- `app_docs/ci-and-adw-config.md`: document the new `lint:git-guard` CI step.
- `app_docs/feature-wdjsgu-package-build-export-package-build.md`: document the widened
  `tsconfig.json` `include`, the widened `vitest.config.ts` `include`, and the new
  `lint:git-guard` script — and record that `tsconfig.build.json`/`files` keep `scripts/`
  out of `dist/` and the tarball.
- `.adw/project.md`: add `scripts/checkGitGhGuard.ts` and `scripts/guard/` to
  `## Relevant Files`, and update the CI description under `.github/workflows/ci.yml`.
- `.adw/commands.md`: the `## Run Linter` section currently reads
  `N/A (no linter configured in this repo)` — replace it with `bun run lint:git-guard`.
- `.adw/conditional_docs.md`: the guard is a new module with no documentation owner. Add an
  entry routing `scripts/checkGitGhGuard.ts` and `scripts/guard/**` to a new
  `app_docs/git-gh-guard.md`, and create that doc describing the two rules, the exempt set,
  the sanctioned-site allowlist, and the two deliberately-unported rules.

### 11. Run the validation commands

- Run every command in `## Validation Commands` below and confirm each exits zero.

## Validation Commands
Execute every command to validate the chore is complete with zero regressions.

- `bun install` — install dependencies (`typescript` and `tsx` are already devDependencies;
  no new dependency is required).
- `bun run typecheck` — `tsc --noEmit` over the widened `include`; must cover
  `scripts/checkGitGhGuard.ts`, `scripts/guard/*.ts` and the pre-existing
  `scripts/smokePackage.ts` with zero errors.
- `bun run lint:git-guard` — the guard itself over the real tree; must exit 0, report two
  exempt packages and one sanctioned construction site, and print both PASS lines.
- `bun run test:unit` — the full vitest suite including the relocated
  `scripts/__tests__/checkGitGhGuard.test.ts`; all tests green, zero regressions in the
  existing `src/**` suites.
- `bun run build` — `tsc -p tsconfig.build.json`; must succeed and must emit **no**
  `dist/checkGitGhGuard.js` and no `dist/guard/`. Verify with
  `ls dist && test ! -e dist/checkGitGhGuard.js && test ! -d dist/guard`.
- `npm pack --dry-run` — confirm the tarball contains only `dist/`, `README.md` and
  `LICENSE`; no `scripts/` entry appears in the listing.
- `bun run smoke:package` — the packed-tarball consumer smoke check, to prove the guard's
  placement and the tsconfig widening changed nothing about the published package.

## Notes
- No `.adw/coding_guidelines.md` (nor `guidelines/coding_guidelines.md`) exists in this
  repository, so no repo-specific guideline file applies. Match the surrounding style
  instead: rich module docblocks explaining *why* (every existing `src/` module has one),
  named exported helpers over inline logic, explicit `.js` extensions on relative imports
  (`moduleResolution: NodeNext` enforces this at typecheck time), and co-located
  `__tests__/` suites. ADW's guard kept its entry point under 300 lines by splitting stdout
  blocks into `guardReport.ts`; that split is preserved here, and with two rules instead of
  four the entry point lands comfortably under it.
- **The one substantive divergence from ADW** is the walk. ADW ran a single walk that pruned
  `EXEMPT_PACKAGES` before any rule saw a file, so the construction rule never inspected the
  adapter that defines the factories. Here the construction rule must see the whole tree,
  so the exemption moves into `scanSource` and applies to the shell-out rule alone. Every
  other behaviour is a verbatim port. Get this wrong and the guard silently stops guarding
  the two packages that make up almost the entire library.
- **Allowlist audit, verified 2026-09-10 against this tree.** The only non-test call sites of
  the seven adapter factories are `src/providers/forgeProviders.ts` lines 102, 111, 116, 124
  and 130. Every other grep hit is a shape the AST rule does not flag: import specifiers;
  `export { createGitLabCodeHost, … } from './…'` re-exports in the three adapter barrels
  (export declarations, not calls); `export function create…(` declarations; the string
  literals `'createGitHubIssueTracker'` / `'createGitHubCodeHost'` /
  `'createGitHubBoardManager'` passed as the third argument to `assertContextBoundTo`; and
  the `new GitContext(options)` mention in a `src/git/types.ts` docblock (line 122 — a
  comment, invisible to the AST). No non-test file constructs `new GitContext`.
- **Shell-out audit, verified 2026-09-10.** No `git …`/`gh …` command literal exists outside
  `src/git/` and `src/providers/github/`. `scripts/smokePackage.ts`'s only near-hit is
  `"if (typeof git.GitContext !== 'function') …"`, which does not match
  `/^(git|gh)(\s|$)/` — the literal starts with `if`. The walk never reaches `.claude/hooks/`
  or `features/`: both basenames are in `EXEMPT_DIR_NAMES`.
- `typescript@^5.7.3` and `tsx@^4.19.3` are already devDependencies; the guard adds no new
  dependency.
- Widening `tsconfig.json`'s `include` brings `scripts/smokePackage.ts` under `typecheck` for
  the first time. It was verified to compile clean under these exact compiler options on
  2026-09-10, but if that changes, fix `smokePackage.ts` — do not narrow the `include` back
  and leave the guard untypechecked.
- The guard's stdout capstone line contains the literal `(0 allowlisted)`. ADW's docblocks
  warn that no other printed block may contain the substring `allowlisted`; preserve that
  invariant when writing `guardReport.ts` so the capstone stays greppable.
- The issue is marked "Blocked by #1", which merged as commit `0e650a1` (package build,
  exports map, CI) and is present on `main`. Nothing else blocks this chore.
- Out of scope: the identity rule, the extraction-readiness rule, the sunset/stale-entry
  ratchet, branch protection, and any change to `src/**` production code. If step 1's greps
  surface a real violation in `src/**`, report it rather than fixing it here — a code change
  to satisfy a new guard is a separate decision.
