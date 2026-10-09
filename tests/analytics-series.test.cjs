const { test } = require('node:test');
const assert = require('node:assert/strict');
const A = require('../web/analytics.js');
function fixture() {
  return {
    settings: {
      start: '2026-01-01',
      asof: '2026-01-03',
      valuation: '2026-01-03',
    },
    tables: {
      tCuentas: [
        { Cuenta: 'A', 'Saldo inicial': 100 },
        { Cuenta: 'B', 'Saldo inicial': 50 },
      ],
      tMovimientos: [
        {
          ID: 'transfer',
          Fecha: '2026-01-02',
          Tipo: 'Transferencia',
          Origen: 'A',
          Destino: 'B',
          Importe: 20,
        },
        {
          ID: 'expense',
          Fecha: '2026-01-03',
          Tipo: 'Gasto',
          Origen: 'B',
          Importe: 30,
          Recuperable: 10,
          Subcategoría: 'Rent',
          Recurrente: 'Sí',
        },
        {
          ID: 'payroll',
          Fecha: '2026-01-01',
          Tipo: 'Ingreso',
          Destino: 'A',
          Importe: 100,
        },
      ],
      tCategorias: [
        { Grupo: 'Gastos', Categoría: 'Vivienda', Subcategoría: 'Rent' },
      ],
      tNominas: [{ Movimiento: 'payroll', Neto: 100 }],
      tProductos: [
        {
          ID: 'P',
          Producto: 'Fund',
          'Fecha base': '2026-01-01',
          'Unidades base': 0,
          'Coste base': 0,
          'Aportado neto': 200,
          Valor: 220,
          Resultado: 20,
          Rentabilidad: 0.1,
        },
      ],
      tOperaciones: [
        {
          Producto: 'P',
          Fecha: '2026-01-01',
          Tipo: 'Compra',
          Participaciones: 10,
          Precio: 10,
          Importe: 100,
        },
        {
          Producto: 'P',
          Fecha: '2026-01-02',
          Tipo: 'Compra',
          Participaciones: 10,
          Precio: 10,
          Importe: 100,
        },
      ],
      tPrecios: [
        { Producto: 'P', Fecha: '2026-01-01', 'VL EUR': 10 },
        { Producto: 'P', Fecha: '2026-01-02', 'VL EUR': 10 },
        { Producto: 'P', Fecha: '2026-01-03', 'VL EUR': 11 },
        { Producto: 'P', Fecha: '2026-01-04', 'VL EUR': 999 },
      ],
    },
    budgets: [{ month: '2026-01', category: null, amount: 50 }],
  };
}
test('cash timeline cuts at asof, internal transfers preserve total, cash differs from own expense', () => {
  const s = fixture(),
    before = JSON.stringify(s),
    rows = A.cashTimeline(s, '2026-01');
  assert.deepEqual(
    rows.map((r) => r.total),
    [250, 250, 220],
  );
  assert.deepEqual(rows[1].accounts, { A: 180, B: 70 });
  assert.equal(rows.length, 3);
  assert.equal(A.spending(s, '2026-01'), 20);
  assert.equal(JSON.stringify(s), before);
  s.tables.tMovimientos[1].Importe = null;
  assert.equal(A.cashTimeline(s, '2026-01')[2].total, null);
});
test('daily real valuations reconcile native last capital/value and neutralize contribution', () => {
  const s = fixture(),
    result = A.investmentTimeline(s);
  assert.deepEqual(
    result.rows.map((r) => r.capital),
    [100, 200, 200],
  );
  assert.deepEqual(
    result.rows.map((r) => r.value),
    [100, 200, 220],
  );
  assert.ok(Math.abs(result.rows[2].returnPct - 10) < 1e-8);
  assert.equal(result.rows[1].returnPct, 0);
  const metrics = A.investmentMetrics(s, 'P');
  assert.equal(result.rows.at(-1).value, metrics.value);
  assert.equal(result.rows.at(-1).capital, metrics.capital);
  assert.equal(metrics.currentCost, null);
});
test('missing/carried prices never become invented observations or future prices', () => {
  const s = fixture();
  s.tables.tPrecios.splice(1, 1);
  const result = A.investmentTimeline(s);
  assert.equal(result.rows[1].carried, true);
  assert.equal(result.rows[1].priceDates.P, '2026-01-01');
  assert.equal(result.rows[2].returnPct, null);
  assert.equal(result.rows[2].value, 220);
  s.tables.tPrecios = s.tables.tPrecios.filter((p) => p.Fecha > '2026-01-01');
  assert.equal(A.investmentTimeline(s).rows[0].value, null);
  assert.equal(
    A.investmentTimeline(s, { productId: 'P' }).rows[0].returnPct,
    null,
  );
});
test('sale and reinvestment preserve net contributions without calling them current cost', () => {
  const s = fixture();
  s.tables.tOperaciones = [
    s.tables.tOperaciones[0],
    {
      Producto: 'P',
      Fecha: '2026-01-02',
      Tipo: 'Venta',
      Participaciones: 10,
      Precio: 12,
      Importe: 120,
    },
    {
      Producto: 'P',
      Fecha: '2026-01-03',
      Tipo: 'Compra',
      Participaciones: 2,
      Precio: 11,
      Importe: 22,
    },
  ];
  const rows = A.investmentTimeline(s).rows;
  assert.equal(rows[1].capital, -20);
  assert.equal(rows[1].value, 0);
  assert.ok(Math.abs(rows[1].returnPct - 20) < 1e-8);
  assert.equal(rows[2].capital, 2);
  assert.equal(rows[2].value, 22);
  assert.equal(rows[2].returnPct, null);
});
test('salary ratio and monthly free budget use matching own expense and avoid overlapping limits', () => {
  const s = fixture();
  assert.equal(A.salarySavings(s)[0].rate, 80);
  assert.equal(A.freeBudget(s, '2026-01'), 30);
  s.budgets = [{ month: '2026-01', category: 'Rent', amount: 50 }];
  assert.equal(A.freeBudget(s, '2026-01'), null);
  s.tables.tNominas[0].Neto = 0;
  assert.equal(A.salarySavings(s)[0].rate, null);
});
test('expense analysis retains housing and explicit exclusion reconciles totals', () => {
  const s = fixture(),
    all = A.spendingAnalysis(s, '2026-01'),
    filtered = A.spendingAnalysis(s, '2026-01', {
      excludeCategory: 'Vivienda',
    });
  assert.equal(all.total, A.spending(s, '2026-01'));
  assert.equal(all.categories[0].label, 'Vivienda');
  assert.equal(all.daily.at(-1).cumulative, 20);
  assert.equal(filtered.total, 0);
  assert.equal(filtered.excluded, 20);
});
test('historical trades before cash tracking remain included when on or after position base', () => {
  const s = fixture();
  s.settings.start = '2026-01-03';
  s.tables.tCuentas[0]['Saldo inicial'] = 300;
  assert.deepEqual(
    A.cashTimeline(s, '2026-01').map((r) => r.total),
    [320],
  );
  const timeline = A.investmentTimeline(s);
  assert.equal(timeline.firstDate, '2026-01-01');
  assert.equal(timeline.rows.at(-1).value, s.tables.tProductos[0].Valor);
});
test('pre-base operations and invalid calendar dates expose inconsistent data rather than silently disappearing', () => {
  const s = fixture();
  s.tables.tProductos[0]['Fecha base'] = '2026-01-02';
  const timeline = A.investmentTimeline(s);
  assert.deepEqual(timeline.coverage.invalidProducts, ['P']);
  assert.equal(timeline.rows.at(-1).value, null);
  s.tables.tOperaciones[0].Fecha = '2026-02-31';
  assert.equal(A.investmentTimeline(s).firstDate, '2026-01-02');
});
test('registered base units close at native value without counting prior cash movements', () => {
  const s = fixture();
  s.tables.tProductos[0]['Fecha base'] = '2026-01-02';
  s.tables.tProductos[0]['Unidades base'] = 10;
  s.tables.tProductos[0]['Coste base'] = 90;
  s.tables.tOperaciones = [s.tables.tOperaciones[1]];
  const timeline = A.investmentTimeline(s);
  assert.equal(timeline.firstDate, '2026-01-02');
  assert.equal(timeline.rows.at(-1).capital, 190);
  assert.equal(timeline.rows.at(-1).value, 220);
});
test('partial withdrawal is neutralized and daily TWR differs from gain divided by net contribution', () => {
  const s = fixture();
  s.tables.tOperaciones.push({
    Producto: 'P',
    Fecha: '2026-01-03',
    Tipo: 'Venta',
    Participaciones: 5,
    Precio: 11,
    Importe: 55,
  });
  const row = A.investmentTimeline(s).rows.at(-1);
  assert.equal(row.value, 165);
  assert.equal(row.capital, 145);
  assert.ok(Math.abs(row.returnPct - 10) < 1e-8);
  assert.notEqual(
    row.returnPct,
    (100 * (row.value - row.capital)) / row.capital,
  );
});
test('cash distributions use native net amount including commission and withholding; product VL excludes them', () => {
  const s = fixture();
  s.tables.tOperaciones = [
    s.tables.tOperaciones[0],
    {
      Producto: 'P',
      Fecha: '2026-01-02',
      Tipo: 'Cobro',
      Participaciones: 0,
      Precio: 2,
      Comisión: 0.2,
      Retención: 0.5,
    },
  ];
  const row = A.investmentTimeline(s).rows[1];
  assert.equal(row.capital, 100);
  assert.equal(row.value, 100);
  assert.ok(Math.abs(row.returnPct - 1.3) < 1e-8);
  assert.equal(
    A.investmentTimeline(s, { productId: 'P' }).rows[1].returnPct,
    0,
  );
});
test('daily TWR does not restart an apparent since-inception return after missing valuations', () => {
  const s = fixture();
  s.tables.tPrecios = s.tables.tPrecios.filter((p) => p.Fecha !== '2026-01-01');
  assert.deepEqual(
    A.investmentTimeline(s).rows.map((r) => r.returnPct),
    [null, null, null],
  );
});
test('product VL anchor starts on first real observed quotation, not on a carried first day', () => {
  const s = fixture();
  s.tables.tPrecios[0].Fecha = '2025-12-31';
  const rows = A.investmentTimeline(s, { productId: 'P' }).rows;
  assert.equal(rows[0].returnPct, null);
  assert.equal(rows[1].returnPct, 0);
  assert.ok(Math.abs(rows[2].returnPct - 10) < 1e-8);
});
test('native missing-price diagnostic keeps valuation metrics unknown even when a table cache contains a number', () => {
  const s = fixture();
  s.summary = { missingPrices: ['Fund'] };
  const metrics = A.investmentMetrics(s, 'P');
  assert.equal(metrics.value, null);
  assert.equal(metrics.gain, null);
  assert.equal(metrics.returnPct, null);
  assert.equal(metrics.capital, 200);
});
