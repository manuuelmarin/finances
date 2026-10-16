# Portfolio analysis and next features

The canonical owner-selectable backlog is now [TODO.md](../TODO.md), with 20 individually developed specifications in [TODO/](../TODO/). The ranked discussion below provides background; use the stable TODO IDs when requesting implementation.

These are proposals, not implemented features. Keep optional analysis under an Investments subview; a new top-level page is unnecessary until the scope justifies it.

## Ranked candidates

Effort is relative to this application; existing calculators, templates and charts are not counted again.

| Candidate                        | Effort      | Benefit and acceptance condition                                                                                            |
| -------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------- |
| Bank CSV import with review      | Medium      | Preview mappings, account/date/amount signs and potential duplicates; never deduplicate only by concept and amount.         |
| Statement reconciliation         | Medium      | Explain differences against dated statement checkpoints; distinguish holds from settled movements.                          |
| Scheduled-versus-actual payments | Medium      | Match planned flows to confirmed records without duplicating either.                                                        |
| Recurrence suggestions           | Low–medium  | Propose flags from repeated records, requiring confirmation; no automatic expenses.                                         |
| Spending calendar heatmap        | Low         | Show daily spending density with drilldown; missing periods differ from zero-spend days.                                    |
| Comparable-period changes        | Low–medium  | Compare equivalent observed days; disclose incomplete or unmatched periods.                                                 |
| Explicit budget carryover        | Medium      | Optional rollover rules, separate from the new period's original limit.                                                     |
| Goal contribution schedule       | Medium      | Track dated contributions separately from asset earmarking; an assignment is not a bank transfer.                           |
| Fund factsheet import            | Medium      | Dated country/sector/currency exposure with source and coverage, identified by ISIN/class.                                  |
| Portfolio overlap                | High        | Aggregate underlying security IDs across funds; requires more than top-ten holdings.                                        |
| Drawdown and recovery            | Medium      | Use a valid total-return series; expose gaps and recovery duration.                                                         |
| Money-weighted return            | Medium      | Add XIRR beside TWR; validate flows, valuation and nonunique/no-solution cases.                                             |
| Volatility/correlation           | Medium–high | Align return observations, currency and frequency; publish sample length and coverage.                                      |
| Allocation targets/drift         | Medium      | Actual versus target weights and proposed rebalancing amounts; never place trades.                                          |
| Comparable benchmark             | Medium–high | Compatible currency, distributions, periods and data rights; an index is not the actual fund.                               |
| Cost attribution                 | Medium      | Separate recorded fees, taxes and returns. Embedded fund costs need dated data and must not be charged twice.               |
| Backup/restore rehearsal         | Medium      | Restore private data/configuration/journal backups into an isolated book; a Sheet copy is not a complete deployment backup. |
| Local-data lock                  | Medium–high | Evaluate encryption and key recovery separately from screen masking.                                                        |

## Portfolio analysis: a realistic sequence

### 1. Exposure with provenance

Import official fund factsheets or periodic reports by ISIN/share class. Store the as-of date, source, methodology, country/sector weights and coverage. Portfolio exposure combines each fund's portfolio weight with its disclosed underlying weights. Preserve an unknown remainder instead of inflating known holdings to 100%.

Fund domicile is not investment exposure. An EUR share class does not establish EUR exposure of all underlying assets; hedging is separate. Benchmark composition may be a labeled proxy, never verified fund holdings. A horizontal country/sector chart and coverage table are sufficient. Monthly/quarterly metadata refreshes fit periodic holdings better than a daily browser bot.

### 2. History-based risk

Use verified NAV/total-return observations for fund risk and a flow-adjusted return series for portfolio risk. Do not calculate volatility from market value, which changes with contributions, or correlation between price levels.

An initial product eligibility rule could require 52 aligned weekly return observations for volatility/correlation. This is a proposed threshold, not a guarantee of statistical precision. Shorter or incompatible histories should show unavailable results. Reconcile share-class currency, distributions and stale observations first.

Useful displays: a drawdown area, a correlation matrix and a compact risk/return table under Analysis.

### 3. Valuation and fundamentals

P/E, forward P/E, P/B and dividend yield can describe equity exposure only with a provider methodology, date and coverage. NAV is not earnings; averaging fund P/Es is not a defensible portfolio P/E. Negative earnings, missing constituents and inconsistent forecasts need explicit treatment.

Start with dated, attributable provider metrics. Do not build a financial-statement engine for every company inside every fund now. A dedicated fundamentals section makes more sense if direct stock ownership becomes material.

## What to defer

A general Power BI-style chart builder needs a semantic model for signs, returns, recoverable shares, coverage and overlapping budgets. It can otherwise produce convincing but invalid charts. Start with controlled variable combinations and audited templates.

Do not add browser-login automation, trading, predictive rankings or an opaque portfolio score to this update.

## Primary references

- [CNMV fund guide](https://www.cnmv.es/DocPortal/Publicaciones/Guias/Los_fondos_de_inversion.pdf): documentation and periodic portfolio information.
- [CFA Institute: rates and returns](https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/rates-and-returns): money- versus time-weighted performance.
- [CFA Institute: portfolio risk and return](https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/portfolio-risk-return-part-1): weights, volatility and correlation.
- [MSCI World factsheet](https://www.msci.com/documents/10199/255599/msci-world-index.pdf): an example of dated index exposures and valuation metrics, not a substitute for actual fund holdings or a data license.
