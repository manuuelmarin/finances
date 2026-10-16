# Release acceptance and cutover

The [portfolio analytics update](PORTFOLIO-METRICS.md) adds six simultaneous panels below the investment charts and a visible incomplete-exact-TWR diagnostic. Confirm product/period filters, annualized TIR inputs, euro-profit reconciliation, drawdown/recovery and the common weekly risk sample with its short-history note. This update changes no Apps Script files or schema and preserves test binding. Native test-book formula validation and scoped principal historical reconciliation are separate from Pages publication and private-backend activation.

The [period and return-chart follow-up](PERIODS-AND-RETURNS-2026-10-16.md) requires only a Pages/PWA update. Accept it with consecutive-month and exact-day filters, ticket arrows, category close/reopen, collapsed fund provenance and both adjusted-return charts. Confirm the estimate is labeled and exact TWR remains separately selectable. No Google files or financial rows change.

The [2026-10-16 frontend follow-up](FEEDBACK-CLOSURE-2026-10-16.md) adds a focused visual acceptance and confirms the remaining principal aggregation-range and GitHub required-check tasks. That follow-up changes no Google files.

The owner completed the previous ten-step test acceptance. Release 3.10.0 changes the workspace and adds interval budgets; it needs a focused acceptance after updating the private deployment. Keep the app bound to the test workbook.

## Update the existing test deployment

1. Resolve pending/uncertain requests on each device through their original deployment. Retain a private workbook/code/configuration backup and note balances, units and report dates.
2. In the installer, select the actual complete installed release. For an intact **3.9.4** baseline, replace only six files: `Configuration.gs`, `BackendAndReporting.gs`, `Operations.gs`, `StateAndValidation.gs`, `Transactions.gs` and `Bridge.html`. Other/customized baselines require the installer's comparison.
3. Save in the existing test project. Run `prepareApplication` once for interval-budget support, then `checkApplication`. Expect build **3.10.0**, API **3.3.0**, model **3**, `environment:test` and no calculation errors. Inspect price freshness separately.
4. Publish **New version** of the existing deployment, preserving its URL, **execute as Me**, **Only me**, test workbook binding and existing daily trigger. Do not toggle daily prices to reset retry limits.
5. Close the old Google window, reload the updated app, open the test book and run **Comprobar sistema**. Confirm the deployed build, environment and baseline values.

## Focused checks

1. Enter arbitrary chart dates, move both range handles and resize. Verify the displayed period changes without writes; test an empty period and series selection.
2. Open the large new-tab chart and export SVG, PNG and CSV. Confirm titles, dates, colors, values and descriptive filenames. Exports contain private data.
3. Select multiple categorical filters, clear them and sort a column. Create a 1 EUR test expense with recurrence left at No, correct it and cancel it; restore advanced dates if necessary.
4. Inspect the price pivot and full NAV precision. Try an inline new-product purchase and cancel at review unless intentionally testing a fictional purchase. Keep real holdings unchanged.
5. Create, inspect, edit, reread and remove an interval budget. Check monthly compatibility too. Periods predating tracking must disclose incomplete data, not zero spending.
6. Open goals/assignments in Planning and pending requests in Configuration. Check theme persistence and the changed mobile layouts.

## Principal activation remains separate

Audit the principal's inputs, balances, units, capital, debt, settings and native calculation ranges. Resolve the previously detected incomplete principal expense aggregation range. Validate an isolated copy before preparing the principal.

Use a separate private production project/deployment with explicit production binding. A new project needs all 15 files; incremental comparisons apply only to a known existing installation. Switch only after owner authorization and request recovery. Preserve the test pair.

Repository tests use fictional data. They do not certify the private deployment, physical phone, owner login or latest provider publication. See [Operations](OPERATIONS.md) for recovery and cutover.
