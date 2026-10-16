# 15. Compatible performance benchmark

Status: **Proposed — awaiting owner selection.** This document authorizes no implementation or financial write.

Priority: **Medium** · Relative effort: **Medium–high**. Estimates describe the current Sheets/Apps Script/PWA architecture, not delivery dates.

## Purpose and expected value

Compare measured performance with an appropriate, attributable reference over matching dates.

## User experience

Investments → Performance. Select a supported benchmark and show two indexed-to-100 curves plus relative change. Indicate currency, return type, dates and source. A contribution-matched hypothetical investment is a separate simulation.

## Data and calculation contract

Use licensed or permitted benchmark data with explicit price/net/gross-total-return classification. Match currency and observation dates. Compare fund NAV/total-return or valid portfolio TWR; simple result/net-capital is not an apples-to-apples index return.

## Scope, prerequisites and exclusions

Depends on source access/rights and enough common history. A fund following an index is not identical to owning the index. Allow the owner to choose the reference; do not silently select an unsuitable index.

## Risks and critical tradeoff

Currency effects, distributions and contribution timing can explain most apparent outperformance. Avoid ranking funds from incompatible samples.

## Acceptance criteria

1. Both indexed series begin at 100 on the same actual observation date.
2. No extrapolated values appear before benchmark inception.
3. A total-return benchmark cannot silently substitute for a price-only series.
4. CSV export includes source, currency and return convention metadata.

## Rollout

Implement only after the owner selects this numbered proposal. Add focused synthetic calculation and browser checks, run the existing financial-flow regressions, and demonstrate the result on the test book. Identify any required Google files and schema migration before publication. Preserve the private review/confirmation, book binding and retry protections.

## Primary reference

[Methodology or source documentation](https://www.msci.com/documents/10199/255599/msci-world-index.pdf). A reference is not a production data-feed license; access, coverage and reuse must be checked before implementation.

[Back to the numbered backlog](../TODO.md)
