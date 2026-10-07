const { test } = require('node:test'),
  assert = require('node:assert/strict');
const { runtime } = require('./helpers/runtime.cjs');
function fixture() {
  const r = runtime();
  r.init();
  const s = r.state();
  s.summaryValues = [
    ['Año', 2026, 'Periodo', 'Todo el año', 'Cuenta', 'Todas'],
    ['Patrimonio neto', 'Efectivo', 'Inversiones', 'Deuda'],
    [1100, 1000, 120, 20],
    ['Ingresos', 'Gastos propios', 'Ahorro', 'Tasa de ahorro'],
    [200, 50, 150, 0.75],
  ];
  const data = r.api({ action: 'read' }).tables;
  return { r, s, data };
}
test('resumen lee los valores nativos y conserva filtros y fechas, sin recalcularlos', () => {
  const { r, s, data } = fixture();
  const result = r.ctx.nativeSummary_(s, data);
  assert.equal(
    result.metrics.find((m) => m.label === 'Patrimonio neto').value,
    1100,
  );
  assert.equal(result.filters.Cuenta, 'Todas');
  assert.equal(result.settings.valuation, '2026-01-01');
  assert.equal(result.complete, true);
});
test('posición sin precio al corte oculta inversión y patrimonio, mantiene efectivo conocido', () => {
  const { r, s, data } = fixture();
  data.tProductos[0].Participaciones = 5;
  s.tables.tPrecios = [];
  const result = r.ctx.nativeSummary_(s, data);
  assert.equal(
    result.metrics.find((m) => m.label === 'Patrimonio neto').value,
    null,
  );
  assert.equal(
    result.metrics.find((m) => m.label === 'Inversiones').value,
    null,
  );
  assert.equal(result.metrics.find((m) => m.label === 'Efectivo').value, 1000);
  assert.equal(result.missingPrices[0], 'Fondo A');
  assert.equal(result.complete, false);
});
test('cabeceras ausentes, duplicadas, fórmulas con error o blancos no se convierten en cero', () => {
  const { r, s, data } = fixture();
  s.summaryValues.push(['Efectivo'], [0]);
  s.summaryValues[4][0] = '#REF!';
  const result = r.ctx.nativeSummary_(s, data);
  assert.equal(result.metrics.find((m) => m.label === 'Efectivo').value, null);
  assert.equal(result.metrics.find((m) => m.label === 'Ingresos').value, null);
  assert.equal(result.complete, false);
  const read = r.api({ action: 'read' });
  assert.match(read.bookKey, /^[0-9a-f]{64}$/);
  assert.equal(read.bookKey.includes('fixture-book'), false);
});
