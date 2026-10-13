# Test coverage and audit

The 3.9.3 audit reviewed every Node test and browser scenario against its asserted behavior. Similar names were not treated as duplicates: authorization at different entry points, failures before and after a write, stale prices and conflicting history protect different risks.

Release 3.9.4 adds four Node installer-contract cases and four unique browser scenarios, including one responsive comparison/filter workflow. Current totals are **237 Node cases in 22 files** and **100 browser executions: 80 desktop plus 20 mobile**. The tables below record the original 3.9.3 reduction, rather than claim that new functionality needs no tests.

The useful reduction was repeated execution. Previously, all 76 browser scenarios ran in both profiles: 152 executions. The revised suite runs all 76 on desktop and 19 relevant workflows on mobile: 95 executions, 57 fewer (37.5%). No logical scenario was removed or hidden with a skip. All 233 Node tests remain because they cover distinct financial, data-integrity, transport or installation contracts.

## Selection rules

- Keep tests that detect incorrect money, lost or duplicate writes, unauthorized access, wrong-book changes, unsafe inputs or broken user workflows.
- Different layers are useful when they detect different failures: a parser test does not prove that its result reaches the UI; a clipboard test does not prove the installer embeds the current source.
- Do not add a test for cosmetic wording or a private implementation detail without an observable contract. Installer privacy and deployment instructions are a contract, not decorative text.
- Run protocol and arithmetic scenarios once in a real browser when browser integration matters. Use Node for the detailed boundaries.
- Tag a scenario `@responsive` when its assertions or interactions depend on a narrow screen, form layout, navigation, focus, tables or charts. Desktop includes tagged tests too. Add an explicit layout assertion when layout is the claimed risk.
- Do not lower counts by merging unrelated failures, skipping expensive cases or adding retries. The suite has zero retries and no new skips.

## Node inventory

Before and after counts are equal. Tests often exercise several related input vectors in one case; case totals are not a coverage percentage.

| Suite                |   Cases | Distinct risk retained                                                                                    |
| -------------------- | ------: | --------------------------------------------------------------------------------------------------------- |
| `agent-queue`        |       4 | Persist before sending, recover uncertainty, isolate books and protect corrupt/locked files.              |
| `analytics-series`   |      25 | Cash and investment series, missing valuations, TWR, contributions, transfers, budgets and projections.   |
| `api-channel`        |       5 | Origin/window/session authentication and bound request envelopes.                                         |
| `api-lifecycle`      |       5 | Reject old sessions, preserve uncertain writes and validate snapshots.                                    |
| `bridge-contract`    |       4 | Authorize before accessing Sheets; keep reads separate from atomic writes.                                |
| `budgets`            |       8 | Validate limits, recover receipts, preserve references and distinguish unknown prices.                    |
| `calculators`        |      12 | Interest, mortgages, deadlines, cent rounding, liquidity and invalid/overflowing inputs.                  |
| `charts`             |       1 | Read native series without writes or turning unknown values into zero.                                    |
| `connection`         |      12 | Deployment validation, visitors, server binding, schema recognition and private permissions.              |
| `daily-history-view` |       4 | Exact NAV dates, unowned-sheet preservation, bounded reads and batch failure.                             |
| `domain`             |       6 | Payroll unknowns, price precision, reference labels and product/assignment behavior.                      |
| `financial-api`      |      23 | Authorization, literal input, idempotency, concurrency, correction, rollback and linked financial writes. |
| `history`            |       3 | CSV safety, effective dates, receipt/read gating and book-switch reset.                                   |
| `installation`       |       4 | Embedded-source parity, release versions, private upgrade instructions and malformed manifests.           |
| `modules`            |       2 | Load-order independence and removal of obsolete public operator aliases.                                  |
| `operations`         |      16 | Archive/templates/plans, payroll corrections, fund transfers, migration, rollback and cost basis.         |
| `operator-facade`    |       3 | Authorized dispatch to the correct environment and denial before book access.                             |
| `prices`             |      66 | ISIN/class/currency/date checks, quote/history integrity, receipts and daily scheduling safeguards.       |
| `production`         |       8 | Environment isolation, read-only readiness and concurrent/formula failures.                               |
| `queue`              |      17 | Persistence, uncertainty, receipts, revisions, cross-tab claims and safe discard.                         |
| `summary`            |       5 | Native metrics, missing/duplicate headings, formula errors and ambiguous blocks.                          |
| **Total**            | **233** | **21 suites.**                                                                                            |

Source/build assertions remain only where behavioral tests do not detect the same defect. In particular, source-copy parity, installer guidance and module exposure cover different failure modes from UI copying or API authorization.

## Browser inventory

| Suite                  | Logical scenarios | Previous executions | Desktop | Mobile | Current executions |
| ---------------------- | ----------------: | ------------------: | ------: | -----: | -----------------: |
| `app`                  |                27 |                  54 |      27 |      9 |                 36 |
| `bridge`               |                11 |                  22 |      11 |      0 |                 11 |
| `calculators`          |                 3 |                   6 |       3 |      1 |                  4 |
| `dashboard-rework`     |                14 |                  28 |      14 |      4 |                 18 |
| `finalization-flows`   |                 7 |                  14 |       7 |      1 |                  8 |
| `planning-transfers`   |                 2 |                   4 |       2 |      1 |                  3 |
| `records-enhancements` |                 6 |                  12 |       6 |      3 |                  9 |
| `transport`            |                 6 |                  12 |       6 |      0 |                  6 |
| **Total**              |            **76** |             **152** |  **76** | **19** |             **95** |

Mobile retains native reading/filtering without page overflow; expense review/cancel/confirm; offline reopening and PWA cache; navigation and menu focus; budgets; investment chart selection and inspection; table scrolling/filter focus; payroll correction/cancellation; template reuse; fund-transfer review; and an integrated calculator form with an overflow assertion. Protocol, CSP, postMessage, receipt, cross-tab and parser/state scenarios remain covered on desktop and in their relevant Node suites.

Independent review caught two initial omissions: the existing native-read overflow case and calculator forms had been routed only to desktop. The final selection restores the first case on mobile and adds an explicit page-overflow assertion to the existing investment/mortgage form workflow. The percentage-filter workflow remains on mobile to check input focus and access in the narrow table layout.

## CI and evidence

Quality runs for pull requests, pushes to `main`, and manual dispatch. Removing feature-branch push runs avoids an extra pipeline when opening or updating a PR. The PR integration check and the post-merge publication gate remain. The `quality` job, dependency audit, pinned Actions, build, formatter, linter, commit checks and deployment dependency are preserved. Documentation changes still run quality; no path-based exemption was added.

```sh
npm test
npm run test:browser
npx playwright test --project=mobile
npx playwright test --list
```

The quality summary reports actual results and executions by profile. Fewer executions do not imply fewer unique browser scenarios. Re-evaluate the mobile selection when adding or changing UI workflows rather than tagging every parser/security case.

Independent checks also introduced three temporary defects in disposable copies: removing authorization, accepting a different ISIN, and disabling persisted-request replay. Existing tests failed on the expected behavioral assertions in all three cases. The original source was untouched; this is targeted evidence of assertion strength, not a claim of complete mutation coverage.

Tests use fictional data and simulated Google services. Pixel 7 is a Chromium emulation, not a physical Android/iOS device. These checks do not verify the private Google deployment, its scheduled trigger, real fund-provider availability or financial reconciliation against a bank statement; those require the owner checks described in [Operations](OPERATIONS.md).
