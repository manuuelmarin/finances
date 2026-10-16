# Portfolio performance and risk panels

Owner-selected work: XIRR (12), drawdown/recovery (13), volatility/correlation (14) and euro profit contributions. These panels appear together below the existing investment charts, outside the performance-measure selector. They follow the product and period filters; each time-series chart also retains its own inspection range. No new backend module, permanent Sheet, table or schema migration is needed.

## Exact TWR and missing history

Exact TWR needs a complete portfolio valuation at each external flow boundary. The application retains the last supported segment and now displays its last valid date and the flow dates without complete valuations. It does not extend that segment with guessed NAVs, execution costs, shifted trade dates or the simple profit/net-capital ratio. Buying on a nonvaluation day requires confirmation of the effective transaction date and the corresponding NAVs; a transaction's bookkeeping unit cost does not independently prove a fund NAV.

The separate linked Modified Dietz series remains explicitly estimated. Extra helper tables cannot recover missing market observations. A future correction must be based on dated broker evidence and/or verified provider NAVs, with before/after reconciliation in the test book.

## TIR / XIRR

Annual money-weighted return solves `Σ CFᵢ / (1+r)^((dᵢ−d₀)/365) = 0`. Purchases are negative investor flows, net sales/distributions positive, and ending market value positive. Fees/taxes already in a net amount are not deducted again. Paired internal fund transfers are excluded at portfolio scope and retained at product scope. No historical base cost is invented as a dated contribution: pre-existing positions or a later window start at the first complete opening market valuation and use only subsequent flows. An inception window uses actual purchases on its first date.

Same-day amounts are combined. A log-rate bisection with finite bounds solves conventional cash flows; no positive/negative pair, invalid inputs, less than 30 days or multiple sign changes produce an explicit unavailable state. Multiple sign changes are conservatively refused even when a particular series might have one root. The annualized TIR is distinct from cumulative return. Included flows and the actual ending valuation are inspectable in the panel.

## Drawdown and recovery

Use the estimated flow-adjusted return index, not portfolio balances. Drawdown is `100 × (index / runningMaximum − 1)` at complete real valuation cuts. Show the maximum drop, peak/trough dates and the first recovery to that peak, or state that it has not recovered. The companion chart shows calendar days below the last maximum. Both restart the peak search at the selected period's first observation and can miss intraperiod movements without NAVs. They are labeled estimates because their input return index is estimated.

## Contributions to profit

Per-product euros: `ending market value − opening market value − purchases + net sales + net distributions`. At inception opening value is zero; later periods use actual opening market value. Internal transfers cancel at portfolio scope. The sum reconciles to the portfolio profit over the same window; this is not percentage TWR attribution or the amount invested. Unknown product values or cash amounts stay unavailable.

## Weekly risk sample

Fund returns use positive real EUR NAVs only. Products need at least 13 weeks of observations to enter the candidate sample. All included products then use one common set of effective quote dates: the last actual common date in each completed calendar week, omitting incomplete boundary weeks. A return is measured only between adjacent observed calendar weeks; a missing week never becomes a zero return or a multweek return. Different real quote weekdays can make the interval slightly shorter or longer than seven days, as in ordinary weekly sampling around holidays.

At least 12 comparable weekly returns are required. Samples of 12–51 returns display a prominent provisional/short-sample note; 52 is a coverage milestone, not an accuracy guarantee. Sample dates and count are visible. Products excluded for insufficient history are named. Volatility is sample standard deviation (`n−1`) × `√52`; fund correlation is Pearson on the same weekly NAV returns. Constant-series correlation is undefined. EUR NAV returns exclude cash distributions and must not be called total-return risk for distributing funds. Portfolio volatility uses the estimated flow-adjusted index at those same endpoints, only when all required values exist. No price-level correlation, carried quote interpolation or balance volatility is used.

## Verification and private-data handling

Synthetic tests cover analytic IRRs, fees/distributions/transfers, opening market positions, ambiguous roots, missing flow valuations, drawdown/recovery, Pearson edge cases, common-date sampling and short-history gates. Browser checks verify simultaneous panels, selector independence, scope/range changes and mobile width.

Native Google Sheets checks on the private test book independently reproduced XIRR, sample volatility, CORREL, running-maximum drawdown and summed profit contributions. Temporary verification cells are removed after checking. Inputs and cell backups remain outside the public repository. Only attributable missing provider NAVs may be reconciled into the principal, preserving operations, units, costs, source precision, native table bounds and generated historical views. Updating historical data does not activate or certify the principal backend.

## References

- [GIPS handbook](https://www.gipsstandards.org/standards/gips-standards-for-firms/gips-standards-handbook-for-firms/): valuation boundaries, time-weighted returns and Modified Dietz.
- [Microsoft XIRR](https://support.microsoft.com/en-us/excel/functions/xirr-function): dated cash flows and 365-day convention.
- [CFA portfolio risk and return](https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/portfolio-risk-return-part-1): return variance and correlation.

## Arithmetic monthly and yearly means

Below the result/return KPI, show separate arithmetic means of observed calendar-month and calendar-year returns. Use the estimated adjusted-return index: each period is `100 × (endingIndex / openingIndex − 1)`. The first observed period starts at its first real valuation; later periods start at the preceding observed period-end. Include partial inception/current months and years without annualizing or multiplying the monthly mean by twelve. Preserve negative returns. A single initial anchor alone is not a return. Omit missing calendar periods and the first period after a wholly missing month/year rather than attributing a multi-period return to that period or filling it with zero. Inspectable tables show each calendar period, actual valuation boundaries and return. The two means use all recorded history for the selected product/portfolio, matching the KPI scope independently of the chart-period selector. These remain estimates while their adjusted-return input is estimated.
