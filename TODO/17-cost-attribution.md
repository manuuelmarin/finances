# 17. Investment cost attribution

Status: **Proposed — awaiting owner selection.** This document authorizes no implementation or financial write.

Priority: **Medium** · Relative effort: **Medium**. Estimates describe the current Sheets/Apps Script/PWA architecture, not delivery dates.

## Purpose and expected value

Explain which costs are recorded explicitly and which are already embedded in NAV.

## User experience

Investments → Costs. Separate dealing fees, recorded taxes and reported ongoing fund charges. Show recorded euro costs by period and an optional estimate with assumptions; link each explicit cost to its operation.

## Data and calculation contract

Aggregate explicit commissions/withholding from confirmed trades and distributions. Fund TER/ongoing charges are dated metadata already reflected in NAV; any exposure-weighted estimate must not be subtracted again from measured portfolio returns.

## Scope, prerequisites and exclusions

Proposal 09 metadata ingestion can carry official costs. Requires agreement on nominal versus after-tax reporting and fund-transfer treatment. No tax-return or tax-advice engine in this scope.

## Risks and critical tradeoff

Double charging embedded costs, mixing annual percentages with one-off euro fees and presenting estimates as exact debits.

## Acceptance criteria

1. Explicit commissions reconcile to source operations to the cent.
2. A TER estimate is labeled as an estimate and never changes ledger balances.
3. A fee embedded in a trade is not counted a second time through its linked movement.
4. Correcting or cancelling an operation updates costs without stale totals.

## Rollout

Implement only after the owner selects this numbered proposal. Add focused synthetic calculation and browser checks, run the existing financial-flow regressions, and demonstrate the result on the test book. Identify any required Google files and schema migration before publication. Preserve the private review/confirmation, book binding and retry protections.

## Primary reference

[Methodology or source documentation](https://www.cnmv.es/DocPortal/Publicaciones/Guias/Los_fondos_de_inversion.pdf). A reference is not a production data-feed license; access, coverage and reuse must be checked before implementation.

[Back to the numbered backlog](../TODO.md)
