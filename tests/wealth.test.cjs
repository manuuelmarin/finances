'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const FinanceAnalytics = require('../web/analytics.js');
const FinanceWealth = require('../web/wealth.js');

function fixture(overrides = {}) {
  return {
    settings: { start: '2026-01-01', asof: '2026-03-31' },
    tables: {
      tCuentas: [{ Cuenta: 'Cash', 'Saldo inicial': 100 }],
      tMovimientos: [
        {
          ID: 'LOAN-1',
          Fecha: '2026-03-15',
          Tipo: 'Préstamo recibido',
          Importe: 10,
          Destino: 'Cash',
        },
      ],
      tProductos: [
        {
          ID: 'P',
          Producto: 'Fondo',
          'Fecha base': '2026-01-01',
          'Unidades base': 1,
          'Coste base': 10,
        },
      ],
      tOperaciones: [],
      tPrecios: [
        { Producto: 'P', Fecha: '2026-01-31', 'VL EUR': 10 },
        { Producto: 'P', Fecha: '2026-02-28', 'VL EUR': 11 },
        { Producto: 'P', Fecha: '2026-03-31', 'VL EUR': 12 },
      ],
      tDeudas: [{ ID: 'D', 'Saldo inicial': 20 }],
      tVinculos: [{ Movimiento: 'LOAN-1', 'Vinculado a': 'D' }],
    },
    ...overrides,
  };
}

test('reconstructs observed net worth and compares against a clamped month-end', () => {
  const result = FinanceWealth.compare(fixture(), 1, FinanceAnalytics);
  assert.equal(result.currentDate, '2026-03-31');
  assert.equal(result.previousDate, '2026-02-28');
  assert.equal(result.current, 92);
  assert.equal(result.previous, 91);
  assert.equal(result.change, 1);
  assert.equal(result.pct, (1 / 91) * 100);
  assert.equal(result.reason, null);
  assert.equal(result.requestedCurrentDate, '2026-03-31');
  assert.equal(result.requestedPreviousDate, '2026-02-28');
  assert.equal(result.note, null);
});

test('supports three, six, and twelve month horizons with calendar clamping', () => {
  assert.equal(FinanceWealth.subtractMonths('2026-03-31', 1), '2026-02-28');
  assert.equal(FinanceWealth.subtractMonths('2024-03-31', 1), '2024-02-29');
  assert.equal(FinanceWealth.subtractMonths('2026-03-31', 3), '2025-12-31');
  assert.equal(FinanceWealth.subtractMonths('2026-03-31', 6), '2025-09-30');
  assert.equal(FinanceWealth.subtractMonths('2026-03-31', 12), '2025-03-31');
});

test('reports unknown when an endpoint lacks a real NAV observation', () => {
  const snapshot = fixture();
  snapshot.tables.tPrecios = snapshot.tables.tPrecios.filter(
    (price) => price.Fecha !== '2026-02-28',
  );
  const result = FinanceWealth.compare(snapshot, 1, FinanceAnalytics);
  assert.equal(result.previous, null);
  assert.equal(result.pct, null);
  assert.match(result.reason, /valoración real/i);
});

test('reports unknown when an applicable loan has no valid debt link', () => {
  const snapshot = fixture();
  snapshot.tables.tVinculos = [];
  const result = FinanceWealth.compare(snapshot, 1, FinanceAnalytics);
  assert.equal(result.current, null);
  assert.equal(result.pct, null);
  assert.match(result.reason, /vínculo válido/i);
});

test('keeps absolute change when the prior net worth is zero and leaves percent undefined', () => {
  const snapshot = fixture();
  snapshot.tables.tCuentas[0]['Saldo inicial'] = 9;
  snapshot.tables.tDeudas[0]['Saldo inicial'] = 20;
  snapshot.tables.tMovimientos = [];
  snapshot.tables.tVinculos = [];
  const result = FinanceWealth.compare(snapshot, 1, FinanceAnalytics);
  assert.equal(result.previous, 0);
  assert.equal(result.pct, null);
  assert.equal(result.change, 1);
  assert.match(result.reason, /debe ser positivo/i);
});

test('returns unknown when the comparison date predates the book', () => {
  const snapshot = fixture({
    settings: { start: '2026-01-20', asof: '2026-01-31' },
  });
  snapshot.tables.tProductos = [];
  snapshot.tables.tDeudas = [];
  snapshot.tables.tMovimientos = [];
  snapshot.tables.tVinculos = [];
  const result = FinanceWealth.compare(snapshot, 1, FinanceAnalytics);
  assert.equal(result.previousDate, null);
  assert.equal(result.requestedPreviousDate, '2025-12-31');
  assert.equal(result.previous, null);
  assert.equal(result.pct, null);
  assert.match(result.reason, /anterior al inicio/i);
});

test('uses the nearest exact NAV dates and rebuilds cash and debt on those same cuts', () => {
  const snapshot = fixture({
    settings: { start: '2026-09-01', asof: '2026-10-15' },
    tables: {
      tCuentas: [{ Cuenta: 'Cash', 'Saldo inicial': 100 }],
      tMovimientos: [
        {
          ID: 'INCOME',
          Fecha: '2026-09-13',
          Tipo: 'Ingreso',
          Importe: 5,
          Destino: 'Cash',
        },
        {
          ID: 'LOAN-1',
          Fecha: '2026-09-13',
          Tipo: 'Préstamo recibido',
          Importe: 20,
          Destino: 'Cash',
        },
      ],
      tProductos: [
        {
          ID: 'P',
          Producto: 'Fondo',
          'Fecha base': '2026-09-01',
          'Unidades base': 1,
          'Coste base': 10,
        },
      ],
      tOperaciones: [],
      tPrecios: [
        { Producto: 'P', Fecha: '2026-09-11', 'VL EUR': 10 },
        { Producto: 'P', Fecha: '2026-10-14', 'VL EUR': 11 },
      ],
      tDeudas: [{ ID: 'D', 'Saldo inicial': 0 }],
      tVinculos: [{ Movimiento: 'LOAN-1', 'Vinculado a': 'D' }],
    },
  });
  const result = FinanceWealth.compare(snapshot, 1, FinanceAnalytics);
  assert.equal(result.requestedCurrentDate, '2026-10-15');
  assert.equal(result.requestedPreviousDate, '2026-09-14');
  assert.equal(result.currentDate, '2026-10-14');
  assert.equal(result.previousDate, '2026-09-11');
  assert.equal(result.current, 116);
  assert.equal(result.previous, 110);
  assert.match(result.note, /Últimos cortes con valoración completa/i);
  assert.equal(result.reason, null);
});

test('does not look through the book start to find a nearby historical NAV', () => {
  const snapshot = fixture({
    settings: { start: '2026-09-14', asof: '2026-10-15' },
    tables: {
      tCuentas: [{ Cuenta: 'Cash', 'Saldo inicial': 100 }],
      tMovimientos: [],
      tProductos: [
        {
          ID: 'P',
          Producto: 'Fondo',
          'Fecha base': '2026-09-14',
          'Unidades base': 1,
          'Coste base': 10,
        },
      ],
      tOperaciones: [],
      tPrecios: [
        { Producto: 'P', Fecha: '2026-09-11', 'VL EUR': 10 },
        { Producto: 'P', Fecha: '2026-10-14', 'VL EUR': 11 },
      ],
      tDeudas: [],
      tVinculos: [],
    },
  });
  const result = FinanceWealth.compare(snapshot, 1, FinanceAnalytics);
  assert.equal(result.currentDate, '2026-10-14');
  assert.equal(result.previousDate, null);
  assert.equal(result.previous, null);
  assert.equal(result.pct, null);
  assert.match(result.reason, /inicio del libro/i);
});

test('treats an empty investment portfolio as zero', () => {
  const snapshot = fixture();
  snapshot.tables.tCuentas = [{ Cuenta: 'Cash', 'Saldo inicial': 0 }];
  snapshot.tables.tDeudas = [];
  snapshot.tables.tMovimientos = [];
  snapshot.tables.tVinculos = [];
  snapshot.tables.tProductos = [];
  assert.deepEqual(
    FinanceWealth.valueAt(snapshot, '2026-03-31', FinanceAnalytics),
    { value: 0, reason: null },
  );
  snapshot.tables.tProductos = fixture().tables.tProductos;
  assert.equal(
    FinanceWealth.valueAt(snapshot, '2026-03-31', FinanceAnalytics).value,
    12,
  );
});

test('four simultaneous wealth comparisons reuse the same investment observations', () => {
  let calls = 0;
  const analytics = {
    ...FinanceAnalytics,
    investmentTimeline: (...args) => {
      calls++;
      return FinanceAnalytics.investmentTimeline(...args);
    },
  };
  const results = FinanceWealth.comparisons(fixture(), analytics);
  assert.deepEqual(
    results.map((row) => row.months),
    [1, 3, 6, 12],
  );
  assert.equal(calls, 1);
  assert.equal(results[0].current, 92);
  assert.equal(results[1].pct, null);
});

test('account comparisons subtract opening balances and allow zero and book-start balances', () => {
  const s = {
    settings: { start: '2026-01-01', asof: '2026-02-01' },
    tables: {
      tCuentas: [{ Cuenta: 'A', 'Saldo inicial': 0, 'Saldo calculado': 70 }],
      tMovimientos: [
        { Fecha: '2026-01-31', Tipo: 'Ingreso', Destino: 'A', Importe: 140 },
        { Fecha: '2026-02-01', Tipo: 'Gasto', Origen: 'A', Importe: 70 },
      ],
    },
  };
  const result = FinanceWealth.accountComparisons(s, FinanceAnalytics)[0];
  assert.equal(result.windows[0].previous, 140);
  assert.equal(result.windows[0].change, -70);
  assert.equal(result.windows[1].previous, 0);
  assert.equal(result.windows[1].change, 70);
  assert.equal(result.windows[2].previous, 0);
  assert.equal(result.windows[2].change, 70);
  assert.equal(result.windows[4].previous, 0);
  assert.equal(result.windows[5].previous, null);
  s.tables.tCuentas[0]['Saldo calculado'] = 0;
  assert.equal(
    FinanceWealth.accountComparisons(s, FinanceAnalytics)[0].windows[0].change,
    -140,
  );
  s.settings.start = '2026-02-01';
  s.tables.tCuentas[0]['Saldo calculado'] = -70;
  const firstDay = FinanceWealth.accountComparisons(s, FinanceAnalytics)[0]
    .windows;
  assert.equal(firstDay[0].change, -70);
  assert.ok(firstDay.slice(1).every((row) => row.change === null));
});

test('account comparisons preserve unknown current and historical balances', () => {
  const s = fixture();
  s.tables.tCuentas = [
    { Cuenta: 'A', 'Saldo inicial': 100, 'Saldo calculado': null },
  ];
  assert.deepEqual(
    FinanceWealth.accountComparisons(s, FinanceAnalytics)[0].windows.map(
      (row) => row.change,
    ),
    Array(8).fill(null),
  );
  s.tables.tCuentas[0]['Saldo inicial'] = null;
  s.tables.tCuentas[0]['Saldo calculado'] = 0;
  assert.deepEqual(
    FinanceWealth.accountComparisons(s, FinanceAnalytics)[0].windows.map(
      (row) => row.previous,
    ),
    Array(8).fill(null),
  );
});

test('a single cash expense stays minus 15 for the full rolling week, never divided by seven', () => {
  const s = {
    settings: { start: '2026-09-30', asof: '2026-10-18' },
    tables: {
      tCuentas: [
        { Cuenta: 'Cash', 'Saldo inicial': 168, 'Saldo calculado': 153 },
      ],
      tMovimientos: [
        { Fecha: '2026-10-17', Tipo: 'Gasto', Origen: 'Cash', Importe: 15 },
      ],
    },
  };
  for (const date of ['2026-10-18', '2026-10-23']) {
    s.settings.asof = date;
    const windows = FinanceWealth.accountComparisons(s, FinanceAnalytics)[0]
      .windows;
    assert.equal(windows[0].change, 0);
    assert.equal(windows[2].change, -15);
    assert.equal(windows[2].previous, 168);
    assert.equal(windows[4].change, null);
  }
  s.settings.asof = '2026-10-24';
  assert.equal(
    FinanceWealth.accountComparisons(s, FinanceAnalytics)[0].windows[2].change,
    -15,
  );
  s.settings.asof = '2026-10-25';
  assert.equal(
    FinanceWealth.accountComparisons(s, FinanceAnalytics)[0].windows[2].change,
    0,
  );
});

test('opening horizons include baseline-day cash flows and clamp calendar dates before taking the prior close', () => {
  const s = {
    settings: { start: '2023-12-01', asof: '2024-03-31' },
    tables: {
      tCuentas: [
        { Cuenta: 'A', 'Saldo inicial': 100, 'Saldo calculado': 113.4 },
      ],
      tMovimientos: [
        { Fecha: '2023-12-31', Destino: 'A', Importe: 10 },
        { Fecha: '2024-02-29', Destino: 'A', Importe: 20 },
        { Fecha: '2024-03-01', Origen: 'A', Importe: 15, Recuperable: 10 },
        { Fecha: '2024-03-24', Destino: 'A', Importe: 3.5 },
        { Fecha: '2024-03-31', Origen: 'A', Importe: 5.1 },
        { Fecha: '2024-04-01', Destino: 'A', Importe: 1000 },
      ],
    },
  };
  const windows = FinanceWealth.accountComparisons(s, FinanceAnalytics)[0]
    .windows;
  assert.deepEqual(
    windows.map((w) => w.from),
    [
      '2024-03-31',
      '2024-03-30',
      '2024-03-24',
      '2024-03-16',
      '2024-02-29',
      '2023-12-31',
      '2023-09-30',
      '2023-03-31',
    ],
  );
  assert.deepEqual(
    windows.map((w) => w.change),
    [-5.1, -5.1, -1.6, -1.6, 3.4, 13.4, null, null],
  );
  assert.equal(FinanceWealth.subtractMonths('2025-03-31', 1), '2025-02-28');
  assert.equal(windows[2].previous, 115);
  assert.equal(windows[4].baselineDate, '2024-02-28');
  assert.equal(windows[5].previous, 100);
  const leapYear = {
    settings: { start: '2023-01-01', asof: '2024-02-29' },
    tables: {
      tCuentas: [{ Cuenta: 'A', 'Saldo inicial': 100, 'Saldo calculado': 130 }],
      tMovimientos: [
        { Fecha: '2023-02-27', Destino: 'A', Importe: 20 },
        { Fecha: '2023-02-28', Destino: 'A', Importe: 10 },
      ],
    },
  };
  const annual = FinanceWealth.accountComparisons(leapYear, FinanceAnalytics)[0]
    .windows[7];
  assert.equal(annual.from, '2023-02-28');
  assert.equal(annual.baselineDate, '2023-02-27');
  assert.equal(annual.change, 10);
});

test('today and yesterday openings distinguish yesterday spending but coincide for today-only spending', () => {
  for (const [yesterday, today] of [
    [15, 0],
    [15, 7],
    [0, 7],
  ]) {
    const s = {
      settings: { start: '2026-01-01', asof: '2026-10-23' },
      tables: {
        tCuentas: [
          {
            Cuenta: 'A',
            'Saldo inicial': 500,
            'Saldo calculado': 500 - yesterday - today,
          },
        ],
        tMovimientos: [
          { Fecha: '2026-10-22', Origen: 'A', Importe: yesterday },
          { Fecha: '2026-10-23', Origen: 'A', Importe: today },
        ],
      },
    };
    const windows = FinanceWealth.accountComparisons(s, FinanceAnalytics)[0]
      .windows;
    assert.equal(windows[0].change, -today || 0);
    assert.equal(windows[1].change, -yesterday - today);
    assert.equal(windows[0].change === windows[1].change, yesterday === 0);
  }
});

test('all eight account horizons include their opening date and exclude movements from the day before it', () => {
  const dates = [
    '2026-10-23',
    '2026-10-22',
    '2026-10-16',
    '2026-10-08',
    '2026-09-23',
    '2026-07-23',
    '2026-04-23',
    '2025-10-23',
  ];
  for (const [index, from] of dates.entries()) {
    const before = new Date(Date.parse(from + 'T00:00:00Z') - 86400000)
      .toISOString()
      .slice(0, 10);
    const s = {
      settings: { start: '2025-01-01', asof: '2026-10-23' },
      tables: {
        tCuentas: [
          { Cuenta: 'A', 'Saldo inicial': 500, 'Saldo calculado': 470 },
        ],
        tMovimientos: [
          { Fecha: before, Origen: 'A', Importe: 20 },
          { Fecha: from, Origen: 'A', Importe: 10 },
        ],
      },
    };
    const result = FinanceWealth.accountComparisons(s, FinanceAnalytics)[0]
      .windows[index];
    assert.equal(result.previous, 480, result.label);
    assert.equal(result.change, -10, result.label);
  }
});

test('account total comes first in the requested order and internal transfers cancel', () => {
  const names = [
    'Trade Republic',
    'MyInvestor',
    'EFECTIVO',
    'Bankinter',
    'Unicaja',
  ];
  const s = {
    settings: { start: '2026-01-01', asof: '2026-10-23' },
    tables: {
      tCuentas: names.map((Cuenta) => ({
        Cuenta,
        'Saldo inicial': 100,
        'Saldo calculado':
          Cuenta === 'Unicaja' ? 80 : Cuenta === 'Bankinter' ? 120 : 100,
      })),
      tMovimientos: [
        {
          Fecha: '2026-10-23',
          Tipo: 'Transferencia',
          Origen: 'Unicaja',
          Destino: 'Bankinter',
          Importe: 20,
        },
      ],
    },
  };
  const rows = FinanceWealth.accountComparisons(s, FinanceAnalytics);
  assert.deepEqual(
    rows.map((r) => r.account),
    [
      'Total',
      'Unicaja',
      'Bankinter',
      'EFECTIVO',
      'MyInvestor',
      'Trade Republic',
    ],
  );
  assert.equal(rows[0].current, 500);
  assert.equal(rows[0].windows[0].change, 0);
  assert.equal(rows[1].windows[0].change, -20);
  assert.equal(rows[2].windows[0].change, 20);
  assert.equal(s.tables.tCuentas[0].Cuenta, 'Trade Republic');
  s.tables.tCuentas[0]['Saldo calculado'] = null;
  assert.equal(
    FinanceWealth.accountComparisons(s, FinanceAnalytics)[0].current,
    null,
  );
  s.tables.tCuentas[0]['Saldo calculado'] = 100;
  s.tables.tCuentas[0]['Saldo inicial'] = null;
  assert.equal(
    FinanceWealth.accountComparisons(s, FinanceAnalytics)[0].windows[0].change,
    null,
  );
});

test('future book cutoff does not move tomorrow’s transfer into today’s account balances', () => {
  const s = {
    settings: { start: '2026-10-01', asof: '2026-11-01' },
    tables: {
      tCuentas: [
        { Cuenta: 'Bankinter', 'Saldo inicial': 1000, 'Saldo calculado': 590 },
        { Cuenta: 'Unicaja', 'Saldo inicial': 100, 'Saldo calculado': 500 },
      ],
      tMovimientos: [
        { Fecha: '2026-10-30', Origen: 'Bankinter', Importe: 10 },
        {
          Fecha: '2026-10-31',
          Origen: 'Bankinter',
          Destino: 'Unicaja',
          Importe: 400,
        },
      ],
    },
  };
  const cut = FinanceWealth.accountCut(s, '2026-10-30');
  assert.equal(cut, '2026-10-30');
  let rows = FinanceWealth.accountComparisons(s, FinanceAnalytics, cut);
  assert.deepEqual(
    rows.map((row) => [row.account, row.current]),
    [
      ['Total', 1090],
      ['Unicaja', 100],
      ['Bankinter', 990],
    ],
  );
  assert.equal(rows[2].windows[0].change, -10);
  assert.equal(rows[1].windows[0].change, 0);
  assert.equal(rows[0].windows[0].to, '2026-10-30');
  rows = FinanceWealth.accountComparisons(s, FinanceAnalytics, '2026-10-31');
  assert.equal(rows[1].current, 500);
  assert.equal(rows[2].current, 590);
  assert.equal(rows[0].current, 1090);
  s.tables.tCuentas[0]['Saldo calculado'] = 591;
  rows = FinanceWealth.accountComparisons(s, FinanceAnalytics, cut);
  assert.equal(rows[2].current, null);
  assert.match(rows[2].currentReason, /reconstruir/);
  assert.equal(rows[0].current, null);
  assert.equal(FinanceWealth.accountCut(s, '2026-11-03'), '2026-11-01');
  assert.deepEqual(
    FinanceWealth.accountComparisons(s, FinanceAnalytics, '2026-11-02'),
    [],
  );
});

test('investment value comparisons include pocket contributions, withdrawals and price changes without altering returns', () => {
  const s = {
    settings: {
      start: '2025-01-01',
      asof: '2026-10-23',
      valuation: '2026-10-22',
    },
    tables: {
      tProductos: [
        {
          ID: 'P',
          Producto: 'Fondo',
          'Fecha base': '2025-01-01',
          'Unidades base': 10,
          Valor: 150,
          'Aportado neto': 140,
          Resultado: 10,
        },
      ],
      tOperaciones: [
        {
          Producto: 'P',
          Fecha: '2026-10-22',
          Tipo: 'Compra',
          Participaciones: 5,
        },
      ],
      tPrecios: [
        { Producto: 'P', Fecha: '2025-01-01', 'VL EUR': 10 },
        { Producto: 'P', Fecha: '2026-10-23', 'VL EUR': 999 },
      ],
    },
  };
  const comparisonsWithoutMetricChanges = () => {
    const before = FinanceAnalytics.investmentMetrics(s, 'P');
    const result = FinanceWealth.investmentComparisons(s, FinanceAnalytics);
    assert.deepEqual(FinanceAnalytics.investmentMetrics(s, 'P'), before);
    return result;
  };
  let rows = comparisonsWithoutMetricChanges();
  assert.equal(rows[0].product, 'Total');
  assert.equal(rows[1].name, 'Fondo');
  assert.equal(rows[1].windows[0].previous, 100);
  assert.equal(rows[1].windows[0].change, 50);
  assert.equal(rows[1].windows[0].to, '2026-10-22');
  assert.equal(rows[1].windows[0].priceDate, '2025-01-01');
  assert.equal(FinanceAnalytics.investmentMetrics(s).gain, 10);
  s.tables.tProductos[0].Valor = 165;
  s.tables.tPrecios.push({ Producto: 'P', Fecha: '2026-10-22', 'VL EUR': 11 });
  rows = comparisonsWithoutMetricChanges();
  assert.equal(rows[0].windows[0].change, 65);
  s.tables.tOperaciones[0] = {
    Producto: 'P',
    Fecha: '2026-10-22',
    Tipo: 'Venta',
    Participaciones: 5,
  };
  s.tables.tProductos[0].Valor = 55;
  assert.equal(
    comparisonsWithoutMetricChanges()[0].windows[0]
      .change,
    -45,
  );
});

test('investment openings include all eight boundary dates, preserve missing prices and use zero before a new fund purchase', () => {
  for (const [index, from] of [
    '2026-10-23',
    '2026-10-22',
    '2026-10-16',
    '2026-10-08',
    '2026-09-23',
    '2026-07-23',
    '2026-04-23',
    '2025-10-23',
  ].entries()) {
    const s = {
      settings: { start: '2025-01-01', asof: '2026-10-23' },
      tables: {
        tProductos: [
          {
            ID: 'P',
            Producto: 'Nuevo',
            'Fecha base': '2025-01-01',
            'Unidades base': 0,
            Valor: 100,
          },
        ],
        tOperaciones: [
          { Producto: 'P', Fecha: from, Tipo: 'Compra', Participaciones: 10 },
        ],
        tPrecios: [{ Producto: 'P', Fecha: from, 'VL EUR': 10 }],
      },
    };
    assert.equal(
      FinanceWealth.investmentComparisons(s, FinanceAnalytics)[0].windows[index]
        .previous,
      0,
    );
    assert.equal(
      FinanceWealth.investmentComparisons(s, FinanceAnalytics)[0].windows[index]
        .change,
      100,
    );
    s.tables.tProductos[0]['Unidades base'] = 1;
    assert.equal(
      FinanceWealth.investmentComparisons(s, FinanceAnalytics)[0].windows[index]
        .change,
      null,
    );
    s.tables.tPrecios.unshift({
      Producto: 'P',
      Fecha: '2025-01-01',
      'VL EUR': 10,
    });
    assert.equal(
      FinanceWealth.investmentComparisons(s, FinanceAnalytics)[0].windows[index]
        .change,
      90,
    );
    s.summary = { missingPrices: ['Nuevo'] };
    assert.equal(
      FinanceWealth.investmentComparisons(s, FinanceAnalytics)[0].current,
      null,
    );
  }
});

test('fund transfers move value between products and cancel in the portfolio total', () => {
  const s = {
    settings: { start: '2026-01-01', asof: '2026-10-23' },
    tables: {
      tProductos: [
        { ID: 'A', 'Fecha base': '2026-01-01', 'Unidades base': 10, Valor: 50 },
        { ID: 'B', 'Fecha base': '2026-01-01', 'Unidades base': 0, Valor: 50 },
      ],
      tOperaciones: [
        {
          Producto: 'A',
          Fecha: '2026-10-23',
          Tipo: 'Venta',
          Participaciones: 5,
        },
        {
          Producto: 'B',
          Fecha: '2026-10-23',
          Tipo: 'Compra',
          Participaciones: 5,
        },
      ],
      tPrecios: ['A', 'B'].map((Producto) => ({
        Producto,
        Fecha: '2026-01-01',
        'VL EUR': 10,
      })),
    },
  };
  const rows = FinanceWealth.investmentComparisons(s, FinanceAnalytics);
  assert.deepEqual(
    rows.map((r) => r.windows[0].change),
    [0, -50, 50],
  );
  s.tables.tOperaciones[0].Fecha = 'invalid';
  assert.equal(
    FinanceWealth.investmentComparisons(s, FinanceAnalytics)[0].windows[0]
      .change,
    null,
  );
  s.settings.start = '2026-10-23';
  assert.equal(
    FinanceWealth.investmentComparisons(s, FinanceAnalytics)[0].windows[1]
      .change,
    null,
  );
});

