# 13. Drawdown and recovery analysis

Status: **Selected by the owner; implemented in the portfolio-analysis branch.** See [implemented methodology and verification](../docs/PORTFOLIO-METRICS.md). Publication is a separate release step.

Priority: **Medium** · Relative effort: **Medium**. Estimates describe the current Sheets/Apps Script/PWA architecture, not delivery dates.

## Purpose and expected value

Show losses from a previous performance peak and how long recovery took.

## User experience

Investments → Analysis. A negative drawdown area sits beside maximum drawdown, peak/trough/recovery dates and current recovery duration. Selecting a trough highlights its source interval.

## Data and calculation contract

Use a valid total-return index or eligible flow-adjusted portfolio series, not absolute market value. Drawdown is index/running maximum minus one. Separate unresolved underwater periods from completed recovery and expose missing observations.

## Scope, prerequisites and exclusions

Depends on adequate NAV/total-return coverage and an agreed gap policy; do not bridge missing flow valuations in TWR. Fund NAV-only and total-return drawdowns require different labels.

## Risks and critical tradeoff

Contributions can hide losses if calculated from balances. Infrequent observations can understate maximum drawdown; call it observed drawdown at the selected frequency.

## Acceptance criteria

1. New cash contributions alone do not create a new performance peak.
2. A known peak/trough/recovery example gives exact dates and magnitude.
3. An unrecovered drawdown shows open duration, not a fabricated recovery.
4. Insufficient history disables the complete-period statistic.

## Rollout

Owner selection is recorded; use the implemented methodology and release checklist for acceptance. Add focused synthetic calculation and browser checks, run the existing financial-flow regressions, and demonstrate the result on the test book. Identify any required Google files and schema migration before publication. Preserve the private review/confirmation, book binding and retry protections.

## Primary reference

[Methodology or source documentation](https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/rates-and-returns). A reference is not a production data-feed license; access, coverage and reuse must be checked before implementation.

[Back to the numbered backlog](../TODO.md)
