# Agent-input scenarios for issue #16 — carry creation/update metadata on the
# forge domain model.
#
# The system under test is the forge domain model as the library's adapters
# fill it in and as a consumer's compiler sees it: an `Issue` fetched through
# the GitHub or Jira issue tracker carries when it was created (`createdAt`)
# and where it lives (`url`); a `PullRequestRecord` listed through the GitHub
# code host carries when it was last updated (`updatedAt`) and where it lives
# (`url`). The hermetic scenarios build each adapter from
# `@paysdoc/devplatform/providers` over a faked forge and assert the values
# that arrive on the returned domain objects — never merely that a field
# exists. The `@packaging` scenarios type-check a consumer module against the
# packed tarball's emitted declarations and read `tsc`'s exit code. No
# scenario inspects a source file.
#
# The adapters are built with their own factories (and, for Jira, the
# tracker's constructor) rather than through `forgeProviders()`: it hands back
# what those same factories return, untransformed, and its Jira path offers no
# transport seam, so driving it would reach the network.
#
# Each forge fake answers the way the real forge does, so each scenario fails
# for the reason the issue names:
#   * GitHub's CLI returns only the fields a command requests with `--json`,
#     and so does the fake: a pull request's `updatedAt` and `url` reach the
#     listed records only if the listing asks for them. The issue fetch
#     already asks for `createdAt` and `url`, so that scenario fails on the
#     mapping that drops them.
#   * Every held issue was last updated after it was created, so a creation
#     timestamp read from the update field fails.
#   * Jira's issue payload carries a REST `self` link, not a browse URL, so the
#     browse URL has to be composed from the instance URL and the issue key.
#   * Timestamps keep each forge's own format — GitHub's `Z`-suffixed ISO 8601,
#     Jira's millisecond `+0000` form — and are expected verbatim, the way
#     `IssueComment.createdAt` already passes through.
#
# The Jira browse URL comes from the instance URL `JiraApiClient` already holds
# and normalises, so the examples include a trailing slash, a doubled trailing
# slash and a context path; and one scenario constructs the tracker from only a
# client and a project key — the way existing callers do — to show the URL
# needs no new constructor argument.
#
# Deliberately NOT covered here:
#   * The `feat:` commit without `!` or a `BREAKING CHANGE` footer, and the
#     `release-dry-run` job computing 1.2.0, are release-process outcomes of
#     the repository rather than behaviour of the library — as
#     `feature-11.feature` already records — so they stay with the release
#     workflow and the maintainers. The surface property they protect is
#     covered: the emitted declarations still accept the Jira issue tracker
#     constructed the way existing callers construct it.
#   * `GitLabCodeHost.listPullRequests()` stays a refusing stub; this issue
#     leaves it unchanged.
#   * The names ADW resolved on its own side (`readLocalRepoInfo`,
#     `parseGitHubIssue`, `selectPreferredPR`, `convertToSshUrl`,
#     `GitLabApiClient`) are out of scope. No scenario exports them, and none
#     pins their absence either: that boundary belongs to this change, not to
#     the published surface for good.
#
# Fixture notes for the step layer:
#   * The GitHub scenarios build a `GitContext` whose executor is the CLI fake.
#     It answers `gh issue view <n> … --json <fields>` with the held issue and
#     `gh pr list … --state all --json <fields> …` with the held pull requests,
#     each projected to exactly `<fields>`, and refuses any other command so an
#     unexpected one fails the scenario loudly. The held issue carries every
#     field `gh issue view` can project, with neutral defaults for the ones the
#     Gherkin leaves out. A held pull request gets a body of its own, and a
#     merge timestamp only when it is merged.
#   * "The listed pull requests carry" matches listed records to rows by number,
#     expects exactly one listed record per row, and compares only the columns
#     it names.
#   * The Jira scenarios inject a scripted `fetchFn` — through the factory's
#     deps, or the `JiraApiClient`'s deps when the scenario constructs the
#     client itself — answering `GET …/rest/api/3/issue/ADW-7` with a
#     Jira-shaped payload. Global `fetch` is never reached.
#   * "Reads … as required strings" means the consumer module returns each
#     field where a `string` is expected under `strict`, so a field that is
#     missing, optional (`string | undefined`) or not a string fails the type
#     check. "As a read-only string" adds a `@ts-expect-error`-guarded
#     reassignment, which fails the check if the member can be reassigned.
#   * The constructor check builds the tracker as `(client, projectKey)` and as
#     `(client, projectKey, logger)`.

@adw-16
Feature: Creation and update metadata on the forge domain model
  As the ADW orchestrator switching over to @paysdoc/devplatform
  I want every issue I fetch to say when it was created and where it lives, and every pull request I list to say when it was last updated and where it lives
  So that the agents reading those four fields keep compiling and working once my in-repo copy of the provider package is deleted

  # -------------------------------------------------------------------------
  # Issue — createdAt and url, from the GitHub issue tracker
  # -------------------------------------------------------------------------

  Scenario: An issue fetched through a GitHub issue tracker carries the creation timestamp and URL GitHub reported for it
    Given a git context for "paysdoc/devplatform" whose executor answers like the GitHub CLI, returning only the fields a command requests
    And GitHub holds issue #42 created at "2026-09-01T10:15:00Z", last updated at "2026-09-22T16:40:00Z", with the URL "https://github.com/paysdoc/devplatform/issues/42"
    When a GitHub issue tracker created through the providers entry point fetches issue #42
    Then the fetched issue was created at "2026-09-01T10:15:00Z"
    And the fetched issue's URL is "https://github.com/paysdoc/devplatform/issues/42"

  # -------------------------------------------------------------------------
  # Issue — createdAt and url, from the Jira issue tracker
  # -------------------------------------------------------------------------

  Scenario Outline: An issue fetched through a Jira issue tracker carries the creation timestamp Jira reported and its browse URL under the configured instance
    Given Jira holds issue "ADW-7" created at "2026-09-01T10:15:00.000+0000", last updated at "2026-09-22T16:40:00.000+0000"
    When a Jira issue tracker for project "ADW" at "<instanceUrl>" created through the providers entry point fetches issue 7
    Then the fetched issue was created at "2026-09-01T10:15:00.000+0000"
    And the fetched issue's URL is "<browseUrl>"

    Examples:
      | instanceUrl                    | browseUrl                                  |
      | https://acme.atlassian.net     | https://acme.atlassian.net/browse/ADW-7    |
      | https://acme.atlassian.net/    | https://acme.atlassian.net/browse/ADW-7    |
      | https://acme.atlassian.net//   | https://acme.atlassian.net/browse/ADW-7    |
      | https://jira.example.com/jira/ | https://jira.example.com/jira/browse/ADW-7 |

  Scenario: A Jira issue tracker constructed from only an API client and a project key takes its browse URL from the client's normalised instance URL
    Given Jira holds issue "ADW-7" created at "2026-09-01T10:15:00.000+0000", last updated at "2026-09-22T16:40:00.000+0000"
    When a Jira API client for "https://acme.atlassian.net/" is constructed through the providers entry point
    And a Jira issue tracker constructed from only that client and the project key "ADW" fetches issue 7
    Then the Jira API client reports the instance URL "https://acme.atlassian.net"
    And the fetched issue's URL is "https://acme.atlassian.net/browse/ADW-7"

  # -------------------------------------------------------------------------
  # PullRequestRecord — updatedAt and url, from the GitHub code host
  # -------------------------------------------------------------------------

  Scenario: Every pull request listed through a GitHub code host carries the update timestamp and URL GitHub reported for it
    Given a git context for "paysdoc/devplatform" whose executor answers like the GitHub CLI, returning only the fields a command requests
    And GitHub holds these pull requests
      | number | state  | updatedAt            | url                                            |
      | 14     | OPEN   | 2026-09-22T09:30:00Z | https://github.com/paysdoc/devplatform/pull/14 |
      | 13     | MERGED | 2026-09-21T17:05:00Z | https://github.com/paysdoc/devplatform/pull/13 |
      | 12     | CLOSED | 2026-09-19T11:45:00Z | https://github.com/paysdoc/devplatform/pull/12 |
    When a GitHub code host created through the providers entry point lists every pull request
    Then the listed pull requests carry
      | number | updatedAt            | url                                            |
      | 14     | 2026-09-22T09:30:00Z | https://github.com/paysdoc/devplatform/pull/14 |
      | 13     | 2026-09-21T17:05:00Z | https://github.com/paysdoc/devplatform/pull/13 |
      | 12     | 2026-09-19T11:45:00Z | https://github.com/paysdoc/devplatform/pull/12 |
    And each listed pull request still carries the body, state and merge timestamp GitHub holds for it

  # -------------------------------------------------------------------------
  # The packed tarball — the emitted declarations
  # -------------------------------------------------------------------------

  @packaging
  Scenario Outline: The declarations emitted for <entryPoint> type an issue's createdAt and url and a pull request record's updatedAt and url as required strings
    Given the library tarball is installed into a clean consumer project
    When the consumer type-checks a module that reads these fields from "<entryPoint>" as required strings
      | type              | field     |
      | Issue             | createdAt |
      | Issue             | url       |
      | PullRequestRecord | updatedAt |
      | PullRequestRecord | url       |
    Then the subprocess exits 0

    Examples:
      | entryPoint                     |
      | @paysdoc/devplatform           |
      | @paysdoc/devplatform/providers |

  @packaging
  Scenario: The emitted declarations expose a Jira API client's instance URL as a read-only string
    Given the library tarball is installed into a clean consumer project
    When the consumer type-checks a module that reads the instance URL of a Jira API client from "@paysdoc/devplatform/providers" as a read-only string
    Then the subprocess exits 0

  @packaging
  Scenario: The emitted declarations still accept a Jira issue tracker constructed from an API client and a project key, with or without a logger
    Given the library tarball is installed into a clean consumer project
    When the consumer type-checks a module that constructs a Jira issue tracker from "@paysdoc/devplatform/providers" with an API client and a project key, with and without a logger
    Then the subprocess exits 0
