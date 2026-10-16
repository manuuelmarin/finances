# 02. Net-worth change waterfall

Status: **Proposed — awaiting owner selection.** This document authorizes no implementation or financial write.

Priority: **Medium** · Relative effort: **Medium**. Estimates describe the current Sheets/Apps Script/PWA architecture, not delivery dates.

## Purpose and expected value

Explain where a change in wealth came from, beyond a single percentage.

## User experience

Summary → Explain change. Show opening wealth, income, own spending, investment result, debt adjustments and closing wealth as a bridge. Clicking a component opens its actual supporting records.

## Data and calculation contract

Reconstruct both endpoints using matching account, investment and debt dates. Classify external flows separately from internal transfers. Investment purchases change asset composition, not wealth. Recoverable spending and reimbursements follow the existing ledger rules.

## Scope, prerequisites and exclusions

Depends on complete endpoint valuations and an agreed decomposition identity. Reuse the audited historical wealth reconstruction. Do not replace missing categories with a guessed balancing profit.

## Risks and critical tradeoff

Overlapping categories, inconsistent cutoffs and double-counted investment cash movements. Include an explicit unreconciled difference if the bridge cannot tie exactly.

## Acceptance criteria

1. A transfer changes composition while leaving the bridge total unchanged.
2. Income, refunds, debt principal and investment purchases reconcile to synthetic endpoints.
3. Components plus opening wealth equal closing wealth within declared currency rounding.
4. Unknown valuations disable the complete bridge and identify the missing endpoint.

## Rollout

Implement only after the owner selects this numbered proposal. Add focused synthetic calculation and browser checks, run the existing financial-flow regressions, and demonstrate the result on the test book. Identify any required Google files and schema migration before publication. Preserve the private review/confirmation, book binding and retry protections.

[Back to the numbered backlog](../TODO.md)
