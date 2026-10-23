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
  snapshot.tables.tProductos = [];
  assert.equal(
    FinanceWealth.valueAt(snapshot, '2026-03-31', FinanceAnalytics).value,
    80,
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

test('account comparisons subtract exact historical closes and allow zero balances', () => {
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
  assert.equal(result.windows[3].previous, null);
  s.tables.tCuentas[0]['Saldo calculado'] = 0;
  assert.equal(
    FinanceWealth.accountComparisons(s, FinanceAnalytics)[0].windows[0].change,
    -140,
  );
  s.settings.start = '2026-02-01';
  assert.ok(
    FinanceWealth.accountComparisons(s, FinanceAnalytics)[0].windows.every(
      (row) => row.change === null,
    ),
  );
});

test('account comparisons preserve unknown current and historical balances', () => {
  const s = fixture();
  s.tables.tCuentas = [
    { Cuenta: 'A', 'Saldo inicial': 100, 'Saldo calculado': null },
  ];
  assert.ok(
    FinanceWealth.accountComparisons(s, FinanceAnalytics)[0].windows.every(
      (row) => row.change === null,
    ),
  );
  s.tables.tCuentas[0]['Saldo inicial'] = null;
  s.tables.tCuentas[0]['Saldo calculado'] = 0;
  assert.ok(
    FinanceWealth.accountComparisons(s, FinanceAnalytics)[0].windows.every(
      (row) => row.previous === null,
    ),
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
    assert.equal(windows[1].change, -15);
    assert.equal(windows[1].previous, 168);
    assert.equal(windows[2].change, null);
  }
  s.settings.asof = '2026-10-24';
  assert.equal(
    FinanceWealth.accountComparisons(s, FinanceAnalytics)[0].windows[1].change,
    0,
  );
});

test('month horizons use clamped calendar dates and include only cash flows after their closing baseline', () => {
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
    ['2024-03-30', '2024-03-24', '2024-02-29', '2023-12-31'],
  );
  assert.deepEqual(
    windows.map((w) => w.change),
    [-5.1, -5.1, -16.6, 3.4],
  );
  assert.equal(FinanceWealth.subtractMonths('2025-03-31', 1), '2025-02-28');
  // A change on the baseline day is already in that day's closing balance.
  assert.equal(windows[1].previous, 118.5);
});
