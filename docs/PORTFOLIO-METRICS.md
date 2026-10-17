# Portfolio performance and risk panels

TIR/XIRR, monthly return bars, drawdown/recovery, euro profit contributions, volatility and correlation appear together below the investment charts, outside the performance-measure selector. They follow the product and period filters; each time-series chart also has its own inspection range.

## Exact TWR and missing history

Exact TWR needs a complete portfolio valuation at each external flow boundary. The application retains the last supported segment and now displays its last valid date and the flow dates without complete valuations. It does not extend that segment with guessed NAVs, execution costs, shifted trade dates or the simple profit/net-capital ratio. Buying on a nonvaluation day requires confirmation of the effective transaction date and the corresponding NAVs; a transaction's bookkeeping unit cost does not independently prove a fund NAV.

The separate linked Modified Dietz series remains explicitly estimated. Extra helper tables cannot recover missing market observations. A future correction must be based on dated broker evidence and/or verified provider NAVs, with before/after reconciliation in the test book.

## One return basis, without duplicate charts

When the complete observed history supports TWR at every real valuation, the main chart selects TWR and the measure selector omits the redundant Modified Dietz estimate. With incomplete TWR, the explicitly estimated Dietz alternative remains available and the exact view keeps its coverage warning. Never splice an exact prefix to an estimated suffix and call the result exact.

Monthly bars, calendar means, drawdowns, recovery duration and portfolio volatility use that same selected return basis. Their contextual information identifies TWR or estimated Dietz. There is one main cumulative return chart for each product; the former extra “Rentabilidad total con distribuciones” chart repeated a series that already included net distributions and has been removed. The monthly green/red bars and all seven simultaneous analysis panels remain outside the measure selector.

Calendar means are distinct from cumulative TWR: the former average signed period returns arithmetically; the latter geometrically links them. For example, +10% followed by −10% has a 0% arithmetic mean and a −1% cumulative return. TIR is also distinct because it depends on the amounts and dates of personal cash flows.

## TIR / XIRR

Annual money-weighted return solves `Σ CFᵢ / (1+r)^((dᵢ−d₀)/365) = 0`. Purchases are negative investor flows, net sales/distributions positive, and ending market value positive. Fees/taxes already in a net amount are not deducted again. Paired internal fund transfers are excluded at portfolio scope and retained at product scope. No historical base cost is invented as a dated contribution: pre-existing positions or a later window start at the first complete opening market valuation and use only subsequent flows. An inception window uses actual purchases on its first date.

Same-day amounts are combined. A log-rate bisection with finite bounds solves conventional cash flows; no positive/negative pair, invalid inputs, less than 30 days or multiple sign changes produce an explicit unavailable state. Multiple sign changes are conservatively refused even when a particular series might have one root. The annualized TIR is distinct from cumulative return. Included flows and the actual ending valuation are inspectable in the panel.

## Drawdown and recovery

Use the selected flow-adjusted return index, not portfolio balances. Drawdown is `100 × (index / runningMaximum − 1)` at complete real valuation cuts. Show the maximum drop, peak/trough dates and the first recovery to that peak, or state that it has not recovered. The companion chart shows calendar days below the last maximum. Both restart the peak search at the selected period's first observation and can miss intraperiod movements without NAVs. They are labeled estimates when the selected return index uses Dietz.

## Contributions to profit

Per-product euros: `ending market value − opening market value − purchases + net sales + net distributions`. At inception opening value is zero; later periods use actual opening market value. Internal transfers cancel at portfolio scope. The sum reconciles to the portfolio profit over the same window; this is not percentage TWR attribution or the amount invested. Unknown product values or cash amounts stay unavailable.

## Weekly risk sample

Fund returns use positive real EUR NAVs only. Products need at least 13 weeks of observations to enter the candidate sample. All included products then use one common set of effective quote dates: the last actual common date in each completed calendar week, omitting incomplete boundary weeks. A return is measured only between adjacent observed calendar weeks; a missing week never becomes a zero return or a multweek return. Different real quote weekdays can make the interval slightly shorter or longer than seven days, as in ordinary weekly sampling around holidays.

At least 12 comparable weekly returns are required. Samples of 12–51 returns display a prominent provisional/short-sample note; 52 is a coverage milestone, not an accuracy guarantee. Sample dates and count are visible. Products excluded for insufficient history are named. Volatility is sample standard deviation (`n−1`) × `√52`; fund correlation is Pearson on the same weekly NAV returns. Constant-series correlation is undefined. EUR NAV returns exclude cash distributions and must not be called total-return risk for distributing funds. Portfolio volatility uses the selected flow-adjusted index at those same endpoints, only when all required values exist. No price-level correlation, carried quote interpolation or balance volatility is used.

## References

- [GIPS handbook](https://www.gipsstandards.org/standards/gips-standards-for-firms/gips-standards-handbook-for-firms/): valuation boundaries, time-weighted returns and Modified Dietz.
- [Microsoft XIRR](https://support.microsoft.com/en-us/excel/functions/xirr-function): dated cash flows and 365-day convention.
- [CFA portfolio risk and return](https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/portfolio-risk-return-part-1): return variance and correlation.

## Arithmetic monthly and yearly means

Below the result/return KPI, show separate arithmetic means of observed calendar-month and calendar-year returns. Use the selected flow-adjusted return index: each period is `100 × (endingIndex / openingIndex − 1)`. The first observed period starts at its first real valuation; later periods start at the preceding observed period-end. Include partial inception/current months and years without annualizing or multiplying the monthly mean by twelve. Preserve negative returns. A single initial anchor alone is not a return. Omit missing calendar periods and the first period after a wholly missing month/year rather than attributing a multi-period return to that period or filling it with zero. Inspectable tables show each calendar period, actual valuation boundaries and return. The two means use all recorded history for the selected product/portfolio, matching the KPI scope independently of the chart-period selector. These remain estimates whenever the selected return basis is estimated Dietz.

## Monthly return bars

The simultaneous analysis grid includes a signed monthly bar chart: green for nonnegative return, red for loss, month on X and percentage on Y. It reuses the same selected flow-adjusted period-return calculation as the arithmetic means, restricted to the selected product and chart period, with real first/last partial boundaries. A capital deposit alone cannot create a return. Regression examples add 100 and 1,000 EUR at unchanged NAV and verify 0%, followed by genuine +10% and −10% months. Missing observations remain omitted rather than represented as zero. Bar tables and chart exports retain the underlying signed monthly percentages.

## Calculator assumptions

Calculators are local estimates; they do not read or write financial records. Compound growth converts an effective annual return to a monthly rate, with contributions at month-end and annual inflation. Goal saving accepts whole months and finds the smallest cent contribution that reaches the target.

Fixed mortgages use nominal annual TIN divided by twelve, with upfront costs separate from the loan. Early repayment starts from outstanding capital and remaining months, applies an immediate repayment and its percentage charge, and compares a lower payment with a shorter term. Its schedule rounds interest and payments to cents; the final payment clears the balance. Net saving is interest avoided minus the charge, excluding the principal repaid. Insurance, taxes, alternative investment returns and other bank fees are excluded.
