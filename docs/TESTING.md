# Test suite

The suite exercises financial rules and the browser interface in different layers. Repeating a scenario across layers or across desktop Chromium, mobile Chromium and WebKit can detect different failures and is not, by itself, a duplicate.

## Inventory

- `npm test` runs the `tests/*.test.cjs` business-rule, API, storage, installation and queue tests. It writes individual results and counts to `quality-results/unit-tests.tap`.
- `npm run test:browser -- --list` lists each browser execution with its file, title and project. The desktop project runs the full browser suite; `@responsive` also runs on mobile Chromium and `@safari` also runs on WebKit.
- `npm run test:browser` runs those browser cases and writes `test-results/browser-results.json`. Each test gets a separate browser context; financial fixtures are fictional and do not validate a private Google deployment.
- `node tools/quality-summary.cjs` summarizes both reports and fails if unit evidence is missing or unsuccessful, or if desktop, mobile or Safari has no passing execution. The normal CI workflow also fails on test failures and retains failure screenshots and traces.

For the 3.12.1 baseline there were 329 unit executions and 215 browser executions; the quality-evidence and midnight regressions add two unit executions. Counts are evidence for a specific commit, not a coverage guarantee. The [dated 544-execution inventory](audits/2026-10-27-tests.md) compares the prior and subsequent CI results and explains the limits of its automatic review. Generate the current per-case inventory with the commands above rather than relying on a static list that can become stale.

## Redundancy and reliability

Treat a case as removable only after checking its inputs, assertions, layer, side effects and browser profile against the proposed replacement. Identical-looking retry tests can cover failure before or after a write; price tests can distinguish a carried quotation from a missing quotation. Do not remove these distinctions based only on title or source similarity.

Long end-to-end bridge/readback workflows can have a targeted WebKit timeout: a baseline run took 29.3 seconds for a full price-to-expense flow, and a city confirmation/reload/correction flow timed out at 30 seconds in a later main run. The targeted WebKit budgets and the existing cross-view layout budget are set before page fixture creation: a failed run spent 14.2 seconds creating the page. This budget is not a performance guarantee, and assertions and retry policy remain unchanged. The daily price and history fixtures use a per-context fixed clock; separate price cases exercise both sides of Madrid midnight. The recovery test's bounded wait verifies that an additional submission does not occur; replacing it with a condition that passes immediately would weaken that negative assertion. CSP events, by contrast, are awaited using their observed values rather than a fixed short delay.

Successful diagnostic screenshots are optional: run `FINANCE_CAPTURE_SUCCESS=1 npm run test:browser` to generate them. They are artifacts for manual inspection, not automated image-baseline comparisons. The default checks retain their data, interaction and geometry assertions and Playwright's failure-only screenshots and traces. A screenshot-only visual change requires separate visual review.
