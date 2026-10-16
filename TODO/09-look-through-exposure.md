# 09. Country, sector and asset exposure

Status: **Proposed — awaiting owner selection.** This document authorizes no implementation or financial write.

Priority: **High** · Relative effort: **Medium–high**. Estimates describe the current Sheets/Apps Script/PWA architecture, not delivery dates.

## Purpose and expected value

Reveal the underlying portfolio exposure rather than only the funds’ names or legal domiciles.

## User experience

Investments → Analysis. Show compact horizontal country/sector charts, asset-class breakdown and a coverage table. Each panel states holdings date, source and known share; unknown exposure stays visible.

## Data and calculation contract

Key metadata by ISIN/share class and holdings date. Multiply each fund’s current portfolio weight by its disclosed underlying weights. Separate fund domicile, issuer domicile, economic exposure, quote currency and hedging. Do not normalize known holdings to 100%.

## Scope, prerequisites and exclusions

Prefer official factsheets and periodic reports with permitted reuse; start with reviewed imports and monthly/quarterly metadata refreshes. A benchmark-based proxy must be explicitly selectable and labeled.

## Risks and critical tradeoff

Stale reports, inconsistent region taxonomies and top-ten-only lists. Avoid daily browser-login bots and unsupported scraping as core infrastructure.

## Acceptance criteria

1. A 60%-weighted fund with 50% US exposure contributes 30 percentage points to portfolio US exposure.
2. An uncovered 20% remains unknown, not proportionally redistributed.
3. Changing a fund or adding a new ISIN requires metadata, not hardcoded code.
4. Every displayed exposure can be traced to source date and class.

## Rollout

Implement only after the owner selects this numbered proposal. Add focused synthetic calculation and browser checks, run the existing financial-flow regressions, and demonstrate the result on the test book. Identify any required Google files and schema migration before publication. Preserve the private review/confirmation, book binding and retry protections.

## Primary reference

[Methodology or source documentation](https://www.cnmv.es/DocPortal/Publicaciones/Guias/Los_fondos_de_inversion.pdf). A reference is not a production data-feed license; access, coverage and reuse must be checked before implementation.

[Back to the numbered backlog](../TODO.md)
