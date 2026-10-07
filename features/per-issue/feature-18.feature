@adw-18
Feature: git and gh commands run as argument lists, never through a shell

  Rule: gh and git receive every free-text value as exactly one argument, unchanged

    Background:
      Given a git context for "vestmatic/deckerly" with the literal credential "fixed-token"
      And these values, each carrying characters a shell would reinterpret
        | hazard               | value                                                                            |
        | apostrophe           | feat: #52 - Brand colour selection of deckerly's own: black and white is a brand |
        | double quote         | Fix the "Save" button                                                            |
        | backtick             | Fix `foo` crash                                                                  |
        | command substitution | Run $(echo pwned) on the host                                                    |
        | backslash            | Escape C:\Users\deckerly\                                                        |
        | newline              | First line\nSecond line                                                          |

    Scenario: A GitHub code host hands gh each pull request title as the argument after --title
      Given the context's executor is a recorder that answers every command with "https://github.com/vestmatic/deckerly/pull/53"
      When a GitHub code host created through the providers entry point opens a pull request from "feature-issue-52" into "dev" with the body "Implements #52." once per value, with that value as its title
      Then "gh pr create" ran once per value, receiving that value unchanged as the argument after "--title"
      And every "gh pr create" invocation received "Implements #52." on standard input
      And every "gh pr create" invocation also received
        | flag        | argument           |
        | --repo      | vestmatic/deckerly |
        | --head      | feature-issue-52   |
        | --base      | dev                |
        | --body-file | -                  |

    Scenario: A repository API hands gh each pull request label as the argument after its own --label
      Given the context's executor is a recorder that answers every command with "https://github.com/vestmatic/deckerly/pull/53"
      When a repository API is composed over the context through the providers entry point
      And the repository API opens a pull request from "feature-issue-52" into "dev" titled "feat: #52" with the body "Implements #52.", labelled with every value
      Then "gh pr create" ran once, receiving each value unchanged as the argument after its own "--label"

    Scenario: A GitHub issue tracker hands gh each issue title as the argument after --title
      Given the context's executor is a recorder that answers every command with "https://github.com/vestmatic/deckerly/issues/54"
      When a GitHub issue tracker created through the providers entry point creates an issue with the body "Raised by ADW." once per value, with that value as its title
      Then "gh issue create" ran once per value, receiving that value unchanged as the argument after "--title"
      And every "gh issue create" invocation received "Raised by ADW." on standard input

    Scenario Outline: A GitHub issue tracker that <verb> a label hands gh each label name as the argument after --add-label
      Given the context's executor is a recorder that answers every command with "[]"
      When a GitHub issue tracker created through the providers entry point <verb> a label to issue #52 once per value, with that value as the label name
      Then "gh issue edit" ran once per value, receiving that value unchanged as the argument after "--add-label"

      Examples:
        | verb    |
        | adds    |
        | applies |

    Scenario: A GitHub issue tracker that ensures a label hands gh each label name and description as single arguments
      Given the context's executor is a recorder that answers every command with "[]"
      When a GitHub issue tracker created through the providers entry point ensures a label coloured "ededed" once per value, with that value as both its name and its description
      Then "gh label create" ran once per value, receiving that value unchanged as the argument after "create"
      And "gh label create" ran once per value, receiving that value unchanged as the argument after "--description"

    Scenario: A GitHub issue tracker hands gh each search query as the argument after --search
      Given the context's executor is a recorder that answers every command with "[]"
      When a GitHub issue tracker created through the providers entry point searches open issues once per value, with that value as the search query
      Then "gh issue list" ran once per value, receiving that value unchanged as the argument after "--search"

    Scenario: A repository API hands gh each GraphQL string variable as one -f argument
      Given the context's executor is a recorder that answers every command with "{}"
      When a repository API is composed over the context through the providers entry point
      And the repository API runs the GraphQL query "query($status:String!,$number:Int!){viewer{login}}" once per value, with that value as the string variable "status" and 52 as the number variable "number"
      Then "gh api graphql" ran once per value, receiving "status=" followed by that value unchanged as the argument after "-f"
      And every "gh api graphql" invocation also received
        | flag | argument                                                 |
        | -f   | query=query($status:String!,$number:Int!){viewer{login}} |
        | -F   | number=52                                                |

    Scenario Outline: The git context hands git each commit message as the argument after -m when it <operation>
      Given the context's executor is a recorder that answers every command with "?? notes.txt"
      When the git context <operation> once per value, with that value as the commit message
      Then "git commit" ran once per value, receiving that value unchanged as the argument after "-m"

      Examples:
        | operation                       |
        | commits its dirty working tree  |
        | adds and commits "notes.txt"    |
        | removes and commits "stale.txt" |
        | makes an empty claim commit     |

  Rule: Without an injected executor, gh receives its arguments with no shell in between

    Scenario: The pull request for deckerly#52 opens, with its apostrophe title reaching gh verbatim
      Given a stub GitHub CLI on the PATH records each invocation and answers pull request creation with "https://github.com/vestmatic/deckerly/pull/53"
      And a git context for "vestmatic/deckerly" that runs commands through its default executor
      When a GitHub code host created through the providers entry point opens a pull request from "feature-issue-52-brand-colour" into "dev" with the body "Implements #52.", titled
        """
        feat: #52 - Brand colour selection of deckerly's own: black and white is a brand
        """
      Then the code host reports pull request #53 at "https://github.com/vestmatic/deckerly/pull/53"
      And "gh pr create" ran once, receiving that title unchanged as the argument after "--title"
      And every "gh pr create" invocation received "Implements #52." on standard input

  Rule: Without an injected executor, git receives messages, paths and branch names with no shell in between

    Background:
      Given a fresh git repository on branch "main" with one committed file
      And a git context over that repository that runs commands through its default executor

    Scenario: A commit message carrying backticks and a command substitution is committed verbatim and runs nothing on the host
      Given the working tree gains an uncommitted file "notes.txt"
      When the git context commits the working tree with the message
        """
        Fix `touch pwned-by-backtick` and $(touch pwned-by-substitution) in deckerly's "Save" button
        """
      Then the repository's latest commit message is exactly that message
      And the working tree is clean

    Scenario: Paths carrying an apostrophe, a space and a dollar sign are added and committed exactly
      Given the working tree gains an uncommitted file "deckerly's brand.md"
      And the working tree gains an uncommitted file "$HOME notes.md"
      And the working tree gains an uncommitted file "untouched.md"
      When the git context adds and commits these paths with the message "docs: brand notes"
        | path                |
        | deckerly's brand.md |
        | $HOME notes.md      |
      Then the repository's latest commit changes exactly these paths
        | path                |
        | deckerly's brand.md |
        | $HOME notes.md      |
      And the working tree still has the uncommitted file "untouched.md"

    Scenario: A tracked path carrying an apostrophe is removed and committed exactly
      Given the repository commits a file "deckerly's draft.md" containing "draft"
      When the git context removes and commits "deckerly's draft.md" with the message "chore: drop the draft"
      Then the repository's latest commit changes exactly these paths
        | path                |
        | deckerly's draft.md |
      And the repository no longer tracks "deckerly's draft.md"

    Scenario: Committing the working tree leaves out an excluded path carrying an apostrophe
      Given the working tree gains an uncommitted file "notes.txt"
      And the working tree gains an uncommitted file "don't commit.md"
      When the git context commits the working tree with the message "docs: notes", excluding "don't commit.md"
      Then the repository's latest commit changes exactly these paths
        | path      |
        | notes.txt |
      And the working tree still has the uncommitted file "don't commit.md"

    Scenario: A file whose path carries a dollar sign and a space is read back at a ref
      Given the repository commits a file "$HOME notes.md" containing "brand colours: black and white"
      When the git context shows "$HOME notes.md" at "HEAD"
      Then the shown content is "brand colours: black and white"

    Scenario: A worktree for a new branch whose name carries a command substitution is created and removed under exactly that name
      When the git context creates a worktree for the new branch "feature/issue-52-$(whoami)"
      Then the new worktree is checked out on branch "feature/issue-52-$(whoami)"
      When the git context removes the worktree for branch "feature/issue-52-$(whoami)"
      Then the repository has no local branch "feature/issue-52-$(whoami)"

    Scenario: A repository is cloned into a workspace whose path carries an apostrophe and a dollar sign
      When the git entry point's clone operation clones that repository into the workspace "vestmatic's $HOME/deckerly"
      Then the workspace "vestmatic's $HOME/deckerly" is a clone of that repository at the same commit

  Rule: A command built as a shell string cannot come back

    Scenario Outline: The git and gh guard fails a template-literal <program> command handed to a runner in <file>
      Given a source tree whose "<file>" holds the call
        """
        <call>
        """
      When the git and gh guard runs over that source tree
      Then the subprocess exits 1
      And the guard report names "<file>"

      Examples:
        | program | file                                    | call                                                                                                             |
        | git     | src/git/commitOps.ts                    | run(`git commit -m "${message}"`, cwd);                                                                          |
        | gh      | src/providers/github/ghPrApi.ts         | run(`gh pr create --title '${title}' --body-file -`, { input: body });                                           |
        | gh      | src/providers/github/ghCommandRunner.ts | ctx.exec(`gh issue edit ${issueNumber} --add-label ${labelName}`, { cwd: { kind: 'frameworkRoot' }, env: {} }); |

    Scenario: The git and gh guard passes a git command handed to a runner as an argument list
      Given a source tree whose "src/git/commitOps.ts" holds the call
        """
        run(['git', 'commit', '-m', message], cwd);
        """
      When the git and gh guard runs over that source tree
      Then the subprocess exits 0

    @packaging
    Scenario: The emitted declarations accept an injected runner that takes a program and its argument list and reject one that takes a command string
      Given the library tarball is installed into a clean consumer project
      When the consumer type-checks a module that injects these runners through "@paysdoc/devplatform/git"
        | seam                  | runner takes                    | compiler |
        | GitContext's executor | a program and its argument list | accepts  |
        | GitContext's executor | one command string              | rejects  |
        | commitOps             | a program and its argument list | accepts  |
        | commitOps             | one command string              | rejects  |
        | branchOps             | a program and its argument list | accepts  |
        | branchOps             | one command string              | rejects  |
      Then the subprocess exits 0
