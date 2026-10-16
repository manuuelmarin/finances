# Proposed improvements

Twenty stable proposal IDs for owner review. **All are proposals, not approved implementation work.** The interface corrections requested separately are not contingent on selecting this backlog. Choose by number (for example, “implement 03 and 18”); retain IDs when reprioritizing.

| ID  | Proposal                                                                            | Priority      | Relative effort |
| --- | ----------------------------------------------------------------------------------- | ------------- | --------------- |
| 01  | [Bank CSV import with reconciliation](TODO/01-bank-csv-import.md)                   | High          | Medium          |
| 02  | [Net-worth change waterfall](TODO/02-wealth-waterfall.md)                           | Medium        | Medium          |
| 03  | [Like-for-like spending comparisons](TODO/03-comparable-spending.md)                | High          | Low–medium      |
| 04  | [Spending calendar heatmap](TODO/04-spending-heatmap.md)                            | Medium        | Low             |
| 05  | [Rolling 30/90-day spending trends](TODO/05-rolling-expenses.md)                    | Medium        | Low–medium      |
| 06  | [Reviewable recurrence suggestions](TODO/06-recurrence-suggestions.md)              | Medium        | Low–medium      |
| 07  | [Optional budget carryover](TODO/07-budget-carryover.md)                            | Medium        | Medium          |
| 08  | [Dated goal contribution history](TODO/08-goal-contributions.md)                    | Medium        | Medium          |
| 09  | [Country, sector and asset exposure](TODO/09-look-through-exposure.md)              | High          | Medium–high     |
| 10  | [Company concentration and fund overlap](TODO/10-holdings-overlap.md)               | Medium        | High            |
| 11  | [Target allocation and contribution-led rebalancing](TODO/11-allocation-targets.md) | High          | Medium          |
| 12  | [Personal money-weighted return (XIRR)](TODO/12-personal-xirr.md)                   | High          | Medium          |
| 13  | [Drawdown and recovery analysis](TODO/13-drawdown-recovery.md)                      | Medium        | Medium          |
| 14  | [Volatility and correlation with coverage gates](TODO/14-risk-statistics.md)        | Medium        | Medium–high     |
| 15  | [Compatible performance benchmark](TODO/15-compatible-benchmark.md)                 | Medium        | Medium–high     |
| 16  | [Dated fund fundamentals and valuation context](TODO/16-fund-fundamentals.md)       | Low initially | Medium–high     |
| 17  | [Investment cost attribution](TODO/17-cost-attribution.md)                          | Medium        | Medium          |
| 18  | [Saved analytical views](TODO/18-saved-views.md)                                    | High          | Low–medium      |
| 19  | [Interactive expanded chart workspace](TODO/19-expanded-interactive-charts.md)      | Medium        | Medium          |
| 20  | [Verified backup and isolated restore](TODO/20-verified-backup-restore.md)          | High          | Medium          |

## Suggested sequence

- Start with 03 and 18: high daily-use value with no external market-data dependency.
- Evaluate 01 carefully: major time savings, but statement identity and recovery deserve real engineering.
- For investment analysis, start with 09 and 11, then 12 and 13 when histories support the calculation.
- Gate 10, 14, 15 and 16 on sufficient, attributable data. A visually impressive incomplete statistic is worse than an explicit unavailable result.
- Treat 20 as an operational recovery capability; a workbook copy is only one part of a complete backup.

Each specification defines its UX, data contract, scope, risks, acceptance and test-book rollout. Effort excludes purchasing data licenses or broker integrations. None proposes a browser-login bot, automated trades, a generic portfolio score or a Power BI clone.

## Portfolio analysis placement

Use **Investments → Analysis** for exposure, concentration, allocation, drawdown and risk. Keep performance measures next to existing portfolio charts. Start fundamentals as a dated fund-facts table; consider a dedicated top-level page only if direct stocks and the required underlying data become a significant part of the app. Country/sector metadata is normally reported periodically; it does not need to be scraped daily like NAV.

Existing features already include generic ISIN products, daily price accumulation, exact chart ranges, static chart exports, custom-interval budgets, planning tools and goal assignments. The proposals extend those capabilities rather than counting them again as new work.
