# Agent-input scenarios for issue #11 — widen the public surface for the ADW
# switchover.
#
# The system under test is the library's two published barrels as a consumer
# sees them: `@paysdoc/devplatform/providers` and `@paysdoc/devplatform/git`.
# Every name the issue lists is exercised *through* its barrel — the hermetic
# scenarios resolve the name from the barrel and drive it, the `@packaging`
# scenarios resolve it from the real packed tarball — and every assertion reads
# an output of that name: a credential environment overlay, a resolved token or
# identity, a refusal, a command recorded by an injected executor or transport
# stub, a git artefact in a throwaway repository, or a consumer subprocess's
# exit code and printed report. No scenario inspects a source file; a bare
# "the name is exported" check is never the whole assertion, because a
# re-export that points at the wrong implementation would pass it — which is
# also why two `@packaging` scenarios drive a name from each entry point of the
# tarball rather than only resolving it.
#
# The issue leaves open whether `createForgeCredentials` becomes the documented
# route for the four `launchGitContext.ts` helpers. These scenarios pin the
# direct re-exports ADW's plan assumes (PRD story 29: no behaviour change at the
# switchover), so each helper is shown behaving exactly as the factory path in
# `feature-9.feature` already does — including the two properties the factory
# never exercises on its own: a token provider whose App mint fails must refuse
# rather than serve the personal access token, and the bootstrap identity
# resolver's three `appConfig` states (injected, `null`, not injected) must
# each resolve as documented. The factory scenarios in `feature-9.feature` are
# untouched.
#
# Deliberately NOT covered here:
#   * "`./git` pulls no `src/providers/` module" is a static property of the
#     source tree, guarded by the committed `src/__tests__/importGraph.test.ts`
#     walker — as `feature-9.feature` already records — rather than restated.
#   * The `feat:` commit type and the npm publication (including the v1.1.0
#     OIDC trusted-publisher blocker) are release-process outcomes of the
#     repository, not observable behaviour of the library, so they stay with
#     the release workflow and the maintainers.
#
# Fixture notes for the step layer:
#   * The installation-token mint keeps an expiry-aware, per-repository cache
#     inside the adapter, so the mint scenario names a repository no other
#     scenario mints for.
#   * The push-rejection scenario uses a real local remote: a second clone
#     pushes a commit the first has never seen, so `git push --force-with-lease
#     --force-if-includes` is genuinely rejected rather than stubbed.
#   * The GitHub CLI token reader spawns `gh auth token` through the shell, so
#     the two reader scenarios put a stub `gh` executable first on the PATH
#     for the duration of the scenario and restore the PATH afterwards.
#   * Packaged-consumer modules that build a token provider inject every
#     credential seam (no App, no CLI) so the consumer subprocess never spawns
#     `gh` or reaches the network.

@adw-11
Feature: Widened public surface for the ADW switchover
  As the ADW orchestrator switching over to @paysdoc/devplatform
  I want every helper my launch boundary, App auth shim and step definitions call to resolve from the published entry points
  So that the switchover changes where the code lives and nothing about how it behaves

  # -------------------------------------------------------------------------
  # @paysdoc/devplatform/providers — createGitHubTokenProvider
  # -------------------------------------------------------------------------

  Scenario: A GitHub token provider created through the providers entry point serves the personal access token ahead of the GitHub CLI token
    Given the GitHub App is not configured
    And a GitHub personal access token "ghp_from_pat"
    And the GitHub CLI reports the token "gho_from_cli"
    When a GitHub token provider is created through the providers entry point
    And a credential is requested for "paysdoc/devplatform" with purpose "default"
    Then the credential environment sets "GH_TOKEN" to "ghp_from_pat"

  Scenario: A GitHub token provider created through the providers entry point serves the alternate identity token only for alternate identity requests
    Given the GitHub App is not configured
    And a GitHub personal access token "ghp_from_pat"
    And an alternate identity personal access token "ghp_reviewer"
    And the GitHub CLI reports no token
    When a GitHub token provider is created through the providers entry point
    And a credential is requested for "paysdoc/devplatform" with purpose "alternateIdentity"
    Then the credential environment sets "GH_TOKEN" to "ghp_reviewer"
    When a credential is requested for "paysdoc/devplatform" with purpose "default"
    Then the credential environment sets "GH_TOKEN" to "ghp_from_pat"

  Scenario: A GitHub token provider created through the providers entry point refuses rather than substituting the personal access token when the App's mint fails
    Given the GitHub App is configured with app id "12345" and slug "adw-bot"
    And the GitHub App cannot mint an installation token
    And a GitHub personal access token "ghp_must_not_be_substituted"
    When a GitHub token provider is created through the providers entry point
    Then requesting a credential for "paysdoc/devplatform" with purpose "default" is refused without serving the personal access token

  # -------------------------------------------------------------------------
  # @paysdoc/devplatform/providers — resolveContextToken
  # -------------------------------------------------------------------------

  Scenario: The context token resolver served through the providers entry point returns the App's minted token ahead of a personal access token
    Given the GitHub App is configured with app id "12345" and slug "adw-bot"
    And the GitHub App mints the installation token "ghs_minted"
    And a GitHub personal access token "ghp_must_not_be_substituted"
    And the GitHub CLI reports the token "gho_must_not_be_substituted"
    When a context token is resolved through the providers entry point for "paysdoc/devplatform"
    Then the resolved token is "ghs_minted"

  Scenario: The context token resolver served through the providers entry point falls through to the GitHub CLI token when neither App nor personal access token is configured
    Given the GitHub App is not configured
    And no GitHub personal access token is set
    And the GitHub CLI reports the token "gho_from_cli"
    When a context token is resolved through the providers entry point for "paysdoc/devplatform"
    Then the resolved token is "gho_from_cli"

  Scenario: The context token resolver served through the providers entry point refuses by repository name when no token source resolves
    Given the GitHub App is not configured
    And no GitHub personal access token is set
    And the GitHub CLI reports no token
    When a context token is resolved through the providers entry point for "paysdoc/devplatform"
    Then the token resolution is refused with a message naming "paysdoc/devplatform"

  # -------------------------------------------------------------------------
  # @paysdoc/devplatform/providers — resolveBootstrapGitIdentity
  # -------------------------------------------------------------------------

  Scenario: The bootstrap identity resolver served through the providers entry point derives the App bot identity from an injected App configuration
    Given the GitHub App is configured with app id "12345" and slug "adw-bot"
    And the environment carries no git author identity
    When the bootstrap git identity is resolved through the providers entry point
    Then the bootstrap git identity is "adw-bot[bot]" with email "12345+adw-bot[bot]@users.noreply.github.com"

  Scenario: The bootstrap identity resolver served through the providers entry point derives the App bot identity from the environment's GitHub App triple when no App configuration is injected
    Given no GitHub App configuration is injected
    And the environment advertises a GitHub App with app id "12345" and slug "adw-bot"
    And the environment carries no git author identity
    When the bootstrap git identity is resolved through the providers entry point
    Then the bootstrap git identity is "adw-bot[bot]" with email "12345+adw-bot[bot]@users.noreply.github.com"

  Scenario: The bootstrap identity resolver served through the providers entry point ignores a GitHub App advertised by the environment once the caller has established there is no App
    Given the GitHub App is not configured
    And the environment advertises a GitHub App with app id "12345" and slug "adw-bot"
    And the environment carries no git author identity
    And git config reports user "Local Dev" with email "local-dev@example.com"
    When the bootstrap git identity is resolved through the providers entry point
    Then the bootstrap git identity is "Local Dev" with email "local-dev@example.com"

  Scenario: The bootstrap identity resolver served through the providers entry point prefers the git author environment over git config when no App is configured
    Given the GitHub App is not configured
    And the environment sets the git author to "Release Bot" with email "release-bot@example.com"
    And git config reports user "Local Dev" with email "local-dev@example.com"
    When the bootstrap git identity is resolved through the providers entry point
    Then the bootstrap git identity is "Release Bot" with email "release-bot@example.com"

  Scenario: The bootstrap identity resolver served through the providers entry point falls back to git config when no App is configured and the environment carries no identity
    Given the GitHub App is not configured
    And the environment carries no git author identity
    And git config reports user "Local Dev" with email "local-dev@example.com"
    When the bootstrap git identity is resolved through the providers entry point
    Then the bootstrap git identity is "Local Dev" with email "local-dev@example.com"

  # -------------------------------------------------------------------------
  # @paysdoc/devplatform/providers — isGitHubAppConfigured
  # -------------------------------------------------------------------------

  Scenario Outline: The App configuration check served through the providers entry point reports a configuration complete only when all three fields are present
    Given the GitHub App configuration carries app id "<appId>", slug "<appSlug>" and private key path "<keyPath>"
    When the App configuration is checked through the providers entry point
    Then the App configuration check reports "<verdict>"

    Examples:
      | appId | appSlug | keyPath       | verdict        |
      | 12345 | adw-bot | /keys/app.pem | configured     |
      |       | adw-bot | /keys/app.pem | not configured |
      | 12345 |         | /keys/app.pem | not configured |
      | 12345 | adw-bot |               | not configured |

  # -------------------------------------------------------------------------
  # @paysdoc/devplatform/providers — getInstallationToken
  # -------------------------------------------------------------------------

  Scenario: An installation token minted through the providers entry point is the token the GitHub API exchanged for the App's installation
    Given the GitHub App is configured with app id "12345" and slug "adw-bot" and a freshly generated signing key
    And the GitHub API stub answers installation lookups for "paysdoc/devplatform-mint" with installation "4711" and issues the token "ghs_minted"
    When an installation token is minted through the providers entry point for "paysdoc/devplatform-mint"
    Then the minted token is "ghs_minted"
    And the GitHub API stub recorded an installation lookup for "paysdoc/devplatform-mint" followed by a token exchange for installation "4711"

  Scenario: Minting through the providers entry point without a private key path is refused with a message naming the missing field
    Given the GitHub App configuration carries app id "12345", slug "adw-bot" and private key path ""
    When an installation token is minted through the providers entry point for "paysdoc/devplatform"
    Then the mint is refused with a message naming "privateKeyPath"

  # -------------------------------------------------------------------------
  # @paysdoc/devplatform/providers — ghAuthToken
  # -------------------------------------------------------------------------

  Scenario: The GitHub CLI token reader served through the providers entry point returns what the CLI prints
    Given a stub GitHub CLI on the PATH prints the token "gho_from_stub"
    When the GitHub CLI token is read through the providers entry point
    Then the read token is "gho_from_stub"

  Scenario: The GitHub CLI token reader served through the providers entry point returns an empty token when the CLI fails
    Given a stub GitHub CLI on the PATH exits with an error
    When the GitHub CLI token is read through the providers entry point
    Then the read token is empty

  # -------------------------------------------------------------------------
  # @paysdoc/devplatform/providers — createGhRepoApi
  # -------------------------------------------------------------------------

  Scenario: A repository API composed through the providers entry point issues its gh commands through the bound context's executor with that context's credential
    Given a git context for "paysdoc/devplatform" with the literal credential "fixed-token"
    And the context's executor is a recorder that answers every command with "main"
    When a repository API is composed over the context through the providers entry point
    And the repository API is asked for the default branch
    Then the repository API reports the default branch "main"
    And the recorder captured exactly one command
    And the captured command names "paysdoc/devplatform" and carries "GH_TOKEN" set to "fixed-token"

  # -------------------------------------------------------------------------
  # @paysdoc/devplatform/git — commitOps
  # -------------------------------------------------------------------------

  Scenario: Commit operations served through the git entry point commit a dirty working tree
    Given a fresh git repository on branch "main" with one committed file
    And the working tree gains an uncommitted file "notes.txt"
    When the commit operations from the git entry point commit the working tree with message "adw: commit notes"
    Then the commit operations report a commit was made
    And the repository's latest commit message is "adw: commit notes"
    And the working tree is clean

  Scenario: Commit operations served through the git entry point report nothing to commit on a clean working tree
    Given a fresh git repository on branch "main" with one committed file
    When the commit operations from the git entry point commit the working tree with message "adw: nothing to commit"
    Then the commit operations report nothing was committed
    And the repository still has exactly one commit

  Scenario: Pushing through the git entry point a branch whose remote was moved underneath it is refused with the manual remedy and leaves the remote untouched
    Given a fresh git repository on branch "feature/switchover" with one committed file
    And the branch "feature/switchover" is published to a local remote
    And the remote branch "feature/switchover" gains a commit the local repository has never seen
    And the local branch gains a commit "local work"
    When the commit operations from the git entry point push the branch "feature/switchover"
    Then the push is refused with a message naming "feature/switchover"
    And the refusal names the manual remedy "git push --force-with-lease origin feature/switchover"
    And the remote branch "feature/switchover" still points at the commit the local repository has never seen

  # -------------------------------------------------------------------------
  # @paysdoc/devplatform/git — isLeaseRejection
  # -------------------------------------------------------------------------

  Scenario Outline: The lease-rejection check served through the git entry point classifies a push failure by what git reported
    Given a push failure whose stderr reads "<stderr>"
    When the failure is classified by the lease-rejection check from the git entry point
    Then the lease-rejection check reports "<verdict>"

    Examples:
      | stderr                                                                                  | verdict                |
      | ! [rejected] feature/x -> feature/x (stale info)                                        | a lease rejection      |
      | ! [rejected] feature/x -> feature/x (remote ref updated since checkout)                 | a lease rejection      |
      | fatal: Authentication failed for 'https://github.com/paysdoc/devplatform.git/'          | not a lease rejection  |

  # -------------------------------------------------------------------------
  # @paysdoc/devplatform/git — branchOps
  # -------------------------------------------------------------------------

  Scenario: Branch operations served through the git entry point report the checked-out branch
    Given a fresh git repository on branch "main" with one committed file
    And the repository checks out a new branch "feature/switchover"
    When the branch operations from the git entry point read the current branch
    Then the reported current branch is "feature/switchover"

  Scenario: Branch operations served through the git entry point refuse to delete a protected branch
    Given a fresh git repository on branch "main" with one committed file
    And the repository checks out a new branch "feature/switchover"
    When the branch operations from the git entry point delete the local branch "main"
    Then the branch operations report the branch was not deleted
    And the repository has a local branch "main"

  Scenario: Branch operations served through the git entry point delete an unprotected local branch
    Given a fresh git repository on branch "main" with one committed file
    And the repository also has a local branch "feature/stale"
    When the branch operations from the git entry point delete the local branch "feature/stale"
    Then the branch operations report the branch was deleted
    And the repository has no local branch "feature/stale"

  # -------------------------------------------------------------------------
  # The packed tarball — every widened name, with its declarations
  # -------------------------------------------------------------------------

  @packaging
  Scenario: A packaged consumer resolves every widened name at runtime from its published entry point
    Given the library tarball is installed into a clean consumer project
    When the consumer runs a module that dynamically imports the following names
      | name                        | from                           | kind     |
      | createGitHubTokenProvider   | @paysdoc/devplatform/providers | function |
      | resolveBootstrapGitIdentity | @paysdoc/devplatform/providers | function |
      | resolveContextToken         | @paysdoc/devplatform/providers | function |
      | ghAuthToken                 | @paysdoc/devplatform/providers | function |
      | isGitHubAppConfigured       | @paysdoc/devplatform/providers | function |
      | getInstallationToken        | @paysdoc/devplatform/providers | function |
      | createGhRepoApi             | @paysdoc/devplatform/providers | function |
      | createForgeCredentials      | @paysdoc/devplatform/providers | function |
      | commitOps                   | @paysdoc/devplatform/git       | object   |
      | branchOps                   | @paysdoc/devplatform/git       | object   |
      | isLeaseRejection            | @paysdoc/devplatform/git       | function |
      | createLiteralTokenProvider  | @paysdoc/devplatform/git       | function |
    Then the subprocess exits 0
    And the consumer reports every imported name with its declared kind

  @packaging
  Scenario: The emitted type declarations expose every widened name, including the types, to a TypeScript consumer
    Given the library tarball is installed into a clean consumer project
    When the consumer type-checks a module importing the following names
      | name                        | from                           | kind  |
      | createGitHubTokenProvider   | @paysdoc/devplatform/providers | value |
      | resolveBootstrapGitIdentity | @paysdoc/devplatform/providers | value |
      | resolveContextToken         | @paysdoc/devplatform/providers | value |
      | ghAuthToken                 | @paysdoc/devplatform/providers | value |
      | isGitHubAppConfigured       | @paysdoc/devplatform/providers | value |
      | getInstallationToken        | @paysdoc/devplatform/providers | value |
      | createGhRepoApi             | @paysdoc/devplatform/providers | value |
      | createForgeCredentials      | @paysdoc/devplatform/providers | value |
      | GhRepoApi                   | @paysdoc/devplatform/providers | type  |
      | GitHubAppConfig             | @paysdoc/devplatform/providers | type  |
      | commitOps                   | @paysdoc/devplatform/git       | value |
      | branchOps                   | @paysdoc/devplatform/git       | value |
      | isLeaseRejection            | @paysdoc/devplatform/git       | value |
      | createLiteralTokenProvider  | @paysdoc/devplatform/git       | value |
    Then the subprocess exits 0

  # -------------------------------------------------------------------------
  # The packed tarball — a name from each entry point driven, not merely resolved
  # -------------------------------------------------------------------------

  @packaging
  Scenario: A packaged consumer serves a personal access token through a GitHub token provider built from the providers entry point
    Given the library tarball is installed into a clean consumer project
    When the consumer runs a module that builds a GitHub token provider from "@paysdoc/devplatform/providers" with the personal access token "ghp_from_tarball" and requests a credential for "paysdoc/devplatform"
    Then the subprocess exits 0
    And the consumer reports the credential environment sets "GH_TOKEN" to "ghp_from_tarball"

  @packaging
  Scenario: A packaged consumer classifies a push failure with the lease-rejection check from the git entry point
    Given the library tarball is installed into a clean consumer project
    When the consumer runs a module that classifies the push failure "! [rejected] feature/x -> feature/x (stale info)" with the lease-rejection check from "@paysdoc/devplatform/git"
    Then the subprocess exits 0
    And the consumer reports the failure is a lease rejection
