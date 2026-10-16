# Period filters and return-chart follow-up

This frontend-only change preserves the private Google deployment, workbook structure, financial records and recorded operation dates. It requires no Apps Script replacement or new Sheets table.

## Periods and spending

Summary accepts one month, consecutive months or an inclusive exact-date interval. The chosen interval applies to daily cash, category expenses, category transaction detail and the monthly income/expense bars. Snapshot wealth and composition retain their existing report cutoff. The Movements analysis also accepts a start/end month alongside its existing exact dates. Invalid reversed intervals retain the last valid chart and show an inline error.

The ticket card cycles through arithmetic mean, median and mode for positive own expenses under the same active filters. Amounts are grouped to cents for mode; a unique-frequency sample displays no mode and ties show all modal amounts. Refunds affect net spending but are excluded from the positive-ticket population. Unknown selected amounts keep the indicators unavailable. The largest expense includes its concept and exact date.

The selected category's disclosure closes through its summary or a second selection of the same category. Fund-source cards remain generated from the workbook's product list, under a closed disclosure, with further provenance available on demand. Historical-price import is emphasized and remains generic to the selected product.

## Return calculation

Exact TWR still links complete real valuation endpoints and stays unavailable after an external flow without adequate valuation. It is not restarted or silently filled. The separate result/net-contribution and per-product NAV measures retain their meanings.

The default adjusted-return chart uses **linked Modified Dietz**, explicitly labeled as an estimate. The product total-return chart uses the same disclosed method. For consecutive complete, real valuation endpoints `a` and `b`:

```text
w_i = (b - flow_date_i) / (b - a)
r_ab = (V_b - V_a - sum(C_i) - precision_adjustment) /
       (V_a + sum(w_i * C_i))
linked_return = product(1 + r_ab) - 1
```

Dates are calendar-day differences. Purchases are positive flows, sales and net distributions are negative flows. End-of-day flows at `b` have zero denominator weight. Distributions count once. Verified internal fund-transfer precision residuals remain noncash adjustments; internal portfolio transfers are not external contributions.

Only actual complete valuation endpoints become plotted observations. No NAV, execution date or intermediate zero return is written or fabricated. A nonpositive denominator, unknown flow, invalid operation or unverifiable adjustment blocks the affected estimate. The first real valuation is a measured anchor; unknown returns before it are not reconstructed. Choosing a chart window crops the existing measured series, as before, rather than rebasing it.

This estimate can bridge a cash-flow day without its own NAV, unlike exact TWR. Its accuracy still depends on the recorded dates, large flows and market movement between observations. It does not certify a broker's personal-return percentage or resolve uncertain historical execution dates. With observed endpoint flows, the end-of-day calculation agrees with exact TWR.

Reference: [GIPS Standards Handbook for Firms, calculation methodology](https://www.gipsstandards.org/standards/gips-standards-for-firms/gips-standards-handbook-for-firms/). This is a methodology reference, not a claim of GIPS compliance.

## Validation boundaries

Regression coverage includes the published GIPS Modified Dietz numerical example, cross-year contributions on unquoted dates, net distributions, withdrawals, unknown flows, invalid denominators, ticket ties, reversed periods and disclosure reopening. Public fixtures are fictional. A separate read-only reconciliation checks the private test workbook against an independent calculation outside the repository; private inputs and amounts are not committed.

After merge and successful Pages deployment, accept the PWA update. The principal aggregation-range issue and GitHub required-quality-check configuration remain separate outstanding tasks.
