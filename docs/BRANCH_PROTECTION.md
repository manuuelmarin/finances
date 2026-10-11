# Main branch protection

[`.github/rulesets/main.json`](../.github/rulesets/main.json) defines the intended GitHub policy. Committing this file does **not** activate branch protection. A repository administrator must import and save the ruleset in GitHub, then verify that it is **Active**.

## Policy

| Setting                    | Required value                                           |
| -------------------------- | -------------------------------------------------------- |
| Target                     | `refs/heads/main` only                                   |
| Enforcement                | Active                                                   |
| Bypass list                | Empty                                                    |
| Deletion                   | Blocked                                                  |
| Force pushes               | Blocked                                                  |
| Pull request               | Required                                                 |
| Review conversations       | Must be resolved                                         |
| Required approving reviews | 0                                                        |
| Required check             | `quality`, from GitHub Actions (`integration_id: 15368`) |
| Up-to-date branch          | Required before merging                                  |

Zero required approvals keeps a single-maintainer repository usable: authors cannot approve their own PRs. Changes still require a PR, resolved review conversations, and a successful check against the latest `main`. The `quality` job covers dependency audit, commit conventions, build, formatting, lint, unit tests, and desktop/mobile browser tests.

Do not require the `deploy` job before merging. Pages deployment runs from `main` after the merge and depends on `quality`; requiring it on PRs would block that workflow. Do not enable **Restrict updates**, which would prevent normal merges without a bypass actor. Keep the `quality` job ID stable when renaming workflow or step display names.

## Activate in GitHub

1. Download [the ruleset JSON](../.github/rulesets/main.json) using GitHub's raw-file download button.
2. Open repository **Settings → Rules → Rulesets → New ruleset → Import a ruleset** and select the downloaded file.
3. Review the target `main`, the empty bypass list, and the required `quality` check from GitHub Actions. Set **Enforcement status** to **Active**, then save the ruleset.
4. Reopen the saved ruleset and confirm its status and rules. If equivalent rules already exist, review them before importing another ruleset; applicable rules are combined.

Alternatively, create a **New branch ruleset** manually using the policy table above. Editing rules requires repository administration access; ordinary source-code write access is insufficient.

## Verify enforcement

GitHub's public API can report the saved rulesets and effective branch rules without altering the repository:

```text
GET https://api.github.com/repos/manuuelmarin/finances/rulesets
GET https://api.github.com/repos/manuuelmarin/finances/rules/branches/main
```

Confirm that the active rules include `deletion`, `non_fast_forward`, `pull_request`, and `required_status_checks` with the intended parameters. Then use an ordinary maintenance PR to verify that `quality` is required and merging is available once it passes. Do not attempt a destructive force push or deletion as a test, and do not add bypass permissions to work around a failed check.

Reference: GitHub's [ruleset management guide](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/managing-rulesets-for-a-repository) and [ruleset API](https://docs.github.com/en/rest/repos/rules).
