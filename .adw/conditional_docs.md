
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

- app_docs/forge-providers.md
  - Owns:
    - src/providers/forgeProviders.ts
    - src/providers/forgeCredentials.ts
    - src/providers/index.ts
    - src/providers/types.ts
    - src/providers/workspaceValidation.ts
  - Conditions:
    - When working on the forge-neutral provider selection/registration abstraction, the

- app_docs/github-provider.md
  - Owns:
    - src/providers/github/**
  - Conditions:
    - When working on the GitHub forge adapter: the `gh` CLI command runner, issue/PR parsers and

- app_docs/gitlab-provider.md
  - Owns:
    - src/providers/gitlab/**
  - Conditions:
    - When working on the GitLab forge adapter: the GitLab API client, GitLab code host

- app_docs/ci-and-adw-config.md
  - Owns:
    - .github/workflows/**
    - .github/adw.yml
  - Conditions:
    - When working on the CI pipeline (typecheck/test workflow, package build/pack/smoke-test job,

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
    - When working on the release dry-run script (`scripts/releaseDryRun.ts`, `bun run
    - When working on the v1.0.0 baseline-never-recomputed guard or npm OIDC trusted publishing
    - When troubleshooting why an agent-prefixed or plain conventional commit does or does not

- app_docs/git-gh-guard.md
  - Owns:
    - scripts/checkGitGhGuard.ts
    - scripts/guard/**
  - Conditions:
    - When working on the CI git/gh shell-out guard or the unsanctioned-construction guard

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

- app_docs/bdd-scenarios.md
  - Owns:
    - cucumber.js
    - features/**
  - Conditions:
    - When working on the Cucumber/Gherkin BDD scenario suite (`bun run test:e2e`): per-issue
