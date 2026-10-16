# 14. Volatility and correlation with coverage gates

Status: **Proposed — awaiting owner selection.** This document authorizes no implementation or financial write.

Priority: **Medium** · Relative effort: **Medium–high**. Estimates describe the current Sheets/Apps Script/PWA architecture, not delivery dates.

## Purpose and expected value

Add defensible risk comparisons without producing precise-looking statistics from short or incompatible histories.

## User experience

Investments → Analysis. Show annualized volatility, sample period/frequency and a correlation matrix with a shared valid-observation count. Explain exclusions at cell level rather than filling blanks.

## Data and calculation contract

Calculate returns, not price-level correlations or balance volatility. Align effective dates, share-class currencies and distribution conventions. Start with 52 aligned weekly returns as a proposed eligibility rule; document annualization and missing-data policy.

## Scope, prerequisites and exclusions

Depends on complete-enough verified history, proposal 09 for exposure context and a documented statistics module. Benchmark and portfolio-return risk require their own eligible series.

## Risks and critical tradeoff

Stale carried prices suppress measured volatility. Different pairwise samples can make correlations incomparable. Prefer a declared common sample and explicitly mark constant-series undefined correlations.

## Acceptance criteria

1. Flat prices produce zero volatility and undefined correlation, not division errors.
2. Perfectly related synthetic returns yield the expected ±1 correlation.
3. Changing sample frequency updates annualization and sample count consistently.
4. Histories below the chosen coverage gate show unavailable statistics.

## Rollout

Implement only after the owner selects this numbered proposal. Add focused synthetic calculation and browser checks, run the existing financial-flow regressions, and demonstrate the result on the test book. Identify any required Google files and schema migration before publication. Preserve the private review/confirmation, book binding and retry protections.

## Primary reference

[Methodology or source documentation](https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/portfolio-risk-return-part-1). A reference is not a production data-feed license; access, coverage and reuse must be checked before implementation.

[Back to the numbered backlog](../TODO.md)
