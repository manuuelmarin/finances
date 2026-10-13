# Owner acceptance and cutover checklist

This is the remaining owner workflow after the 3.9.3 test-backend confirmation. The 3.9.4 release adds installer file comparisons and clearer scheduling labels; it does not change financial operations, quote validation, retries or workbook data.

## Observed state and pending work

- Editor output confirmed build **3.9.3**, API **3.3.0**, model **3**, test environment, 10 business sheets, 12 tables and no calculation errors. The same revision before/after the checks shows no financial-input change.
- The daily routine can be enabled while its three attempts receive old effective dates and a further manual execution returns `DAILY_RETRY_LIMIT`. The next Madrid calendar day gets a fresh daily ledger. Calling `enableDailyPrices` again on the same enabled binding preserves today's attempts. `disableDailyPrices` removes that state; do not toggle disable/enable to bypass the quota.
- `ok:true` reports that an operator/check ran; `technicalReady:true` covers structure, calculations, summary, Bridge, verified sources and stable revision. Neither field means that every latest NAV was published. Inspect `complete`, `dailyPrices.status`, effective dates and warnings separately.
- Provider results can carry `PUBLICATION_DELAY` even when their identity is valid. A newer stored observation must remain when the provider returns an older effective date. No newer prices are assumed or fabricated.
- Confirm the intended report (`asof`) and valuation cutoffs before interpreting current-market charts; change dates explicitly through the app when appropriate.
- Editor execution does not prove that the `/exec` deployment has the same code. Publish and verify the private deployed version separately.

## Tomorrow: test application, in order

1. Resolve pending/uncertain operations on each device through their original deployment before any connection switch. Record the current balances, holdings and report dates, and retain the full native backup.
2. Open the installer and select **3.9.3** only if all its original modules are installed without custom edits. For 3.9.4, replace the files marked changed: `Configuration.gs` and `Bridge.html`. Keep the other 13 files. If the baseline is uncertain, follow the complete installation instructions.
3. Save in the existing test project. Run `checkApplication`; expect build **3.9.4**, API **3.3.0**, `environment:test`, `technicalReady:true` and no calculation errors. Preparation is already confirmed; rerun `prepareApplication` only if initialization/capacity diagnostics require it.
4. Publish **New version** of the existing web deployment, retaining its URL, **execute as Me** and **Only me** access. Keep its existing test properties and workbook ID.
5. After resolving pending requests, close the old Google window, reload Finance and reopen the workbook. Inspect the connection diagnostics from the app. Confirm the deployed build is **3.9.4**, the environment is test, and the intended workbook loaded. Check that its financial values and dates match the baseline.
6. In Settings, inspect daily prices: enabled schedule **20, 21, 22 / Europe/Madrid**. An exhausted previous-day result must not be presented as a current successful publication. Use one manual `updatePrices` check on the new day if wanted; it shares the three-attempt quota. A still-old source legitimately remains pending.
7. In Investments, inspect each product's ISIN, effective price date, source and warning. Newer stored prices must remain if the provider returns an older effective date. `Histórico` must retain real dates and blank unsupported dates; a successful poll need not add a row when the NAV is unchanged.
8. On the **test book**, review/cancel an expense without sending it, then confirm a 1 EUR synthetic expense. Correct it to 2 EUR, cancel it, reread and reconcile the original balance and report dates. Confirm there is no duplicate row or unresolved request.
9. Check existing monthly budgets, salary, goals, account filters and investment/product/time selectors. Use your accepted desktop/phone workflows; an offline rehearsal must recover one request/receipt and be canceled on the test book afterward.
10. After the automatic window, inspect the latest run, each effective NAV date and provider warnings. A `complete` verification is useful evidence; `retry_limit` with delayed quotes means the publication issue remains open even when technical readiness is green.

## Principal activation remains separate

Make a fresh native backup and audit/reconcile the current principal's inputs, balances, units, capital, debt, settings and native calculations. Validate an isolated copy with the new backend before preparing the real principal. Use its separate private Apps Script project/deployment and explicitly configured production binding; preserve the test pair. A new project needs all 15 files for its first installation; the two-file comparison applies to an existing complete 3.9.3 project. Switch the app only after owner authorization and completed pending-request recovery, then compare the first production read with the saved baseline and enable production prices there. Follow [Operations](OPERATIONS.md) for the complete recovery/cutover procedure.

Repository tests use fictional data. They do not certify a physical phone, owner login, the private deployment or current provider publication. The application is technically validated; fresh prices and principal-workbook acceptance remain live checks.
