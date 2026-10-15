# Financial workspace update

Release 3.10.0 keeps API 3.3.0, workbook model 3 and the test environment. It changes the interface and adds interval spending limits. It does not authorize a production cutover.

| Area              | Result                                                                                                                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Charts            | Local SVG/PNG/CSV export and a larger new-tab view; temporal charts have editable date bounds and range handles. Legends select series; axes use readable intervals.                   |
| Summary           | Net worth, liquidity and historical net-worth change; account allocation and monthly income above zero/own expenses below zero. Physical cash remains “Efectivo”.                      |
| Movements         | One entry point, contextual fields, categorical checklist filters and No as the expense-recurrence default.                                                                            |
| Spending          | Inclusive category selection, average/largest expense, distribution, city, recurrence and adaptive frequency charts. Selecting a category or bin exposes sortable, searchable records. |
| Investments       | Inline product creation, ISIN binding and purchase share one atomic request. Historical operations and manual prices remain available under advanced options.                          |
| Prices            | A display-only date-by-product pivot preserves NAV precision and per-quote corrections. Storage remains keyed by product and effective date.                                           |
| Accounts          | Balances, comparable observations and reconciliation differences; planned cash flows remain separate from actual balances.                                                             |
| Planning          | Spending limits and savings goals share a page. Limits support months, explicit intervals and ongoing periods, with individual evolution and a dashed limit.                           |
| Salary            | Paired charts for recorded payroll and monthly saving over payroll.                                                                                                                    |
| Activity/settings | Activity is inside Configuration. One action runs connection, calculation and summary/source checks through the same private session; individual checks remain available.              |
| Calculators       | Existing calculators and assumptions are preserved.                                                                                                                                    |
| Appearance        | System, light, dark and warm themes, larger date controls and explanatory disclosures.                                                                                                 |

## Financial boundaries

- Own expense subtracts recoverable amounts and personal refunds. Investment purchases, internal transfers and debt repayments are not spending. A shared refund subtracts only its personal part, consistently across monthly and interval views.
- Net-worth change includes saving and cash flows; it is **not** portfolio return. Both endpoints reconstruct cash, linked debt and investments on matching actual dates. A complete valuation may be sought up to seven days before a requested date; the interface shows the dates used. Missing history and nonpositive percentage baselines stay unavailable.
- Overlapping budgets are evaluated separately. A period beginning before tracking cannot have a known complete spending total.
- The histogram counts positive personal expenses. Refunds affect expense totals but are not negative-frequency observations. Equal-width bins include empty intervals.
- Chart filters and exports never write to Sheets. Exports stay local, contain private financial data and use descriptive filenames. CSV text is protected against formula injection.
- NAV history is never interpolated or backfilled with current prices. Daily scheduling, source validation, bounded retries, receipts and duplicate protection keep their existing contracts.

## Google update

For an intact 3.9.4 installation, changed files are `Configuration.gs`, `BackendAndReporting.gs`, `Operations.gs`, `StateAndValidation.gs`, `Transactions.gs` and `Bridge.html`. Confirm against the installer baseline; older/customized installations may differ.

`prepareApplication` creates `_Finanzas_PresupuestosIntervalos`, a hidden support table. Existing monthly budgets and financial tables remain intact. New interval writes require the new capability and schema.

Follow [the release checklist](RELEASE-CHECKLIST.md). Keep the existing test deployment URL, workbook binding and daily trigger. [Advanced analysis proposals](PORTFOLIO-ANALYSIS.md) are separate from implemented features.
