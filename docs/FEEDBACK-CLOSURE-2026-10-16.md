# Feedback closure and system audit — 2026-10-16

Scope: the owner’s latest dashboard, spending, account, goal, theme and proposal-documentation feedback. This is a source/configuration audit with synthetic regression tests and read-only workbook reconciliation; it is not a claim that a private Google deployment has been upgraded or that production has been accepted.

## Implemented corrections

| Area                     | Result                                                                                                                                                                                                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Proposal backlog         | [TODO.md](../TODO.md) indexes 20 stable IDs; each has an individual specification under [TODO/](../TODO/), pending owner selection.                                                                                                                                                        |
| Wealth variation         | Four simultaneous 1M/3M/6M/1Y cells in a 2×2 layout. Signed color, neutral zero/unavailable states and actual comparison-date explanations. Shared timeline computation avoids rebuilding history for each horizon.                                                                        |
| Month selection          | Spanish month names plus a touch-sized year control, while retaining YYYY-MM values, validation and existing change contracts. Monthly chart axes also use localized labels.                                                                                                               |
| Spending category detail | Clicking a category opens an in-chart disclosure containing only date, concept and own amount. Summary uses the report month; Movements uses its selected interval/categories. Refunds retain their sign.                                                                                  |
| Spending histogram       | Select 5/10/20/50/100 EUR intervals; integer frequencies, rotated X labels, exact bin-boundary assignment and consistent CSV/drilldown. Very large empty gaps are omitted without changing numeric X spacing or interval width.                                                            |
| Cities                   | Named cities use a darker blue; unclassified spending uses a lighter gray. Amounts, selections and CSV totals are unchanged.                                                                                                                                                               |
| Performance              | Default result/net-capital history continues across years, including recorded net distributions. Exact TWR and per-product NAV variation remain separate, explicitly selectable measures. A sold-out product does not leak a TWR point into NAV-only variation.                            |
| Account cards            | Current calculated balance minus preceding daily moving averages for 1D, 1W, 1M and 3M, in EUR. Exclude the report day; require full windows. Zero balances are valid, missing history remains unavailable.                                                                                |
| Observations             | Existing bank checkpoints and reconciliation remain available in a compact disclosure and register. Intraday observations are not represented as comparable end-of-day closes.                                                                                                             |
| Forecast                 | Future payment/income planning remains available. Do not draw a one-point forecast when no selected future plan exists. Keep assumptions behind concise information/exception controls.                                                                                                    |
| Goal resources           | Separate accounts, investments and unidentified assets. Existing assignment data and totals are preserved.                                                                                                                                                                                 |
| Emergency fund           | Link an existing goal, show its account-only reserves against its target, exclude investment assignments and flag excess/unknown availability. The association is a per-book device preference; financial goal/assignment data remains in Sheets. No automatic goal or reserve is created. |
| Appearance               | Five additional local palettes: Ocean, Forest, Slate, Lavender and Solar. Theme preference persists; check foreground contrasts and mobile layout. No additional runtime dependency or third-party asset request. Free-form theme editing is outside this change.                          |
| Visual privacy           | Mask entire private views through a stable presentation state. Asynchronous data refresh no longer reveals masked cards, and unmasking preserves real empty/hidden states. This is screen masking, not encryption.                                                                         |

## Performance reconciliation and honest limits

The test book contains operations across both 2025 and 2026. Some 2026 contributions occur on dates without a corresponding real NAV (including non-trading days). Exact TWR stops linking when an external flow has no valuation; the old chart therefore ended before the later history despite the value/capital series continuing. It would be incorrect to fabricate missing NAVs or silently restart a since-inception TWR.

The new default uses `100 × (market value − net contributions + net distributions) / net contributions`, only for positive net capital. It uses the last stored NAV per product, like the valuation chart, and is explicitly **not TWR, XIRR or annualized performance**. Cash distributions count once. The existing native product percentage uses a gross-purchase denominator, so that table’s native measure is intentionally not relabeled as net-capital return after withdrawals. Exact TWR remains available with its coverage limits.

Read-only reconciliation checked actual units, purchase records, effective NAV dates and the native value/capital/result identity. An independent MyInvestor **catalog** read provided a later quoted date; it does not expose the owner’s actual broker positions, transaction settlement history or personal-return methodology. A reported broker percentage cannot be certified equal without the same date, units, costs and formula. No prices, purchases, cash records or report dates were changed during this work. Private amounts, identifiers and source extracts are excluded from this public report and all fixtures.

## System controls reviewed

| Control                    | Evidence and outcome                                                                                                                                                                                                                                             |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google access              | Source manifest remains `MYSELF` / `USER_DEPLOYING`; backend checks the configured owner and active account. No scope or deployment-access change. The live owner deployment still requires an owner-side check.                                                 |
| Private bridge             | Exact app origin, receiver window, handshake state and call identifier checks remain in place. The app never fetches private Sheets data through the public Pages host.                                                                                          |
| Writes and retry           | Existing typed review/confirmation, book binding, optimistic revision, script lock, durable receipt and audit contracts remain unchanged. Regression tests cover rejected/uncertain replies, reopening, recovery and duplicate prevention.                       |
| Financial inputs           | No `.gs`, `appsscript.json`, `Bridge.html`, workbook formulas or business rows changed in this PR. Frontend projections remain read-only.                                                                                                                        |
| Daily NAV automation       | Existing owner/book/project binding, environment-specific activation, bounded retry schedule and last-valid-price retention remain intact. Publication delay is not treated as a verified fresh price. A live trigger execution was not performed by this audit. |
| Data handling              | UI uses text nodes for record values; no added evaluation or dynamic executable HTML. CSV formula-neutralization remains covered. PWA cache includes only public assets and now includes the month-control module.                                               |
| Dependencies and CI        | Pinned tooling, SHA-pinned actions, least-privilege workflow permissions, vulnerability audit, format/lint/unit/browser gates and quality artifacts remain in use. Pages deployment depends on the successful quality job.                                       |
| GitHub live protection     | Active PR/deletion/force-push/linear-history rules verified. Required `quality` status and resolved-conversation enforcement are still absent; see [the exact remaining configuration](BRANCH_PROTECTION.md). This connector lacks administrative write access.  |
| Previous public deployment | Main commit `301837f5d755249891012b9fa546a345cbb43074` had a successful quality/deployment workflow. That does not mean this new PR is already on Pages.                                                                                                         |

## Principal-book blocker confirmed

Read-only inspection confirmed that the principal’s native income/expense/recovery aggregates still stop at row 28 while movements extend through row 39. The bound test copy has expanded support ranges. **Do not use the principal’s current native summary as a complete ledger total, and do not treat this frontend change as production cutover.**

The existing `prepareApplication` path initializes technical tables and regenerates support formulas against the book’s actual table capacity. Before touching the principal: take a private backup, validate preparation on an isolated copy of the principal, reconcile every input/balance/unit/summary total, then obtain/confirm the planned owner cutover. Keep the accepted test pair available. This is a specific existing preparation task, not a reason to rewrite the financial model.

## Validation and publication

Run `npm run build`, `npm run format:check`, `npm run lint`, `npm run audit`, `npm test` and `npm run test:browser`. Browser fixtures are fictional and block external financial requests. Focused checks cover cross-year returns, TWR gaps, moving averages/zero/missing values, exact histogram counts, three-column drilldowns, month controls, resource separation, emergency association persistence, theme contrasts and privacy after refresh. Inspect desktop/mobile screenshots before publishing.

This PR needs **no Apps Script file replacement**. After the owner merges it and Pages succeeds, accept the PWA update and reload the test book. The existing 3.10.0 backend installation requirements remain relevant only if the private project has not yet been upgraded.

Owner acceptance:

1. Confirm the four wealth horizons are visible and unavailable history stays neutral.
2. Pick a category in Summary; verify the three-column detail contains only that report month.
3. Change histogram interval and exact dates; compare counts/detail and city colors.
4. In Investments, compare the default result with the stored value, net capital and distributions. Switch to TWR and observe honest gaps rather than invented performance.
5. In Accounts, inspect each EUR moving-average comparison and its explanation; reconcile a zero-balance account as zero.
6. Link an emergency goal, verify only account assignments count, reopen, and check the selected goal persists on that device/book.
7. Choose a new theme, reopen, and verify readable tables/charts on desktop and phone.
8. Run the existing read-only system check and confirm `environment:test`; retain the current private deployment and book binding.

## Design and methodology references

- [Nord palettes](https://www.nordtheme.com/docs/colors-and-palettes/), [Catppuccin palettes](https://catppuccin.com/palette/) and [Solarized](https://ethanschoonover.com/solarized/) informed independent semantic palette choices; no third-party theme code was bundled.
- [WCAG contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) informed measured text-contrast checks. Passing selected checks is not a full WCAG conformance certification.
- [CFA rates and returns](https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/rates-and-returns) distinguishes personal, time-weighted and other performance measures; a simple gain ratio is labeled separately.
