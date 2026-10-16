# 16. Dated fund fundamentals and valuation context

Status: **Proposed — awaiting owner selection.** This document authorizes no implementation or financial write.

Priority: **Low initially** · Relative effort: **Medium–high**. Estimates describe the current Sheets/Apps Script/PWA architecture, not delivery dates.

## Purpose and expected value

Provide useful context such as P/E, P/B, yield and fund size without pretending NAV is a company earnings multiple.

## User experience

Investments → Analysis → Fund facts. Start with a dated table of attributable provider metrics and coverage, then optional comparisons among compatible equity funds. Separate valuation measures from fees and historic performance.

## Data and calculation contract

Store ISIN/class, metric definition, source, reporting date, covered portfolio share, treatment of negative earnings and forward/actual estimates. Never average fund P/E values arithmetically into a portfolio P/E. Unknown components remain unknown.

## Scope, prerequisites and exclusions

Requires permission to reuse a reliable provider feed or reviewed official reports. Use a compact Investments subview; defer a new Fundamentals top-level page until direct equity holdings justify it.

## Risks and critical tradeoff

Inconsistent definitions, forecast revisions and mixed equity/bond portfolios. A single valuation ratio is not a buy/sell signal or a quality score.

## Acceptance criteria

1. Forward and trailing P/E are visibly distinct and never combined silently.
2. Negative earnings and unavailable coverage cannot become zero P/E.
3. Each number exposes provider date/methodology and class.
4. Non-equity funds display only applicable metrics.

## Rollout

Implement only after the owner selects this numbered proposal. Add focused synthetic calculation and browser checks, run the existing financial-flow regressions, and demonstrate the result on the test book. Identify any required Google files and schema migration before publication. Preserve the private review/confirmation, book binding and retry protections.

## Primary reference

[Methodology or source documentation](https://www.msci.com/documents/10199/255599/msci-world-index.pdf). A reference is not a production data-feed license; access, coverage and reuse must be checked before implementation.

[Back to the numbered backlog](../TODO.md)
