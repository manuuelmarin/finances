# 06. Reviewable recurrence suggestions

Status: **Proposed — awaiting owner selection.** This document authorizes no implementation or financial write.

Priority: **Medium** · Relative effort: **Low–medium**. Estimates describe the current Sheets/Apps Script/PWA architecture, not delivery dates.

## Purpose and expected value

Reduce manual classification of subscriptions and repeated bills without automatically booking expenses.

## User experience

Movements → Suggestions. Group possible repeats by account, normalized merchant/concept, approximate amount and spacing. Show evidence dates and a concise reason. Accept or dismiss each suggestion; default recurrence remains No.

## Data and calculation contract

Use only existing confirmed records. Candidate generation is deterministic and versioned; require multiple observations, expose amount/date tolerances and exclude transfers/investment operations. A suggested recurrence flag is not a forecast or a confirmed payment.

## Scope, prerequisites and exclusions

Accepting a suggestion uses the existing correction/review API. Dismissals may be per-book preferences initially. No background creation of financial movements.

## Risks and critical tradeoff

Identical café purchases are not necessarily subscriptions. Avoid large fuzzy-merchant merges and never apply flags without confirmation.

## Acceptance criteria

1. A synthetic monthly bill is suggested with its evidence, while irregular equal purchases remain unclassified.
2. Accepting changes only the reviewed recurrence fields and preserves movement identity.
3. Dismissing never deletes or alters source records.
4. No suggestion creates a future payment or changes a budget.

## Rollout

Implement only after the owner selects this numbered proposal. Add focused synthetic calculation and browser checks, run the existing financial-flow regressions, and demonstrate the result on the test book. Identify any required Google files and schema migration before publication. Preserve the private review/confirmation, book binding and retry protections.

[Back to the numbered backlog](../TODO.md)
