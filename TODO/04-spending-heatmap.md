# 04. Spending calendar heatmap

Status: **Proposed — awaiting owner selection.** This document authorizes no implementation or financial write.

Priority: **Medium** · Relative effort: **Low**. Estimates describe the current Sheets/Apps Script/PWA architecture, not delivery dates.

## Purpose and expected value

Find expensive days and spending patterns without another nearly identical line chart.

## User experience

Movements → Calendar. A compact month grid shades own spending by day, with keyboard-accessible date cells. Selecting a day opens Fecha, Concepto and Importe below the calendar. A legend and amount labels complement color.

## Data and calculation contract

Aggregate the same signed own-expense records used by existing analysis. Use a separate treatment for net-refund days. Explicitly distinguish an observed zero from an unobserved date. Scale color within the selected period and retain numeric amounts.

## Scope, prerequisites and exclusions

Local read-only feature using the current snapshot and date filters. No external calendar, geolocation or new permissions.

## Risks and critical tradeoff

Color-only meaning, exaggerated outliers and confusion between absent data and no spending. Keep a robust labeled scale and show extreme values in the tooltip.

## Acceptance criteria

1. Week starts on Monday and dates match the Spanish month/year selector.
2. Refunds retain their sign and do not inflate positive spending intensity.
3. All cells are usable with keyboard and on a phone.
4. Selecting any date returns exactly its contributing movements.

## Rollout

Implement only after the owner selects this numbered proposal. Add focused synthetic calculation and browser checks, run the existing financial-flow regressions, and demonstrate the result on the test book. Identify any required Google files and schema migration before publication. Preserve the private review/confirmation, book binding and retry protections.

[Back to the numbered backlog](../TODO.md)
