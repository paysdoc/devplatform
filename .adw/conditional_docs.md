- README.md
  - Owns:
    - README.md
  - Conditions:
    - When updating the project overview, description, or top-level usage summary

- app_docs/git-worktree-core.md
  - Owns:
    - src/git/**
  - Conditions:
    - When working on the forge-neutral git/worktree core module: identity bootstrap, branch
      operations, commit operations, worktree create/remove/probe/query/reset operations, the
      working-directory guard, remote operations, git context, or the console logger

- app_docs/forge-providers.md
  - Owns:
    - src/providers/forgeProviders.ts
    - src/providers/index.ts
    - src/providers/types.ts
    - src/providers/workspaceValidation.ts
  - Conditions:
    - When working on the forge-neutral provider selection/registration abstraction, or on
      cross-provider workspace validation shared by the GitHub/GitLab/Jira adapters

- app_docs/github-provider.md
  - Owns:
    - src/providers/github/**
  - Conditions:
    - When working on the GitHub forge adapter: the `gh` CLI command runner, issue/PR parsers and
      APIs, the GitHub board manager, GitHub App auth, GitHub identity, token resolution, or the
      GitHub issue/PR/board/label/secret CLI commands

- app_docs/gitlab-provider.md
  - Owns:
    - src/providers/gitlab/**
  - Conditions:
    - When working on the GitLab forge adapter: the GitLab API client, GitLab code host
      implementation, the GitLab board manager, or GitLab type mappers

- app_docs/jira-provider.md
  - Owns:
    - src/providers/jira/**
  - Conditions:
    - When working on the Jira issue-tracker adapter: the Jira API client, the Jira issue tracker
      implementation, the Jira board manager, or the ADF (Atlassian Document Format) converter

- app_docs/ci-and-adw-config.md
  - Owns:
    - .github/workflows/**
    - .github/adw.yml
  - Conditions:
    - When working on the CI pipeline (typecheck/test workflow, package build/pack/smoke-test job,
      or the PR release-dry-run job) defined in `.github/workflows/ci.yml`, the real release
      workflow's job orchestration (checkout, baseline-tag guard, concurrency, permissions) in
      `.github/workflows/release.yml`, or this repository's ADW guardrails toggle
      (`.github/adw.yml`)

- app_docs/feature-9xqejz-release-automation.md
  - Owns:
    - release.config.js
    - scripts/releaseDryRun.ts
    - src/__tests__/releaseConfig.test.ts
    - src/__tests__/releaseParser.test.ts
    - src/__tests__/semantic-release-commit-analyzer.d.ts
    - src/__tests__/semantic-release-release-notes-generator.d.ts
  - Conditions:
    - When working on the semantic-release configuration (`release.config.js`): the
      agent-prefix-aware commit `parserOpts`, the dry-run plugin toggle, or the analyzer/notes
      generator plugin list
    - When working on the release dry-run script (`scripts/releaseDryRun.ts`, `bun run
      release:dry-run`) or the CI/CD-visible next-version check it prints
    - When working on the v1.0.0 baseline-never-recomputed guard or npm OIDC trusted publishing
      with `NPM_TOKEN` fallback
    - When troubleshooting why an agent-prefixed or plain conventional commit does or does not
      trigger a release, or what release type (patch/minor/major/none) a commit computes to

- app_docs/git-gh-guard.md
  - Owns:
    - scripts/checkGitGhGuard.ts
    - scripts/guard/**
  - Conditions:
    - When working on the CI git/gh shell-out guard or the unsanctioned-construction guard
      rule: the exempt-package set, the sanctioned construction-site allowlist, or the guard's
      report/stdout formatting

- app_docs/feature-wdjsgu-package-build-export-package-build.md
  - Owns:
    - package.json
    - tsconfig.json
    - tsconfig.build.json
    - src/index.ts
    - scripts/smokePackage.ts
    - src/__tests__/importGraph.test.ts
    - src/__tests__/packageExports.test.ts
  - Conditions:
    - When working on the package build pipeline (`tsc` → `dist/`), the `exports`/`files` map,
      the root `src/index.ts` entry point, the NodeNext/`.js`-extension import discipline, the
      import-graph layering test, the package-manifest contract test, or the packed-tarball
      consumer smoke check (`scripts/smokePackage.ts`, `bun run smoke:package`)

- app_docs/bdd-scenarios.md
  - Owns:
    - cucumber.js
    - features/**
  - Conditions:
    - When working on the Cucumber/Gherkin BDD scenario suite (`bun run test:e2e`): per-issue
      `.feature` files, the promoted regression vocabulary, step definitions, the shared
      Cucumber world/support code, or the packaged-consumer (`@packaging`) fixture that packs
      and installs the real tarball
