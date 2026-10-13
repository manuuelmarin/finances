# Apps Script module map

This is the private Google backend for Finance. [`modules.json`](modules.json) lists the 13 `.gs` files shipped by the installer. All modules share one Apps Script global scope; helper names ending in `_` are internal and cannot be invoked through `google.script.run`.

| File                                                         | Responsibility                                                                                                                                                                      |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`Code.gs`](Code.gs)                                         | Small public facade: owner preparation, checks, price scheduling, web entry point and JSON transport. It dispatches to the configured test or production implementation.            |
| [`Configuration.gs`](Configuration.gs)                       | API/build versions, required business sheets, native table and input schemas, technical schemas, limits and the allowed app origin. Contains no private workbook ID or credentials. |
| [`AccessAndUtilities.gs`](AccessAndUtilities.gs)             | Owner/environment authorization, server-side workbook selection, native structure checks, Bridge validation, hashes, dates, values and shared error/locking helpers.                |
| [`BackendAndReporting.gs`](BackendAndReporting.gs)           | Initialize technical storage, read snapshots and diagnostics, interpret native summaries/charts and route authenticated API requests.                                               |
| [`DailyHistory.gs`](DailyHistory.gs)                         | Maintain the generated `Histórico` view using exact stored NAV dates and holdings. Preserve unrelated sheets and leave unsupported dates blank.                                     |
| [`DailyPriceAutomation.gs`](DailyPriceAutomation.gs)         | Opt-in daily triggers, owner/project/book binding, bounded retries, leases, receipts and scheduling health for each environment.                                                    |
| [`OperatorChecks.gs`](OperatorChecks.gs)                     | Preparation and read-only closure checks for backend, formulas, summary, Bridge, source identity and stable revision. Technical readiness does not certify current NAV publication. |
| [`PriceHistory.gs`](PriceHistory.gs)                         | Preview and import reviewed historical observations with product/class/currency/provenance validation, conflict checks and receipt recovery.                                        |
| [`PriceProvidersAndRefresh.gs`](PriceProvidersAndRefresh.gs) | Generic ISIN binding, Quefondos quote parsing, effective-date/currency validation, caching and atomic refresh plans. A provider's older quote never replaces a newer stored NAV.    |
| [`StateAndValidation.gs`](StateAndValidation.gs)             | State revisions, financial/reference validation, trade amounts and guarded fund-transfer formula migrations/cost-basis adjustments.                                                 |
| [`Operations.gs`](Operations.gs)                             | Apply typed financial and metadata operations to an isolated state; corrections, cancellation, budgets, payroll, goals, archives, templates and plans.                              |
| [`SupportAndCapacity.gs`](SupportAndCapacity.gs)             | Discover and extend business/support ranges and maintain canonical calculation formulas without discarding financial inputs.                                                        |
| [`Transactions.gs`](Transactions.gs)                         | Translate accepted state changes into atomic Sheets requests, preserve receipt/audit records and build typed cell writes.                                                           |

Two additional files are required: [`Bridge.html`](Bridge.html) provides the authenticated Google window and private JSON channel; [`appsscript.json`](appsscript.json) declares Google services, scopes and runtime settings. This makes **15 installable files**.

## Public owner commands

`prepareApplication` prepares the configured workbook; `checkApplication` checks it without financial writes; `enableDailyPrices`, `updatePrices` and `disableDailyPrices` control its price routine. `doGet` serves the private Bridge and `financialApiJson` handles the authenticated API. The public facade is not a separate financial calculation engine.

## Updates and boundaries

The [installer](https://manuuelmarin.github.io/finances/install.html) compares exact file hashes against a selected known installed release. Replace files marked **Modified** or **New**, retain unchanged files, then save and publish a new version of the existing private deployment. If the installed baseline is unknown or files were customized, use the full installation path. Copying code is not evidence of installation or deployment.

Release hashes are recorded in [`tools/install-releases.json`](../tools/install-releases.json); the build rejects a changed source under an already recorded version. Keep historical hashes immutable and record each new release after its backend sources are final.

Script Properties and deployments are private configuration: keep owner, workbook IDs and URLs out of GitHub. Preserve test/production isolation. Follow [Operations](../docs/OPERATIONS.md) before preparing or activating the principal workbook; do not run synthetic financial probes on it.
