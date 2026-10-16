# 07. Optional budget carryover

Status: **Proposed — awaiting owner selection.** This document authorizes no implementation or financial write.

Priority: **Medium** · Relative effort: **Medium**. Estimates describe the current Sheets/Apps Script/PWA architecture, not delivery dates.

## Purpose and expected value

Allow a chosen budget to carry unused room or overspending into its next defined period.

## User experience

Planning → Budget settings. Enable carryover explicitly, select whether to carry a surplus, deficit or both, and show base limit, brought-forward adjustment, spent and remaining separately.

## Data and calculation contract

Store the original limit independently of carryover. Link consecutive periods with stable budget IDs and an explicit category/scope. Recompute from confirmed own spending; refunds retain sign. Overlapping unrelated budgets must not feed one another.

## Scope, prerequisites and exclusions

Requires an audited metadata migration and rules for custom/annual/open-ended intervals. Start with closed consecutive periods; do not force carryover on existing budgets.

## Risks and critical tradeoff

Corrections to past spending can change later carryover. Make that dependency visible and decide whether a closed period is recalculated or locked before implementation.

## Acceptance criteria

1. A 100 limit with 80 spent carries 20 only when enabled.
2. Deficit-only and surplus-only policies remain distinct.
3. A corrected past movement updates dependent periods without adding ledger rows.
4. Deleting a budget previews the effect on linked future carryover.

## Rollout

Implement only after the owner selects this numbered proposal. Add focused synthetic calculation and browser checks, run the existing financial-flow regressions, and demonstrate the result on the test book. Identify any required Google files and schema migration before publication. Preserve the private review/confirmation, book binding and retry protections.

[Back to the numbered backlog](../TODO.md)
