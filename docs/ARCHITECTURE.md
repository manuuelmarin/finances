# Architecture

Finanzas 3.8.1 uses workbook model 3 and API 3.3.0. The environment remains `ENVIRONMENT=test`; this document does not authorize production cutover.

## Components

| Component                 | Responsibility                                            |
| ------------------------- | --------------------------------------------------------- |
| GitHub Pages (`web/`)     | Public interface, installer and PWA assets.               |
| API client and Bridge     | Authenticated connection to private Google deployment.    |
| Apps Script               | Owner authorization, validation and financial batches.    |
| Google Sheets             | Inputs, tables, formulas and native results.              |
| IndexedDB                 | Snapshots and pending requests by deployment/workbook.    |
| Agent adapters (`tools/`) | Envelopes and durable queue over authenticated transport. |

The server authorizes access before reading Sheets, selects the configured workbook and accepts defined processes/fields, never arbitrary cell instructions. Bridge validates origin, window and session; responses must match the authenticated handshake. The owner-checked initial snapshot may arrive in private HTML; subsequent requests use JSON strings. Sessions are reused within a tab, never between tabs/workbooks. Deployment changes invalidate previous results.

The service worker caches public assets only. Embedded operation is restricted; open the app in its own window. See [SECURITY.md](../SECURITY.md) for trust boundaries and local-data risks.

## Reads and calculations

`FinanceApiClient.read()` returns tables, calculated results, diagnostics, `revision` and `bookKey`. Revision detects concurrent changes; workbook binding is not a credential. `backendReady`, `calculationState` and errors distinguish usable data from structures requiring review. Unknown values remain unknown.

Dates are ISO: `settings.start` begins tracking, `settings.asof` sets the report cutoff, and `settings.valuation` sets valuation. Start and valuation cannot exceed the cutoff. Operations can advance applicable dates; local filters change neither dates nor revision.

Sheets calculates results. Cash series reconstruct balances from account opening balances and transactions. External observations are reconciled only with comparable cutoffs. Historical purchases are not new cash movements; description/amount alone cannot deduplicate transactions.

Monthly budgets may be overall or expense-subcategory limits; zero is valid. They create no transactions or carryover. Personal expenses subtract recoverable shares and owner refunds; transfers, purchases, shared reimbursements and debt are excluded. Overall/category limits stay independent; missing overall limits do not imply available balance. Goals retain `tObjetivos`/`tAsignaciones`. Budget changes update revision through `presupuesto`/`quitar_presupuesto` and the financial batch.

Charts use snapshot/native results; filters never write. Calculators are estimates with explicit, constant assumptions. Price history never interpolates or applies current NAV retrospectively. TWR links observed valuations; insufficient valuation around a flow interrupts it. Missing initial history identifies a calculable start and unknown earlier returns. Net-contribution returns do not replace TWR/native returns. See [PRICES.md](../apps-script/PRICES.md).

## Writes and recovery

A `transact` envelope contains UUID `requestId`, `expectedRevision`, applicable `bookKey`, and 1–20 operations. Apps Script generates final record IDs.

1. Read through the authorized session and review resolved operations.
2. Persist the complete envelope before `client.submit(envelope)`.
3. For uncertain responses, query `client.requestStatus(envelope)`; retry exactly the same envelope where appropriate.

The server checks the journal before revision, recovering prior receipts despite later changes. Reusing a UUID with changed content returns `REQUEST_CONFLICT`; an outdated new request returns `CONFLICT`, requiring a fresh read and explicit review.

Inputs, changes, audit and receipt share one batch. Failed confirmation attempts receipt recovery and may return `WRITE_UNCERTAIN`. This and `RESPONSE_UNCERTAIN` preserve submitted/unconfirmed requests: never discard, edit or silently replace them. Production mutations/status queries require read-derived binding; test retains older-envelope compatibility.

Agent modules share `web/queue.js`, persisting state before sending. Resume the same queue with `run(client)`, without re-enqueueing. Files use user permissions, atomic writes and disk synchronization. Workbook changes block submission; corrupt files/busy locks block replacement. Preserve files and check no process uses a `.lock` before removing it. See [DEVELOPMENT.md](DEVELOPMENT.md).

## Deployment and cutover

Keep `TEST_SPREADSHEET_ID`, `OWNER_EMAIL`, credentials and private URLs outside the repository. Production needs a separate project/deployment and different `PRODUCTION_SPREADSHEET_ID`. Browser selection cannot change server configuration; Pages cannot update Apps Script.

`comprobarCierre()` / **Comprobar sistema** check without writes. `ok:true` means completion; `technicalReady:true` requires all checks, not phone/authentication/source acceptance.

Before authorized cutover, resolve device queues, accept real tests, verify sources, back up workbook/code/configuration, prepare via `comprobarPaso4` and verify closure. Never transfer test requests. Archive XLSX after accepting Sheets.

Recovery stops submissions, preserves workbook/queues/journal, restores into a new workbook, validates formulas and reconciles audit/receipts. Query uncertain requests in their original deployment. Do not treat a native workbook copy as a verified backup of Script Properties or deployment settings; inspect any copied bound script and keep periodic and pre-change backups with private dates/revisions/cutoffs.
