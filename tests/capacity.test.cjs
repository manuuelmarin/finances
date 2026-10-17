const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { runtime, serial } = require('./helpers/runtime.cjs');
const expense = () => ({
  process: 'gasto',
  date: '2026-01-02',
  concept: 'Capacity fixture',
  account: 'Cuenta A',
  category: 'Café',
  amount: 12,
});

test('capacidad agotada amplía tabla y cálculo; el reintento conserva una única solicitud', () => {
  const r = runtime();
  r.init();
  const calc = r.book().sheets.find((s) => s.properties.title === 'Cálculos')
    .properties.sheetId;
  const summaryFormula = r.cell(calc, 3, 5).userEnteredValue.formulaValue;
  assert.match(summaryFormula, /INDEX\(Finanzas_CalculoMovimientos;0;11\)/);
  const cap = r.state().raw.tMovimientos.length;
  for (let i = 0; i < cap; i += 20)
    assert.equal(
      r.transact(Array.from({ length: Math.min(20, cap - i) }, () => expense()))
        .ok,
      true,
    );
  const envelope = {
    action: 'transact',
    requestId: crypto.randomUUID(),
    expectedRevision: r.state().revision,
    operations: [expense()],
  };
  assert.equal(r.api(envelope).ok, true);
  assert.equal(r.api(envelope).replayed, true);
  const s = r.state();
  assert.equal(s.tables.tMovimientos.length, cap + 1);
  assert.ok(s.raw.tMovimientos.length > cap);
  const support = s.book.namedRanges.find(
    (n) => n.name === 'Finanzas_CalculoMovimientos',
  );
  assert.equal(
    support.range.endRowIndex - support.range.startRowIndex,
    s.raw.tMovimientos.length,
  );
  assert.equal(s.technical.requests.length, cap / 20 + 1);
  assert.equal(
    r.cell(calc, 3, 5).userEnteredValue.formulaValue,
    summaryFormula,
  );
  const monthly = s.book.namedRanges.find(
    (n) => n.name === 'Finanzas_ResumenMensual',
  ).range;
  assert.match(
    r.cell(calc, monthly.startRowIndex, 3).userEnteredValue.formulaValue,
    /INDEX\(Finanzas_CalculoMovimientos;0;11\)/,
  );
});

test('la preparación migra totales antiguos sin modificar entradas y es idempotente', () => {
  const r = runtime();
  r.init();
  const before = JSON.stringify(r.state().tables),
    calc = r.book().sheets.find((s) => s.properties.title === 'Cálculos')
      .properties.sheetId;
  r.ctx.Sheets.Spreadsheets.batchUpdate(
    {
      requests: [
        {
          updateCells: {
            start: { sheetId: calc, rowIndex: 3, columnIndex: 5 },
            rows: [
              {
                values: [
                  { userEnteredValue: { formulaValue: '=SUM(L9:L28)' } },
                ],
              },
            ],
            fields: 'userEnteredValue',
          },
        },
        r.ctx.cellRequest_(calc, 7, 19, 'API-3.1.0-A1-legacy'),
      ],
    },
    'fixture-book',
  );
  assert.equal(r.init().ok, true);
  assert.match(
    r.cell(calc, 3, 5).userEnteredValue.formulaValue,
    /INDEX\(Finanzas_CalculoMovimientos;0;11\)/,
  );
  assert.equal(JSON.stringify(r.state().tables), before);
  const writes = r.writes.length;
  assert.equal(r.init().ok, true);
  assert.equal(r.writes.length, writes);
});
test('una preparación interrumpida se reanuda sin repetir crecimiento ni modificar datos', () => {
  const r = runtime({ failFormulaMaintenanceOnce: true }),
    original = JSON.stringify(r.state().tables);
  assert.equal(r.init().ok, false);
  const cap = r.state().raw.tMovimientos.length;
  assert.equal(r.init().ok, true);
  assert.equal(r.state().raw.tMovimientos.length, cap);
  assert.equal(JSON.stringify(r.state().tables), original);
  assert.equal(r.api({ action: 'diagnostics' }).capacityReady, true);
});
test('alta de un producto amplía el histórico mensual y admite lectura sin precio conocido', () => {
  const r = runtime();
  r.init();
  const result = r.transact([
    {
      process: 'producto',
      name: 'Fondo ficticio B',
      account: 'Cuenta B',
      class: 'Renta fija',
      date: '2025-01-01',
      units: 0,
      cost: 0,
    },
  ]);
  assert.equal(result.ok, true);
  const state = r.state(),
    range = state.book.namedRanges.find(
      (n) => n.name === 'Finanzas_HistoricoProductos',
    ).range;
  assert.ok(range.endRowIndex - range.startRowIndex >= 26);
  assert.equal(state.tables.tProductos.length, 2);
  assert.equal(state.tables.tPrecios.length, 1);
  const writes = r.writes
    .flatMap((b) => b.requests)
    .filter((r) => r.updateCells)
    .flatMap((r) => r.updateCells.rows)
    .flatMap((r) => r.values);
  assert.ok(
    writes.some((c) =>
      c.userEnteredValue?.formulaValue?.includes('IF(COUNT(I'),
    ),
  );
  assert.equal(
    writes.some((c) =>
      /\bt[A-Za-z]+\[/.test(c.userEnteredValue?.formulaValue || ''),
    ),
    false,
  );
});
test('alta de categoría con tabla llena mantiene referencias y amplía categorías del resumen', () => {
  const r = runtime();
  r.init();
  const cap = r.state().raw.tCategorias.length;
  for (let i = 2; i < cap; i++)
    for (const [field, value] of Object.entries({
      Grupo: 'Gastos',
      Subgrupo: 'Otros',
      Categoría: 'Otros',
      Subcategoría: 'Categoría ficticia ' + i,
    }))
      r.setInput('tCategorias', i, field, value);
  assert.equal(
    r.transact([
      {
        process: 'categoria',
        group: 'Gastos',
        subgroup: 'Otros',
        category: 'Nueva categoría',
        subcategory: 'Nuevo subgrupo',
      },
    ]).ok,
    true,
  );
  const state = r.state(),
    range = state.book.namedRanges.find(
      (n) => n.name === 'Finanzas_CalculoCategorias',
    ).range;
  assert.equal(state.tables.tCategorias.length, cap + 1);
  assert.ok(state.raw.tCategorias.length > cap);
  assert.equal(
    range.endRowIndex - range.startRowIndex,
    state.raw.tCategorias.length,
  );
});

test('all eleven financial input tables grow across unequal boundaries without changing inputs', () => {
  const r = runtime();
  assert.equal(r.init().ok, true);
  const config = { id: 'fixture-book', environment: 'test' };
  const original = JSON.stringify(r.state().tables);
  for (const extra of [1, 101]) {
    const before = r.state();
    const desired = { ...before, tables: { ...before.tables } };
    for (const name of Object.keys(before.tables)) {
      desired.tables[name] = Array.from(
        { length: before.raw[name].length + extra },
        () => before.tables[name][0] || {},
      );
    }
    const after = r.ctx.prepareCapacity_(config, before, desired);
    assert.equal(JSON.stringify(after.tables), original);
    for (const name of Object.keys(before.tables)) {
      assert.ok(after.raw[name].length >= desired.tables[name].length, name);
      const meta = after.layout[name];
      for (const column of meta.headers.filter(
        (h) => !r.inputSchema[name].inputs.includes(h),
      )) {
        const cell = r.cell(
          meta.range.sheetId,
          meta.range.endRowIndex - 1,
          meta.range.startColumnIndex + meta.headers.indexOf(column),
        );
        assert.ok(cell.userEnteredValue?.formulaValue, name + '.' + column);
      }
    }
    assert.equal(r.ctx.capacityReady_(after), true);
    const writes = r.writes.length;
    r.ctx.prepareCapacity_(config, after, after);
    assert.equal(r.writes.length, writes, 'second preparation must be a no-op');
  }
});

test('support history adapts to earlier inception, more products and new valuation years', () => {
  const r = runtime();
  r.init();
  const before = r.state();
  const desired = {
    ...before,
    settings: { ...before.settings, valuation: serial('2028-03-01') },
    tables: {
      ...before.tables,
      tProductos: Array.from({ length: 7 }, (_, i) => ({
        ...before.tables.tProductos[0],
        ID: 'P' + i,
        'Fecha base': serial('2023-11-01'),
      })),
    },
  };
  const after = r.ctx.prepareCapacity_(
    { id: 'fixture-book', environment: 'test' },
    before,
    desired,
  );
  const ranges = r.ctx.supportRanges_(after);
  assert.equal(r.ctx.monthSpan_(desired), 53);
  assert.ok(
    ranges.history.range.endRowIndex - ranges.history.range.startRowIndex >=
      7 * 53,
  );
  assert.ok(
    ranges.months.range.endRowIndex - ranges.months.range.startRowIndex >= 53,
  );
  assert.equal(JSON.stringify(after.tables), JSON.stringify(before.tables));
});
