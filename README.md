# Finance

[![CI](https://github.com/manuuelmarin/finances/actions/workflows/pages.yml/badge.svg)](https://github.com/manuuelmarin/finances/actions/workflows/pages.yml)

Personal finance PWA for cash, investments, budgets and goals. GitHub Pages serves the interface; private Google Sheets stores the data.

[Open app](https://manuuelmarin.github.io/finances/) · [Install / update](https://manuuelmarin.github.io/finances/install.html) · [TODOs](TODO.md) · [History](History.md)

**App 3.10.1 · API 3.3.0 · workbook model 3.**

## End to end

```mermaid
flowchart TD
    Source["Source and tests"] --> CI["Quality checks"]
    CI --> Pages["GitHub Pages: public assets"]
    subgraph Device["Your device"]
        App["PWA: records, charts, planning"]
        App <--> Local["IndexedDB: snapshot and pending requests"]
        App --> Review["Review operation and persist UUID"]
        Review --> Bridge["Google session bridge"]
        App <-->|"Read and recover receipts"| Bridge
    end
    subgraph Google["Private Google environment"]
        API["Apps Script: owner, book, revision, lock"]
        API --> Batch["Atomic inputs, audit and receipt"]
        Batch --> Sheets["Sheets tables and native formulas"]
        Sheets -->|"Calculated snapshot"| API
        Schedule["Optional price schedule"] --> API
    end
    Pages --> App
    Bridge <-->|"Authenticated JSON"| API
    API <-->|"Verified, dated NAVs"| Provider["External price provider"]
```

The backend selects the workbook. The PWA caches public assets; financial snapshots and pending requests remain in the device profile. Missing values stay unknown.

## Setup

1. Convert the complete [blank workbook](templates/finances-model-3.xlsx) to Google Sheets. Preserve its [tables and formulas](docs/WORKBOOK.md).
2. Follow the installer to add its 15 files to a private Apps Script project. Set `OWNER_EMAIL`, `ENVIRONMENT=test` and `TEST_SPREADSHEET_ID` in Script Properties.
3. Run `prepareApplication`, then `checkApplication`. Check calculation, summary and source results; `ok:true` alone is insufficient.
4. Deploy as **Me**, access **Only me**. Connect its private URL in the app.

For production, retain the test setup and use a separate project with `ENVIRONMENT=production`, `PRODUCTION_SPREADSHEET_ID` and a different `TEST_SPREADSHEET_ID`. Keep all private configuration outside GitHub.

Updates require replacing the installer's changed files, running preparation/checks and publishing **New version** of the existing deployment. Pages does not update Apps Script. Add records through the app: it expands capacity automatically. After changing table structure directly in Sheets, run preparation again.

## Recovery

Back up the complete native workbook and the script code/configuration before updates. Resolve pending requests in their original deployment before switching books or clearing storage. An uncertain write retains its original content and UUID: query its receipt before retrying. Restore into a separate copy and reconcile before resuming.

[Workbook and prices](docs/WORKBOOK.md) · [Return and risk calculations](docs/PORTFOLIO-METRICS.md) · [Security](SECURITY.md)

## Development

Node.js 24+:

```sh
npm ci --ignore-scripts
npx playwright install --with-deps chromium
npm run build
node tools/serve.cjs
```

Open `http://127.0.0.1:4173`. Run `npm run check` and `npm run audit` before a PR. Tests use fictional data; private Google and physical-device acceptance remain separate. Capacity tests cover every editable table and longer histories; portfolio tests check that splitting identical holdings preserves return and risk results. Browser suites cover the current installer, channel, recovery and mobile flows. Deployment publishes the exact public files produced and tested by `quality`.

| Directory      | Purpose                                          |
| -------------- | ------------------------------------------------ |
| `web/`         | UI, charts, API client, queue and PWA            |
| `apps-script/` | Authorization, transactions, formulas and prices |
| `tools/`       | Builds, local server and checks                  |
| `tests/`       | Financial, recovery and browser tests            |
| `templates/`   | Empty workbook                                   |
| `TODO/`        | Feature proposals                                |

Edit source files and rebuild generated installer, CSP and service-worker assets. Keep existing release hashes immutable. Use Conventional Commits and merge through a checked PR; deployment depends on `quality`.
