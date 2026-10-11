# Changelog

Build numbers identify the app and Apps Script code, not necessarily GitHub tags or releases. The API remains **3.3.0**. This history does not establish the installed Google version or environment; publishing Pages changes neither.

## Repository maintenance · no new app version

Simplified documentation, issue and PR templates, and editing conventions. Build 3.8.1 runtime files, dependencies and deployment configuration are preserved.

## 3.8.1

[PR #14](https://github.com/manuuelmarin/finances/pull/14): revised contribution/value charts and TWR between observed valuations. Missing initial history remains unknown; insufficient valuations interrupt TWR. Optional daily prices in test include concurrency checks, receipt recovery and stale-price handling.

## 3.8.0

Interactive charts, sortable/filterable records, investment periods and expense analysis. Added daily cash balances, savings/goal comparisons and calculators; prepared optional daily prices with fallback between official VDOS/Quefondos pages.

## 3.7.0

Dedicated app sections and mobile navigation, retaining filters and record details. Activity separates pending requests from confirmed history; Settings groups diagnostics and storage.

## 3.6.1

Reused Google sessions across reads, checks and operations. Prevented duplicate checks and outdated responses; improved Spanish connection notices and closed-window recovery.

## 3.6.0

Initial snapshot embedded in private Google HTML after owner verification. Authenticated channel checks and subsequent JSON transport distinguish failed reads from unconfirmed writes.

## 3.5.1

Recovered uncertain responses with the same UUID and receipt lookup. Protected uncertain operations against editing/discarding and cancelled outdated reads after deployment changes.

## 3.5.0

Transaction shortcuts, dashboard charts and monthly overall/subcategory budgets. Audited limits do not create transactions or alter cash balances.

## 3.4.0

Readiness checks and separate primary-workbook configuration. Retained API 3.3.0 with workbook binding, revision and receipt controls.
