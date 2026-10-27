const { test } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../web/chart-renderer.js');
const theme = {
  colors: { 'chart-mint': '#123456', 'chart-red': '#aa0000' },
  text: '#111',
  muted: '#555',
  line: '#ddd',
  font: 'sans-serif',
};
test('vector renderer preserves every exact dated value and null gap without financial transforms', () => {
  const rows = [
    { date: '2026-01-01', v: 301.123456 },
    { date: '2026-01-03', v: null },
    { date: '2026-02-01', v: -15 },
  ];
  const before = JSON.stringify(rows);
  const o = R.plotOption(
    { rows, fields: [{ key: 'v', label: 'Valor' }], unit: 'EUR' },
    theme,
  );
  assert.equal(o.xAxis.type, 'time');
  assert.deepEqual(
    o.series[0].data.map((d) => d.value),
    rows.map((r) => [Date.parse(r.date + 'T00:00:00Z'), r.v]),
  );
  assert.equal(o.series[0].smooth, false);
  assert.equal(o.series[0].connectNulls, false);
  assert.equal(o.series[0].sampling, undefined);
  assert.equal(JSON.stringify(rows), before);
});
test('numeric histograms retain real spacing, count units and a zero baseline', () => {
  const o = R.plotOption(
    {
      rows: [
        { x: 5, v: 2 },
        { x: 105, v: 1 },
      ],
      xKey: 'x',
      unit: 'count',
      fields: [{ key: 'v', label: 'Frecuencia', shape: 'bar' }],
    },
    theme,
  );
  assert.equal(o.xAxis.type, 'value');
  assert.deepEqual(
    o.series[0].data.map((d) => d.value),
    [
      [5, 2],
      [105, 1],
    ],
  );
  assert.equal(o.yAxis.min, 0);
  assert.equal(o.yAxis.minInterval, 1);
  assert.equal(o.yAxis.name, 'Recuento');
});
test('capital steps, reference limits, losses and horizontal comparisons retain their meaning', () => {
  const fields = [{ key: 'v', label: 'Capital', shape: 'step', area: true }];
  const o = R.plotOption(
    {
      rows: [{ date: '2026-01-01', v: 100 }],
      fields,
      unit: 'EUR',
      reference: { value: 150, label: 'Límite' },
    },
    theme,
  );
  assert.equal(o.series[0].step, 'end');
  assert.equal(o.series[0].areaStyle.origin, 0);
  assert.deepEqual(o.series[0].markLine.data, [{ yAxis: 150 }]);
  assert.ok(
    o.yAxis.max > 150,
    'reference above observed values remains visible',
  );
  const bars = R.plotOption(
    {
      rows: [
        { label: 'A', v: -15, tone: 'chart-red' },
        { label: 'B', v: 20 },
      ],
      fields: [{ key: 'v', label: 'Resultado', shape: 'bar' }],
      unit: 'EUR',
      horizontal: true,
    },
    theme,
  );
  assert.equal(bars.yAxis.type, 'category');
  assert.deepEqual(bars.yAxis.data, ['A', 'B']);
  assert.deepEqual(
    bars.series[0].data.map((d) => d.value),
    [-15, 20],
  );
  assert.equal(bars.series[0].data[0].itemStyle.color, '#aa0000');
  assert.equal(bars.xAxis.scale, false);
});
