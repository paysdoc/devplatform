# Agent-input scenarios for issue #9 — forge-keyed credential factory.
#
# The system under test is the library's public credential surface:
# `createForgeCredentials` behind `@paysdoc/devplatform/providers` and
# `createLiteralTokenProvider` behind `@paysdoc/devplatform/git`. Every assertion
# below reads an *output* of that surface — a credential environment overlay
# returned by `credentialEnv`, a resolved `GitIdentity`, a refusal raised at
# construction or at request time, or the exit code and stdout of a subprocess
# run against the packed tarball. No scenario inspects a source file.
#
# The forge selection also carries an issue tracker, which the credential factory
# never dispatches on; the steps below default it to "github" and leave it out of
# the Gherkin so each scenario names only the input that decides the outcome.
#
# Deliberately NOT covered here: acceptance criterion 3 ("@paysdoc/devplatform/git
# still imports nothing from src/providers/**") is a static property of the source
# tree rather than observable behaviour, so it stays guarded by the committed
# `src/__tests__/importGraph.test.ts` walker instead of being restated in Gherkin.
#
# Two contract details the issue leaves open, left unpinned here on purpose:
#   * The GitLab credential *variable name* is not fixed by the issue, so the
#     GitLab scenarios assert the token *value* reaches the overlay rather than
#     naming a variable. The GitHub scenarios do pin `GH_TOKEN`, because that is
#     the shipped contract of today's `createGitHubTokenProvider`, which the
#     factory must preserve.
#   * The GitLab identity fallback address is not fixed by the issue, so the
#     fallback scenario asserts a *complete* identity rather than a literal one.

@adw-9
Feature: Forge-keyed credential factory
  As a consumer wiring up a run at its launch boundary
  I want one factory that returns a token provider and a bootstrap git identity for a named forge
  So that I never have to reach for a GitHub-named export to obtain a credential

  Scenario: GitHub bootstrap identity is the App bot identity when the App is configured
    Given the forge selection names code host "github" for repository "paysdoc/devplatform"
    And the GitHub App is configured with app id "12345" and slug "adw-bot"
    And the environment carries no git author identity
    When forge credentials are created
    Then the bootstrap git identity is "adw-bot[bot]" with email "12345+adw-bot[bot]@users.noreply.github.com"

  Scenario: A GitHub App that cannot mint refuses rather than substituting the personal access token
    Given the forge selection names code host "github" for repository "paysdoc/devplatform"
    And the GitHub App is configured with app id "12345" and slug "adw-bot"
    And the GitHub App cannot mint an installation token
    And a GitHub personal access token "ghp_must_not_be_substituted"
    When forge credentials are created
    Then requesting a credential for "paysdoc/devplatform" with purpose "default" is refused without serving the personal access token

  Scenario: GitHub credentials serve the personal access token when the App is not configured
    Given the forge selection names code host "github" for repository "paysdoc/devplatform"
    And the GitHub App is not configured
    And a GitHub personal access token "ghp_from_pat"
    And the GitHub CLI reports no token
    When forge credentials are created
    And a credential is requested for "paysdoc/devplatform" with purpose "default"
    Then the credential environment sets "GH_TOKEN" to "ghp_from_pat"

  Scenario: GitHub credentials fall through to the GitHub CLI token when neither App nor personal access token is configured
    Given the forge selection names code host "github" for repository "paysdoc/devplatform"
    And the GitHub App is not configured
    And no GitHub personal access token is set
    And the GitHub CLI reports the token "gho_from_cli"
    When forge credentials are created
    And a credential is requested for "paysdoc/devplatform" with purpose "default"
    Then the credential environment sets "GH_TOKEN" to "gho_from_cli"

  Scenario: GitHub credentials refuse by repository name when no token source resolves
    Given the forge selection names code host "github" for repository "paysdoc/devplatform"
    And the GitHub App is not configured
    And no GitHub personal access token is set
    And the GitHub CLI reports no token
    When forge credentials are created
    Then requesting a credential for "paysdoc/devplatform" with purpose "default" is refused with a message naming "paysdoc/devplatform"

  Scenario: GitHub credentials serve the alternate identity token only for alternate identity requests
    Given the forge selection names code host "github" for repository "paysdoc/devplatform"
    And the GitHub App is not configured
    And a GitHub personal access token "ghp_from_pat"
    And an alternate identity personal access token "ghp_reviewer"
    And the GitHub CLI reports no token
    When forge credentials are created
    And a credential is requested for "paysdoc/devplatform" with purpose "alternateIdentity"
    Then the credential environment sets "GH_TOKEN" to "ghp_reviewer"
    When a credential is requested for "paysdoc/devplatform" with purpose "default"
    Then the credential environment sets "GH_TOKEN" to "ghp_from_pat"

  Scenario: GitLab credentials serve the configured token for both credential purposes
    Given the forge selection names code host "gitlab" for repository "paysdoc/devplatform"
    And the GitLab configuration supplies token "glpat-configured" at "https://gitlab.com"
    When forge credentials are created
    And a credential is requested for "paysdoc/devplatform" with purpose "default"
    Then the credential environment carries the token "glpat-configured"
    When a credential is requested for "paysdoc/devplatform" with purpose "alternateIdentity"
    Then the credential environment carries the token "glpat-configured"

  Scenario: GitLab bootstrap identity comes from the git author environment when it is complete
    Given the forge selection names code host "gitlab" for repository "paysdoc/devplatform"
    And the GitLab configuration supplies token "glpat-configured" at "https://gitlab.com"
    And the environment sets the git author to "Release Bot" with email "release-bot@example.com"
    When forge credentials are created
    Then the bootstrap git identity is "Release Bot" with email "release-bot@example.com"

  Scenario: GitLab bootstrap identity falls back to git config when the environment carries none
    Given the forge selection names code host "gitlab" for repository "paysdoc/devplatform"
    And the GitLab configuration supplies token "glpat-configured" at "https://gitlab.com"
    And the environment carries no git author identity
    And git config reports user "Local Dev" with email "local-dev@example.com"
    When forge credentials are created
    Then the bootstrap git identity is "Local Dev" with email "local-dev@example.com"

  Scenario: GitLab bootstrap identity derives no bot identity from a GitHub App in the environment
    Given the forge selection names code host "gitlab" for repository "paysdoc/devplatform"
    And the GitLab configuration supplies token "glpat-configured" at "https://gitlab.com"
    And the environment carries no git author identity
    And the environment advertises a GitHub App with app id "12345" and slug "adw-bot"
    And git config reports user "Local Dev" with email "local-dev@example.com"
    When forge credentials are created
    Then the bootstrap git identity is "Local Dev" with email "local-dev@example.com"

  Scenario: GitLab bootstrap identity falls back to a complete built-in identity when nothing resolves
    Given the forge selection names code host "gitlab" for repository "paysdoc/devplatform"
    And the GitLab configuration supplies token "glpat-configured" at "https://gitlab.com"
    And the environment carries no git author identity
    And git config reports no identity
    When forge credentials are created
    Then the bootstrap git identity is complete

  Scenario: A GitLab code host without configuration is refused at construction
    Given the forge selection names code host "gitlab" for repository "paysdoc/devplatform"
    And no GitLab configuration is supplied
    When forge credentials are created
    Then creating the credentials is refused with a message naming "gitlab"

  Scenario: An unknown code host is refused at construction
    Given the forge selection names code host "bitbucket" for repository "paysdoc/devplatform"
    When forge credentials are created
    Then creating the credentials is refused with a message naming "bitbucket"

  @packaging
  Scenario: A packaged consumer resolves both new names and serves a literal credential
    Given the library tarball is installed into a clean consumer project
    When the consumer runs a module importing "createForgeCredentials" from "@paysdoc/devplatform/providers" and "createLiteralTokenProvider" from "@paysdoc/devplatform/git"
    Then the subprocess exits 0
    And the consumer reports both imported names are callable
    And the consumer reports the literal credential value "fixed-token"

  @packaging
  Scenario: The emitted type declarations expose both new names to a TypeScript consumer
    Given the library tarball is installed into a clean consumer project
    When the consumer type-checks a module importing "createForgeCredentials" from "@paysdoc/devplatform/providers" and "createLiteralTokenProvider" from "@paysdoc/devplatform/git"
    Then the subprocess exits 0
