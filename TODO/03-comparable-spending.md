# 03. Like-for-like spending comparisons

Status: **Proposed — awaiting owner selection.** This document authorizes no implementation or financial write.

Priority: **High** · Relative effort: **Low–medium**. Estimates describe the current Sheets/Apps Script/PWA architecture, not delivery dates.

## Purpose and expected value

Compare spending against an equivalent observed period instead of a complete month versus half a month.

## User experience

Movements → Analysis. Choose previous month, previous year or a custom reference. Show current amount, reference amount, euro change and percentage only where the denominator is positive. Rank meaningful category changes.

## Data and calculation contract

Use own spending, signed refunds and identical category/account filters. Default a partial current month to the same day count in the reference month, clamped to its end. Show actual bounds. A fully observed zero-spend period is distinct from a period before tracking.

## Scope, prerequisites and exclusions

Existing exact-date spending filters are the baseline. No new ledger writes or external data. Calendar coverage must be checked before showing any comparison.

## Risks and critical tradeoff

Unequal month length, incomplete tracking and category changes can create spurious trends. Keep unmatched categories visible rather than dropping them.

## Acceptance criteria

1. Compare 15 observed days with 15 reference days, not a whole reference month.
2. Handle February, leap years and late-month starts explicitly.
3. Display euro differences for a zero reference; show percentage as unavailable.
4. Every category drilldown reconciles to the displayed total.

## Rollout

Implement only after the owner selects this numbered proposal. Add focused synthetic calculation and browser checks, run the existing financial-flow regressions, and demonstrate the result on the test book. Identify any required Google files and schema migration before publication. Preserve the private review/confirmation, book binding and retry protections.

[Back to the numbered backlog](../TODO.md)
