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
    - When working on the CI pipeline (typecheck/test workflow, release workflow) or on this
      repository's ADW guardrails configuration

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
