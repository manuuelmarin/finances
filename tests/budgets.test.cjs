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

test('un límite por intervalo conserva ID estable, permite solapes y edita o retira solo ese ID', () => {
  const r = runtime();
  r.init();
  const custom = (title, start, end = null, id) => ({
    process: 'presupuesto_intervalo',
    ...(id ? { id } : {}),
    title,
    start,
    end,
    category: 'Café',
    amount: 50,
  });
  const envelope = {
    action: 'transact',
    requestId: crypto.randomUUID(),
    expectedRevision: r.state().revision,
    operations: [custom('Cafés desde verano', '2026-08-18')],
  };
  assert.equal(r.api(envelope).ok, true);
  assert.equal(r.api(envelope).replayed, true);
  assert.equal(r.state().technical.intervalBudgets.length, 1);
  assert.equal(
    r.transact([custom('Cafés fin de año', '2026-10-01', '2026-12-31')]).ok,
    true,
  );
  let records = r.api({ action: 'read' }).intervalBudgets;
  assert.equal(records.length, 2);
  const id = records[0].id;
  assert.equal(
    r.transact([custom('Verano ajustado', '2026-08-18', null, id)]).ok,
    true,
  );
  assert.equal(
    r.api({ action: 'read' }).intervalBudgets.find((x) => x.id === id).title,
    'Verano ajustado',
  );
  assert.equal(
    r.transact([{ process: 'quitar_presupuesto_intervalo', id }]).ok,
    true,
  );
  assert.equal(r.api({ action: 'read' }).intervalBudgets.length, 1);
  assert.equal(
    r.state().technical.audit.filter((x) => x[2] === 'presupuestos_intervalo')
      .length,
    4,
  );
});

test('interval budgets reject malformed dates, negative limits and invalid categories atomically', () => {
  for (const change of [
    { start: '2026-02-30' },
    { end: '2026-08-17' },
    { category: 'Nómina' },
    { amount: -1 },
    { title: ' ' },
  ]) {
    const r = runtime();
    r.init();
    assert.equal(
      r.transact([
        {
          process: 'presupuesto_intervalo',
          title: 'Cafe',
          start: '2026-08-18',
          end: null,
          category: 'Café',
          amount: 50,
          ...change,
        },
      ]).ok,
      false,
    );
    assert.equal(r.state().technical.intervalBudgets.length, 0);
  }
  const r = runtime();
  r.init();
  assert.equal(r.api({ action: 'read' }).supportsCustomBudgets, true);
});

test('the server returns UPDATE_REQUIRED if a custom-budget request reaches a backend without its schema', () => {
  const r = runtime();
  r.init();
  const state = r.state();
  delete state.tech.intervalBudgets;
  assert.throws(
    () =>
      r.evaluate(
        `applyOperations_(${JSON.stringify(state)}, ${JSON.stringify([
          {
            process: 'presupuesto_intervalo',
            title: 'Cafés',
            start: '2026-08-18',
            amount: 50,
          },
        ])}, 'request-id', '2026-08-01T00:00:00.000Z', false)`,
      ),
    (error) => error.code === 'UPDATE_REQUIRED',
  );
});

test('custom interval spending is bounded inclusively, uses own expense rules, and does not synthesize future spending', () => {
  const snapshot = {
    settings: { start: '2026-08-01', asof: '2026-09-10' },
    tables: {
      tMovimientos: [
        {
          Fecha: '2026-08-18',
          Tipo: 'Gasto',
          Importe: 20,
          Recuperable: 5,
          Subcategoría: 'Café',
        },
        {
          Fecha: '2026-08-19',
          Tipo: 'Devolución gasto',
          Importe: 3,
          Subcategoría: 'Café',
        },
        {
          Fecha: '2026-09-11',
          Tipo: 'Gasto',
          Importe: 100,
          Subcategoría: 'Café',
        },
        {
          Fecha: '2026-08-20',
          Tipo: 'Transferencia',
          Importe: 500,
          Subcategoría: 'Café',
        },
      ],
    },
  };
  const b = A.intervalBudget(snapshot, {
    start: '2026-08-18',
    end: null,
    category: 'Café',
    amount: 50,
  });
  assert.equal(b.spent, 12);
  assert.equal(b.remaining, 38);
  assert.deepEqual(
    A.budgetEvolution(snapshot, {
      start: '2026-08-18',
      end: null,
      category: 'Café',
      amount: 50,
    }).map((x) => x.expense),
    [15, 12, 12],
  );
});

test('custom intervals before tracking disclose partial or unavailable coverage instead of zero spend', () => {
  const snapshot = {
    settings: { start: '2026-09-30', asof: '2026-10-15' },
    tables: {
      tMovimientos: [
        { Fecha: '2026-10-02', Tipo: 'Gasto', Importe: 18, Recuperable: 0 },
      ],
    },
  };
  const partial = {
    title: 'Cafés',
    start: '2026-08-18',
    end: null,
    category: null,
    amount: 50,
  };
  const partialBudget = A.intervalBudget(snapshot, partial);
  assert.equal(partialBudget.spent, null);
  assert.equal(partialBudget.remaining, null);
  assert.deepEqual(partialBudget.coverage, {
    status: 'partial',
    observed: true,
    first: '2026-09-30',
    last: '2026-10-15',
  });
  assert.equal(A.budgetEvolution(snapshot, partial)[0].date, '2026-09-30');
  assert.equal(
    A.intervalBudget(snapshot, { ...partial, end: '2026-09-01' }).coverage
      .status,
    'prestart',
  );
  assert.equal(
    A.intervalBudget(snapshot, { ...partial, end: '2026-09-01' }).spent,
    null,
  );
  assert.equal(
    A.intervalBudget(snapshot, {
      ...partial,
      start: '2026-10-20',
      end: null,
    }).coverage.status,
    'future',
  );
});

test('renaming a subcategory preserves active custom limits and their stable identifiers', () => {
  const r = runtime();
  r.init();
  assert.equal(
    r.transact([
      {
        process: 'presupuesto_intervalo',
        title: 'Cafés',
        start: '2026-01-01',
        end: null,
        category: 'Café',
        amount: 50,
      },
    ]).ok,
    true,
  );
  const previous = r.api({ action: 'read' }).intervalBudgets[0];
  const result = r.transact([
    {
      process: 'renombrar',
      kind: 'subcategoria',
      from: 'Café',
      to: 'Cafetería',
    },
  ]);
  assert.equal(result.ok, true, result.message);
  const after = r.api({ action: 'read' }).intervalBudgets[0];
  assert.equal(after.id, previous.id);
  assert.equal(after.category, 'Cafetería');
  assert.equal(after.amount, 50);
});

const intervalSnapshot = {
  settings: { start: '2026-01-01', asof: '2026-01-20' },
  tables: {
    tMovimientos: [
      {
        Fecha: '2026-01-02',
        Tipo: 'Gasto',
        Subcategoría: 'Café',
        Importe: 100,
        Recuperable: 20,
      },
      {
        Fecha: '2026-01-03',
        Tipo: 'Devolución gasto',
        Subcategoría: 'Café',
        Importe: 20,
        Recuperable: 5,
      },
      { Fecha: '2026-01-03', Tipo: 'Compra inversión', Importe: 200 },
    ],
  },
};
const intervalRecord = {
  start: '2026-01-01',
  end: '2026-01-31',
  category: 'Café',
  amount: 100,
};
test('interval limits and evolution reconcile shared refunds with monthly own expense', () => {
  assert.equal(A.spending(intervalSnapshot, '2026-01', 'Café'), 65);
  assert.equal(A.intervalBudget(intervalSnapshot, intervalRecord).spent, 65);
  assert.equal(
    A.budgetEvolution(intervalSnapshot, intervalRecord).at(-1).expense,
    65,
  );
});
test('unobserved intervals never become zero expense or a fabricated cumulative starting balance', () => {
  assert.equal(
    A.intervalBudget(intervalSnapshot, {
      ...intervalRecord,
      start: '2026-02-01',
      end: null,
    }).spent,
    null,
  );
  const partial = { ...intervalRecord, start: '2025-12-18' };
  assert.equal(A.intervalBudget(intervalSnapshot, partial).spent, null);
  assert.ok(
    A.budgetEvolution(intervalSnapshot, partial).every(
      (row) => row.expense === null,
    ),
  );
});
