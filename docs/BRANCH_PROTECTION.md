# Main branch protection

[The ruleset JSON](../.github/rulesets/main.json) defines the intended policy. Committing it **does not activate protection**; a repository administrator must import, save and verify it in GitHub.

## Intended policy

Target `main` only, with **Active** enforcement, no bypass actors, and blocked force pushes and deletion. Changes require a PR, resolved review conversations, and the `quality` check from GitHub Actions (`integration_id: 15368`), with the branch up to date before merging.

Required approvals: **0**, allowing a sole maintainer to merge their own PR after checks pass. Authors cannot approve their own PRs. Do not require `deploy`, which runs after merging, or enable **Restrict updates**. Keep the `quality` job ID stable.

## Activate and verify

1. Download the [JSON](../.github/rulesets/main.json) using GitHub's raw-file download button.
2. Open **Settings → Rules → Rulesets → New ruleset → Import a ruleset**.
3. Review the policy, set enforcement to **Active**, save, and reopen to verify. Review existing rules first: applicable rules combine.

Verify saved rulesets and effective rules through these read-only API paths:

```text
GET /repos/manuuelmarin/finances/rulesets
GET /repos/manuuelmarin/finances/rules/branches/main
```

Use an ordinary maintenance PR to confirm that `quality` is required. Never test by force-pushing or deleting `main`, or add bypass permissions to avoid failed checks.

See GitHub's [ruleset guide](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/managing-rulesets-for-a-repository).
