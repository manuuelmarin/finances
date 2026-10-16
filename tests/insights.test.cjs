const { test } = require('node:test');
const assert = require('node:assert/strict');
const I = require('../web/insights.js');

const snapshot = {
  settings: { start: '2026-09-30', asof: '2026-11-03' },
  tables: {
    tCategorias: [{ Subcategoría: 'Comida', Categoría: 'Alimentación' }],
    tMovimientos: [
      { Fecha: '2026-10-16', Tipo: 'Ingreso', Importe: 2000 },
      {
        Fecha: '2026-10-17',
        Tipo: 'Gasto',
        Importe: 100,
        Recuperable: 20,
        Subcategoría: 'Comida',
      },
      {
        Fecha: '2026-10-18',
        Tipo: 'Devolución gasto',
        Importe: 10,
        Recuperable: 0,
        Subcategoría: 'Comida',
      },
      { Fecha: '2026-10-19', Tipo: 'Transferencia', Importe: 900 },
      {
        Fecha: '2026-11-02',
        Tipo: 'Gasto',
        Importe: 25,
        Recuperable: 0,
        Subcategoría: '',
      },
    ],
  },
};

test('expense detail uses own expense, preserves refund sign and excludes transfers', () => {
  assert.deepEqual(
    I.spendingMovements(snapshot, '2026-10').map((r) => r.amount),
    [80, -10],
  );
  const flows = I.monthlyFlows(snapshot);
  assert.deepEqual(
    flows.map((r) => r.month),
    ['2026-10', '2026-11'],
  );
  assert.equal(flows[0].income, 2000);
  assert.equal(flows[0].expense, 70);
  assert.equal(flows[1].income, 0);
});

test('expense detail accepts exact dates crossing months and reconciles selected positive frequencies', () => {
  const movements = I.spendingMovements(snapshot, {
    from: '2026-10-18',
    to: '2026-11-02',
  });
  assert.deepEqual(
    movements.map((row) => [row.date, row.amount]),
    [
      ['2026-10-18', -10],
      ['2026-11-02', 25],
    ],
  );
  assert.equal(
    I.expenseHistogram(movements).reduce((sum, row) => sum + row.value, 0),
    1,
  );
  assert.deepEqual(
    I.spendingMovements(snapshot, { from: '2026-11-03', to: '2026-10-01' }),
    [],
  );
});

test('histogram separates café prices and reconciles positive own-expense counts', () => {
  const rows = [1.5, 2, 2.5, 3, 3.5].map((amount) => ({
    type: 'Gasto',
    amount,
  }));
  rows.push(
    { type: 'Devolución gasto', amount: -5 },
    { type: 'Gasto', amount: null },
    { type: 'Gasto', amount: 0 },
  );
  const bins = I.expenseHistogram(rows);
  assert.ok(bins.length > 1);
  assert.equal(
    bins.reduce((sum, row) => sum + row.value, 0),
    5,
  );
  assert.deepEqual(
    bins.map((row) => row.low),
    [...bins.map((row) => row.low)].sort((a, b) => a - b),
  );
  assert.ok(
    bins.every((row) => row.high > row.low && row.label.includes('–<')),
  );
});

test('histogram retains empty intervals, assigns exact boundaries to the next bin, and handles identical values', () => {
  const sparse = I.expenseHistogram([
    { type: 'Gasto', amount: 1 },
    { type: 'Gasto', amount: 1000 },
  ]);
  assert.ok(sparse.some((row) => row.value === 0));
  assert.equal(
    sparse.reduce((sum, row) => sum + row.value, 0),
    2,
  );

  const boundary = I.expenseHistogram([
    { type: 'Gasto', amount: 1 },
    { type: 'Gasto', amount: 2 },
  ]);
  assert.ok(boundary.some((row) => row.value === 0));
  assert.equal(
    boundary.find((row) => row.value === 1 && row.low === 2).high,
    2.5,
  );

  const identical = I.expenseHistogram([
    { type: 'Gasto', amount: 25 },
    { type: 'Gasto', amount: 25 },
    { type: 'Gasto', amount: 25 },
  ]);
  assert.equal(identical.length, 1);
  assert.equal(identical[0].value, 3);
});

test('unknown amounts stay unknown and partial tracking month is omitted from monthly series', () => {
  const incomplete = structuredClone(snapshot);
  incomplete.tables.tMovimientos.push(
    {
      Fecha: '2026-10-20',
      Tipo: 'Gasto',
      Importe: null,
      Subcategoría: 'Comida',
    },
    {
      Fecha: '2026-10-21',
      Tipo: 'Gasto',
      Importe: '30',
      Subcategoría: 'Comida',
    },
  );
  const movements = I.spendingMovements(incomplete, '2026-10');
  assert.deepEqual(
    movements.slice(-2).map((r) => r.amount),
    [null, null],
  );
  const flows = I.monthlyFlows(incomplete);
  assert.deepEqual(
    flows.map((r) => r.month),
    ['2026-10', '2026-11'],
  );
  assert.equal(flows[0].expense, null);
  assert.equal(flows[0].income, 2000);
});

test('fixed euro bins preserve exact boundaries, empty intervals and count totals for every supported width', () => {
  for (const width of [5, 10, 20, 50, 100]) {
    const bins = I.expenseHistogram(
      [0.01, width - 0.01, width, width * 3].map((amount) => ({
        type: 'Gasto',
        amount,
      })),
      width,
    );
    assert.equal(bins.length, 4);
    assert.deepEqual(
      bins.map((row) => row.value),
      [2, 1, 0, 1],
    );
    assert.ok(bins.every((row) => Math.abs(row.high - row.low - width) < 1e-9));
  }
  assert.throws(() => I.expenseHistogram([], 7), RangeError);
  const large = I.expenseHistogram(
    [1, 1e8].map((amount) => ({ type: 'Gasto', amount })),
    5,
  );
  assert.equal(large.length, 2);
  assert.equal(large[1].x, 1e8);
  assert.equal(
    large.reduce((sum, row) => sum + row.value, 0),
    2,
  );
});
