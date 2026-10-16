# 18. Saved analytical views

Status: **Proposed — awaiting owner selection.** This document authorizes no implementation or financial write.

Priority: **High** · Relative effort: **Low–medium**. Estimates describe the current Sheets/Apps Script/PWA architecture, not delivery dates.

## Purpose and expected value

Reopen useful filters and table layouts without rebuilding them every session.

## User experience

Add Save view next to appropriate filters. Name a view, choose it from a compact list and optionally make it the default for that section. Save ranges, category/product selections, columns and ordering; distinguish relative dates from fixed intervals.

## Data and calculation contract

Persist a versioned settings object scoped to book identity and view type. Store stable entity IDs, not account balances or snapshot copies. Validate restored settings against current products/categories and explain removed references.

## Scope, prerequisites and exclusions

Local preferences are the first phase; optional cross-device settings require private backend support. Existing default views and URL navigation remain usable.

## Risks and critical tradeoff

Applying another book’s IDs, silently broadening a missing category filter and restoring stale absolute dates. Explicitly handle empty selections versus all selections.

## Acceptance criteria

1. A saved exact interval restores the same dates and filters after reopening.
2. A relative 30-day view advances with the current report cutoff.
3. Removing an entity marks that selection unavailable rather than switching to All.
4. Views from one book cannot apply to a different bound book.

## Rollout

Implement only after the owner selects this numbered proposal. Add focused synthetic calculation and browser checks, run the existing financial-flow regressions, and demonstrate the result on the test book. Identify any required Google files and schema migration before publication. Preserve the private review/confirmation, book binding and retry protections.

[Back to the numbered backlog](../TODO.md)
