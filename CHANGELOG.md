# Changelog

This document summarizes the builds described in the repository. Version numbers identify the app and its Apps Script code; they do not imply that GitHub tags or releases exist. The API retains its own identifier, currently **3.3.0**.

## Repository maintenance · no new app version

- Product-focused README with access links and current documentation.
- Architecture, development and security documentation separated from build history.
- Issue and PR templates; consistent editing conventions and line endings.
- Executable files, dependencies and deployment configuration from build 3.8.1 are preserved.

## 3.8.1

[PR #14](https://github.com/manuuelmarin/finances/pull/14)

- Net contributions shown as a blue area beneath a step series with a zero baseline; market value shown as a red line without fill or markers.
- TWR between observed valuations with no intervening cash flows. If initial history is missing, the calculable segment shows its start date; a cash flow without sufficient valuation data interrupts the calculation.
- Optional daily updates in test: an hourly trigger checks between 20:00 and 22:00 Madrid time, with up to three attempts per batch per day.
- Concurrency protection, receipt-based recovery and workbook verification after querying the source.
- Settings shows activation status and the last execution when the workbook is read again. Stale prices or conflicts are not presented as a completed update.

## 3.8.0

- Overview of net worth, composition and the remaining overall monthly budget.
- Tables with column filtering and sorting; charts with series selection and inspection by date.
- Investments selectable by product and period, with ISIN and source shown separately.
- Expense analysis with distributions and cumulative totals; explicit category exclusions.
- Daily cash balances, monthly savings based on salary, and comparison of allocations against targets.
- Calculators for time to target, required contributions and a liquidity buffer.
- Fallback between the two official VDOS/Quefondos pages and preparation of the optional daily routine in test.

## 3.7.0

- Dedicated screens for Overview, Transactions, Investments, Accounts, Budgets, Salary, Goals, Activity, Calculators and Settings.
- Mobile navigation, retained filters and record details.
- Pending requests and confirmed history in Activity; diagnostics and storage in Settings.

## 3.6.1

- Reuse of the Google session across reads, checks and recording operations.
- Prevention of duplicate checks and rejection of responses from a previous configuration.
- Connection notices in Spanish and recovery of a closed window.

## 3.6.0

- First complete snapshot included in private Google HTML after verifying the owner identity.
- Authenticated channel verification before announcing the connection.
- JSON transport for subsequent reads and operations; distinction between a failed read and an unconfirmed write.

## 3.5.1

- Recovery of uncertain responses with the same UUID and receipt lookup before retrying.
- Protection against editing or discarding uncertain operations.
- Cancellation of outdated reads when changing the deployment.

## 3.5.0

- Transaction entry from workbook loading, with shortcuts by operation type.
- Dashboard with charts and monthly overall or subcategory budgets.
- Audited limits without creating transactions or altering cash balances.

## 3.4.0

- Readiness checks covering structure, calculations, summary, Bridge, sources and revision stability.
- Preparation of the primary workbook with explicit configuration separate from test.
- Retention of API 3.3.0 and workbook binding, revision and receipt controls.

The private Google installation and operating environment cannot be inferred from this history. They are checked in the connected deployment; publishing GitHub Pages does not change them.
