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
  assert.ok(a.xirrRows.length > 0);
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
test('return basis uses complete TWR and preserves a single estimated basis through a missing flow valuation', () => {
  const s = fixture();
  const t = A.investmentTimeline(s);
  const original = structuredClone(t);
  const exact = P.returnSeries(t);
  assert.equal(exact.estimated, false);
  close(exact.rows.at(-1).adjustedReturnPct, t.rows.at(-1).totalReturnPct);
  assert.deepEqual(t, original);
  const broken = structuredClone(t);
  const point = broken.rows.find((r) => r.totalReturnPct !== null);
  point.totalReturnPct = null;
  const estimated = P.returnSeries(broken);
  assert.equal(estimated.estimated, true);
  assert.deepEqual(
    estimated.rows.map((r) => r.adjustedReturnPct),
    broken.rows.map((r) => r.adjustedReturnPct),
  );
  t.coverage.sinceInception = false;
  assert.equal(P.returnSeries(t).estimated, true);
  assert.equal(P.returnSeries({ rows: [], coverage: {} }).estimated, true);
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
  assert.ok(a.observations.length > 0);
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

test('calendar return means include partial inception and current years without annualizing', () => {
  const rows = [
    ['2025-04-22', 0],
    ['2025-04-30', 10],
    ['2025-05-31', 21],
    ['2025-12-31', 32],
    ['2026-01-31', 45.2],
    ['2026-02-14', 30.68],
  ].map(([date, adjustedReturnPct]) => ({ date, adjustedReturnPct }));
  const annual = P.averageReturns(rows, 'year');
  assert.equal(annual.periods.length, 2);
  assert.deepEqual(
    annual.periods.map((p) => p.period),
    ['2025', '2026'],
  );
  close(annual.periods[0].value, 32);
  close(annual.periods[1].value, -1);
  close(annual.value, 15.5);
  const monthly = P.averageReturns(rows);
  assert.deepEqual(
    monthly.periods.map((p) => p.period),
    ['2025-04', '2025-05', '2026-01', '2026-02'],
  );
  monthly.periods.forEach((p, i) => close(p.value, [10, 10, 10, -10][i]));
  close(monthly.value, 5);
});
test('period means preserve losses and distinguish arithmetic average from compounded growth', () => {
  const rows = [
    ['2026-01-01', 0],
    ['2026-01-31', -50],
    ['2026-02-28', 0],
  ].map(([date, adjustedReturnPct]) => ({ date, adjustedReturnPct }));
  close(P.averageReturns(rows).value, 25);
  close(P.averageReturns(rows, 'year').value, 0);
  assert.equal(P.averageReturns([]).value, null);
  assert.equal(
    P.averageReturns([{ date: '2026-01-01', adjustedReturnPct: 0 }]).value,
    null,
  );
  assert.equal(
    P.averageReturns([{ date: '2026-01-01', adjustedReturnPct: null }]).periods
      .length,
    0,
  );
});

test('monthly bars use flow-adjusted returns: deposits at a flat NAV yield zero, not a capital gain', () => {
  function returns(deposit) {
    const s = fixture();
    s.settings.asof = s.settings.valuation = '2025-03-31';
    s.tables.tProductos[0]['Unidades base'] = 10;
    s.tables.tProductos[0]['Coste base'] = 100;
    s.tables.tOperaciones = [
      {
        ID: 'cash-jan',
        Producto: 'A',
        Tipo: 'Compra',
        Fecha: '2025-01-15',
        Participaciones: deposit / 10,
        Precio: 10,
        Importe: deposit,
      },
      {
        ID: 'cash-mar',
        Producto: 'A',
        Tipo: 'Compra',
        Fecha: '2025-03-15',
        Participaciones: deposit / 11,
        Precio: 11,
        Importe: deposit,
      },
    ];
    s.tables.tPrecios = [
      ['2025-01-01', 10],
      ['2025-01-31', 10],
      ['2025-02-28', 11],
      ['2025-03-15', 11],
      ['2025-03-31', 9.9],
    ].map(([Fecha, price]) => ({ Producto: 'A', Fecha, 'VL EUR': price }));
    const timeline = A.investmentTimeline(s);
    return P.averageReturns(timeline.rows).periods;
  }
  for (const deposit of [100, 1000]) {
    const months = returns(deposit);
    assert.deepEqual(
      months.map((r) => r.period),
      ['2025-01', '2025-02', '2025-03'],
    );
    months.forEach((r, i) => close(r.value, [0, 10, -10][i]));
  }
});

test('splitting identical holdings across 1, 3 or 17 products preserves all portfolio return and risk measures', () => {
  function split(count) {
    const s = fixture();
    s.settings.start = '2025-01-03';
    s.settings.asof = s.settings.valuation = '2025-04-04';
    s.tables.tOperaciones = [];
    s.tables.tProductos = Array.from({ length: count }, (_, i) => ({
      ID: 'SPLIT-' + i,
      Producto: 'Independent label ' + (count - i),
      'Fecha base': '2025-01-03',
      'Unidades base': 10 / count,
      'Coste base': 100 / count,
    }));
    s.tables.tPrecios = s.tables.tProductos
      .flatMap((p) =>
        Array.from({ length: 14 }, (_, i) => ({
          Producto: p.ID,
          Fecha: new Date(Date.parse('2025-01-03') + i * 7 * 86400000)
            .toISOString()
            .slice(0, 10),
          'VL EUR': 10 + i / 10 + Math.sin(i) / 5,
        })),
      )
      .reverse();
    const t = A.investmentTimeline(s);
    const a = P.analyze(s, t);
    return {
      timeline: t.rows
        .filter((r) => r.totalReturnPct !== null)
        .map((r) => [r.date, r.value, r.capital, r.totalReturnPct]),
      xirr: a.xirrRows.at(-1).value,
      profit: a.contributions.reduce((sum, p) => sum + p.value, 0),
      drawdown: a.drawdowns.max?.value,
      monthly: P.averageReturns(P.returnSeries(t).rows).value,
      annual: P.averageReturns(P.returnSeries(t).rows, 'year').value,
      risk: a.risk,
    };
  }
  const baseline = split(1);
  assert.ok(Number.isFinite(baseline.xirr));
  assert.ok(Number.isFinite(baseline.risk.volatility[0].value));
  for (const count of [3, 17]) {
    const next = split(count);
    assert.deepEqual(
      next.timeline.map((row) => row[0]),
      baseline.timeline.map((row) => row[0]),
    );
    next.timeline.forEach((row, i) =>
      row
        .slice(1)
        .forEach((v, j) => close(v, baseline.timeline[i][j + 1], 1e-8)),
    );
    for (const key of ['xirr', 'profit', 'drawdown', 'monthly', 'annual'])
      close(next[key], baseline[key], 1e-8);
    assert.equal(next.risk.products.length, count);
    assert.equal(next.risk.correlations.length, (count * (count - 1)) / 2);
    next.risk.volatility.forEach((v) =>
      close(v.value, baseline.risk.volatility[0].value, 1e-8),
    );
    next.risk.correlations.forEach((p) => close(p.value, 1));
  }
});
