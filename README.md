# Finance

[![CI](https://github.com/manuuelmarin/finances/actions/workflows/pages.yml/badge.svg)](https://github.com/manuuelmarin/finances/actions/workflows/pages.yml)

Personal finance PWA backed by private Google Sheets and Apps Script. Track cash, investments, budgets, salary and savings goals with interactive charts, sortable tables and an offline operation queue.

**App 3.9.2 · API 3.3.0 · model 3 · test environment · Spanish interface.**

[Open app](https://manuuelmarin.github.io/finances/) · [Install Google backend](https://manuuelmarin.github.io/finances/install.html)

## Getting started

Follow the installer to add the listed Apps Script modules to the existing private project. Keep its URL and properties, then run `prepareApplication` and `checkApplication`. Run `enableDailyPrices` only when daily updates are wanted. GitHub Pages does not update the Google project.

## Documentation

- [Development](docs/DEVELOPMENT.md) — setup, checks and generated files.
- [Architecture](docs/ARCHITECTURE.md) — data flow, writes and recovery.
- [Operations](docs/OPERATIONS.md) — backup, test restore and cutover.
- [Prices](apps-script/PRICES.md) — NAV sources and daily updates.
- [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Branch protection](docs/BRANCH_PROTECTION.md) · [Changelog](CHANGELOG.md)
