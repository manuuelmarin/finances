const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { runtime } = require('./helpers/runtime.cjs');
const A = require('../web/analytics.js');
const limit = (changes = {}) => ({
  process: 'presupuesto',
  month: '2026-01',
  category: null,
  amount: 100,
  ...changes,
});

test('presupuesto se guarda auditado sin cambiar tablas financieras, fechas o fórmulas', () => {
  const r = runtime();
  r.init();
  const before = r.state(),
    formulas = r.formulas();
  const response = r.transact([limit()]);
  assert.equal(response.ok, true, response.message);
  const after = r.state();
  assert.deepEqual(after.tables, before.tables);
  assert.deepEqual(after.settings, before.settings);
  assert.deepEqual(r.formulas(), formulas);
  assert.notEqual(after.revision, before.revision);
  assert.equal(after.technical.budgets.length, 1);
  assert.equal(after.technical.requests.length, 1);
  assert.equal(after.technical.audit.at(-1)[2], 'presupuestos');
  assert.deepEqual(r.api({ action: 'read' }).budgets, [
    { month: '2026-01', category: null, amount: 100 },
  ]);
});
test('reintento, edición y retirada conservan un único presupuesto y el journal', () => {
  const r = runtime();
  r.init();
  const envelope = {
    action: 'transact',
    requestId: crypto.randomUUID(),
    expectedRevision: r.state().revision,
    operations: [limit({ category: 'Café' })],
  };
  assert.equal(r.api(envelope).ok, true);
  assert.equal(r.api(envelope).replayed, true);
  assert.equal(r.transact([limit({ category: 'Café', amount: 0 })]).ok, true);
  assert.equal(r.state().technical.budgets.length, 1);
  assert.equal(r.api({ action: 'read' }).budgets[0].amount, 0);
  assert.equal(
    r.transact([
      { process: 'quitar_presupuesto', month: '2026-01', category: 'Café' },
    ]).ok,
    true,
  );
  assert.equal(r.api({ action: 'read' }).budgets.length, 0);
  assert.equal(r.state().technical.budgets.length, 1);
  assert.equal(r.state().technical.requests.length, 3);
});
test('límites inválidos rechazan el lote completo y no crean movimientos', () => {
  for (const change of [
    { month: '2026-13' },
    { category: 'Nómina' },
    { category: 'Desconocida' },
    { amount: -1 },
    { amount: 1.001 },
    { month: '<script>' },
  ]) {
    const r = runtime();
    r.init();
    const before = r.state();
    assert.equal(r.transact([limit(change)]).ok, false);
    assert.deepEqual(r.state(), before);
  }
});
test('presupuestos respetan autorización, vínculo de libro y conflictos de otro dispositivo', () => {
  const denied = runtime({ visitor: 'other@example.test' });
  assert.equal(
    denied.api({
      action: 'transact',
      requestId: crypto.randomUUID(),
      expectedRevision: 'x',
      operations: [limit()],
    }).error,
    'ACCESS_DENIED',
  );
  assert.equal(denied.writes.length, 0);
  const r = runtime();
  r.init();
  const revision = r.state().revision;
  r.transact([limit()]);
  assert.equal(
    r.api({
      action: 'transact',
      requestId: crypto.randomUUID(),
      expectedRevision: revision,
      operations: [limit({ amount: 200 })],
    }).error,
    'CONFLICT',
  );
});
test('la hoja nueva se prepara en un libro antiguo sin cambiar su revisión antes del primer límite', () => {
  const r = runtime();
  r.init();
  r.removeTechnical('_Finanzas_Presupuestos');
  const before = r.state();
  assert.equal(r.api({ action: 'diagnostics' }).priceReady, true);
  assert.equal(r.transact([limit()]).ok, true);
  assert.deepEqual(r.state().tables, before.tables);
  assert.equal(r.state().technical.budgets.length, 1);
});
test('renombrar una subcategoría conserva su límite y no permite eliminarla mientras esté activa', () => {
  const r = runtime();
  r.init();
  r.transact([limit({ category: 'Café' })]);
  assert.equal(
    r.transact([
      {
        process: 'renombrar',
        kind: 'subcategoria',
        from: 'Café',
        to: 'Café nuevo',
      },
    ]).ok,
    true,
  );
  assert.equal(r.api({ action: 'read' }).budgets[0].category, 'Café nuevo');
  assert.equal(
    r.transact([
      {
        process: 'eliminar',
        table: 'tCategorias',
        key: { Subcategoría: 'Café nuevo' },
      },
    ]).ok,
    false,
  );
});
test('gasto propio excluye recuperables, cobros compartidos, transferencias, inversiones y fechas fuera de corte', () => {
  const snapshot = {
    settings: { start: '2026-01-02', asof: '2026-01-20' },
    tables: {
      tMovimientos: [
        {
          Fecha: '2026-01-03',
          Tipo: 'Gasto',
          Importe: 30,
          Recuperable: 10,
          Subcategoría: 'Café',
        },
        {
          Fecha: '2026-01-04',
          Tipo: 'Devolución gasto',
          Importe: 6,
          Recuperable: 2,
          Subcategoría: 'Café',
        },
        ...[
          'Cobro compartido',
          'Transferencia',
          'Compra inversión',
          'Devolución deuda',
        ].map((Tipo) => ({ Fecha: '2026-01-05', Tipo, Importe: 1000 })),
        { Fecha: '2026-01-01', Tipo: 'Gasto', Importe: 1000 },
        { Fecha: '2026-01-21', Tipo: 'Gasto', Importe: 1000 },
      ],
    },
  };
  assert.equal(A.spending(snapshot, '2026-01'), 16);
  assert.equal(A.spending(snapshot, '2026-01', 'Café'), 16);
  assert.equal(A.spending(snapshot, '2026-01', 'Otros'), 0);
  assert.equal(
    A.budget(snapshot, { month: '2026-01', category: null, amount: 10 })
      .remaining,
    -6,
  );
  assert.equal(
    A.budget(snapshot, { month: '2026-01', category: null, amount: 0 })
      .exceeded,
    true,
  );
});
test('un gasto desconocido o una valoración parcial permanecen desconocidos', () => {
  const snapshot = {
    settings: { start: '2026-01-01', asof: '2026-01-20' },
    tables: {
      tMovimientos: [{ Fecha: '2026-01-02', Tipo: 'Gasto', Importe: null }],
    },
  };
  assert.equal(A.spending(snapshot, '2026-01'), null);
  assert.equal(
    A.groups([
      { group: 'RV', value: null },
      { group: 'RV', value: 10 },
    ])[0].value,
    null,
  );
});
