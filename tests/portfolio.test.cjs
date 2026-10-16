const { test } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../web/portfolio.js');
const A = require('../web/analytics.js');
const close = (a, b, tolerance = 1e-10) =>
  assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const flow = (date, amount) => ({ date, amount });
const fixture = () => ({
  settings: {
    start: '2025-01-01',
    asof: '2026-01-01',
    valuation: '2026-01-01',
  },
  tables: {
    tProductos: [
      {
        ID: 'A',
        Producto: 'Alpha',
        'Fecha base': '2025-01-01',
        'Unidades base': 0,
        'Coste base': 0,
      },
    ],
    tOperaciones: [
      {
        ID: 'buy',
        Producto: 'A',
        Tipo: 'Compra',
        Fecha: '2025-01-01',
        Participaciones: 10,
        Precio: 10,
        Importe: 100,
      },
    ],
    tPrecios: [
      { Producto: 'A', Fecha: '2025-01-01', 'VL EUR': 10 },
      { Producto: 'A', Fecha: '2026-01-01', 'VL EUR': 11 },
    ],
  },
});
test('XIRR solves annual gains, losses and dated multi-deposit examples', () => {
  close(P.xirr([flow('2025-01-01', -100), flow('2026-01-01', 110)]).rate, 0.1);
  close(P.xirr([flow('2025-01-01', -100), flow('2026-01-01', 80)]).rate, -0.2);
  const rate = 0.17;
  const time =
    (Date.parse('2026-01-01') - Date.parse('2025-07-01')) / 86400000 / 365;
  close(
    P.xirr([
      flow('2025-01-01', -100),
      flow('2025-07-01', -50),
      flow('2026-01-01', 100 * (1 + rate) + 50 * (1 + rate) ** time),
    ]).rate,
    rate,
  );
});
test('XIRR combines same-day flows and does not choose ambiguous roots or annualize tiny periods', () => {
  close(
    P.xirr([
      flow('2025-01-01', -50),
      flow('2025-01-01', -50),
      flow('2026-01-01', 110),
    ]).rate,
    0.1,
  );
  assert.equal(
    P.xirr([flow('2025-01-01', -100), flow('2025-01-02', 110)]).status,
    'short',
  );
  assert.equal(
    P.xirr([
      flow('2025-01-01', -100),
      flow('2026-01-01', 230),
      flow('2027-01-01', -132),
    ]).status,
    'nonconventional',
  );
  assert.equal(P.xirr([flow('2025-01-01', -100)]).status, 'signs');
  assert.equal(
    P.xirr([flow('2025-02-30', -100), flow('2026-01-01', 100)]).status,
    'invalid',
  );
  assert.equal(
    P.xirr([flow('2025-01-01', null), flow('2026-01-01', 100)]).status,
    'invalid',
  );
});
test('read-only inception analysis reconciles profit and personal annual return', () => {
  const s = fixture(),
    before = JSON.stringify(s);
  const a = P.analyze(s, A.investmentTimeline(s));
  close(a.xirrRows.at(-1).value, 10);
  close(a.contributions[0].value, 10);
  assert.equal(a.inception, true);
  assert.equal(a.diagnostics.complete, true);
  assert.equal(JSON.stringify(s), before);
});
test('opening positions use market value rather than cost and later windows exclude opening-date flows', () => {
  const s = fixture();
  s.tables.tProductos[0]['Unidades base'] = 10;
  s.tables.tProductos[0]['Coste base'] = 500;
  s.tables.tOperaciones = [];
  const a = P.analyze(s, A.investmentTimeline(s));
  close(a.xirrRows.at(-1).value, 10);
  assert.equal(a.flows[0].amount, -100);
  close(a.contributions[0].value, 10);
});
test('internal transfers are excluded from portfolio flows and retained at product scope', () => {
  const s = fixture();
  s.tables.tProductos.push({ ID: 'B', Producto: 'Beta' });
  s.tables.tOperaciones.push(
    {
      ID: 'out',
      Producto: 'A',
      Tipo: 'Venta',
      Fecha: '2025-07-01',
      Importe: 50,
    },
    {
      ID: 'in',
      Producto: 'B',
      Tipo: 'Compra',
      Fecha: '2025-07-01',
      Importe: 50,
    },
  );
  s.fundTransfers = [
    { outTradeID: 'out', inTradeID: 'in', rawOut: 50, rawIn: 50 },
  ];
  assert.equal(P.cashFlows(s).length, 1);
  assert.equal(P.cashFlows(s, 'A').at(-1).amount, 50);
  assert.equal(P.cashFlows(s, 'B').at(-1).amount, -50);
});
test('fees, taxes and distributions are cash flows once; incomplete inputs stay unavailable', () => {
  const s = fixture();
  s.tables.tOperaciones = [
    {
      Producto: 'A',
      Fecha: '2025-01-01',
      Tipo: 'Compra',
      Participaciones: 10,
      Precio: 10,
      Comisión: 2,
    },
    {
      Producto: 'A',
      Fecha: '2026-01-01',
      Tipo: 'Cobro',
      Precio: 10,
      Comisión: 1,
      Retención: 2,
    },
  ];
  assert.deepEqual(
    P.cashFlows(s).map((f) => f.amount),
    [-102, 7],
  );
  s.tables.tOperaciones[0].Precio = null;
  const a = P.analyze(s, A.investmentTimeline(s));
  assert.ok(a.xirrRows.every((r) => r.value === null));
});
test('missing flow valuations report the exact cut without silently extending TWR', () => {
  const s = fixture();
  s.tables.tOperaciones.push({
    Producto: 'A',
    Tipo: 'Compra',
    Fecha: '2025-07-01',
    Participaciones: 1,
    Precio: 10,
    Importe: 10,
  });
  const a = P.analyze(s, A.investmentTimeline(s));
  assert.deepEqual(a.diagnostics.missing, ['2025-07-01']);
  assert.equal(a.diagnostics.complete, false);
  assert.equal(a.diagnostics.last, '2025-01-01');
  assert.ok(Number.isFinite(a.xirrRows.at(-1).value));
});
test('drawdown tracks peak/trough, recovery and elapsed calendar days', () => {
  const a = P.drawdowns(
    [
      ['2025-01-01', 0],
      ['2025-01-02', 20],
      ['2025-01-12', -4],
      ['2025-02-01', 20],
    ].map(([date, adjustedReturnPct]) => ({ date, adjustedReturnPct })),
  );
  close(a.max.value, -20);
  assert.equal(a.max.peak, '2025-01-02');
  assert.equal(a.max.trough, '2025-01-12');
  assert.equal(a.recovery, '2025-02-01');
  assert.deepEqual(
    a.rows.map((r) => r.underwaterDays),
    [0, 0, 10, 0],
  );
  assert.equal(P.drawdowns([]).max, null);
});
test('sample deviation and Pearson correlation handle perfect, constant and missing series', () => {
  close(P.stdev([1, 2, 3]), 1);
  close(P.correlation([1, 2, 3], [2, 4, 6]), 1);
  close(P.correlation([1, 2, 3], [6, 4, 2]), -1);
  assert.equal(P.correlation([1, 1, 1], [2, 4, 6]), null);
  assert.equal(P.stdev([1, null]), null);
});
function weeklyFixture(n) {
  const s = fixture();
  s.tables.tProductos.push({ ID: 'B', Producto: 'Beta' });
  s.tables.tPrecios = [];
  for (let i = 0; i < n; i++) {
    const date = new Date(Date.parse('2025-01-03') + i * 7 * 86400000)
      .toISOString()
      .slice(0, 10);
    s.tables.tPrecios.push(
      { Producto: 'A', Fecha: date, 'VL EUR': 100 + i * i },
      { Producto: 'B', Fecha: date, 'VL EUR': 100 + i * i },
    );
  }
  return s;
}
test('risk uses identical real weekly dates, sample volatility and the 12-observation gate', () => {
  const s = weeklyFixture(14);
  const a = P.risk(s, '2024-12-30', '2025-04-04', []);
  assert.equal(a.count, 13);
  close(a.correlations[0].value, 1);
  close(
    a.volatility[0].value,
    100 * Math.sqrt(52) * P.stdev(a.observations.map((r) => r.values[0])),
  );
  assert.equal(a.short, true);
  const short = P.risk(weeklyFixture(12), '2024-12-30', '2025-04-04', []);
  assert.equal(short.volatility.length, 0);
  assert.equal(short.correlations.length, 0);
});
test('missing weeks are omitted, partial boundary weeks excluded, and selected funds are dynamic', () => {
  const s = weeklyFixture(16);
  s.tables.tPrecios = s.tables.tPrecios.filter((q) => q.Fecha !== '2025-02-14');
  const a = P.risk(s, '2024-12-30', '2025-04-16', []);
  assert.ok(
    a.observations.every(
      (o) => Date.parse(o.to) - Date.parse(o.from) === 7 * 86400000,
    ),
  );
  assert.ok(a.to < '2025-04-14');
  const one = P.risk(s, '2024-12-30', '2025-04-16', [], 'B');
  assert.equal(one.products.length, 1);
  assert.equal(one.volatility[0].label, 'Beta');
});

test('unverified transfer metadata cannot silently certify a personal return', () => {
  const s = fixture();
  const timeline = A.investmentTimeline(s);
  timeline.coverage.precisionAdjustments = [{ verified: false }];
  const a = P.analyze(s, timeline);
  assert.ok(a.xirrRows.length > 1);
  assert.ok(
    a.xirrRows.every((r) => r.value === null && r.status === 'invalid'),
  );
});
