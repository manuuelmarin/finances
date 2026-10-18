# History

Changes in repository order, from the first recorded build to the current app. Version numbers come from committed source; early builds were unversioned, and 3.1.0/3.2.0 identified the API. Updates within the same app version are grouped together. Linked merged PRs retain the full branch discussion and diff after branch deletion. Publishing Pages does not update a private Apps Script installation.

## Initial builds · unversioned

- Created the connection-check page, then added private Google Sheets access and GitHub Pages deployment ([first build](https://github.com/manuuelmarin/finances/commit/e08a52c), [private backend](https://github.com/manuuelmarin/finances/commit/d5782ab)).
- Adapted connection validation to workbook model 3 and added the responsive workspace, local calculators and guided installer ([model](https://github.com/manuuelmarin/finances/commit/5d79a89), [workspace](https://github.com/manuuelmarin/finances/commit/32d4254)).

## 3.1.0 · API

- Added financial reads/writes, automatic IDs, validation, revision checks, atomic batches, audit and persisted request replay ([#1](https://github.com/manuuelmarin/finances/pull/1)).
- Added corrections, cancellations, observed balances, table growth, maintained formulas and monthly product history.

## 3.2.0 · API

- Added generic fund lookup by ISIN and reference name, preserving quote date, precision, currency and provenance ([#2](https://github.com/manuuelmarin/finances/pull/2)).
- Added audited quote refreshes, partial-failure handling and duplicate/conflict protection.

## 3.3.0

- Connected the financial workspace to native Sheets results and reviewed transactions; added durable IndexedDB queues and recovery ([#3](https://github.com/manuuelmarin/finances/pull/3)).
- Added the installable/offline PWA, agent API adapter and quality checks before Pages deployment.

## 3.4.0

- Added system acceptance checks, explicit separate test/production configuration and corrected native summary reads ([#4](https://github.com/manuuelmarin/finances/pull/4)).
- Hardened authentication, frame/session binding, embedded-page restrictions, CSP and provider parsing.

## 3.5.0

- Added native financial charts, monthly total/category budgets and goal assignments ([#5](https://github.com/manuuelmarin/finances/pull/5)).
- Routed budgets through reviewed, audited requests without creating cash movements.

## 3.5.1

- Preserved uncertain writes and their UUIDs; receipt recovery precedes retries and uncertain requests cannot be discarded ([#6](https://github.com/manuuelmarin/finances/pull/6)).
- Prevented stale reads from crossing deployment changes and synchronized installer version labels.

## 3.5.2

- Opened movement entry immediately, preserved drafts while connecting and showed connection failures in the form ([#7](https://github.com/manuuelmarin/finances/pull/7)).

## 3.6.0

- Loaded the authenticated initial snapshot and verified JSON operations before enabling writes ([#8](https://github.com/manuuelmarin/finances/pull/8)).
- Preserved the Google bridge window and distinguished failed reads from uncertain writes.

## 3.6.1

- Reused one Google session for connection, reads, checks and transactions ([#9](https://github.com/manuuelmarin/finances/pull/9)).
- Blocked duplicate checks and discarded responses from superseded sessions/books.

## 3.7.0

- Organized records, investments, accounts, budgets, salary, goals, activity, calculators and settings into dedicated views ([#10](https://github.com/manuuelmarin/finances/pull/10)).
- Added mobile navigation, retained view filters and simplified record details and diagnostics.

## 3.8.0

- Added interactive charts, product/period selection, column filters/sorting, daily cash, spending analysis, salary savings and planning calculators ([#11](https://github.com/manuuelmarin/finances/pull/11)).
- Added verified provider fallback and optional daily price collection; compacted asset composition and changed city spending to bars ([#13](https://github.com/manuuelmarin/finances/pull/13)).

## 3.8.1

- Corrected contribution/value chart presentation and exact-TWR coverage across real valuation intervals ([#14](https://github.com/manuuelmarin/finances/pull/14)).
- Hardened owner/book-bound daily quote scheduling, bounded retries and receipt recovery.
- Consolidated repository presentation, English documentation and protection guidance without changing runtime behavior ([#15](https://github.com/manuuelmarin/finances/pull/15), [#16](https://github.com/manuuelmarin/finances/pull/16), [#17](https://github.com/manuuelmarin/finances/pull/17)).

## 3.9.0

- Completed uncertain-request recovery, contextual/payroll corrections and cashless fund transfers with preserved contribution basis ([#18](https://github.com/manuuelmarin/finances/pull/18)).
- Added historical NAV import, templates, archives, planned payments, filtered CSV export and extended account/goal/budget analysis.
- Improved calculator precision, privacy controls and bounded synchronization.

## 3.9.1

- Added the managed daily NAV history view: calendar rows, dynamic product columns and blanks for missing observations ([#19](https://github.com/manuuelmarin/finances/pull/19)).
- Preserved unrelated sheets/start-date overrides, bounded reads to the existing grid and clarified explicit test scheduler activation ([#20](https://github.com/manuuelmarin/finances/pull/20)).

## 3.9.2

- Split the backend into native modules and reduced the editor facade to five operator actions ([#21](https://github.com/manuuelmarin/finances/pull/21)).
- Generated the 15-file installer from a checked manifest while preserving API 3.3.0, model 3 and financial routes.

## 3.9.3

- Required authorized workbook/backend readiness before installing price triggers; failed checks preserve existing bindings ([#22](https://github.com/manuuelmarin/finances/pull/22)).
- Published the workbook contract and empty model 3 template ([#23](https://github.com/manuuelmarin/finances/pull/23), [#24](https://github.com/manuuelmarin/finances/pull/24)).
- Removed redundant branch-push CI and browser executions while retaining targeted mobile coverage ([#25](https://github.com/manuuelmarin/finances/pull/25)).

## 3.9.4

- Added installer comparisons against frozen per-file release hashes, truthful changed/new/removed status and an unknown-baseline option ([#26](https://github.com/manuuelmarin/finances/pull/26)).
- Clarified upgrade and scheduler status; copying source does not claim a completed Google installation.

## 3.10.0

- Added editable chart dates, range handles, SVG/PNG/CSV exports, consolidated entry, inline product purchases, checklists, interval budgets and reorganized planning/settings ([#27](https://github.com/manuuelmarin/finances/pull/27)).
- Completed exact-date/recurrence filtering, goal assignments, account reconciliation, signed refunds and responsive layouts ([#28](https://github.com/manuuelmarin/finances/pull/28)).
- Added four wealth horizons, account moving-average comparisons, spending drilldowns/bin widths, themes, privacy-refresh fixes and 20 numbered TODO proposals ([#29](https://github.com/manuuelmarin/finances/pull/29)).
- Added continuous month/day ranges, ticket mean/median/mode and dated largest expenses; clarified exact versus estimated returns ([#30](https://github.com/manuuelmarin/finances/pull/30)).
- Added simultaneous XIRR, drawdown/recovery, profit contributions, weekly volatility, correlations and calendar return averages; monthly green/red bars exclude deposits from gains ([#31](https://github.com/manuuelmarin/finances/pull/31), [#32](https://github.com/manuuelmarin/finances/pull/32)).
- Preferred complete TWR, removed duplicate return charts and consolidated current documentation ([#33](https://github.com/manuuelmarin/finances/pull/33), [#34](https://github.com/manuuelmarin/finances/pull/34)).

## 3.10.1

- Repaired period/monthly aggregates left on old row bounds, bound movement totals to managed ranges and withheld stale totals until capacity preparation ([#35](https://github.com/manuuelmarin/finances/pull/35)).
- Added the end-to-end architecture diagram, shortened the English README and consolidated price documentation.
- Validated growth across all editable tables, longer histories and portfolio-size invariance; consolidated tests and made deployment publish the tested artifact ([#36](https://github.com/manuuelmarin/finances/pull/36)).
- Made workbook tables readable and consolidated version history here. TODO proposals remain separate from implemented features.
- Swapped Investments and Planning in desktop and mobile navigation.
- Refresh public PWA assets from the network during installation so browser HTTP caches cannot preserve an old interface after an update.
- Set the final navigation order to Overview, Movements, Investments, Accounts, Salary, Planning, Calculators and Settings; keep Accounts on the mobile bar and Planning in More.

### Private Google update from 3.10.0

- Replace `Configuration.gs`, `BackendAndReporting.gs`, `SupportAndCapacity.gs` and `Bridge.html` with their complete 3.10.1 installer versions. The other 11 installer files are unchanged.
- Run `prepareApplication`, then `checkApplication`; review all checks, then publish **New version** of the existing private deployment. Preserve its URL and script properties.

## 3.10.2 · current

- Recover internal server failures through the original request receipt, including pending records stored by older clients; preserve UUIDs and block unsafe discard or recreation.
- Read only the receipt journal during recovery and omit reporting calculations while preparing transactions. Keep financial validation, workbook binding and atomic writes.
- Preserve uncertainty for interrupted historical imports and record unexpected failures with a diagnostic ID in private Apps Script execution logs.
- Add `checkSending`, which validates and builds a fictional expense entirely in memory. It never writes a transaction and does not claim to verify native write permissions.
- Preserve the configured production/test book in installer instructions and run sending/recovery checks through WebKit with an iPhone profile.

### Private Google update from 3.10.1

- Replace `Code.gs`, `Configuration.gs`, `AccessAndUtilities.gs`, `BackendAndReporting.gs` and `Bridge.html` with the installer versions. Preserve the current deployment URL and script properties.
- Run `checkSending` and `checkApplication`, then publish **New version** of the existing deployment. Update the app and use **Send pending** to recover the original requests; do not recreate them.

## 3.10.3

- Ship an isolated, complete Apps Script backend in Code.gs; updates from 3.10.2 replace only Code.gs and Bridge.html.
- Test the shipped artifact through the complete sending and receipt recovery flow, including legacy helpers left in the project.
- Renew scheduled price handlers with enableDailyPrices after upgrading.
