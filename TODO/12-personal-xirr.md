# 12. Personal money-weighted return (XIRR)

Status: **Proposed — awaiting owner selection.** This document authorizes no implementation or financial write.

Priority: **High** · Relative effort: **Medium**. Estimates describe the current Sheets/Apps Script/PWA architecture, not delivery dates.

## Purpose and expected value

Complement TWR and result/net-capital with a return sensitive to the owner’s cash-flow timing.

## User experience

Investments → Performance. Add clearly labeled annualized XIRR, period bounds, terminal valuation date and included cash flows. Provide a view of those inputs and explain why it differs from TWR and simple profit ratios.

## Data and calculation contract

At portfolio scope, contributions are negative investor cash flows, withdrawals/distributions positive, and terminal market value positive. Internal fund transfers are excluded; fees/taxes are treated consistently. Solve dated discounted cash flows with a documented day-count convention and stable numerical bounds.

## Scope, prerequisites and exclusions

Requires complete cash-flow history, trustworthy ending valuation and audited treatment of opening positions. Reference the CFA rates-and-returns distinction. Never tune the result to match a broker’s undocumented percentage.

## Risks and critical tradeoff

No solution, multiple roots, a terminal valuation before a flow or short periods with extreme annualization. Return an explicit unavailable/ambiguous result rather than a convenient root.

## Acceptance criteria

1. Known analytic examples reproduce expected returns within numerical tolerance.
2. A contribution-only sequence with no positive ending value does not produce a spurious result.
3. Internal fund transfers leave portfolio XIRR unchanged.
4. Show dates and cash flows sufficient for independent spreadsheet reproduction.

## Rollout

Implement only after the owner selects this numbered proposal. Add focused synthetic calculation and browser checks, run the existing financial-flow regressions, and demonstrate the result on the test book. Identify any required Google files and schema migration before publication. Preserve the private review/confirmation, book binding and retry protections.

## Primary reference

[Methodology or source documentation](https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/rates-and-returns). A reference is not a production data-feed license; access, coverage and reuse must be checked before implementation.

[Back to the numbered backlog](../TODO.md)
