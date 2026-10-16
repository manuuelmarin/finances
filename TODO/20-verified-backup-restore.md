# 20. Verified backup and isolated restore

Status: **Proposed — awaiting owner selection.** This document authorizes no implementation or financial write.

Priority: **High** · Relative effort: **Medium**. Estimates describe the current Sheets/Apps Script/PWA architecture, not delivery dates.

## Purpose and expected value

Make recovery demonstrable instead of assuming a Sheet copy covers the complete system.

## User experience

Configuration → Backup and recovery. Explain included components, create a private dated backup manifest and rehearse restoration into a separately bound test book. Show verification results before offering a production cutover.

## Data and calculation contract

Include business data, formulas/table metadata, auxiliary operation/audit tables, book binding/configuration and documented trigger/deployment settings. Keep public code/version references separate from private backup content. Do not publish the owner’s data or credentials.

## Scope, prerequisites and exclusions

Requires owner-controlled private storage, retention policy and explicit restore authorization. A test restore must not reuse production triggers or journal identity accidentally. Validate supported schema/version migrations.

## Risks and critical tradeoff

A copied workbook alone does not reproduce Apps Script properties, deployed access controls or browser pending operations. Secrets and unresolved queued requests need separate handling.

## Acceptance criteria

1. Restore a synthetic backup into an isolated book and reconcile all balances, tables and history.
2. Check journal/retry behavior without replaying already completed production requests.
3. Verify private access and disabled production-side automation before enabling test triggers.
4. A failed verification blocks production cutover and leaves the original book untouched.

## Rollout

Implement only after the owner selects this numbered proposal. Add focused synthetic calculation and browser checks, run the existing financial-flow regressions, and demonstrate the result on the test book. Identify any required Google files and schema migration before publication. Preserve the private review/confirmation, book binding and retry protections.

[Back to the numbered backlog](../TODO.md)
