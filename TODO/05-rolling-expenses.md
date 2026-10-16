# 05. Rolling 30/90-day spending trends

Status: **Proposed — awaiting owner selection.** This document authorizes no implementation or financial write.

Priority: **Medium** · Relative effort: **Low–medium**. Estimates describe the current Sheets/Apps Script/PWA architecture, not delivery dates.

## Purpose and expected value

Distinguish sustained changes in variable spending from month-boundary noise.

## User experience

Movements → Trends. Plot trailing 30-day and 90-day own spending for selected categories. Optionally divide by the number of observed days for an explicitly labeled daily mean. Use exact temporal bounds and the common chart menu.

## Data and calculation contract

Compute windows from daily signed amounts, including observed zero days. Never annualize a short sample. By default require a complete window; any optional partial-window display must disclose its actual denominator.

## Scope, prerequisites and exclusions

Depends on existing category classification and coverage. Category selections must be explicit; do not guess what the owner considers essential or variable.

## Risks and critical tradeoff

Overlapping windows are descriptive, not independent evidence. Missing initial history and large one-off purchases can distort comparisons.

## Acceptance criteria

1. A single expense affects exactly the next 30 or 90 trailing windows.
2. Zero-expense days count in averages; unknown history does not.
3. Refunds and selected categories reconcile to raw records.
4. The chart never portrays a 12-day partial mean as a complete 90-day trend.

## Rollout

Implement only after the owner selects this numbered proposal. Add focused synthetic calculation and browser checks, run the existing financial-flow regressions, and demonstrate the result on the test book. Identify any required Google files and schema migration before publication. Preserve the private review/confirmation, book binding and retry protections.

[Back to the numbered backlog](../TODO.md)
