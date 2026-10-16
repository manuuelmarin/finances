# 08. Dated goal contribution history

Status: **Proposed — awaiting owner selection.** This document authorizes no implementation or financial write.

Priority: **Medium** · Relative effort: **Medium**. Estimates describe the current Sheets/Apps Script/PWA architecture, not delivery dates.

## Purpose and expected value

Distinguish saving progress over time from today’s labels on already owned assets.

## User experience

Planning → Goal detail. Add a dated contribution history, target trajectory and cumulative actual contributions. Keep current asset assignments in a separate panel. A contribution may link to an existing transfer but must not duplicate it.

## Data and calculation contract

Add an explicit dated goal-event table with stable IDs, direction, amount and optional movement reference. Define treatment of withdrawals, market gains and reassignment between goals. Current tAsignaciones rows are snapshots, not historical contributions.

## Scope, prerequisites and exclusions

Requires schema migration, corrections/cancellation, journal support and a reconciliation rule between events and current assignments. Never reconstruct dates from current totals.

## Risks and critical tradeoff

Calling earmarking a bank transfer or inferring an invented historical savings curve. Keep contributed cash, assigned assets and market value separately labeled.

## Acceptance criteria

1. A target with existing assignments shows no fabricated contribution history.
2. Two dated contributions and one withdrawal reconcile to the event total.
3. Linked bank movements affect account balances once.
4. Correct/retry/cancel events through the private API without duplicates.

## Rollout

Implement only after the owner selects this numbered proposal. Add focused synthetic calculation and browser checks, run the existing financial-flow regressions, and demonstrate the result on the test book. Identify any required Google files and schema migration before publication. Preserve the private review/confirmation, book binding and retry protections.

[Back to the numbered backlog](../TODO.md)
