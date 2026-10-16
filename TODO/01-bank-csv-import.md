# 01. Bank CSV import with reconciliation

Status: **Proposed — awaiting owner selection.** This document authorizes no implementation or financial write.

Priority: **High** · Relative effort: **Medium**. Estimates describe the current Sheets/Apps Script/PWA architecture, not delivery dates.

## Purpose and expected value

Import a statement without retyping movements or silently creating duplicates.

## User experience

Movements → Import statement. Choose the account, map date/concept/amount columns, preview signed rows and compare potential matches. Separate new, matched and unresolved rows. Only checked rows enter the existing review and confirmation flow.

## Data and calculation contract

Parse files locally with explicit encoding, delimiter, decimal separator and date format. Keep original statement identifiers where supplied. Match account, effective date, signed amount, bank reference and existing operation links; identical café purchases must remain possible. A file fingerprint is supporting evidence, not a substitute for row identity.

## Scope, prerequisites and exclusions

Existing journal, review, correction, cancellation, offline queue and book binding must be reused. Add import metadata only through an explicit schema migration. Start with CSV; defer PDF/OCR and direct banking access.

## Risks and critical tradeoff

CSV formula injection, ambiguous European dates, duplicated retries and partial imports. Reject ambiguous mappings and preserve monetary signs; never infer a transfer or investment solely from its concept.

## Acceptance criteria

1. Import a synthetic mixed income/expense statement and reconcile totals to the cent.
2. Import it again: suggest existing rows rather than submitting them again. Two legitimate same-day equal purchases remain independently selectable.
3. Interrupt a confirmed import and reopen: receipt recovery produces no duplicate movements.
4. Reject malformed dates and unknown accounts before review; no private statements enter GitHub.

## Rollout

Implement only after the owner selects this numbered proposal. Add focused synthetic calculation and browser checks, run the existing financial-flow regressions, and demonstrate the result on the test book. Identify any required Google files and schema migration before publication. Preserve the private review/confirmation, book binding and retry protections.

[Back to the numbered backlog](../TODO.md)
