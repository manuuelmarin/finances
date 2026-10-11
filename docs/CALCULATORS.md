# Calculator assumptions

All tools are local estimates. They do not read or write financial records.

- Compound growth uses an effective annual return converted to a monthly rate, end-of-month contributions and annual inflation. Existing integer-year inputs remain supported.
- Goal saving accepts an integer number of months in the form (1–120,000); the JavaScript API also accepts legacy years when they represent whole months. The required contribution is the smallest cent amount that reaches the target within floating-point tolerance. An infinite annuity factor is rejected, including zero initial capital scenarios.
- Fixed mortgages use annual nominal TIN divided by 12, not TAE. Upfront costs are paid separately; initial cash is down payment plus these costs. This existing estimate retains its unrounded payment formula.
- Early repayment lives inside the fixed-mortgage tool. It starts from today's outstanding capital and remaining months, with fixed TIN, an immediate repayment and a percentage charge on that repayment. It compares no repayment, the same term with a lower payment, and the same payment with a shorter term. Monthly interest and payments are rounded to cents; the final instalment clears the residual balance. Interest saved excludes the principal repaid; net savings subtract the repayment charge. Optional remaining cash subtracts repayment and charge, and a negative amount is shown as a cash shortfall.
- Early repayment excludes insurance, taxes, alternative investment returns and other bank charges. Banks may round differently. Zero repayment leaves the schedule unchanged; full repayment removes all remaining instalments. Overpayment and negative TIN are invalid.

`tests/calculators.test.cjs` exercises formulas, cents, limits and repayment schedules. `tests/browser/calculators.spec.cjs` exercises the real forms on desktop and mobile, including existing tools, month deadlines, overflow and clearing stale errors after edits.
