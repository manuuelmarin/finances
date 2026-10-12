# Operations validation

All native-engine checks used a newly created disposable copy with a unique rehearsal title, independently verified source/copy ID separation, matching owner and no added sharing. Only direct connector API writes were used. Google documents that API changes do not run simple or installable edit triggers. No original or principal workbook, Apps Script properties, deployment, production activation or trigger was modified.

Synthetic positions replaced inputs only inside the copy. Private input/formula/effective-value backups and fresh restoration reads stayed outside the repository. The ten business sheets and twelve business tables remained intact. The added typed transfer sheet was removed after the rehearsal. Cell writes changed only user-entered values, preserving style and validation.

## Native results

Each tuple below is `(units, net contributions, value, result, return percentage)`.

| Scenario                                                               | Source fund              | Destination fund                | Preserved portfolio totals                                                                        |
| ---------------------------------------------------------------------- | ------------------------ | ------------------------------- | ------------------------------------------------------------------------------------------------- |
| Baseline                                                               | `(10, 20, 30, 10, 50%)`  | `(0, 0, 0, 0, unknown)`         | Contributions 20; value 30; result 10                                                             |
| Partial transfer at value 6                                            | `(8, 16, 24, 8, 50%)`    | `(3, 4, 6, 2, 50%)`             | Contributions 20; value 30; result 10                                                             |
| Broker precision: outgoing raw 6, incoming raw 6.003, both settle 6.00 | `(8, 16, 24, 8, 50%)`    | `(3, 4, 6.003, 2.003, 50.075%)` | Contributions exactly 20; actual value 30.003; disclosed valuation residual 0.003; cash unchanged |
| Transfer remaining position at value 24                                | `(0, 0, 0, 0, unknown)`  | `(15, 20, 30, 10, 50%)`         | Contributions 20; value 30; result 10                                                             |
| Signed-basis baseline after synthetic cash-linked withdrawal           | `(5, -10, 15, 25, 125%)` | `(0, 0, 0, 0, unknown)`         | Contributions -10; value 15; result 25                                                            |
| Signed-basis transfer at value 6                                       | `(3, -6, 9, 15, 125%)`   | `(3, -4, 6, 10, 125%)`          | Contributions -10; value 15; result 25                                                            |

The native monthly history matched each position's units, contributions and value. The final per-leg formula expressions were also compiled and recalculated for an asymmetric raw-value case: contribution capital stayed exactly 20 while actual units/NAVs retained the disclosed 0.003 precision valuation residual. No cash or income was invented. Each transfer preserved exact cash balances relative to its preceding baseline. The independent auditor fetched unformatted effective values for full and signed cases directly from Google. All 297 targeted migration formulas (240 product contribution/percentage formulas and 57 history contribution formulas) compiled and recalculated in the native engine, including empty capacity rows.

## Recovery and formula representation

An attempted restoration of byte-identical imported structured-reference formula text was accepted by the API but produced native formula parse errors. This confirms why the backend writes `nativeFormula_` A1 expressions. Raw original text remains retained in the backup; semantic restoration converts only table references and accounts for Google's optional sheet-name quote normalization.

After canonical recovery, fresh readback found:

- 3,438 original captured cells with zero effective-value differences.
- Zero changes to nonformula input values, including original dates and the temporary synthetic cash row.
- 1,423 original captured formulas with zero canonical formula differences.
- Zero native errors across bounded summary, investment, calculation, account, payroll and goal ranges.
- The rehearsal transfer sheet removed, original table/sheet contracts retained, and the copy still private with its original owner.

No release claim relies on byte-identical reentry of imported formula text. Recovery proves original inputs and financial results, canonical financial formulas, raw backup retention and preserved unrelated workbook structure.

## Local checks

Focused operation tests cover atomic metadata-only writes and receipts, planning realization, complete payroll corrections and unknown values, contextual linked reclassification, reference integrity and rename behavior, archive history and picker eligibility, CSV injection/delimiter handling, two-leg cash-neutral transfers, signed basis, invalid units/value closing, unknown native formula rejection, broker cent-settlement compatibility with raw-leg authenticity, request replay, cancellation/restoration and readback normalization. Financial/API, budget, domain, pricing and production-isolation regressions also pass. Browser interaction tests are included for percentage focus/export and payroll review; final browser execution belongs to the integrated release check.
