const { test } = require('node:test');
const assert = require('node:assert/strict');
const A = require('../web/analytics.js');

test('salary planning uses the latest earned payroll and refuses overlapping limits', () => {
  const s = {
    tables: {
      tMovimientos: [
        { ID: 'old', Fecha: '2026-09-30', Importe: 1600 },
        { ID: 'latest', Fecha: '2026-10-30', Importe: 1800 },
        { ID: 'future', Fecha: '2026-11-01', Importe: 2000 },
      ],
      tNominas: [
        { Movimiento: 'old', Neto: 1600 },
        { Movimiento: 'latest', Neto: 1800 },
        { Movimiento: 'future', Neto: 2000 },
      ],
    },
    budgets: [{ month: '2026-10', category: 'Comida', amount: 300 }],
    intervalBudgets: [
      {
        title: 'Transporte',
        category: 'Transporte',
        start: '2026-10-01',
        end: '2026-10-31',
        amount: 100,
      },
      {
        title: 'Futuro',
        category: 'Viaje',
        start: '2026-11-01',
        end: null,
        amount: 50,
      },
    ],
  };
  let result = A.salaryAllocation(s, '2026-10-30');
  assert.equal(result.salary, 1800);
  assert.equal(result.date, '2026-10-30');
  assert.deepEqual(
    result.records.map((r) => r.title),
    ['Comida', 'Transporte'],
  );
  assert.equal(result.planned, 400);
  assert.equal(result.available, 1400);
  assert.equal(result.excess, 0);
  s.intervalBudgets.push({
    title: 'Duplicado',
    category: 'Comida',
    start: '2026-10-01',
    end: null,
    amount: 10,
  });
  result = A.salaryAllocation(s, '2026-10-30');
  assert.equal(result.planned, null);
  assert.equal(result.available, null);
  assert.match(result.reason, /solapados/);
  s.intervalBudgets.pop();
  s.budgets.push({ month: '2026-10', category: null, amount: 1000 });
  assert.equal(A.salaryAllocation(s, '2026-10-30').available, null);
  s.budgets = [{ month: '2026-10', category: 'Comida', amount: 2000 }];
  s.intervalBudgets = [];
  result = A.salaryAllocation(s, '2026-10-30');
  assert.equal(result.available, 0);
  assert.equal(result.excess, 200);
  assert.equal(A.salaryAllocation(s, '2026-09-01').salary, null);
  s.intervalBudgets = [{ title: 'Inválido', start: '2026-02-30', amount: 10 }];
  result = A.salaryAllocation(s, '2026-10-30');
  assert.equal(result.available, null);
  assert.match(result.reason, /fechas no válidas/);
  s.tables.tNominas.push({ Movimiento: null, Neto: 1000 });
  result = A.salaryAllocation(s, '2026-10-30');
  assert.equal(result.salary, null);
  assert.match(result.reason, /nómina sin fecha/);
});

test('salary allocation follows the selected month without counting future payroll', () => {
  const s = {
    tables: {
      tMovimientos: [
        { ID: 'now', Fecha: '2026-10-30', Importe: 1808.16 },
        { ID: 'future', Fecha: '2026-11-30', Importe: 2000 },
      ],
      tNominas: [
        { Movimiento: 'now', Neto: 1808.16 },
        { Movimiento: 'future', Neto: 2000 },
      ],
    },
    budgets: [
      { month: '2026-10', category: 'Antiguo', amount: 10 },
      ...[
        ['Supermercado', 300],
        ['Restaurantes', 100],
        ['Transporte', 30],
        ['Suscripciones', 50],
        ['Alquiler', 650],
        ['Salud', 50],
        ['Wellness', 200],
      ].map(([category, amount]) => ({ month: '2026-11', category, amount })),
    ],
    intervalBudgets: [],
  };
  let result = A.salaryAllocation(s, '2026-10-30', '2026-11');
  assert.equal(result.salary, 1808.16);
  assert.equal(result.date, '2026-10-30');
  assert.equal(result.records.length, 7);
  assert.equal(result.planned, 1380);
  assert.equal(result.available, 428.16);
  assert.equal(
    A.salaryAllocation(s, '2026-10-30', '2026-10').available,
    1798.16,
  );
  s.intervalBudgets.push({
    category: 'Viaje',
    title: 'Viaje',
    start: '2026-10-15',
    end: '2026-11-15',
    amount: 200,
  });
  result = A.salaryAllocation(s, '2026-10-30', '2026-11');
  assert.equal(result.available, null);
  assert.match(result.reason, /más de un mes/);
  s.intervalBudgets = [
    { category: 'Ocio', start: '2026-11-01', end: '2026-11-10', amount: 10 },
    { category: 'Ocio', start: '2026-11-11', end: '2026-11-20', amount: 20 },
  ];
  assert.equal(
    A.salaryAllocation(s, '2026-10-30', '2026-11').available,
    398.16,
  );
  s.intervalBudgets[1].start = '2026-11-10';
  assert.match(
    A.salaryAllocation(s, '2026-10-30', '2026-11').reason,
    /solapados/,
  );
});

test('readback checks known balances using full cash amounts while leaving unknown native balances unchanged', () => {
  const s = {
    settings: { start: '2026-01-01', asof: '2026-01-02' },
    tables: {
      tCuentas: [
        { Cuenta: 'Fictional', 'Saldo inicial': 100, 'Saldo calculado': 100 },
      ],
      tMovimientos: [
        {
          Fecha: '2026-01-02',
          Tipo: 'Gasto',
          Origen: 'Fictional',
          Importe: 20,
          Recuperable: 10,
        },
      ],
    },
  };
  assert.equal(A.cashBalancesMatch(s), false);
  assert.equal(s.tables.tCuentas[0]['Saldo calculado'], 100);
  s.tables.tCuentas[0]['Saldo calculado'] = 80;
  assert.equal(A.cashBalancesMatch(s), true);
  s.summary = { metrics: [{ label: 'Efectivo', value: 100 }] };
  assert.equal(A.cashBalancesMatch(s), false);
  s.summary.metrics[0].value = 80;
  assert.equal(A.cashBalancesMatch(s), true);
  s.tables.tCuentas[0]['Saldo calculado'] = null;
  assert.equal(A.cashBalancesMatch(s), true);
  assert.equal(s.tables.tCuentas[0]['Saldo calculado'], null);
});

test('linked Modified Dietz reproduces the GIPS cash-flow example without inserting quotes', () => {
  const s = {
    settings: {
      start: '2026-05-31',
      asof: '2026-06-30',
      valuation: '2026-06-30',
    },
    tables: {
      tProductos: [
        {
          ID: 'P',
          'Fecha base': '2026-05-31',
          'Unidades base': 1000,
          'Coste base': 100000,
        },
      ],
      tOperaciones: [
        {
          Producto: 'P',
          Fecha: '2026-06-06',
          Tipo: 'Venta',
          Participaciones: 20,
          Precio: 100,
          Importe: 2000,
        },
        {
          Producto: 'P',
          Fecha: '2026-06-11',
          Tipo: 'Compra',
          Participaciones: 200,
          Precio: 100,
          Importe: 20000,
        },
      ],
      tPrecios: [
        { Producto: 'P', Fecha: '2026-05-31', 'VL EUR': 100 },
        { Producto: 'P', Fecha: '2026-06-30', 'VL EUR': 135000 / 1180 },
      ],
    },
  };
  const original = JSON.stringify(s);
  const timeline = A.investmentTimeline(s);
  const last = timeline.rows.at(-1);
  const expected =
    (100 * 17000) / (100000 - (2000 * 24) / 30 + (20000 * 19) / 30);
  assert.ok(Math.abs(last.adjustedReturnPct - expected) < 1e-10);
  assert.equal(last.totalReturnPct, null);
  assert.equal(timeline.coverage.adjustedEstimatedIntervals, 1);
  assert.equal(
    timeline.rows.filter((r) => r.adjustedReturnPct !== null).length,
    2,
  );
  assert.equal(JSON.stringify(s), original);
  s.tables.tOperaciones[0].Importe = null;
  s.tables.tOperaciones[0].Precio = null;
  assert.equal(A.investmentTimeline(s).rows.at(-1).adjustedReturnPct, null);
});

test('estimated returns cross year-end flows and count net distributions exactly once', () => {
  const s = {
    settings: {
      start: '2025-12-31',
      asof: '2026-01-05',
      valuation: '2026-01-05',
    },
    tables: {
      tProductos: [
        {
          ID: 'P',
          'Fecha base': '2025-12-31',
          'Unidades base': 10,
          'Coste base': 100,
        },
      ],
      tOperaciones: [
        {
          Producto: 'P',
          Fecha: '2026-01-03',
          Tipo: 'Compra',
          Participaciones: 10,
          Precio: 11,
          Importe: 110,
        },
        {
          Producto: 'P',
          Fecha: '2026-01-04',
          Tipo: 'Cobro',
          Precio: 6,
          Comisión: 0.5,
          Retención: 0.5,
        },
      ],
      tPrecios: [
        { Producto: 'P', Fecha: '2025-12-31', 'VL EUR': 10 },
        { Producto: 'P', Fecha: '2026-01-05', 'VL EUR': 12 },
      ],
    },
  };
  const last = A.investmentTimeline(s).rows.at(-1);
  assert.ok(
    Math.abs(
      last.adjustedReturnPct - (100 * 35) / (100 + (110 * 2) / 5 - 5 / 5),
    ) < 1e-10,
  );
  assert.equal(last.totalReturnPct, null);
  // Exact observed end-of-day flows produce the same return in both methods.
  s.tables.tOperaciones[0].Fecha = '2026-01-05';
  s.tables.tOperaciones[1].Fecha = '2026-01-05';
  const exact = A.investmentTimeline(s).rows.at(-1);
  assert.ok(Number.isFinite(exact.adjustedReturnPct));
  assert.ok(Number.isFinite(exact.totalReturnPct));
  assert.ok(Math.abs(exact.totalReturnPct - 35) < 1e-10);
  assert.ok(Math.abs(exact.adjustedReturnPct - exact.totalReturnPct) < 1e-10);
  s.tables.tOperaciones[0].Tipo = 'Venta';
  s.tables.tOperaciones[0].Fecha = '2026-01-01';
  s.tables.tOperaciones[0].Participaciones = 10;
  s.tables.tOperaciones[0].Importe = 200;
  assert.equal(A.investmentTimeline(s).rows.at(-1).adjustedReturnPct, null);
});

test('arbitrary expense periods reconcile category totals, daily accumulation and unknown excluded amounts', () => {
  const s = {
    settings: { start: '2026-01-10', asof: '2026-03-15' },
    tables: {
      tCategorias: [
        { Subcategoría: 'Café', Categoría: 'Comida' },
        { Subcategoría: 'Metro', Categoría: 'Transporte' },
      ],
      tMovimientos: [
        {
          Fecha: '2026-01-01',
          Tipo: 'Gasto',
          Importe: 999,
          Subcategoría: 'Café',
        },
        {
          Fecha: '2026-01-31',
          Tipo: 'Gasto',
          Importe: 2,
          Subcategoría: 'Café',
        },
        {
          Fecha: '2026-02-01',
          Tipo: 'Gasto',
          Importe: 8,
          Recuperable: 3,
          Subcategoría: 'Café',
        },
        {
          Fecha: '2026-02-10',
          Tipo: 'Devolución gasto',
          Importe: 1,
          Subcategoría: 'Café',
        },
        {
          Fecha: '2026-02-11',
          Tipo: 'Gasto',
          Importe: null,
          Subcategoría: 'Metro',
        },
        { Fecha: '2026-02-09', Tipo: 'Transferencia', Importe: 500 },
        {
          Fecha: '2026-03-16',
          Tipo: 'Gasto',
          Importe: 100,
          Subcategoría: 'Café',
        },
      ],
    },
  };
  const period = { from: '2026-01-31', to: '2026-02-11' };
  assert.equal(A.spendingAnalysis(s, null, period).total, null);
  const selected = A.spendingAnalysis(s, null, {
    ...period,
    includeCategories: ['Comida'],
  });
  assert.equal(selected.total, 6);
  assert.equal(selected.daily[0].date, period.from);
  assert.equal(selected.daily.at(-1).date, period.to);
  assert.equal(selected.daily.at(-1).cumulative, selected.total);
  assert.deepEqual(selected.categories, [{ label: 'Comida', value: 6 }]);
  assert.deepEqual(selected.recurring, [{ label: 'No recurrente', value: 6 }]);
  const none = A.spendingAnalysis(s, null, {
    ...period,
    includeCategories: [],
  });
  assert.equal(none.total, 0);
  assert.equal(none.daily.at(-1).cumulative, 0);
  assert.equal(
    A.spendingAnalysis(s, null, { from: '2026-03-20', to: '2026-03-30' }).total,
    null,
  );
  assert.equal(
    A.spendingAnalysis(s, null, { from: '2026-01-01', to: '2026-01-09' }).total,
    null,
  );
  assert.equal(
    A.spendingAnalysis(s, null, { from: '2026-02-31', to: '2026-03-05' }).total,
    null,
  );
  assert.equal(
    A.spendingAnalysis(s, null, { from: '2026-03-05', to: '2026-02-01' }).daily
      .length,
    0,
  );
});
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
  const metrics = A.investmentMetrics(s, 'P');
  assert.equal(metrics.currentCost, null);
  assert.equal(metrics.capitalKind, 'netContributions');
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
  const invalidDate = A.investmentTimeline(s);
  assert.equal(invalidDate.firstDate, '2026-01-02');
  assert.deepEqual(invalidDate.coverage.invalidProducts, ['P']);
  assert.equal(invalidDate.rows.at(-1).value, null);
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
test('TWR starts an explicitly dated measured segment after an unknown prefix', () => {
  const s = fixture();
  s.tables.tPrecios = s.tables.tPrecios.filter((p) => p.Fecha !== '2026-01-01');
  const timeline = A.investmentTimeline(s);
  assert.deepEqual(
    timeline.rows.map((r) => r.returnPct),
    [null, 0, 100 * (1.1 - 1)],
  );
  assert.equal(timeline.coverage.returnStartDate, '2026-01-02');
  assert.equal(timeline.coverage.sinceInception, false);
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
test('real valuation endpoints link across price gaps only without intervening external flows', () => {
  const s = fixture();
  s.tables.tOperaciones = [s.tables.tOperaciones[0]];
  s.tables.tPrecios = s.tables.tPrecios.filter((p) => p.Fecha !== '2026-01-02');
  const timeline = A.investmentTimeline(s);
  assert.deepEqual(
    timeline.rows.map((r) => r.returnPct),
    [0, null, 100 * (1.1 - 1)],
  );
  assert.equal(timeline.coverage.supportedIntervals, 1);
  assert.equal(timeline.rows[1].carried, true);
  assert.equal(timeline.rows[2].priceDates.P, '2026-01-03');
  // A distribution during that gap also requires an intervening valuation.
  s.tables.tOperaciones.push({
    Producto: 'P',
    Fecha: '2026-01-02',
    Tipo: 'Cobro',
    Importe: 2,
  });
  assert.deepEqual(
    A.investmentTimeline(s).rows.map((r) => r.returnPct),
    [0, null, null],
  );
});
test('end-of-interval contributions are neutralized using actual endpoint valuation', () => {
  const s = fixture();
  s.tables.tOperaciones[1].Fecha = '2026-01-03';
  s.tables.tOperaciones[1].Precio = 11;
  s.tables.tOperaciones[1].Importe = 110;
  s.tables.tPrecios = s.tables.tPrecios.filter((p) => p.Fecha !== '2026-01-02');
  const rows = A.investmentTimeline(s).rows;
  assert.equal(rows[1].returnPct, null);
  assert.ok(Math.abs(rows[2].returnPct - 10) < 1e-8);
  assert.equal(rows[2].value, 220);
});
test('product NAV variation uses real quotation dates and leaves carried prices unplotted', () => {
  const s = fixture();
  s.tables.tPrecios = s.tables.tPrecios.filter((p) => p.Fecha !== '2026-01-02');
  const rows = A.investmentTimeline(s, { productId: 'P' }).rows;
  assert.equal(rows[0].returnPct, 0);
  assert.equal(rows[1].returnPct, null);
  assert.ok(Math.abs(rows[2].returnPct - 10) < 1e-8);
});
test('May investment with first quotes in September measures only the September onward segment', () => {
  const s = fixture();
  s.settings = {
    start: '2026-05-01',
    asof: '2026-10-01',
    valuation: '2026-10-01',
  };
  s.tables.tProductos[0]['Fecha base'] = '2026-05-01';
  s.tables.tOperaciones = [
    {
      Producto: 'P',
      Fecha: '2026-05-01',
      Tipo: 'Compra',
      Participaciones: 10,
      Importe: 100,
    },
  ];
  s.tables.tPrecios = [
    { Producto: 'P', Fecha: '2026-09-01', 'VL EUR': 12 },
    { Producto: 'P', Fecha: '2026-10-01', 'VL EUR': 13.2 },
  ];
  let timeline = A.investmentTimeline(s);
  assert.equal(timeline.coverage.returnStartDate, '2026-09-01');
  assert.equal(timeline.coverage.sinceInception, false);
  assert.equal(
    timeline.rows.find((r) => r.date === '2026-05-01').returnPct,
    null,
  );
  assert.equal(timeline.rows.find((r) => r.date === '2026-09-01').returnPct, 0);
  assert.ok(Math.abs(timeline.rows.at(-1).returnPct - 10) < 1e-8);
  s.tables.tOperaciones.push({
    Producto: 'P',
    Fecha: '2026-09-15',
    Tipo: 'Compra',
    Participaciones: 1,
    Importe: 12,
  });
  timeline = A.investmentTimeline(s);
  assert.equal(timeline.rows.at(-1).returnPct, null);
  assert.equal(timeline.coverage.returnStartDate, '2026-09-01');
});
test('monthly coverage distinguishes planned future, prestart, full and partial observation', () => {
  const s = fixture();
  s.settings.start = '2026-01-15';
  s.settings.asof = '2026-03-12';
  assert.equal(A.monthCoverage(s, '2025-12').status, 'prestart');
  assert.equal(A.monthCoverage(s, '2026-01').status, 'partial');
  assert.equal(A.monthCoverage(s, '2026-02').status, 'full');
  assert.equal(A.monthCoverage(s, '2026-03').status, 'partial');
  assert.equal(A.monthCoverage(s, '2026-04').status, 'future');
  s.budgets = [{ month: '2026-04', amount: 500, category: null }];
  assert.equal(A.spending(s, '2026-04'), null);
  assert.equal(A.freeBudget(s, '2026-04'), null);
  assert.equal(A.budget(s, s.budgets[0]).remaining, null);
  assert.equal(A.spendingAnalysis(s, '2025-12').total, null);
  assert.deepEqual(
    A.salarySavings(s).map((r) => r.month),
    ['2026-01', '2026-02', '2026-03'],
  );
  assert.ok(
    A.salarySavings(s).every((r) => r.payroll === null && r.rate === null),
  );
});
test('goal availability totals assignments without moving money and preserves missing valuation', () => {
  const s = fixture();
  s.tables.tCuentas[0]['Saldo calculado'] = 100;
  s.tables.tAsignaciones = [
    { Objetivo: 'G1', Origen: 'A', Importe: 70 },
    { Objetivo: 'G2', Origen: 'A', Importe: 50 },
    { Objetivo: 'G1', Origen: 'P', Importe: 40 },
  ];
  s.summary = { missingPrices: ['Fund'] };
  const before = JSON.stringify(s);
  const rows = A.goalAvailability(s);
  assert.equal(rows.find((r) => r.origin === 'A').free, -20);
  assert.equal(rows.find((r) => r.origin === 'A').overallocated, true);
  assert.equal(rows.find((r) => r.origin === 'P').free, null);
  assert.equal(rows.find((r) => r.origin === 'P').available, null);
  assert.equal(JSON.stringify(s), before);
});

test('goal progress identifies expired deadlines and unknown monthly pace', () => {
  const s = fixture();
  assert.equal(
    A.goalProgress(s, { Meta: 200, Asignado: 100, Fecha: '2025-12-31' })
      .expired,
    true,
  );
  assert.equal(
    A.goalProgress(s, { Meta: 200, Asignado: null, Fecha: '2026-06-01' })
      .monthlyPace,
    null,
  );
});
test('forecast uses current known cash and selected dated plans without creating actual cash', () => {
  const s = fixture();
  s.tables.tCuentas[0]['Saldo calculado'] = 180;
  s.tables.tCuentas[1]['Saldo calculado'] = 40;
  s.planned = [
    {
      id: 'out',
      date: '2026-01-05',
      concept: 'Rent',
      account: 'B',
      amount: 50,
      kind: 'expense',
      active: true,
    },
    {
      id: 'in',
      date: '2026-01-10',
      concept: 'Income',
      account: 'A',
      amount: 100,
      kind: 'income',
      active: true,
    },
    {
      id: 'past',
      date: '2026-01-01',
      concept: 'Overdue',
      account: 'A',
      amount: 999,
      kind: 'expense',
      active: true,
    },
  ];
  const before = JSON.stringify(s);
  assert.deepEqual(
    A.cashForecast(s, ['out', 'in']).rows.map((r) => r.projected),
    [220, 170, 270],
  );
  assert.deepEqual(
    A.cashForecast(s, ['out']).rows.map((r) => r.projected),
    [220, 170],
  );
  assert.equal(A.cashForecast(s).notices.length, 1);
  assert.equal(JSON.stringify(s), before);
  s.tables.tCuentas[0]['Saldo calculado'] = null;
  assert.deepEqual(
    A.cashForecast(s, ['out', 'in']).rows.map((r) => r.projected),
    [null, null, null],
  );
  s.tables.tCuentas[0]['Saldo calculado'] = 180;
  s.planned[0].account = 'Missing';
  assert.deepEqual(
    A.cashForecast(s, ['out', 'in']).rows.map((r) => r.projected),
    [220, null, null],
  );
});
test('cashless fund transfer carries signed net contribution basis and neutralizes only product market flow', () => {
  const s = fixture();
  s.tables.tOperaciones = [s.tables.tOperaciones[0]];
  s.tables.tProductos.push({
    ID: 'Q',
    Producto: 'Destination',
    'Fecha base': '2026-01-01',
    'Unidades base': 0,
    'Coste base': 0,
  });
  s.tables.tOperaciones.push(
    {
      ID: 'out',
      Producto: 'P',
      Fecha: '2026-01-02',
      Tipo: 'Venta',
      Participaciones: 5,
      Importe: 50,
      Precio: 10,
    },
    {
      ID: 'in',
      Producto: 'Q',
      Fecha: '2026-01-02',
      Tipo: 'Compra',
      Participaciones: 10,
      Importe: 50,
      Precio: 5,
    },
  );
  s.tables.tPrecios.push(
    { Producto: 'Q', Fecha: '2026-01-02', 'VL EUR': 5 },
    { Producto: 'Q', Fecha: '2026-01-03', 'VL EUR': 5.5 },
  );
  s.fundTransfers = [
    {
      id: 'T',
      date: '2026-01-02',
      fromProduct: 'P',
      toProduct: 'Q',
      outTradeID: 'out',
      inTradeID: 'in',
      costBasis: 50,
      investedBasis: 50,
      amount: 50,
      rawOut: 50,
      rawIn: 50,
      valuationResidual: 0,
    },
  ];
  const rows = A.investmentTimeline(s).rows;
  assert.deepEqual(
    rows.map((r) => r.capital),
    [100, 100, 100],
  );
  assert.deepEqual(
    rows.map((r) => r.value),
    [100, 100, 110],
  );
  assert.ok(Math.abs(rows.at(-1).returnPct - 10) < 1e-8);
  assert.equal(
    A.investmentTimeline(s, { productId: 'P' }).rows[1].totalReturnPct,
    0,
  );
  s.fundTransfers[0].costBasis = -20;
  assert.equal(
    A.investmentTimeline(s, { productId: 'P' }).rows.at(-1).capital,
    120,
  );
  assert.equal(
    A.investmentTimeline(s, { productId: 'Q' }).rows.at(-1).capital,
    -20,
  );
  assert.equal(A.investmentTimeline(s).rows.at(-1).capital, 100);
  s.fundTransfers[0].costBasis = null;
  assert.equal(A.investmentTimeline(s).rows.at(-1).capital, null);
});
test('asymmetric raw transfer adjusts portfolio TWR only with same-day NAV evidence', () => {
  const s = fixture();
  s.settings.asof = s.settings.valuation = '2026-01-03';
  s.tables.tProductos.push({
    ID: 'Q',
    Producto: 'Destination',
    'Fecha base': '2026-01-01',
    'Unidades base': 1,
    'Coste base': 10,
  });
  s.tables.tProductos.find((p) => p.ID === 'P')['Unidades base'] = 10;
  s.tables.tProductos.find((p) => p.ID === 'P')['Coste base'] = 100;
  s.tables.tOperaciones = [
    {
      ID: 'out',
      Producto: 'P',
      Fecha: '2026-01-02',
      Tipo: 'Venta',
      Participaciones: 0.6,
      Importe: 6,
      Precio: 10,
      Movimiento: null,
    },
    {
      ID: 'in',
      Producto: 'Q',
      Fecha: '2026-01-02',
      Tipo: 'Compra',
      Participaciones: 0.6003,
      Importe: 6,
      Precio: 10,
      Movimiento: null,
    },
  ];
  s.tables.tPrecios = [
    { Producto: 'P', Fecha: '2026-01-01', 'VL EUR': 10 },
    { Producto: 'P', Fecha: '2026-01-02', 'VL EUR': 10 },
    { Producto: 'P', Fecha: '2026-01-03', 'VL EUR': 10 },
    { Producto: 'Q', Fecha: '2026-01-01', 'VL EUR': 10 },
    { Producto: 'Q', Fecha: '2026-01-02', 'VL EUR': 10 },
    { Producto: 'Q', Fecha: '2026-01-03', 'VL EUR': 10 },
  ];
  s.fundTransfers = [
    {
      id: 'T',
      date: '2026-01-02',
      fromProduct: 'P',
      toProduct: 'Q',
      outTradeID: 'out',
      inTradeID: 'in',
      costBasis: 6,
      investedBasis: 6,
      amount: 6,
      rawOut: 6,
      rawIn: 6.003,
      valuationResidual: 0.003,
    },
  ];
  const timeline = A.investmentTimeline(s);
  const transferRow = timeline.rows[1];
  assert.equal(transferRow.returnPct, 0);
  assert.equal(transferRow.value, 110.003);
  assert.equal(transferRow.capital, 110);
  assert.equal(transferRow.precisionAdjustment, 0.003);
  assert.equal(timeline.coverage.precisionAdjustments[0].verified, true);
  assert.equal(
    A.investmentTimeline(s, { productId: 'P' }).rows[1].returnPct,
    0,
  );
  assert.equal(
    A.investmentTimeline(s, { productId: 'Q' }).rows[1].returnPct,
    0,
  );
  assert.equal(
    A.investmentTimeline(s, { productId: 'Q' }).rows[1].totalReturnPct,
    0,
  );
  assert.deepEqual(
    s.tables.tMovimientos.map((m) => m.ID),
    ['transfer', 'expense', 'payroll'],
  );

  s.tables.tPrecios = s.tables.tPrecios.filter(
    (q) => !(q.Producto === 'Q' && q.Fecha === '2026-01-02'),
  );
  const unverified = A.investmentTimeline(s);
  assert.equal(unverified.rows[1].returnPct, null);
  assert.equal(unverified.rows[2].returnPct, null);
});
test('same-class total return includes net distributions once while NAV variation remains separate', () => {
  const s = fixture();
  s.tables.tOperaciones = [
    s.tables.tOperaciones[0],
    {
      Producto: 'P',
      Fecha: '2026-01-02',
      Tipo: 'Cobro',
      Precio: 2,
      Comisión: 0.2,
      Retención: 0.5,
    },
  ];
  const rows = A.investmentTimeline(s, { productId: 'P' }).rows;
  assert.ok(Math.abs(rows[1].totalReturnPct - 1.3) < 1e-8);
  assert.equal(rows[1].returnPct, 0);
  s.tables.tPrecios = s.tables.tPrecios.filter((p) => p.Fecha !== '2026-01-02');
  assert.equal(
    A.investmentTimeline(s, { productId: 'P' }).rows.at(-1).totalReturnPct,
    null,
  );
});
test('selected-window NAV health counts actual dates and gaps independently of latest freshness', () => {
  const s = fixture();
  s.settings.valuation = '2026-04-03';
  s.tables.tPrecios.push({ Producto: 'P', Fecha: '2026-04-03', 'VL EUR': 12 });
  const timeline = A.investmentTimeline(s, { productId: 'P', range: '1m' });
  assert.equal(timeline.coverage.selectedStartDate, '2026-03-03');
  assert.equal(timeline.coverage.selectedEndDate, '2026-04-03');
  assert.equal(timeline.coverage.perProduct[0].quoteCount, 1);
  assert.equal(timeline.coverage.perProduct[0].firstQuote, '2026-04-03');
  assert.equal(timeline.coverage.carriedDays, 31);
  assert.ok(
    timeline.coverage.inceptionCarriedDays > timeline.coverage.carriedDays,
  );
  assert.equal(timeline.coverage.perProduct[0].carriedDays, 31);
});

test('net-capital result continues across 2026 flows without pretending unavailable TWR is known', () => {
  const s = {
    settings: {
      start: '2025-12-31',
      asof: '2026-01-05',
      valuation: '2026-01-05',
    },
    tables: {
      tProductos: [
        {
          ID: 'P',
          'Fecha base': '2025-12-31',
          'Unidades base': 0,
          'Coste base': 0,
        },
      ],
      tOperaciones: [
        {
          ID: 'B1',
          Producto: 'P',
          Fecha: '2025-12-31',
          Tipo: 'Compra',
          Participaciones: 10,
          Precio: 10,
          Importe: 100,
        },
        {
          ID: 'B2',
          Producto: 'P',
          Fecha: '2026-01-03',
          Tipo: 'Compra',
          Participaciones: 10,
          Precio: 11,
          Importe: 110,
        },
        {
          ID: 'D',
          Producto: 'P',
          Fecha: '2026-01-05',
          Tipo: 'Cobro',
          Participaciones: 0,
          Precio: 5,
          Importe: 5,
        },
      ],
      tPrecios: [
        { Producto: 'P', Fecha: '2025-12-31', 'VL EUR': 10 },
        { Producto: 'P', Fecha: '2026-01-05', 'VL EUR': 12 },
      ],
    },
  };
  const timeline = A.investmentTimeline(s);
  const last = timeline.rows.at(-1);
  assert.equal(last.date, '2026-01-05');
  assert.equal(last.value, 240);
  assert.equal(last.capital, 210);
  assert.equal(last.netResult, 35);
  assert.equal(last.resultOnCapitalPct, (100 * 35) / 210);
  assert.equal(last.returnPct, null);
  assert.equal(last.totalReturnPct, null);
  s.tables.tOperaciones.push({
    ID: 'SELL',
    Producto: 'P',
    Fecha: '2026-01-05',
    Tipo: 'Venta',
    Participaciones: 20,
    Precio: 12,
    Importe: 240,
  });
  const sold = A.investmentTimeline(s).rows.at(-1);
  assert.equal(sold.resultOnCapitalPct, null);
  assert.equal(sold.netResult, 35);
  s.tables.tOperaciones[0].Importe = null;
  s.tables.tOperaciones[0].Precio = null;
  assert.equal(A.investmentTimeline(s).rows.at(-1).resultOnCapitalPct, null);
});

test('a sold-out product does not mix a final TWR point into its NAV-only variation', () => {
  const s = fixture();
  s.tables.tProductos[0]['Unidades base'] = 10;
  s.tables.tProductos[0]['Coste base'] = 100;
  s.tables.tOperaciones = [
    {
      Producto: 'P',
      Fecha: '2026-01-03',
      Tipo: 'Venta',
      Participaciones: 10,
      Precio: 11,
      Importe: 110,
    },
  ];
  const row = A.investmentTimeline(s, { productId: 'P' }).rows.at(-1);
  assert.equal(row.value, 0);
  assert.equal(row.returnPct, null);
  assert.ok(Math.abs(row.totalReturnPct - 10) < 1e-8);
});

