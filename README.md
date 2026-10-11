# Finance

[![Finance quality and deployment](https://github.com/manuuelmarin/finances/actions/workflows/pages.yml/badge.svg)](https://github.com/manuuelmarin/finances/actions/workflows/pages.yml)
[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-open%20app-0969da)](https://manuuelmarin.github.io/finances/)

Finanzas is a responsive personal finance app that can be installed as a PWA. Google Sheets stores the workbook and calculates its results; a private Google Apps Script deployment validates reads and operations for the owner account. The public website provides the interface and installer, without including the workbook or its private configuration. The app interface remains in Spanish.

**Build 3.8.1 · API 3.3.0 · model 3.** The working environment remains `test`; publishing GitHub Pages does not update Apps Script, install routines in Google, or activate production.

[Open app](https://manuuelmarin.github.io/finances/) · [Install](https://manuuelmarin.github.io/finances/install.html) · [Development guide](docs/DEVELOPMENT.md) · [Architecture](docs/ARCHITECTURE.md) · [Security](SECURITY.md) · [Changelog](CHANGELOG.md) · [Prices](apps-script/PRICES.md)

## Features

| App section                | Current features                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------- |
| Overview (Resumen)         | Net worth, investments, cash and monthly budget; charts with inspection by date.                  |
| Transactions (Movimientos) | View, filter and record expenses, income and transfers; review details before confirming.         |
| Investments (Inversiones)  | Products, purchases, sales, positions and prices; contributions, value and returns by period.     |
| Accounts (Cuentas)         | Accounts, balances, debts and balance observations at the cutoff date.                            |
| Budgets (Presupuestos)     | Create, edit and remove monthly overall or subcategory limits.                                    |
| Salary (Salario)           | Payslips, trends and monthly savings based on net income and personal expenses.                   |
| Goals (Objetivos)          | View savings targets and allocations.                                                             |
| Activity (Actividad)       | Track pending requests and view confirmed operation history.                                      |
| Calculators (Calculadoras) | Estimate time to target, required contributions and a liquidity buffer with explicit assumptions. |
| Settings (Ajustes)         | Private connection, categories, dates, diagnostics, storage and installation.                     |

The app saves a local snapshot for offline viewing and a persistent operation queue. A submitted operation is confirmed only by the server response or receipt; an uncertain response is recovered using the same request. The queue does not submit operations while the app is closed; the daily price routine runs separately in Google.

## Use and private installation

1. Open the [installer](https://manuuelmarin.github.io/finances/install.html) and follow its instructions for the three Apps Script files and the private test workbook configuration.
2. Run the specified checks and publish a new Google deployment version with access restricted to **Only myself**.
3. Save its URL in the app and open the workbook with the owner account. Review individual diagnostic results: `ok: true` means the check finished, not that all conditions or prices are complete.

Daily price updates are optional and require installing the corresponding code and enabling the routine in Google. VDOS/Quefondos supplies available prices by ISIN; failures preserve the last price. The source does not reconstruct a complete daily history. Charts use available observed prices, and TWR is shown only for segments with sufficient valuations and an identified start date. See [sources and historical limits](apps-script/PRICES.md).

The financial snapshot and pending browser requests are stored in IndexedDB, without app-level encryption. Use a trusted device and browser profile; resolve pending requests before deleting the local copy in Settings (Ajustes). Controls and tests do not guarantee the absence of vulnerabilities. Read [Security](SECURITY.md) before using real data.

## Development and quality

Requires Node.js 24 or later. CI uses Node 24. To set up the project and run the checks:

```sh
npm ci --ignore-scripts
npx playwright install --with-deps chromium
npm run check
```

`check` generates installation assets, checks formatting with Prettier, runs ESLint, and executes Node and Playwright tests. CI also audits dependencies; Pages deployment depends on passing quality checks. Tests use fictional data and do not independently validate a private Google deployment or a physical phone.

The [development guide](docs/DEVELOPMENT.md) explains commands and generated assets. The [branch protection guide](docs/BRANCH_PROTECTION.md) provides the importable `main` policy and explains how to activate and verify it in GitHub. To propose changes, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Repository structure

| Path           | Contents                                                                 |
| -------------- | ------------------------------------------------------------------------ |
| `web/`         | Public interface, API client, local queue, charts and PWA.               |
| `apps-script/` | Private backend, authenticated bridge, manifest and price documentation. |
| `tools/`       | Installer and cache generation, checks and agent adapters.               |
| `tests/`       | Business rules, API, recovery and browser tests.                         |
| `docs/`        | Development guide and architecture.                                      |
| `.github/`     | CI and collaboration configuration.                                      |

`web/install.html` and `web/sw.js` are generated by `npm run build`: edit their sources rather than generated blocks. The [architecture guide](docs/ARCHITECTURE.md) explains snapshot, revision, receipt and recovery contracts.
