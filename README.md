# Finance

[![CI](https://github.com/manuuelmarin/finances/actions/workflows/pages.yml/badge.svg)](https://github.com/manuuelmarin/finances/actions/workflows/pages.yml)

Personal finance PWA backed by private Google Sheets and Apps Script. Track cash, investments, budgets, salary and savings goals with interactive charts, sortable tables and an offline operation queue.

**App 3.10.0 · API 3.3.0 · model 3 · test environment · Spanish interface.**

[Open app](https://manuuelmarin.github.io/finances/) · [Install Google backend](https://manuuelmarin.github.io/finances/install.html)

## Getting started

For a new setup, start with the [blank model 3 workbook](templates/finances-model-3.xlsx) and follow [Workbook compatibility](docs/WORKBOOK.md). For an existing private project, follow the installer to add the listed Apps Script modules, keep its URL and properties, run `prepareApplication` and `checkApplication`, then publish a new version of the same private deployment. GitHub Pages does not update the Google project.

## Documentation

- [Workbook compatibility](docs/WORKBOOK.md) — required Sheets structure, formulas, and safe anonymized setup.
- [Google module map](apps-script/README.md) · [Owner acceptance checklist](docs/RELEASE-CHECKLIST.md).
- [Development](docs/DEVELOPMENT.md) — setup, checks and generated files.
- [Architecture](docs/ARCHITECTURE.md) — data flow, writes and recovery.
- [Operations](docs/OPERATIONS.md) — backup, test restore and cutover.
- [Prices](apps-script/PRICES.md) — NAV sources and daily updates.
- [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Branch protection](docs/BRANCH_PROTECTION.md) · [Changelog](CHANGELOG.md)
