# 11. Target allocation and contribution-led rebalancing

Status: **Proposed — awaiting owner selection.** This document authorizes no implementation or financial write.

Priority: **High** · Relative effort: **Medium**. Estimates describe the current Sheets/Apps Script/PWA architecture, not delivery dates.

## Purpose and expected value

Show allocation drift and explore directing future contributions toward chosen targets.

## User experience

Investments → Allocation. Enter target weights totaling 100%, compare current/target/difference in percentage points, then simulate a contribution amount. Show suggested distribution as a planning table, with no trading action.

## Data and calculation contract

Use current verified market values and owner-defined groups or products. Treat unpriced assets as unknown and block a complete plan. Separate gross account cash, investment contributions, fees and minimum dealing constraints.

## Scope, prerequisites and exclusions

Owner must select allocation targets; the app does not recommend a risk profile. Reuse generic product IDs and current book binding. Persist targets only through explicit reviewed configuration.

## Risks and critical tradeoff

False precision, stale prices and impossible fractional/minimum subscriptions. Present indicative amounts and residual cash, not executable broker orders.

## Acceptance criteria

1. Targets must total 100% within a declared tolerance and reject negative weights.
2. A zero portfolio supports allocation of a new contribution without division by zero.
3. Suggested purchases plus residual equal the simulated contribution.
4. Missing NAVs block a misleading full allocation.

## Rollout

Implement only after the owner selects this numbered proposal. Add focused synthetic calculation and browser checks, run the existing financial-flow regressions, and demonstrate the result on the test book. Identify any required Google files and schema migration before publication. Preserve the private review/confirmation, book binding and retry protections.

[Back to the numbered backlog](../TODO.md)
