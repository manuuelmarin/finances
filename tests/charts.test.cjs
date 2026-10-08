const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runtime, serial } = require('./helpers/runtime.cjs');
test('gráficos usan resultados nativos, conservan desconocidos y no escriben al consultar', () => {
  const r = runtime();
  r.init();
  const state = r.state();
  state.summaryValues = [
    ['Mes', 'Ingresos', 'Gastos', 'Efectivo'],
    ['ene 2026', 12.34, 0, 100],
    ['feb 2026', '', '', ''],
  ];
  state.chartValues = {
    Finanzas_CalculoCategorias: [
      ['Comida', 2.5],
      ['Ocio', '#REF!'],
    ],
    Finanzas_GraficoCiudades: [['Madrid', 2.5]],
    Finanzas_MesesInversiones: [[serial('2026-01-01'), 10, 15]],
  };
  const writes = r.writes.length;
  const charts = r.ctx.nativeCharts_(state, r.api({ action: 'read' }).tables);
  assert.equal(charts.monthly[0].income, 12.34);
  assert.equal(charts.monthly[0].expense, 0);
  assert.equal(charts.monthly[1].cash, null);
  assert.equal(charts.categories[1].value, null);
  assert.equal(charts.investments[0].label, '2026-01');
  assert.equal(charts.cities[0].value, 2.5);
  assert.equal(r.writes.length, writes);
});
