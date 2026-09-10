# Feature: Forge-keyed credential factory — `createForgeCredentials` (token provider + bootstrap git identity)

## Metadata
issueNumber: `9`
adwId: `2vdkq1-forge-keyed-credenti`
issueJson: `{"number":9,"title":"Forge-keyed credential factory: createForgeCredentials (token provider + bootstrap git identity)","body":"**Parent PRD:** `paysdoc/AI_Dev_Workflow` `specs/prd/gitcontext-library-extraction.md`. Unblocks the ADW switchover (AI_Dev_Workflow issue 840), whose build stopped because ADW's launch boundary can only build a `TokenProvider` and a bootstrap `GitIdentity` through GitHub-named exports that the published barrels do not carry. The consumer must not name a forge; the library resolves the implementation from the forge name, the way `forgeProviders()` already does for the tracker, code host and board.\n\n## What to build\n\nOne forge-keyed factory in `src/providers/`, exported from `@paysdoc/devplatform/providers`:\n\n```ts\ncreateForgeCredentials(options: {\n  forge: ForgeSelection;          // same selection object forgeProviders() takes\n  identity: RepoIdentifier;\n  deps?: ForgeCredentialDeps;     // per-forge, mirrors ForgeProviderDeps\n}): { tokenProvider: TokenProvider; gitIdentity: GitIdentity }\n```\n\nDispatch on `forge.codeHost`:\n\n- **github** — `tokenProvider` is today's `createGitHubTokenProvider` fed by today's `resolveContextToken` chain (installation token when the App is configured, else PAT, else `gh auth token`), with `alternateIdentityPat` honoured. `gitIdentity` is today's `resolveBootstrapGitIdentity` (App-bot identity when the App is configured, else env, else git config, else the fallback). `deps.github` carries what the launch boundary currently injects by hand: `appConfig` (`GitHubAppConfig | null`, already resolved from env by the caller), `pat?`, `alternateIdentityPat?`, `ghAuthToken?` (test seam), `env?`, `exec?`.\n- **gitlab** — there is no GitLab `TokenProvider` in the tree today. Add the minimal one: a `TokenProvider` whose `credentialEnv` supplies `GitLabConfig.token` for both purposes; `gitIdentity` from env → git config → fallback (no bot derivation). `deps.gitlab` is the existing `GitLabConfig`.\n- Unknown code host: throw at construction, same as `forgeProviders()`.\n\nAlso:\n- Move `createLiteralTokenProvider` out of `src/providers/github/` into the git core and export it from `@paysdoc/devplatform/git` — it is a fixed-string `TokenProvider` with no forge knowledge and every ADW test fixture uses it. Keep the GitHub file re-exporting it so nothing inside the library moves.\n- Do **not** add the GitHub-named helpers (`createGhRepoApi`, `readLocalRepoInfo`, `ghAuthToken`, `resolveContextToken`, `getInstallationToken`, …) to any barrel. They stay adapter-internal; the factory is the only new public name.\n\n## Acceptance criteria\n- [ ] `createForgeCredentials` is importable from `@paysdoc/devplatform/providers`; `createLiteralTokenProvider` from `@paysdoc/devplatform/git`; a committed test packs the tarball and asserts both names resolve at runtime and in the emitted `.d.ts`\n- [ ] Unit tests: github branch reproduces the three token-resolution paths and the App-bot identity; gitlab branch supplies the config token and env/git-config identity; unknown code host throws\n- [ ] `@paysdoc/devplatform/git` still imports nothing from `src/providers/**` (existing import-graph assertion stays green)\n- [ ] `bun run test`, `test:unit`, `lint:git-guard` green\n- [ ] Merged with a `feat:` commit so semantic-release publishes a minor version\n\n## Blocked by\nnone\n","state":"OPEN","author":"paysdoc","labels":[],"createdAt":"2026-09-10T15:00:00Z","comments":[],"actionableComment":null}`

## Feature Description

Today the only way to build the two values a `GitContext` cannot be constructed without — a
`TokenProvider` and a bootstrap `GitIdentity` — is through GitHub-named functions that live
inside the GitHub adapter and sit on no published barrel: `createGitHubTokenProvider`
(`src/providers/github/githubTokenProvider.ts`), the `resolveContextToken` chain,
`getInstallationToken`/`isGitHubAppConfigured` (`appAuth.ts`), `ghAuthToken`, and
`resolveBootstrapGitIdentity` (`githubIdentity.ts`). ADW's launch boundary (the consumer this
library was extracted for) therefore cannot compile against the published package — and even
if it could, it would have to *name a forge* to do so, which is exactly what `forgeProviders()`
was built to avoid for the tracker, code host and board.

This feature adds one forge-keyed factory, `createForgeCredentials()`, in `src/providers/` and
exports it from `@paysdoc/devplatform/providers`. It takes the same `ForgeSelection` object
`forgeProviders()` takes, a `RepoIdentifier`, and a `ForgeCredentialDeps` bag that mirrors
`ForgeProviderDeps` (forge-neutral seams at the top, one per-forge bag each), and returns
`{ tokenProvider, gitIdentity }`:

- **`github`** — `tokenProvider` is today's `createGitHubTokenProvider` fed by today's
  `resolveContextToken` chain (App installation token → PAT → `gh auth token`), with
  `alternateIdentityPat` honoured; `gitIdentity` is today's `resolveBootstrapGitIdentity`
  (App-bot identity → `GIT_AUTHOR_*`/`GIT_COMMITTER_*` environment → `git config` → the ADW
  Bot fallback). The App-bot identity is derived from the **injected** `appConfig`, not
  re-read from the environment.
- **`gitlab`** — a new, minimal GitLab `TokenProvider` whose `credentialEnv` supplies
  `GitLabConfig.token` for both credential purposes, and a bootstrap identity resolved
  environment → git config → fallback with no bot derivation.
- **anything else** — `UnknownForgeError` at construction, before any seam is touched, exactly
  like `forgeProviders()`.

Alongside the factory, `createLiteralTokenProvider` — a fixed-string `TokenProvider` with no
forge logic that every ADW test fixture (and 60+ call sites in this repo's own tests) uses —
moves out of the GitHub adapter into the git core and is exported from
`@paysdoc/devplatform/git`; the GitHub file keeps re-exporting it so nothing inside the library
has to move.

The behavioural contract is already pinned by committed BDD scenarios
(`features/per-issue/feature-9.feature`, tag `@adw-9`, currently RED): 13 hermetic scenarios
drive the factory through `src/providers/index.ts`, and two `@packaging` scenarios pack the real
tarball into a clean consumer, run a module importing both new names, and type-check a consumer
module against the emitted `.d.ts` with the repository's `tsc` under `NodeNext`. Those packaging
scenarios *are* the committed tarball test the issue asks for; this plan wires them into CI and
adds the same two symbol assertions to the existing `scripts/smokePackage.ts`. No GitHub-named
helper is added to any barrel: the factory is the only new public runtime name.

## User Story

As a consumer of `@paysdoc/devplatform` wiring a launch boundary (ADW's `forgeProviders`
switchover)
I want to obtain a `TokenProvider` and a bootstrap `GitIdentity` from the forge name alone,
through the published `./providers` and `./git` entry points
So that my launch code never names a forge-specific helper, compiles against the packed
package, and picks up the GitLab implementation with no code change when the selection changes.

## Problem Statement

1. The published barrels (`src/providers/index.ts`, `src/providers/github/index.ts`,
   `src/git/index.ts`) carry no way to build a `TokenProvider` or a bootstrap `GitIdentity`.
   ADW's switchover build is stopped on this.
2. The functions that *do* build them are GitHub-named and adapter-internal by design (issues
   #792/#793 moved them out of the core precisely so the core carries no forge vocabulary).
   Putting them on a barrel would leak GitHub names into every consumer and contradict the
   forge-neutral contract `forgeProviders()` established.
3. There is no GitLab `TokenProvider` in the tree at all, so a GitLab code-host selection
   currently has no way to hand `GitContext` a credential.
4. `createLiteralTokenProvider` lives in the GitHub adapter although it knows nothing about
   GitHub, forcing even the git core's own tests to import from `src/providers/github/`
   (six test files under `src/git/__tests__/` do this today).
5. `resolveBootstrapGitIdentity` derives the App-bot identity from `GITHUB_APP_*` environment
   variables, but the factory receives an already-resolved `appConfig`; without a seam the
   bot identity would silently depend on ambient environment again (the scenario "GitHub
   bootstrap identity is the App bot identity when the App is configured" runs with an empty
   environment).

## Solution Statement

Add `src/providers/forgeCredentials.ts`, a sibling of `forgeProviders.ts` that reuses its
vocabulary — `ForgeSelection`, `isCodeHostForge`/`CODE_HOST_FORGES`, `UnknownForgeError` — and
its guard-clause shape (validate identity → refuse an unknown code host → refuse a missing
per-forge config → build). Each branch composes what already exists rather than re-implementing
it: the GitHub branch wires `createGitHubTokenProvider` to `isGitHubAppConfigured` +
`getInstallationToken` + `ghAuthToken`, and calls `resolveBootstrapGitIdentity`; the GitLab
branch uses two small new adapter-internal modules (`gitlabTokenProvider.ts`,
`gitlabIdentity.ts`) that compose the core's `readEnvGitIdentity`/`readGitConfigIdentity`. Two
minimal, additive seams go onto existing code so the factory can be both correct and hermetically
tested: `resolveBootstrapGitIdentity` accepts an injected `appConfig` (so the bot identity comes
from the config the caller already resolved, not from ambient environment), and
`UnknownForgeError` accepts an optional source name so the message says which factory refused.

The deps shape follows the issue for `deps.github` (`appConfig`, `pat?`, `alternateIdentityPat?`,
`ghAuthToken?`, `env?`, `exec?`) and `deps.gitlab` (the existing `GitLabConfig`), and — the way
`ForgeProviderDeps` carries a forge-neutral `logger` beside its per-forge bags — carries the
forge-neutral bootstrap-identity seams `env?`/`exec?` at the top level as well. The committed
step layer (`features/step_definitions/forgeCredentials.steps.ts`, `buildDeps`) passes exactly
that shape, and the GitLab git-config scenarios can only be deterministic if the factory reads
the top-level `exec` seam.

`createLiteralTokenProvider` moves verbatim to `src/git/literalTokenProvider.ts`, is exported
from `src/git/index.ts`, and is re-exported from `githubTokenProvider.ts`. The git core's tests
import it from the core; every other import is untouched.

Proof lives in three layers: co-located vitest suites for every new/changed module (the issue's
"unit tests"), the committed `@adw-9` scenarios (13 hermetic + 2 `@packaging`) run through
`bun run test:e2e`, and the `package` CI job's smoke script. The `check` CI job gains the
hermetic scenarios and the `package` job gains the `@packaging` ones, so the committed tarball
test is enforced on every pull request.

## Relevant Files

Use these files to implement the feature:

**Committed scenarios (the behavioural contract — read first, do not weaken):**
- `features/per-issue/feature-9.feature` — 15 `@adw-9` scenarios: App-bot identity from config,
  App-cannot-mint refusal without PAT substitution, PAT path, `gh auth token` path,
  no-source refusal naming the repo, `alternateIdentityPat` selection, GitLab token for both
  purposes, GitLab identity (environment → git config → complete fallback, no bot derivation),
  missing GitLab config refused naming "gitlab", unknown code host refused naming "bitbucket",
  and two `@packaging` scenarios (runtime import + `.d.ts` type-check of a clean consumer).
- `features/step_definitions/forgeCredentials.steps.ts` — how the factory is called: dynamic
  `import('../../src/providers/index.js')`, `buildDeps` producing
  `{ env, exec, github?: { appConfig, pat, alternateIdentityPat, ghAuthToken, env, exec }, gitlab?: { token, instanceUrl } }`,
  `appConfig` with an absent `privateKeyPath` for "cannot mint", a `ghAuthToken` seam
  defaulting to `() => ''`, `exec` stubs for `git config`, and the assertion helpers.
- `features/step_definitions/packagedConsumer.steps.ts`, `features/support/packagedConsumer.ts` —
  the packaging proof: `npm pack` (runs `prepack` → build), `npm install` into a temp consumer,
  Node run of a module importing both names (expects a JSON report with `factory`/`literal`
  as `'function'` and the literal credential value), and `tsc -p` under `NodeNext` against the
  emitted declarations.
- `features/support/world.ts` — the cucumber World: managed `process.env` keys cleared per
  scenario, structural `AppConfigInput`/`GitLabConfigInput`/`ForgeCredentials` shapes
  (`gitIdentity` is compared with `deepEqual` against exactly four fields).
- `cucumber.js`, `package.json` (`test:e2e`), `.adw/commands.md`, `.adw/scenarios.md` — the
  scenario runner wiring (`NODE_OPTIONS="--import tsx" cucumber-js`, `--tags`).

**Source the feature reads or changes:**
- `src/providers/forgeProviders.ts` — the assembly function the factory mirrors: `ForgeSelection`,
  `CODE_HOST_FORGES`, `isCodeHostForge`, `UnknownForgeError` (line 83; gains an optional source
  name), the "needs deps.gitlab (GitLabConfig)" refusal wording (line 122), and the guard-clause
  ordering the factory copies. Only the error class changes.
- `src/providers/index.ts` — the `"./providers"` barrel; gains `export * from './forgeCredentials.js'`.
- `src/providers/types.ts` — `RepoIdentifier`, `validateRepoIdentifier`, `Platform` (read-only).
- `src/providers/github/githubTokenProvider.ts` — `createGitHubTokenProvider` +
  `GitHubTokenProviderInput` (unchanged) and `createLiteralTokenProvider` (line 64; moves to
  the core, re-exported from here).
- `src/providers/github/tokenResolver.ts` — `resolveContextToken`, the App → PAT → `gh auth
  token` chain (read-only; never reads the ambient `GH_TOKEN`).
- `src/providers/github/appAuth.ts` — `GitHubAppConfig`, `isGitHubAppConfigured`,
  `getInstallationToken(config, owner, repo, deps?)`, `AppAuthDeps` (`runCurl`/`apiBaseUrl`),
  `clearAppAuthCaches` (read-only; the factory composes these). Note `createAppJWT` reads the
  key file first, so an absent `privateKeyPath` fails the mint before any curl — the
  "cannot mint" scenario relies on this.
- `src/providers/github/ghAuthToken.ts` — the `gh auth token` read; production default for the
  `ghAuthToken` seam (read-only).
- `src/providers/github/githubIdentity.ts` — `resolveBootstrapGitIdentity`, `BootstrapIdentityDeps`,
  `deriveAppBotIdentity` (private, line 97), `ADW_BOT_FALLBACK_IDENTITY`; gains an `appConfig` dep.
- `src/providers/github/index.ts` — the GitHub barrel; must **not** gain any GitHub-named helper
  (read-only; asserted by a validation grep).
- `src/providers/gitlab/gitlabApiClient.ts` — `GitLabConfig` (`token`, `instanceUrl`) (read-only).
- `src/providers/gitlab/gitlabCodeHost.ts` — precedent for injected GitLab config and the
  `GITLAB_TOKEN`/`GITLAB_INSTANCE_URL` naming ADW's wiring uses (read-only).
- `src/providers/gitlab/index.ts` — the GitLab barrel; the new modules stay adapter-internal
  and are **not** added here (read-only).
- `src/git/types.ts` — `TokenProvider`, `CredentialRequest`, `CredentialPurpose`, `GitIdentity`
  (read-only). Its docblock is the contract that the credential variable's *name* stays on the
  adapter side of the port.
- `src/git/bootstrapIdentity.ts` — `readEnvGitIdentity`, `readGitConfigIdentity`,
  `GitConfigIdentityDeps` (`env`/`exec` seams) that both identity resolvers compose (read-only).
- `src/git/index.ts` — the `"./git"` barrel; gains `createLiteralTokenProvider` and a docblock
  update.
- `src/git/gitContext.ts` — read-only: `assertCompleteIdentity` probes `credentialEnv` once at
  construction (any non-empty overlay is accepted, so a `GITLAB_TOKEN` overlay is valid);
  `commandEnv` spreads the overlay under the `GIT_*` identity keys.
- `src/git/__tests__/gitContext.test.ts`, `gitContextOperations.test.ts`, `gitReadOps.test.ts`,
  `repoApiCwd.test.ts`, `workingDirectoryGuard.test.ts`, `worktreeLogger.test.ts` — the six
  core suites importing `createLiteralTokenProvider` from `../../providers/github/…`; repoint.
- `src/providers/github/__tests__/githubTokenProvider.test.ts` — holds the four
  `createLiteralTokenProvider` tests (lines 193–213) that move with the function.
- `src/providers/github/__tests__/githubIdentity.test.ts` — `resolveBootstrapGitIdentity` suite;
  gains the injected-`appConfig` cases.
- `src/providers/github/__tests__/appAuth.test.ts` — the pattern for a hermetic successful App
  mint (throwaway RSA key via `crypto.generateKeyPairSync`, canned `runCurl`, `clearAppAuthCaches()`).
- `src/providers/__tests__/forgeProviders.test.ts`, `forgeProviders.selection.test.ts`,
  `forgeProvidersFixture.ts` — assertion style for `UnknownForgeError` and the "needs deps.gitlab"
  refusal; `makeRepoId` fixture to reuse.
- `src/__tests__/importGraph.test.ts` — the layering walker; `"./git"` must still reach nothing
  under `src/providers/`; gains positive-control lines.
- `src/__tests__/packageExports.test.ts` — the manifest contract (read-only; no new subpath).
- `scripts/smokePackage.ts` — the packed-tarball consumer check (`importCheck`, lines 75–83);
  gains the two new symbol assertions.
- `scripts/guard/constructionRule.ts`, `scripts/checkGitGhGuard.ts` — read-only. The construction
  rule's name set is explicit and deliberately excludes credential plumbing such as
  `createGitHubTokenProvider`; `createForgeCredentials` is the same kind of function and is not
  added. `features/` is in `EXEMPT_DIR_NAMES`, so the step layer is never scanned.
- `tsconfig.json` — `include` widened with `features/**/*.ts` so `bun run typecheck` covers
  the step layer (verified clean under the repo's compiler options on 2026-09-10).
- `tsconfig.build.json`, `vitest.config.ts`, `package.json` `exports`/`files` — read-only: the
  build excludes `__tests__`, vitest includes `src/**/__tests__/**/*.test.ts`, and neither
  `features/` nor `cucumber.js` can reach `dist/` or the tarball.
- `.github/workflows/ci.yml` — `check` job gains `bun run test:e2e --tags "not @packaging"`;
  `package` job gains `bun run test:e2e --tags "@packaging"` (it already has Node + npm via
  `actions/setup-node`).
- `README.md` — "What it does", the install snippet, Setup (`bun run test:e2e`), and the
  Project Structure tree (conditional-docs owner of the top-level usage summary).
- `app_docs/ci-and-adw-config.md` — conditional-docs owner of `.github/workflows/**`; document
  the two new CI steps and why they are split across the jobs.
- `app_docs/feature-wdjsgu-package-build-export-package-build.md` — conditional-docs owner of
  `scripts/smokePackage.ts` and `tsconfig.json`; document the new smoke assertions and the
  widened `include`.
- `.adw/project.md`, `.adw/conditional_docs.md` — list the new modules and the scenario suite
  under `## Relevant Files`; route `features/**` and `cucumber.js` to an owner (a short new
  `app_docs/bdd-scenarios.md`, or the README entry).
- `UBIQUITOUS_LANGUAGE.md` — add `createForgeCredentials()` to the forge-providers glossary.

### New Files

- `src/git/literalTokenProvider.ts` — `createLiteralTokenProvider(token, alternateIdentityPat?)`,
  moved verbatim from the GitHub adapter.
- `src/git/__tests__/literalTokenProvider.test.ts` — the four moved tests, importing from the
  `"./git"` barrel.
- `src/providers/gitlab/gitlabTokenProvider.ts` — `createGitLabTokenProvider(config: GitLabConfig): TokenProvider`
  (adapter-internal; `GITLAB_TOKEN` overlay for both purposes).
- `src/providers/gitlab/gitlabIdentity.ts` — `resolveGitLabBootstrapGitIdentity(deps?)` and
  `GITLAB_BOT_FALLBACK_IDENTITY` (adapter-internal; environment → git config → fallback).
- `src/providers/gitlab/__tests__/gitlabTokenProvider.test.ts`,
  `src/providers/gitlab/__tests__/gitlabIdentity.test.ts` — co-located suites.
- `src/providers/forgeCredentials.ts` — `createForgeCredentials`, `ForgeCredentialsOptions`,
  `ForgeCredentialDeps`, `GitHubCredentialDeps`, `ForgeCredentials`.
- `src/providers/__tests__/forgeCredentials.test.ts` — the factory suite (github/gitlab/unknown).

## Implementation Plan

### Phase 1: Foundation

Confirm the RED baseline of the committed scenarios, then move `createLiteralTokenProvider`
into the git core (new module, `"./git"` export, GitHub re-export, tests moved, core test
imports repointed) and add the two small seams the factory needs on existing code: an optional
source name on `UnknownForgeError`, and an injected `appConfig` on `resolveBootstrapGitIdentity`
so the App-bot identity derives from the config the caller already resolved (the
environment-derived path stays as the legacy behaviour when `appConfig` is absent). Both are
additive; every existing test keeps passing unchanged.

### Phase 2: Core Implementation

Add the GitLab half that does not exist yet — an adapter-internal `createGitLabTokenProvider`
and `resolveGitLabBootstrapGitIdentity` with their own suites — then the factory itself in
`src/providers/forgeCredentials.ts`: types mirroring `ForgeProviderDeps` (top-level `env`/`exec`
seams plus `github`/`gitlab` bags), guard clauses in `forgeProviders()` order, one small builder
per code host, and a frozen `{ tokenProvider, gitIdentity }` result. Token resolution stays
lazy (per `credentialEnv` call, as today — two scenarios construct credentials with an App
whose key file does not exist and must not fail at construction); identity resolution is eager.
Cover it with a hermetic vitest suite, then export it from the barrel and watch the 13
non-packaging `@adw-9` scenarios go green.

### Phase 3: Integration

Extend the import-graph positive control, add the two symbol assertions to
`scripts/smokePackage.ts`, widen `tsconfig.json` to typecheck the step layer, wire
`bun run test:e2e` into both CI jobs (hermetic scenarios in `check`, `@packaging` in
`package`), run the `@packaging` scenarios green, and update the README, glossary, app docs
and ADW config so the documentation agent and the next planner see the new surface. Finish
with the full validation command list.

## Step by Step Tasks
Execute every step in order, top to bottom.

### 1. Confirm the RED baseline

- `bun install` (the scenario tooling added `@cucumber/cucumber` to `devDependencies`).
- `bun run test:e2e --tags "@adw-9 and not @packaging"` → expect **13 failed** scenarios, every
  one on the same message: `expected "createForgeCredentials" to be exported from
  @paysdoc/devplatform/providers`. Anything else failing means the scenario tooling is broken
  and must be reported, not worked around.
- `bun run test:unit` → 41 files / 924 tests green; `bun run typecheck` and `bun run
  lint:git-guard` clean. These numbers are the regression baseline.

### 2. Move `createLiteralTokenProvider` into the git core

- Create `src/git/literalTokenProvider.ts` with the function moved **verbatim** from
  `src/providers/github/githubTokenProvider.ts` lines 59–70: same signature
  `createLiteralTokenProvider(token: string, alternateIdentityPat?: string): TokenProvider`, same
  `{ GH_TOKEN: … }` overlay, same `'alternateIdentity'` selection. Import `CredentialRequest`/
  `TokenProvider` from `./types.js`. Docblock: a fixed-string provider for tests and fixtures,
  never a production credential source; why it lives in the core (no forge *logic*, and the
  core's own tests need it); why the overlay key stays `GH_TOKEN` (every fixture here and in ADW
  asserts that key; the `@packaging` scenario reads `Object.values(overlay)[0]`, so the value,
  not the key, is the contract there; the production providers keep the variable name on the
  adapter side, per `src/git/types.ts`'s `TokenProvider` docblock).
- `src/git/index.ts`: add `export { createLiteralTokenProvider } from './literalTokenProvider.js';`
  next to the `TokenProvider` type exports, and amend the header docblock (it currently implies
  every `TokenProvider` implementation lives in the adapter).
- `src/providers/github/githubTokenProvider.ts`: delete the local definition and add
  `export { createLiteralTokenProvider } from '../../git/literalTokenProvider.js';` so every
  existing `'../githubTokenProvider.js'` import in `src/providers/**` keeps working. Update its
  docblock accordingly.
- Create `src/git/__tests__/literalTokenProvider.test.ts`: move the four tests from the
  `describe('createLiteralTokenProvider')` block of `githubTokenProvider.test.ts` (lines
  193–213), importing from `'../index.js'` so the barrel export is what is tested. Replace the
  removed block in `githubTokenProvider.test.ts` with one test asserting the GitHub module
  re-exports the very same function object (`toBe`) as `'../../../git/literalTokenProvider.js'`.
- Repoint the six git-core suites (`gitContext.test.ts`, `gitContextOperations.test.ts`,
  `gitReadOps.test.ts`, `repoApiCwd.test.ts`, `workingDirectoryGuard.test.ts`,
  `worktreeLogger.test.ts`) from `'../../providers/github/githubTokenProvider.js'` to
  `'../literalTokenProvider.js'`. Leave every `src/providers/**` test import untouched.
- Checkpoint: `bun run typecheck && bun run test:unit` — 925 tests green (four moved, one
  added), `importGraph.test.ts` still passing (the new module imports only `./types.js`).

### 3. Give `UnknownForgeError` a caller name

- In `src/providers/forgeProviders.ts`, add a fourth, optional constructor parameter
  `source: string = 'forgeProviders'` used as the message prefix:
  `${source}: unknown ${port} forge "${value}" (expected one of: …)`. Existing call sites and
  assertions (`/bananas/`, `/code host/`, `name === 'UnknownForgeError'`) are unaffected.
  Update the class docblock to say it is thrown by both assembly functions.

### 4. Let `resolveBootstrapGitIdentity` derive the App-bot identity from an injected `GitHubAppConfig`

- In `src/providers/github/githubIdentity.ts`, extend `BootstrapIdentityDeps` with
  `appConfig?: GitHubAppConfig | null` (import the type and `isGitHubAppConfigured` from
  `./appAuth.js`). Semantics, documented on the field:
  - `appConfig` **present and complete** (`isGitHubAppConfigured`) → the bot identity derives
    from `appConfig.appId`/`appConfig.appSlug`, regardless of what the environment carries —
    the scenario "GitHub bootstrap identity is the App bot identity when the App is configured"
    runs with an empty environment and expects `adw-bot[bot]` /
    `12345+adw-bot[bot]@users.noreply.github.com`;
  - `appConfig === null` → the caller has established "no App"; skip bot derivation even if
    the environment carries `GITHUB_APP_*`;
  - `appConfig` **absent** (`undefined`) → today's behaviour, unchanged: the `GITHUB_APP_*`
    environment triple decides;
  - an explicitly injected `deps.isAppConfigured` still wins over the derived default (existing
    tests rely on it).
- Implement with a small private helper returning `{ appId, appSlug, configured }` from either
  the config or the environment, so the four-step resolution order stays in one readable
  function and `deriveAppBotIdentity` stays private. Keep the file under the 300-line cap.
  Deriving the identity must never read the private-key file — the scenarios configure an
  absent path.
- Add to `githubIdentity.test.ts`: (a) complete `appConfig` + empty environment →
  config-derived bot identity; (b) `appConfig: null` + environment carrying both
  `GITHUB_APP_*` and `GIT_AUTHOR_*` → the environment identity, never the bot; (c) incomplete
  `appConfig` (`{ appId: 'x' }`) → not configured → environment/git-config/fallback; (d) every
  existing environment-based case is left as is.

### 5. Add the GitLab token provider

- Create `src/providers/gitlab/gitlabTokenProvider.ts` exporting
  `createGitLabTokenProvider(config: GitLabConfig): TokenProvider`. It throws at construction
  when `config.token` is blank (`createGitLabTokenProvider: GitLabConfig.token must not be empty`)
  and otherwise returns a provider whose `credentialEnv` returns a fresh `{ GITLAB_TOKEN: config.token }`
  for **both** purposes (GitLab has no bot-self-approval split to express, so `'alternateIdentity'`
  degrades to the same token — say so in the docblock). Export `GITLAB_TOKEN_ENV_VAR = 'GITLAB_TOKEN'`
  for tests. The docblock explains that the variable name is adapter-owned (the core never learns
  it) and matches the `glab` CLI and the `GITLAB_TOKEN` variable ADW's wiring already reads
  (`gitlabCodeHost.ts`'s factory docblock). The scenarios assert the token *value* reaches the
  overlay, so the key name is this plan's decision, not the scenarios'.
- Do **not** export it from `src/providers/gitlab/index.ts` — adapter-internal; the factory is
  the public name.
- Create `src/providers/gitlab/__tests__/gitlabTokenProvider.test.ts`: `'default'` and
  `'alternateIdentity'` both return the config token; the overlay's keys are exactly
  `['GITLAB_TOKEN']`; a fresh object per call; blank/whitespace token throws naming `token`;
  a poisoned ambient `GITLAB_TOKEN` sentinel (set in `beforeEach`, restored in `afterEach`,
  mirroring `gitlabApiClient.test.ts`) is never returned.

### 6. Add the GitLab bootstrap identity resolver

- Create `src/providers/gitlab/gitlabIdentity.ts` exporting `GITLAB_BOT_FALLBACK_IDENTITY`
  (`ADW Bot` / `adw-bot@users.noreply.gitlab.com`, author and committer) and
  `resolveGitLabBootstrapGitIdentity(deps: GitConfigIdentityDeps = {}): GitIdentity` =
  `readEnvGitIdentity(environment) ?? readGitConfigIdentity({ env: environment, exec: deps.exec }) ?? GITLAB_BOT_FALLBACK_IDENTITY`
  where `environment` is `deps.env` falling back to the process environment. Imports come from
  `../../git/bootstrapIdentity.js` and `../../git/types.js` (providers may import the core;
  never the reverse). Docblock: no bot derivation by design (issue #9); the fallback is
  deliberately forge-shaped and deliberately not in the core (same reasoning as
  `ADW_BOT_FALLBACK_IDENTITY`); the scenario only asserts a *complete* fallback, so the
  address is this plan's decision.
- Not exported from the GitLab barrel.
- Create `src/providers/gitlab/__tests__/gitlabIdentity.test.ts`: environment wins; git config
  via a fake `exec` (copy the `fakeExec` shape from `githubIdentity.test.ts`); fallback when
  `exec` throws; never an empty field; an environment carrying `GITHUB_APP_*` still yields no
  `[bot]` identity.

### 7. Implement `createForgeCredentials` in `src/providers/forgeCredentials.ts`

- Types (all fields `readonly`, all exported):
  - `GitHubCredentialDeps` — `appConfig: GitHubAppConfig | null` (required inside the bag),
    `pat?`, `alternateIdentityPat?`, `ghAuthToken?: () => string` (test seam; production default
    is the adapter's `ghAuthToken`), `env?: NodeJS.ProcessEnv`, `exec?: GitConfigIdentityDeps['exec']`,
    and `appAuth?: AppAuthDeps` (the existing `runCurl`/`apiBaseUrl` transport seam of
    `getInstallationToken`; production default is real curl against `api.github.com`).
  - `ForgeCredentialDeps` — `{ env?: NodeJS.ProcessEnv; exec?: GitConfigIdentityDeps['exec']; github?: GitHubCredentialDeps; gitlab?: GitLabConfig }`.
    `env`/`exec` are the forge-neutral bootstrap-identity seams (the `GitConfigIdentityDeps` pair
    the core already defines) and apply to whichever code host is selected; `gitlab` is
    documented as "required when `forge.codeHost === 'gitlab'`", exactly like `ForgeProviderDeps`.
    Precedence for the GitHub branch: the `deps.github` value when present, else the top-level
    value (the step layer passes both, identical).
  - `ForgeCredentialsOptions` — `{ forge: ForgeSelection; identity: RepoIdentifier; deps?: ForgeCredentialDeps }`.
  - `ForgeCredentials` — `Readonly<{ tokenProvider: TokenProvider; gitIdentity: GitIdentity }>`.
  - Re-export `type { GitHubAppConfig, AppAuthDeps }` from `./github/appAuth.js` so a typed
    consumer can build `deps.github` without importing an adapter-internal module. Types only —
    no runtime helper is re-exported.
- Guard clauses, in `forgeProviders()` order and all before anything is built:
  `validateRepoIdentifier(identity)`, then
  `if (!isCodeHostForge(forge.codeHost)) throw new UnknownForgeError(forge.codeHost, 'code host', CODE_HOST_FORGES, 'createForgeCredentials')`
  (the "bitbucket" scenario passes `platform: Platform.Bitbucket` and only top-level seams;
  the message must name the value). Only the code host is checked — the tracker selection is
  irrelevant to credentials and is not validated.
- `buildGitHubCredentials(identity, deps)` with `deps` defaulting to `{ appConfig: null }`:
  - `const appConfigured = deps.appConfig !== null && isGitHubAppConfigured(deps.appConfig)`;
  - `tokenProvider = createGitHubTokenProvider({ pat, alternateIdentityPat, isAppConfigured: () => appConfigured, mintInstallationToken: (owner, repo) => getInstallationToken(appConfig, owner, repo, deps.appAuth), ghAuthToken: deps.ghAuthToken ?? ghAuthToken })`
    — the mint closure guards a null `appConfig` with a named error (unreachable when
    `appConfigured` is false, but never a `TypeError`);
  - `gitIdentity = resolveBootstrapGitIdentity({ env: environment, exec, appConfig: deps.appConfig })`
    with the precedence above.
  - `deps.github` may be omitted for a GitHub code host: it degrades to "no App, no PAT" — the
    `gh auth token` path at first `credentialEnv`, and environment/git-config/fallback identity.
    Deliberate; documented.
- `buildGitLabCredentials(config, environment, exec)`: if `config` is missing throw
  `createForgeCredentials: code host "gitlab" needs deps.gitlab (GitLabConfig)` (same wording
  family as `forgeProviders`; the scenario asserts the message names "gitlab"); else
  `tokenProvider = createGitLabTokenProvider(config)` and
  `gitIdentity = resolveGitLabBootstrapGitIdentity({ env: environment, exec })`.
- Return `Object.freeze({ tokenProvider, gitIdentity })`.
- Side-effect contract, stated in the docblock: construction never resolves a token — the
  provider resolves per `credentialEnv` call, unmemoised, as today, so no App mint and no
  `gh auth token` spawn at construction (two scenarios configure an App whose key file does
  not exist and expect construction to succeed); construction **does** perform the bootstrap
  identity reads (environment, then `git config` when needed), exactly as
  `resolveBootstrapGitIdentity` does today.
- The file must contain no `git …`/`gh …` string literal (it is outside both guard-exempt
  packages) and must not call any name in the guard's `PROVIDER_CONSTRUCTORS`/`CONTEXT_CONSTRUCTORS`
  sets or `new GitContext`. Keep it well under 300 lines; the module docblock explains the
  forge-keyed dispatch and why the GitHub-named helpers stay off the barrels.

### 8. Unit-test the factory (`src/providers/__tests__/forgeCredentials.test.ts`)

- Fixtures: `makeRepoId` from `forgeProvidersFixture.ts`; a `request()` helper as in
  `githubTokenProvider.test.ts`; an ambient `GH_TOKEN` sentinel set in `beforeEach` / deleted in
  `afterEach` (the tree's "ambient token never leaks" precedent); `clearAppAuthCaches()` in
  `beforeEach`; a throwaway RSA key + `makeRunCurl`-style canned transport copied from
  `appAuth.test.ts` (`{ "id": 4711 }` / 200 for the installation lookup, `{ "token": "ghs_minted", "expires_at": <one hour ahead> }` / 201 for the exchange).
- **github — three token paths and the identity:**
  - complete `appConfig` + `appAuth: { runCurl }` → `credentialEnv(default).GH_TOKEN === 'ghs_minted'`;
    the `ghAuthToken` seam is never called; a supplied `pat` is ignored; the sentinel never
    returned; `gitIdentity` is `my-app[bot]` / `12345+my-app[bot]@users.noreply.github.com` even
    with an empty environment (config-derived);
  - complete `appConfig` with an absent `privateKeyPath` + `pat` → construction succeeds,
    `credentialEnv` throws, and the PAT is never served (the scenario's "cannot mint" shape);
  - `appConfig: null` + `pat` → the PAT; `gitIdentity` from the environment (`GIT_AUTHOR_*`);
  - `appConfig: null`, no PAT, `ghAuthToken: () => 'ghs-from-cli'` → that value; `gitIdentity`
    from a fake `exec` answering `git config user.name`/`user.email`, passed **only** at the top
    level (`deps.exec`) to prove the forge-neutral seam is honoured;
  - `appConfig: null`, nothing → construction succeeds, `credentialEnv` throws
    `/no veracious token for acme\/webapp/`; `gitIdentity` is `ADW_BOT_FALLBACK_IDENTITY` when
    the environment is empty and `exec` throws;
  - `alternateIdentityPat` → `'alternateIdentity'` returns it without minting (`runCurl` not
    called) while `'default'` still resolves normally; whitespace-only `alternateIdentityPat`
    degrades to `'default'`;
  - the `deps.github` seams win over the top-level seams when both are given;
  - incomplete `appConfig` (`{ appId: '1' }`) → not configured: PAT path, no `[bot]` identity;
  - `deps.github` omitted → construction succeeds and `gitIdentity` has four non-empty fields
    (no `credentialEnv` call, so nothing spawns `gh`).
- **gitlab:**
  - `deps.gitlab: { token, instanceUrl }` + top-level environment with `GIT_AUTHOR_*` →
    `GITLAB_TOKEN === token` for both purposes; overlay keys exactly `['GITLAB_TOKEN']`;
    identity from the environment;
  - git-config identity via top-level `exec` fake; fallback `adw-bot@users.noreply.gitlab.com`
    when both are empty; an environment carrying `GITHUB_APP_*` still yields no `[bot]`;
  - no `deps.gitlab` → throws `/gitlab.*deps\.gitlab/i`; blank token → throws naming `token`;
  - a `deps.github` bag passed alongside a GitLab code host is ignored (a throwing `ghAuthToken`
    seam is never invoked).
- **unknown code host:** `'bananas' as CodeHostForge` → `UnknownForgeError`, `name`, message
  matches `/bananas/`, `/code host/` and `/createForgeCredentials/`; no seam (`ghAuthToken`,
  `exec`, `runCurl`) was invoked; `'jira' as CodeHostForge` refused the same way.
- **identity validation:** empty `repo` throws through `validateRepoIdentifier` before any seam runs.
- **result shape:** frozen object; `tokenProvider.credentialEnv` is a function (the same check
  `forgeProviders`'s `assertTokenProvider` applies).

### 9. Export from the providers barrel and turn the hermetic scenarios green

- `src/providers/index.ts`: add `export * from './forgeCredentials.js';`.
- `src/__tests__/importGraph.test.ts`: in the positive-control test also assert
  `reachedProviders.has('src/providers/forgeCredentials.ts')` and that
  `walkImportGraph('src/git/index.ts')` reaches `src/git/literalTokenProvider.ts`. The existing
  "`./git` reaches nothing under `src/providers/`" assertion is the AC and stays untouched.
- `bun run test:e2e --tags "@adw-9 and not @packaging"` → **13 passed**. If a scenario stays red,
  fix the implementation, not the scenario (the feature file is the contract; the only
  legitimate scenario edit is a genuine step-definition bug, which must be reported).
- Checkpoint: `bun run typecheck && bun run lint:git-guard && bun run test:unit`.

### 10. Packaging proof: smoke script, CI wiring, `@packaging` scenarios

- `scripts/smokePackage.ts`: add to `importCheck` two lines asserting
  `typeof providers.createForgeCredentials === 'function'` and
  `typeof git.createLiteralTokenProvider === 'function'`, so the existing `package` CI job
  asserts the same names under Node and Bun.
- `tsconfig.json`: `"include": ["src/**/*.ts", "scripts/**/*.ts", "features/**/*.ts", "release.config.js"]`
  so `bun run typecheck`/`bun run test` cover the step layer (verified clean on 2026-09-10).
  `tsconfig.build.json` keeps its own `src`-only `include`/`rootDir`, so nothing under
  `features/` reaches `dist/` or the tarball.
- `.github/workflows/ci.yml`: in the `check` job add `- run: bun run test:e2e --tags "not @packaging"`
  after `bun run test:unit`; in the `package` job add `- run: bun run test:e2e --tags "@packaging"`
  after `bun run smoke:package`. The split follows `app_docs/ci-and-adw-config.md`'s rule
  ("a new CI check belongs in `check` unless it specifically needs the built/packed artifact"):
  the hermetic scenarios need nothing built; the packaging scenarios need Node + npm + a
  pack, which only `package` provisions (`actions/setup-node@v4`).
- Run `bun run smoke:package`, then `bun run test:e2e --tags "@packaging"` → both scenarios
  pass (the runtime consumer prints `{"factory":"function","literal":"function","credential":"fixed-token"}`;
  the `tsc -p` type-check exits 0). Finally `bun run test:e2e` (everything) → 15 passed.

### 11. Update documentation

- `README.md`: add a "What it does" bullet for the forge-keyed credential factory
  (`createForgeCredentials()` — dispatches on the code-host forge name: GitHub App/PAT/`gh auth
  token` chain + App-bot identity; GitLab config token + environment/git-config identity;
  unknown forge refused at construction) and note that `createLiteralTokenProvider` now ships
  from `@paysdoc/devplatform/git` for test fixtures. Extend the Install snippet with a
  `createForgeCredentials` → `new GitContext(...)` example. Add a BDD-scenarios bullet
  (`bun run test:e2e`, `features/per-issue/`, `@packaging`) and the CI split to the CI bullet.
  Setup: add `bun run test:e2e`. Project Structure: `cucumber.js`, `features/per-issue/`,
  `features/step_definitions/`, `features/support/`, `src/providers/forgeCredentials.ts`,
  `src/git/literalTokenProvider.ts`, and the GitLab token-provider/identity modules.
- `UBIQUITOUS_LANGUAGE.md`: add a `createForgeCredentials()` row to the forge-providers table
  ("the forge-keyed factory that resolves a TokenProvider and a bootstrap GitIdentity from the
  code-host forge name; sibling of forgeProviders()") and a relationship line.
- `app_docs/ci-and-adw-config.md`: document the two new `test:e2e` steps and the job split.
- `app_docs/feature-wdjsgu-package-build-export-package-build.md`: document the new smoke
  assertions and the widened `tsconfig.json` `include` (and that `features/` still cannot
  reach `dist/`).
- `.adw/project.md`: add the new modules and the scenario suite (`cucumber.js`, `features/**`,
  `bun run test:e2e`) to `## Relevant Files` / `## Framework Notes`. `.adw/conditional_docs.md`:
  route `features/**` and `cucumber.js` to an owner (a short new `app_docs/bdd-scenarios.md`
  is the cleanest; otherwise the README entry).

### 12. Run the validation commands

- Run every command in `## Validation Commands` below and confirm each exits zero. Commit with
  a `feat:` type (e.g. `build-agent: feat: add forge-keyed credential factory`) so the merge
  computes a minor release. The uncommitted scenario tooling already in the worktree
  (`cucumber.js`, `features/**`, `package.json`/`bun.lock` cucumber devDependency and
  `test:e2e` script, `.adw/commands.md`, `.adw/scenarios.md`, the README tree lines) belongs
  to this issue's branch and is committed with the feature — never reverted.

## Testing Strategy

### Unit Tests
(The issue's acceptance criteria require these tests explicitly, and `bun run test:unit` is a CI
gate for this repo — see Notes on `.adw/project.md`.)

- `src/git/__tests__/literalTokenProvider.test.ts` — the four moved behaviours, imported from
  the `"./git"` barrel; `githubTokenProvider.test.ts` keeps a single same-function re-export check.
- `src/providers/github/__tests__/githubIdentity.test.ts` — injected `appConfig` (complete →
  config-derived bot; `null` → never bot even with ambient `GITHUB_APP_*`; incomplete → not
  configured); legacy environment path unchanged; explicit `isAppConfigured` still wins.
- `src/providers/gitlab/__tests__/gitlabTokenProvider.test.ts` — both purposes, exact overlay
  keys, fresh object, blank-token refusal, poisoned ambient `GITLAB_TOKEN` never returned.
- `src/providers/gitlab/__tests__/gitlabIdentity.test.ts` — environment → git config →
  fallback, never empty, no bot derivation.
- `src/providers/__tests__/forgeCredentials.test.ts` — the factory: GitHub App mint (real
  `getInstallationToken` over canned `runCurl` + throwaway RSA key), App-cannot-mint without PAT
  substitution, PAT, `gh auth token` seam, nothing-available (lazy throw on `credentialEnv`),
  `alternateIdentityPat`, App-bot identity from config, environment/git-config/fallback
  identity through both the top-level and the `deps.github` seams; GitLab token for both
  purposes and identity chain; missing `deps.gitlab`; unknown/wrong-port code host →
  `UnknownForgeError` naming `createForgeCredentials` with no seam invoked; identity
  validation; frozen result; ambient `GH_TOKEN` sentinel never leaks.
- `src/__tests__/importGraph.test.ts` — existing `"./git"` layering assertion untouched; new
  positive controls for `forgeCredentials.ts` and `literalTokenProvider.ts`.
- Scenario suite (`bun run test:e2e`, committed under `features/`): the 13 hermetic `@adw-9`
  scenarios are the end-to-end acceptance signal for the factory; the 2 `@packaging` scenarios
  are the committed tarball test (runtime import under Node + `.d.ts` type-check under
  `NodeNext`). `scripts/smokePackage.ts` additionally asserts both names under Node and Bun.

### Edge Cases

- `appConfig` present but incomplete (missing `appSlug` or `privateKeyPath`) → not configured:
  PAT/`gh` path and no `[bot]` identity; never a `TypeError` from `fs.readFileSync(undefined)`.
- `appConfig` complete but the key file is absent → construction succeeds (identity derivation
  never reads the key); the first `credentialEnv` fails at the JWT signing-key read and the PAT
  is not substituted (scenario 2).
- `appConfig: null` while the ambient environment carries `GITHUB_APP_ID`/`SLUG`/
  `PRIVATE_KEY_PATH` → the config wins; no bot identity, no mint.
- `deps.github` omitted for a GitHub code host → valid; token resolution defers to `gh auth
  token` at first `credentialEnv`; identity from environment/git-config/fallback.
- Top-level seams only (no `deps.github` seams) → honoured by both branches; when both levels
  are present the per-forge value wins.
- Whitespace-only `pat` / `alternateIdentityPat` → ignored (existing `resolveContextToken` and
  `createGitHubTokenProvider` semantics).
- Installation-token cache: `clearAppAuthCaches()` before each factory test so a token minted
  for `acme/webapp` in one test never satisfies another.
- GitLab `token` blank or whitespace → refused at construction, naming the field; `instanceUrl`
  is not validated by the credential factory (the code host validates it).
- GitLab `'alternateIdentity'` → same token as `'default'` (documented degradation).
- Unknown (`'bananas'`, `'bitbucket'`) and wrong-port (`'jira'`) code hosts → `UnknownForgeError`
  before any seam runs; the message names `createForgeCredentials`, the value and the port.
- `identity` with empty `owner`/`repo` → `validateRepoIdentifier` throws first.
- `createLiteralTokenProvider` after the move: identical behaviour for both purposes, and the
  GitHub re-export is the same function object (no duplicate implementation).
- `gitIdentity` always carries exactly the four `GitIdentity` fields (the World compares with
  `deepEqual`); never an extra key, never an empty value.

## Acceptance Criteria

- `createForgeCredentials` (plus its option/deps/result types) is exported from
  `@paysdoc/devplatform/providers`; `createLiteralTokenProvider` is exported from
  `@paysdoc/devplatform/git`; the committed `@packaging` scenarios pack the real tarball and
  prove both names resolve at runtime and in the emitted `.d.ts`; `bun run smoke:package`
  asserts the same two names under Node and Bun; both run in CI.
- All 15 `@adw-9` scenarios pass via `bun run test:e2e --tags "@adw-9"`, with no edit to
  `features/per-issue/feature-9.feature`.
- GitHub branch: unit tests reproduce the installation-token, PAT and `gh auth token` paths, the
  `alternateIdentityPat` selection, and the App-bot identity derived from injected `appConfig`.
- GitLab branch: unit tests show `credentialEnv` supplies `GitLabConfig.token` for both purposes
  and the identity resolves environment → git config → fallback with no bot derivation; a
  missing `deps.gitlab` is refused by name.
- An unknown or wrong-port code host throws `UnknownForgeError` at construction, naming the
  value, the port and `createForgeCredentials`, before any seam is touched.
- `src/git/index.ts` still reaches no module under `src/providers/` (`importGraph.test.ts`
  green, untouched assertion).
- No GitHub-named helper (`createGhRepoApi`, `readLocalRepoInfo`, `ghAuthToken`,
  `resolveContextToken`, `getInstallationToken`, `createGitHubTokenProvider`,
  `resolveBootstrapGitIdentity`) and no GitLab-internal helper (`createGitLabTokenProvider`,
  `resolveGitLabBootstrapGitIdentity`) appears on any `index.ts` barrel; only types are
  re-exported alongside the factory.
- `githubTokenProvider.ts` still exports `createLiteralTokenProvider` (as a re-export), so no
  internal import changes outside `src/git/__tests__/`.
- `bun run test` (tsc, now covering `features/`), `bun run test:unit`, `bun run lint:git-guard`,
  `bun run typecheck`, `bun run build`, `npm pack --dry-run`, `bun run smoke:package` and
  `bun run test:e2e` all exit zero; no regression in the existing 924 tests.
- The change lands with a `feat:` conventional-commit type so semantic-release computes a minor
  release.

## Validation Commands
Execute every command to validate the feature works correctly with zero regressions.

- `bun install` — dependencies (no new package beyond the `@cucumber/cucumber` devDependency
  the scenario tooling already added; `typescript`, `tsx` and `vitest` are present).
- `bun run typecheck` — `tsc --noEmit` over `src/**`, `scripts/**` and now `features/**`; zero errors.
- `bun run test` — the issue names this script explicitly (it is `tsc --noEmit` here); zero errors.
- `bun run lint:git-guard` — must exit 0 with `src/providers/forgeCredentials.ts`,
  `src/providers/gitlab/gitlabTokenProvider.ts` and `src/providers/gitlab/gitlabIdentity.ts`
  scanned and clean, and the sanctioned-site list still exactly one entry.
- `bun run test:unit` — the full vitest suite (existing 924 tests plus the new suites), all green.
- `bunx vitest run src/__tests__/importGraph.test.ts src/__tests__/packageExports.test.ts` —
  the layering and manifest proofs in isolation.
- `bun run test:e2e --tags "@adw-9 and not @packaging"` — the 13 hermetic scenarios, all passed.
- `bun run test:e2e --tags "@packaging"` — the 2 packed-tarball scenarios (runtime import +
  `.d.ts` type-check), all passed. Needs `node` and `npm`; takes the longest.
- `bun run test:e2e` — the whole scenario suite (15 passed, 0 failed, no undefined steps under
  `strict: true`).
- `bun run build && grep -q "export declare function createForgeCredentials" dist/providers/forgeCredentials.d.ts && grep -q "export declare function createLiteralTokenProvider" dist/git/literalTokenProvider.d.ts && grep -q "forgeCredentials.js" dist/providers/index.d.ts && grep -q "literalTokenProvider.js" dist/git/index.d.ts && test ! -d dist/features && echo "d.ts OK"` —
  the emitted declarations carry both names through their barrels, and `features/` never
  reaches `dist/`.
- `grep -n "^export" src/index.ts src/providers/index.ts src/providers/github/index.ts src/providers/gitlab/index.ts src/git/index.ts | grep -E "ghAuthToken|resolveContextToken|getInstallationToken|createGhRepoApi|readLocalRepoInfo|createGitHubTokenProvider|resolveBootstrapGitIdentity|createGitLabTokenProvider|resolveGitLabBootstrapGitIdentity"; test $? -eq 1 && echo "barrels carry no forge-named credential helper"` —
  the adapter-internal helpers stay off every barrel.
- `npm pack --dry-run` — the tarball still lists only `dist/`, `README.md`, `LICENSE`.
- `bun run smoke:package` — builds, packs, installs into a fresh consumer and asserts
  `forgeProviders`, `GitContext`, `BoardStatus`, **and now** `createForgeCredentials` and
  `createLiteralTokenProvider` under both Node and Bun.

## Notes

- No `.adw/coding_guidelines.md` (nor `guidelines/coding_guidelines.md`) exists in this
  repository. Match the surrounding style: a module docblock explaining *why* on every new
  file, small named functions over inline logic, `readonly` option/deps interfaces, guard
  clauses first, explicit `.js` extensions on every relative import (`moduleResolution:
  NodeNext` enforces it at typecheck time), co-located `__tests__/` suites, and files under the
  repo's 300-line cap. No decorators, no new abstractions beyond the ones the issue names.
- **Unit tests are planned although `.adw/project.md` has no `## Unit Tests` section.** The
  issue's acceptance criteria name the tests explicitly ("Unit tests: github branch reproduces
  the three token-resolution paths…"), `bun run test:unit` is a CI gate here, and every
  previous plan in `specs/` planned tests the same way. Omitting them would make the plan
  unable to meet the issue.
- **The committed scenarios are the contract.** `features/per-issue/feature-9.feature` and its
  step layer were generated for this issue and are RED on purpose (verified 2026-09-10: 13
  failed, all on the missing export). Two of their choices bind this plan: the deps bag carries
  forge-neutral `env`/`exec` at the top level *and* under `deps.github`; and `deps.gitlab` is a
  plain `GitLabConfig` (so the GitLab identity path must read the top-level `exec` seam to be
  deterministic). Two details they deliberately leave open — the GitLab overlay key and the
  GitLab fallback address — are decided here (`GITLAB_TOKEN`; `adw-bot@users.noreply.gitlab.com`).
- **Two deliberate additions to the issue's `deps` shape**, both additive: top-level
  `env?`/`exec?` (mirroring how `ForgeProviderDeps` carries a forge-neutral `logger` beside its
  per-forge bags, and required by the step layer) and `deps.github.appAuth?: AppAuthDeps` (the
  existing `runCurl`/`apiBaseUrl` seam of `getInstallationToken`, which also lets a consumer
  point at a GitHub Enterprise API base). Without the latter, a *successful* installation-token
  mint could only be unit-tested against the network.
- **Why `resolveBootstrapGitIdentity` gains `appConfig` instead of the factory re-deriving the
  bot identity itself:** the issue says `gitIdentity` "is today's `resolveBootstrapGitIdentity`".
  Keeping the four-step resolution order in that one function — and only changing where the App
  id/slug come from when the caller has already resolved the config — keeps that literally true
  and leaves `deriveAppBotIdentity` private. Today's environment-derived behaviour is preserved
  whenever `appConfig` is absent, so ADW's current call sites are unaffected until they switch.
- **The git/gh guard needs no change.** `createForgeCredentials`, `createGitLabTokenProvider` and
  `resolveGitLabBootstrapGitIdentity` are credential plumbing, the same category as
  `createGitHubTokenProvider`, which the guard's docblock lists as a deliberate non-match; do not
  add them to `PROVIDER_CONSTRUCTORS`/`CONTEXT_CONSTRUCTORS`, and never add a file to
  `SANCTIONED_CONSTRUCTION_SITES`. The three new `src/providers/` modules sit outside the exempt
  packages, so they must not contain a `git …`/`gh …` literal — they only call the core's readers
  and the adapter's `ghAuthToken()` function. `features/` is pruned from the walk by name.
- **Construction is side-effect-free for tokens and eager for identity**, mirroring today's
  boundaries: `createGitHubTokenProvider` resolves per `credentialEnv` call (the only cache on the
  path is `appAuth.ts`'s expiry-aware installation-token cache), while
  `resolveBootstrapGitIdentity` reads environment/`git config` when called. `GitContext`'s
  constructor performs its usual validate-and-discard probe afterwards, so a "no veracious
  token" failure still surfaces at launch time, not at first use. Two scenarios depend on
  construction *not* minting (they configure an App whose key file does not exist).
- **`GITLAB_TOKEN` is the GitLab overlay key.** The core never learns it (it only merges the
  overlay); the adapter owns the name, and it matches the `glab` CLI and the `GITLAB_TOKEN`
  variable ADW's wiring already reads for `GitLabConfig`. The literal provider keeps `GH_TOKEN`
  because every fixture in this repo and in ADW asserts that key — the move is a relocation,
  not a behaviour change.
- The `@packaging` scenarios run `npm pack` (which runs the `prepack` build) and `npm install`
  into a temp consumer, then `node` and the repository's `tsc`; they need `node`/`npm` on the
  runner, which only the `package` CI job provisions — hence the job split. Baseline verified
  on 2026-09-10: `bun run build` ≈ 0.6 s, `bun run test:unit` → 41 files / 924 tests green.
- Out of scope: any change to `resolveContextToken`, `getInstallationToken` or the GitHub
  adapter's resolution order; a Jira credential branch (Jira is an issue tracker, not a code
  host, and takes its config through `ForgeProviderDeps.jira` already); reading configuration
  from the environment inside the library (the caller resolves `appConfig`/`GitLabConfig`, as
  today); any new `package.json` subpath (the two existing entry points carry the new names);
  and editing the committed feature file.
- Release: the merge commit must be `feat: …` (or `<agent-name>: feat: …`) so
  `release.config.js`'s agent-prefix-aware parser computes a minor version.
