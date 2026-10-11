# Prices

Release 3.8.1 retains API 3.3.0. `refreshPrices` preserves revision, workbook binding, UUID and receipt rules. Confirmed NAV enters `tPrecios` once per **published effective date**, never query date. Same-date conflicts require review; failures preserve the last price and audit evidence.

## Sources and history

Verified on 9 October 2026: **VDOS / Quefondos**, using fixed HTTPS routes by validated ISIN, without redirects or provider HTML execution.

The [classic factsheet](https://www.quefondos.com/es/fondos/ficha/index.html?isin=ES0112611001) publishes identity, currency and «Última valoración» (Latest valuation). The ISIN is a research example. The [mobile variant](https://www.quefondos.com/m/es/fondos/ficha/index.html?isin=ES0112611001) is fallback only for HTTP/network/format failures, never identity, share-class, currency, date or price inconsistency. Preserve each response's effective date and share-class currency; store published EUR NAV, with any conversion supplied by the provider.

The [help](https://www.quefondos.com/es/fondos/ficha/ayuda_ficha.html) and [official JavaScript](https://www.quefondos.com/opencms/export/system/modules/com.vdos.site.qf.templates/resources/js/infofiucaract-lib.js) describe monthly samples, gap filling and EUR returns rebased to 100. These do not establish daily NAV dates. [VDOS](https://www.vdos.com/es/datos.html) offers histories, but no generic public daily endpoint has been verified. [Vanguard](https://www.vanguard.co.uk/professional/product/fund/bond/9132/20-year-euro-treasury-index-fund-euro-shares) downloads cover specific classes only.

Earlier history needs a verified exportable source by class/currency and another adapter. Display missing history; never interpolate or apply current NAV retrospectively. No licensed feed or retrospective history is installed.

## Optional test routine

Pages publication installs nothing. The owner copies the three Apps Script files, including the current manifest, and publishes a new Google version. Keep `ENVIRONMENT=test`. The `script.scriptapp` [permission](https://developers.google.com/apps-script/reference/script/script-app) requires reauthorization; permission alone does not activate updates.

From the editor, run `comprobarPaso4`, `probarFuentesPaso4`, then `activarActualizacionDiariaPreciosTest`. Activation creates one hourly trigger bound to the test workbook, querying between 20:00–22:00 Madrid time; Google chooses the minute. `desactivarActualizacionDiariaPreciosTest` disables binding/state and removes only this routine's triggers. Reinstallation removes duplicates/migrates old triggers; reactivation preserves receipts/attempts.

`actualizacionDiariaPreciosTest` uses batches up to twenty, stable receipt UUIDs and at most three attempts per batch/day. Lost responses recover receipts without another attempt. Completion requires valid NAV at most four calendar days old, updated or unchanged; stale/conflicting/failed prices remain pending. Product/ISIN changes reopen completed selections.

Locks prevent concurrent runs. Production/workbook changes stop the routine; binding/deactivation are rechecked after network access. The private `actualizacionDiariaPreciosTest_` verifies owner, test workbook and trigger UID. [Installable triggers](https://developers.google.com/apps-script/guides/triggers/installable) run as their creator. New funds/batches start within two/three-minute budgets; in-flight requests depend on Google timeout. `TIME_BUDGET` preserves prices. Money/units stay unchanged; cutoffs remain monotonic.

## Diagnostics

`ok:true` is not completeness: inspect `complete` and individual results. `responseInfo` reports bounded source evidence, not bodies/private exceptions. `historyAvailability.status = LATEST_ONLY` declares coverage. `dailyPrices` in `read`/`diagnostics` and **Ajustes** (Settings) distinguishes scheduling, completion and failures; it activates nothing. `prices[].lastValid` reports age/freshness, including invalid future dates.

Local tests simulate sources, conflicts, UUID recovery and trigger lifecycle; they neither install triggers nor write Google workbooks.
