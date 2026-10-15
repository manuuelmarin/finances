const { test } = require('node:test');
const assert = require('node:assert/strict');
const A = require('../web/analytics.js');
const snapshot = {
  settings: { start: '2026-01-01', asof: '2026-01-20' },
  tables: {
    tMovimientos: [
      {
        Fecha: '2026-01-02',
        Tipo: 'Gasto',
        Subcategoría: 'Café',
        Importe: 100,
        Recuperable: 20,
      },
      {
        Fecha: '2026-01-03',
        Tipo: 'Devolución gasto',
        Subcategoría: 'Café',
        Importe: 20,
        Recuperable: 5,
      },
      { Fecha: '2026-01-03', Tipo: 'Compra inversión', Importe: 200 },
    ],
  },
};
const record = {
  start: '2026-01-01',
  end: '2026-01-31',
  category: 'Café',
  amount: 100,
};
test('interval limits and evolution reconcile shared refunds with monthly own expense', () => {
  assert.equal(A.spending(snapshot, '2026-01', 'Café'), 65);
  assert.equal(A.intervalBudget(snapshot, record).spent, 65);
  assert.equal(A.budgetEvolution(snapshot, record).at(-1).expense, 65);
});
test('unobserved intervals never become zero expense or a fabricated cumulative starting balance', () => {
  assert.equal(
    A.intervalBudget(snapshot, { ...record, start: '2026-02-01', end: null })
      .spent,
    null,
  );
  const partial = { ...record, start: '2025-12-18' };
  assert.equal(A.intervalBudget(snapshot, partial).spent, null);
  assert.ok(
    A.budgetEvolution(snapshot, partial).every((row) => row.expense === null),
  );
});
