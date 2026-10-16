# 19. Interactive expanded chart workspace

Status: **Proposed — awaiting owner selection.** This document authorizes no implementation or financial write.

Priority: **Medium** · Relative effort: **Medium**. Estimates describe the current Sheets/Apps Script/PWA architecture, not delivery dates.

## Purpose and expected value

Keep temporal selection and series controls when opening a chart larger.

## User experience

Chart menu → Open interactive view. Prefer an accessible full-screen in-app workspace, with an optional new-tab equivalent. Retain current product, range, legend and export actions; offer reset and a clear return action.

## Data and calculation contract

The current new-tab action exports a static SVG snapshot; do not relabel it interactive. Expanded charts must receive a frozen, validated read-only dataset or securely request the active view through a tightly scoped same-origin channel.

## Scope, prerequisites and exclusions

Reuse shared chart rendering, date bounds and export formatting. Avoid financial data in URLs, public local-storage links or server logs. No new Google popup and no mutation controls.

## Risks and critical tradeoff

Leaking financial data through share links, stale snapshots and expanded views that show a different range. Never loosen CSP just to embed serialized executable chart code.

## Acceptance criteria

1. Expanded view initially matches the selected range and enabled series exactly.
2. Keyboard, touch and date-range controls work at phone and desktop sizes.
3. Exports use the expanded visible interval and meaningful filenames.
4. Closing or changing the book cannot expose another book’s live data in the expanded channel.

## Rollout

Implement only after the owner selects this numbered proposal. Add focused synthetic calculation and browser checks, run the existing financial-flow regressions, and demonstrate the result on the test book. Identify any required Google files and schema migration before publication. Preserve the private review/confirmation, book binding and retry protections.

[Back to the numbered backlog](../TODO.md)
