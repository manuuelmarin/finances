# Architecture

Finanzas 3.8.1 uses workbook model 3 and API 3.3.0. This document describes current behavior; it does not authorize an environment change or a production cutover.

## Components and boundaries

| Component                 | Responsibility                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------ |
| GitHub Pages (`web/`)     | Serve the public interface, PWA assets and installer.                                            |
| API client and Bridge     | Connect the app to an authenticated session in the private Google deployment.                    |
| Apps Script               | Authorize the owner account, validate contracts and operations, and write financial batches.     |
| Google Sheets             | Store inputs and tables, run formulas, and provide native summaries and charts.                  |
| IndexedDB                 | Store the local snapshot and pending requests by deployment and workbook.                        |
| Agent adapters (`tools/`) | Prepare envelopes and maintain a durable queue using an already authenticated private transport. |

Authorization is checked on the server before accessing the workbook, including public editor functions. Operations allow specific processes and fields; the client cannot choose the workbook ID or submit cell instructions. Text is written as `stringValue`, without turning it into a formula.

Bridge validates origin, window and session reference. The client accepts responses from the exact frame and origin established by the authenticated handshake. The first snapshot can be included in private Google HTML after checking the owner account, with contextual escaping; subsequent reads and operations travel as JSON strings. The workbook session is reused across reads and checks, but is not shared between tabs or workbooks. Results from a previous configuration are discarded when the deployment changes.

The service worker caches public assets; financial snapshots and pending requests are stored separately in IndexedDB. An embedded app does not enable configuration, operations or its local copy: it must be opened in its own window. See browser boundaries and review limitations in [SECURITY.md](../SECURITY.md).

## Snapshots and dates

`FinanceApiClient.read()` retrieves tables, diagnostics, revision, workbook binding, observations, prices, budgets and calculated results. The `backendReady` and `calculationState` indicators and calculation errors distinguish available data from a structure requiring review. Unknown values must not be converted to zero.

| Field                 | Meaning                                                                       |
| --------------------- | ----------------------------------------------------------------------------- |
| `revision`            | Fingerprint of the state used to prepare a write; detects concurrent changes. |
| `bookKey`             | Binding to the workbook read, checked on the server. It is not a credential.  |
| `settings.start`      | Start of financial tracking.                                                  |
| `settings.asof`       | Report cutoff date.                                                           |
| `settings.valuation`  | Investment valuation date.                                                    |
| `supportsBookBinding` | Support for binding requests to the workbook read.                            |
| `supportsBudgets`     | Support for reading and modifying monthly budgets.                            |

Public dates use ISO date format. The backend requires the start and valuation dates to be no later than the report cutoff. An operation can advance the applicable cutoffs according to its rules; interface filters are local and do not change those dates or the write revision.

Google calculates workbook balances and results. The cash view reconstructs daily balances from account opening balances and transactions through the cutoff date. External balance observations are references: a comparable end-of-day observation is checked against the opening balance plus inflows minus outflows since tracking began. A reference without a comparable cutoff is not presented as reconciled. Do not record historical purchases again as new cash movements or deduplicate transactions solely by description and amount.

## Writes, UUIDs and receipts

A transaction contains `action: 'transact'`, a UUID `requestId`, `expectedRevision`, the `bookKey` binding where applicable, and between 1 and 20 operations. The request reference identifies the complete envelope; Apps Script generates the final IDs of new entities.

1. Read the state using the authorized private session.
2. Prepare operations with resolved names or selections and review their effects.
3. Save the complete envelope before sending it.
4. Submit through `client.submit(envelope)` and retain the result.
5. If the response is uncertain, query `client.requestStatus(envelope)` and, where appropriate, retry exactly the same envelope.

The server checks the request journal before comparing the revision: an already applied request can recover its receipt even if the workbook has changed since. The same UUID with different content returns `REQUEST_CONFLICT`. A new request with an outdated revision returns `CONFLICT` and requires another read and explicit review of a new proposal.

Inputs, financial changes, audit entries and the receipt are recorded in a single batch. If batch confirmation fails, the server attempts to recover the receipt and may return `WRITE_UNCERTAIN`. The queue keeps the write as submitted but unconfirmed: it cannot be discarded, edited or silently replaced with a new request. `RESPONSE_UNCERTAIN` preserves the same protection in the app and agent adapters.

In production, every mutation and request-status query requires the binding obtained from a read. The `test` environment retains compatibility with older envelopes; this does not remove the requirement to separate workbooks and review server configuration.

## Budgets and interface calculations

Limits belong to a specific month and can be overall or by expense subcategory. Zero is valid. They do not create transactions or carry over to other months. Personal expenses equal expenses minus the recoverable share and refunds attributable to the owner, from the tracking start through the report cutoff; transfers, purchases, shared-expense reimbursements and debt are excluded.

The overall limit and category limits are displayed independently. They are not added together as net worth or used to invent an available balance when the overall limit is missing. Goals retain their allocations in `tObjetivos` and `tAsignaciones`.

The hidden `_Finanzas_Presupuestos` sheet is prepared with the backend or when the first limit is confirmed. Status is recorded as integer 1/0; changes, audit entries and the receipt belong to the financial batch. Changing a limit changes the revision; renaming a subcategory preserves its limits. The app and agents use the `presupuesto` and `quitar_presupuesto` processes.

Charts combine native workbook results and series calculated from the snapshot. They do not load external libraries. Their data is accessible, and filters do not write to Sheets. Calculators use explicit parameters and constant assumptions; their results are estimates.

## Prices and returns

Price queries use fixed VDOS/Quefondos HTTPS routes with a validated ISIN, without following redirects or executing provider HTML. Each price retains its effective date and source. A failure does not delete the last price, and a stale price or conflict is not presented as a completed update.

The optional daily routine uses an hourly trigger, a window between 20:00 and 22:00 Madrid time, and up to three attempts per batch per day. Deactivation and workbook changes are checked again after the network query, before saving. The `script.scriptapp` permission allows management of project triggers; the code creates or removes its own routine. Activation requires action by the owner account in Google, using `activarActualizacionDiariaPreciosTest` and `ENVIRONMENT=test`.

The provider supplies available prices; earlier daily history has not been reconstructed. Series do not interpolate or apply the latest value retrospectively. A product's NAV change starts at its first observed price. TWR links observed valuations without intervening cash flows; a cash flow without sufficient valuation data interrupts the calculation. If initial history is missing, the calculable segment and its start date are identified, with earlier returns unknown. The return on net contributions does not replace TWR or native product returns. See [PRICES.md](../apps-script/PRICES.md).

## Agents and persistence

`tools/agent-envelope.cjs` prepares a UUID and revision from an API 3.3.0 snapshot. `tools/agent-queue.cjs` reuses `web/queue.js` and saves the snapshot, workbook, envelope, reference and status before submission. Both require an already authenticated private API client; they do not sign in or provide a public endpoint.

```js
const { openQueue } = require('./tools/agent-queue.cjs');
const queue = await openQueue({
  directory: privateStateDirectory,
  deploymentUrl,
});
await queue.saveSnapshot(await client.read());
await queue.enqueue(operations, 'Reviewed operation');
await queue.run(client);
```

After a shutdown, open the same queue and call `run(client)` without preparing or enqueuing the operation again. Each deployment uses its own file, user permissions, atomic writes and disk synchronization. A different workbook blocks submission; conflicts require review. A corrupt file or an occupied lock prevents replacing the queue. Before removing a `.lock`, verify that no process is using it and preserve pending files.

## Environments, checks and recovery

The test project keeps `TEST_SPREADSHEET_ID`, `OWNER_EMAIL` and `ENVIRONMENT=test` outside the repository. Production requires a separate project and deployment, a different `PRODUCTION_SPREADSHEET_ID` and `ENVIRONMENT=production`. Selecting another deployment in the browser does not change Google configuration. Do not publish workbook IDs, private URLs or credentials.

`comprobarCierre()` and “Comprobar sistema” perform checks without writes: structure, calculations, cards, Bridge, ISIN sources and revision stability. `ok: true` means the checks finished; `technicalReady: true` requires every `checks` result to pass. They do not validate a physical phone, rejection of another account or whether the source remains current.

Before an authorized cutover, accept real-world tests, resolve pending requests on every device, compare current sources and retain a native workbook copy, code and private configuration. Prepare the primary backend with `comprobarPaso4`, run `comprobarCierre` and save its own URL in the app. Do not transfer fictional operations or pending test requests. Once Sheets is accepted as the operational source, the original XLSX is archived; earlier OOXML tools are for reading or recovering the original source, not a second backend.

For recovery, stop submissions and preserve the current workbook, queues and journal; restore into a new workbook, validate formulas and inputs, and reconcile subsequent changes using audit entries and receipts. Check uncertain requests in their original deployment before resubmitting. A native Sheets copy does not back up Apps Script properties or deployments. Keep complete backups periodically and before changes, with dates, revisions and cutoffs recorded in private tracking documentation.

GitHub Actions checks and publishes Pages assets. Publishing does not change the three files or version of a private Google deployment. The installer and cache are generated from their sources; see [DEVELOPMENT.md](DEVELOPMENT.md) for maintenance.
