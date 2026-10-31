const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runtime, serial } = require('./helpers/runtime.cjs');
const D = require('../web/domain.js');
const expense = {
  process: 'gasto',
  date: '2026-01-02',
  concept: 'Synthetic expense',
  account: 'Cuenta A',
  category: 'Café',
  amount: 12,
  recoverable: 4,
};

test('archive, template and planned metadata persist without movements and retain revision/audit/receipt', () => {
  const r = runtime();
  r.init();
  const before = r.state(),
    formulas = r.formulas();
  const result = r.transact([
    { process: 'plantilla', name: 'Synthetic template', operation: expense },
    {
      process: 'obligacion',
      date: '2026-01-10',
      concept: 'Synthetic plan',
      account: 'Cuenta A',
      category: 'Café',
      amount: 7,
      kind: 'expense',
    },
    {
      process: 'archivar',
      kind: 'account',
      reference: 'Cuenta B',
      archived: true,
    },
  ]);
  assert.equal(result.ok, true, result.message);
  const read = r.api({ action: 'read' });
  assert.deepEqual(r.state().tables, before.tables);
  assert.deepEqual(r.state().settings, before.settings);
  assert.deepEqual(r.formulas(), formulas);
  assert.notEqual(read.revision, before.revision);
  assert.equal(read.templates.length, 1);
  assert.equal(read.planned.length, 1);
  assert.deepEqual(read.archives.accounts, ['Cuenta B']);
  assert.equal(r.state().technical.requests.length, 1);
  assert.ok(r.state().technical.audit.some((row) => row[2] === 'planned'));
  assert.equal(
    r.transact([
      {
        process: 'ingreso',
        date: '2026-01-02',
        concept: 'Archived',
        account: 'Cuenta B',
        category: 'Nómina',
        amount: 1,
      },
    ]).ok,
    false,
  );
  assert.equal(
    r.transact([
      {
        process: 'archivar',
        kind: 'account',
        reference: 'Cuenta B',
        archived: false,
      },
    ]).ok,
    true,
  );
  assert.equal(
    r.transact([
      {
        process: 'plantilla',
        id: read.templates[0].id,
        name: 'Renamed',
        operation: { ...expense, amount: 15 },
      },
      { process: 'quitar_obligacion', id: read.planned[0].id },
    ]).ok,
    true,
  );
  assert.equal(r.api({ action: 'read' }).templates[0].operation.amount, 15);
  assert.equal(r.api({ action: 'read' }).planned.length, 0);
  assert.equal(
    r.transact([{ process: 'quitar_plantilla', id: read.templates[0].id }]).ok,
    true,
  );
  assert.equal(r.api({ action: 'read' }).templates.length, 0);
});
test('planned realization is atomic; invalid metadata fields and stale revisions cannot apply', () => {
  const r = runtime();
  r.init();
  let before = r.state();
  assert.equal(
    r.transact([
      {
        process: 'obligacion',
        date: '2026-01-10',
        concept: 'Synthetic',
        account: 'Cuenta A',
        category: 'Café',
        amount: 1,
        kind: 'expense',
        extra: {},
      },
    ]).ok,
    false,
  );
  assert.deepEqual(r.state(), before);
  assert.equal(
    r.transact([
      {
        process: 'plantilla',
        name: 'Invalid',
        operation: { ...expense, ID: 'manual' },
      },
    ]).ok,
    false,
  );
  assert.deepEqual(r.state(), before);
  r.transact([
    {
      process: 'obligacion',
      date: '2026-01-02',
      concept: 'Synthetic',
      account: 'Cuenta A',
      category: 'Café',
      amount: 1,
      kind: 'expense',
    },
  ]);
  const planned = r.api({ action: 'read' }).planned[0];
  before = r.state();
  const stale = r.api({
    action: 'transact',
    requestId: require('node:crypto').randomUUID(),
    expectedRevision: 'stale-revision',
    operations: [expense, { process: 'quitar_obligacion', id: planned.id }],
  });
  assert.equal(stale.error, 'CONFLICT');
  assert.deepEqual(r.state(), before);
  assert.equal(
    r.transact([
      { ...expense, amount: -1 },
      { process: 'quitar_obligacion', id: planned.id },
    ]).ok,
    false,
  );
  assert.deepEqual(r.state(), before);
  assert.equal(
    r.transact([expense, { process: 'quitar_obligacion', id: planned.id }]).ok,
    true,
  );
  assert.equal(r.state().tables.tMovimientos.length, 1);
  assert.equal(r.api({ action: 'read' }).planned.length, 0);
});
test('payroll correction changes date/account/net/breakdown atomically and preserves movement ID', () => {
  const r = runtime();
  r.init();
  r.transact([
    {
      process: 'nomina',
      date: '2026-01-01',
      concept: 'Synthetic payroll',
      account: 'Cuenta A',
      category: 'Nómina',
      amount: 80,
      gross: 100,
      contribution: 5,
      tax: 10,
      otherDeductions: 5,
    },
  ]);
  const id = r.state().tables.tMovimientos[0].ID;
  const corrected = {
    process: 'corregir_nomina',
    movement: id,
    date: '2026-01-02',
    concept: 'Corrected payroll',
    account: 'Cuenta B',
    category: 'Nómina',
    amount: 90,
    gross: 110,
    contribution: 5,
    tax: 10,
    otherDeductions: 5,
  };
  assert.equal(r.transact([corrected]).ok, true);
  assert.equal(r.state().tables.tMovimientos[0].ID, id);
  assert.equal(r.state().tables.tMovimientos[0].Destino, 'Cuenta B');
  assert.equal(r.state().tables.tMovimientos[0].Fecha, serial('2026-01-02'));
  assert.equal(r.state().tables.tMovimientos[0].Importe, 90);
  assert.equal(r.state().tables.tNominas[0].Bruto, 110);
  assert.equal(r.state().tables.tNominas[0].Cotización, 5);
  assert.equal(r.state().tables.tNominas[0].IRPF, 10);
  assert.equal(r.state().tables.tNominas[0]['Otras deducciones'], 5);
  const before = r.state();
  assert.equal(r.transact([{ ...corrected, amount: 91 }]).ok, false);
  assert.deepEqual(r.state(), before);
});
test('contextual corrections preserve IDs and links, reclassify atomically and reject over recovery', () => {
  const r = runtime();
  r.init();
  r.transact([expense]);
  const original = r.state().tables.tMovimientos[0].ID;
  r.transact([
    {
      process: 'cobro_compartido',
      date: '2026-01-02',
      concept: 'Synthetic recovery',
      account: 'Cuenta A',
      original,
      amount: 2,
    },
  ]);
  const id = r.state().tables.tMovimientos[1].ID;
  const op = {
    process: 'editar_movimiento',
    movement: id,
    kind: 'devolucion_gasto',
    date: '2026-01-02',
    concept: 'Synthetic refund',
    account: 'Cuenta B',
    original,
    amount: 2,
    recoverable: 1,
  };
  assert.equal(r.transact([op]).ok, true);
  assert.equal(
    r.state().tables.tMovimientos.find((r) => r.ID === id).Tipo,
    'Devolución gasto',
  );
  assert.equal(
    r.state().tables.tVinculos.find((r) => r.Movimiento === id)['Vinculado a'],
    original,
  );
  const before = r.state();
  assert.equal(
    r.transact([{ ...op, kind: 'cobro_compartido', amount: 5 }]).ok,
    false,
  );
  assert.deepEqual(r.state(), before);
  assert.equal(
    r.transact([
      {
        process: 'editar_movimiento',
        movement: id,
        kind: 'traspaso',
        date: '2026-01-02',
        concept: 'Reclassified',
        from: 'Cuenta A',
        to: 'Cuenta B',
        amount: 2,
      },
    ]).ok,
    true,
  );
  assert.equal(r.state().tables.tVinculos.length, 0);
  assert.equal(r.state().tables.tMovimientos[1].ID, id);
});
test('CSV exports every filtered row as escaped semicolon data with neutralized spreadsheet formulas', () => {
  const csv = D.csv(
    [
      { text: '=HYPERLINK("x")', amount: 1.25, date: '2026-01-02' },
      { text: ' @SUM(1)', amount: -2, date: '2026-01-03' },
      { text: 'a;b\nc', amount: null, date: null },
    ],
    [['text'], ['amount'], ['date']],
  );
  assert.ok(csv.startsWith('\ufeff'));
  assert.ok(csv.includes('"\'=HYPERLINK(""x"")"'));
  assert.ok(csv.includes('"\' @SUM(1)"'));
  assert.ok(csv.includes('"1,25";"2026-01-02"'));
  assert.ok(csv.includes('"-2"'));
  assert.ok(csv.includes('"a;b\nc"'));
});
function funds() {
  const r = runtime();
  r.init();
  r.transact([
    {
      process: 'vincular_isin',
      product: 'PRODUCT-A',
      isin: 'IE00B4L5Y983',
      referenceName: 'Synthetic A',
    },
    {
      process: 'producto',
      name: 'Synthetic B',
      account: 'Cuenta B',
      class: 'Renta variable',
      date: '2025-01-01',
      units: 0,
      cost: 0,
      isin: 'IE00B3XXRP09',
      referenceName: 'Synthetic B',
    },
  ]);
  const state = r.state(),
    range = state.layout.tProductos.range,
    requests = [];
  for (let row = range.startRowIndex + 1; row < range.endRowIndex; row++)
    for (const f of r.ctx.fundProductFormulas_(state, row + 1))
      requests.push({
        updateCells: {
          start: {
            sheetId: range.sheetId,
            rowIndex: row,
            columnIndex: f.column,
          },
          rows: [
            {
              values: [
                {
                  userEnteredValue: {
                    formulaValue: r.ctx.nativeFormula_(state, f.original),
                  },
                },
              ],
            },
          ],
          fields: 'userEnteredValue',
        },
      });
  r.ctx.Sheets.Spreadsheets.batchUpdate({ requests }, 'fixture-book');
  const to = r.state().tables.tProductos.find((p) => p.ID !== 'PRODUCT-A').ID;
  return {
    r,
    op: {
      process: 'traspaso_fondo',
      date: '2026-01-02',
      concept: 'Synthetic transfer',
      fromProduct: 'PRODUCT-A',
      toProduct: to,
      outUnits: 2,
      outPrice: 3,
      inUnits: 3,
      inPrice: 2,
    },
  };
}
test('fund transfer uses two cashless legs, carries basis, preserves quotes and guarded native formulas', () => {
  const { r, op } = funds(),
    before = r.state(),
    quotes = before.tables.tPrecios;
  const response = r.transact([op]);
  assert.equal(response.ok, true, response.message);
  const state = r.state(),
    transfer = r.api({ action: 'read' }).fundTransfers[0];
  assert.deepEqual(state.tables.tMovimientos, before.tables.tMovimientos);
  assert.deepEqual(state.tables.tPrecios, quotes);
  assert.equal(state.tables.tOperaciones.length, 2);
  assert.ok(state.tables.tOperaciones.every((o) => o.Movimiento === null));
  assert.equal(transfer.amount, 6);
  assert.equal(transfer.concept, op.concept);
  assert.equal(transfer.costBasis, 4);
  assert.equal(transfer.investedBasis, 4);
  assert.ok(state.technical.migrations.length > 0);
  assert.ok(
    r
      .formulas()
      .some(([, formula]) => formula.includes('_Finanzas_TraspasosFondos')),
  );
  const stable = r.state();
  assert.equal(
    r.transact([
      {
        process: 'eliminar',
        table: 'tOperaciones',
        key: { ID: transfer.outTradeID },
      },
    ]).ok,
    false,
  );
  assert.deepEqual(r.state(), stable);
  assert.equal(
    r.transact([{ process: 'anular_traspaso_fondo', id: transfer.id }]).ok,
    true,
  );
  assert.equal(r.state().tables.tOperaciones.length, 0);
  assert.equal(r.api({ action: 'read' }).fundTransfers.length, 0);
});
test('fund transfer rejects nonclosing/excess units and unknown native formula before financial mutation', () => {
  for (const change of [
    { outUnits: 6, inUnits: 9 },
    { inPrice: 3 },
    { inPrice: 2.002 },
  ]) {
    const { r, op } = funds(),
      before = r.state();
    assert.equal(r.transact([{ ...op, ...change }]).ok, false);
    assert.deepEqual(r.state(), before);
  }
  const { r, op } = funds(),
    state = r.state(),
    range = state.layout.tProductos.range;
  r.ctx.Sheets.Spreadsheets.batchUpdate(
    {
      requests: [
        {
          updateCells: {
            start: {
              sheetId: range.sheetId,
              rowIndex: range.startRowIndex + 1,
              columnIndex: range.startColumnIndex + 8,
            },
            rows: [
              {
                values: [
                  {
                    userEnteredValue: {
                      formulaValue: '=UNKNOWN_CUSTOM_FORMULA()',
                    },
                  },
                ],
              },
            ],
            fields: 'userEnteredValue',
          },
        },
      ],
    },
    'fixture-book',
  );
  const before = r.state();
  const result = r.transact([op]);
  assert.equal(result.ok, false);
  assert.match(result.message, /fórmula nativa/);
  assert.deepEqual(r.state(), before);
});

test('fund migration rejects active restoration and cancel+restore recovers formulas; replay never duplicates legs', () => {
  const { r, op } = funds(),
    formulas = r.formulas();
  const crypto = require('node:crypto'),
    envelope = {
      action: 'transact',
      requestId: crypto.randomUUID(),
      expectedRevision: r.state().revision,
      operations: [op],
    };
  assert.equal(r.api(envelope).ok, true);
  assert.equal(r.api(envelope).replayed, true);
  assert.equal(r.state().tables.tOperaciones.length, 2);
  const before = r.state();
  const migrations = JSON.parse(JSON.stringify(before.technical.migrations));
  assert.ok(migrations.length > 0);
  assert.ok(migrations.every((row) => row[1] === 'fund-transfer-v1'));
  assert.equal(
    r.transact([{ process: 'restaurar_formulas_fondos' }]).ok,
    false,
  );
  assert.deepEqual(r.state(), before);
  const id = r.api({ action: 'read' }).fundTransfers[0].id;
  assert.equal(
    r.transact([
      { process: 'anular_traspaso_fondo', id },
      { process: 'restaurar_formulas_fondos' },
    ]).ok,
    true,
  );
  assert.deepEqual(r.formulas(), formulas);
  assert.deepEqual(
    JSON.parse(JSON.stringify(r.state().technical.migrations)),
    migrations.map((row) => [
      row[0],
      'restored-fund-transfer-v1',
      ...row.slice(2),
    ]),
  );
  assert.equal(r.transact([op]).ok, true);
  assert.equal(r.api({ action: 'read' }).fundTransfers.length, 1);
});
test('metadata/transfer financial APIs authorize before reads and do not expose an arbitrary technical-write process', () => {
  const r = runtime({ visitor: 'stranger@example.test' });
  const result = r.api({
    action: 'transact',
    requestId: require('node:crypto').randomUUID(),
    expectedRevision: 'x',
    operations: [
      {
        process: 'archivar',
        kind: 'account',
        reference: 'Cuenta A',
        archived: true,
      },
    ],
  });
  assert.equal(result.error, 'ACCESS_DENIED');
  assert.equal(r.writes.length, 0);
  assert.equal(r.readBooks.length, 0);
  const safe = runtime();
  safe.init();
  const before = safe.state();
  assert.equal(
    safe.transact([{ process: 'technical', sheet: 'migrations', rows: [] }]).ok,
    false,
  );
  assert.deepEqual(safe.state(), before);
});
test('archived selectors preserve existing edit references only and linked eligibility excludes the edited recovery', () => {
  const snapshot = {
    archives: { accounts: ['Archived'], categories: ['Old'] },
    tables: {
      tCuentas: [{ Cuenta: 'Archived' }, { Cuenta: 'Live' }],
      tCategorias: [
        { Grupo: 'Gastos', Subcategoría: 'Old' },
        { Grupo: 'Gastos', Subcategoría: 'Live category' },
      ],
      tMovimientos: [
        { ID: 'ORIGINAL', Tipo: 'Gasto', Importe: 10, Recuperable: 4 },
        { ID: 'RECOVERY', Tipo: 'Cobro compartido', Importe: 3 },
      ],
      tVinculos: [{ Movimiento: 'RECOVERY', 'Vinculado a': 'ORIGINAL' }],
    },
  };
  assert.deepEqual(
    D.options('accounts', snapshot, 'gasto', { account: 'Archived' }),
    [['Live', 'Live']],
  );
  assert.deepEqual(
    D.options('accounts', snapshot, 'gasto', {
      account: 'Archived',
      _allowArchived: true,
    }),
    [
      ['Archived', 'Archived'],
      ['Live', 'Live'],
    ],
  );
  assert.equal(D.linkEligibility(snapshot, 'cobro_compartido', 'ORIGINAL'), 1);
  assert.equal(
    D.linkEligibility(snapshot, 'cobro_compartido', 'ORIGINAL', 'RECOVERY'),
    4,
  );
});

test('active template references block deletion, track renames and permit deletion after template removal', () => {
  const r = runtime();
  r.init();
  assert.equal(
    r.transact([
      {
        process: 'categoria',
        group: 'Gastos',
        subgroup: 'Synthetic',
        category: 'Synthetic',
        subcategory: 'Unused',
      },
      {
        process: 'plantilla',
        name: 'Synthetic reference',
        operation: { ...expense, category: 'Unused' },
      },
    ]).ok,
    true,
  );
  const before = r.state();
  assert.equal(
    r.transact([
      {
        process: 'eliminar',
        table: 'tCategorias',
        key: { Subcategoría: 'Unused' },
      },
    ]).ok,
    false,
  );
  assert.deepEqual(r.state(), before);
  assert.equal(
    r.transact([
      {
        process: 'renombrar',
        kind: 'subcategoria',
        from: 'Unused',
        to: 'Renamed synthetic',
      },
    ]).ok,
    true,
  );
  assert.equal(
    r.api({ action: 'read' }).templates[0].operation.category,
    'Renamed synthetic',
  );
  const id = r.api({ action: 'read' }).templates[0].id;
  assert.equal(
    r.transact([
      { process: 'quitar_plantilla', id },
      {
        process: 'eliminar',
        table: 'tCategorias',
        key: { Subcategoría: 'Renamed synthetic' },
      },
    ]).ok,
    true,
  );
});

test('unknown payroll breakdown remains null and committed revision matches reread', () => {
  const r = runtime();
  r.init();
  r.transact([
    {
      process: 'nomina',
      date: '2026-01-01',
      concept: 'Synthetic',
      account: 'Cuenta A',
      category: 'Nómina',
      amount: 80,
    },
  ]);
  const id = r.state().tables.tMovimientos[0].ID;
  const result = r.transact([
    {
      process: 'corregir_nomina',
      movement: id,
      date: '2026-01-02',
      concept: 'Synthetic corrected',
      account: 'Cuenta B',
      category: 'Nómina',
      amount: 90,
    },
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.revision, r.state().revision);
  assert.equal(r.state().tables.tNominas[0].Bruto, null);
});
test('unarchived unused category can be deleted without erasing archive history', () => {
  const r = runtime();
  r.init();
  r.transact([
    {
      process: 'categoria',
      group: 'Gastos',
      subgroup: 'Synthetic',
      category: 'Synthetic',
      subcategory: 'Unused archived',
    },
    {
      process: 'archivar',
      kind: 'category',
      reference: 'Unused archived',
      archived: true,
    },
  ]);
  assert.equal(
    r.transact([
      {
        process: 'eliminar',
        table: 'tCategorias',
        key: { Subcategoría: 'Unused archived' },
      },
    ]).ok,
    false,
  );
  assert.equal(
    r.transact([
      {
        process: 'archivar',
        kind: 'category',
        reference: 'Unused archived',
        archived: false,
      },
      {
        process: 'eliminar',
        table: 'tCategorias',
        key: { Subcategoría: 'Unused archived' },
      },
    ]).ok,
    true,
  );
  assert.equal(r.state().technical.archives.length, 1);
});

test('native gate accepts Sheets optional quote normalization without relaxing literal values', () => {
  const { r, op } = funds();
  assert.equal(r.transact([op]).ok, true);
  const state = r.state(),
    requests = [];
  for (const [key, formula] of r.formulas()) {
    if (!formula.includes('_Finanzas_TraspasosFondos')) continue;
    const [sheetId, rowIndex, columnIndex] = key.split(':').map(Number);
    requests.push({
      updateCells: {
        start: { sheetId, rowIndex, columnIndex },
        rows: [
          {
            values: [
              {
                userEnteredValue: {
                  formulaValue: formula.replace(
                    /'([A-Za-z_][A-Za-z0-9_]*)'!/g,
                    '$1!',
                  ),
                },
              },
            ],
          },
        ],
        fields: 'userEnteredValue',
      },
    });
  }
  r.ctx.Sheets.Spreadsheets.batchUpdate({ requests }, 'fixture-book');
  assert.equal(
    r.transact([
      {
        process: 'ingreso',
        date: '2026-01-02',
        concept: 'Synthetic',
        account: 'Cuenta A',
        category: 'Nómina',
        amount: 1,
      },
    ]).ok,
    true,
  );
  assert.equal(
    r.ctx.sameNativeFormula_("='Inversiones'!A1", '=Inversiones!A1'),
    true,
  );
  assert.equal(
    r.ctx.sameNativeFormula_('="\'Inversiones\'!"', '="Inversiones!"'),
    false,
  );
  assert.equal(
    r.ctx.sameNativeFormula_('=Inversiones!A1+1', '=Inversiones!A1+2'),
    false,
  );
  assert.equal(
    state.tables.tOperaciones.length,
    r.state().tables.tOperaciones.length,
  );
});

test('legacy fund-transfer schema fails closed before financial writes', () => {
  const { r, op } = funds(),
    state = r.state(),
    transferSchema = state.tech.transfers;
  r.ctx.Sheets.Spreadsheets.batchUpdate(
    {
      requests: [
        {
          updateCells: {
            start: {
              sheetId: transferSchema.id,
              rowIndex: 0,
              columnIndex: 0,
            },
            rows: [
              {
                values: transferSchema.headers.slice(0, 12).map((value) => ({
                  userEnteredValue: { stringValue: value },
                })),
              },
            ],
            fields: 'userEnteredValue',
          },
        },
        {
          updateCells: {
            start: {
              sheetId: transferSchema.id,
              rowIndex: 0,
              columnIndex: 12,
            },
            rows: [{ values: [{}, {}] }],
            fields: 'userEnteredValue',
          },
        },
      ],
    },
    'fixture-book',
  );
  const writesBefore = r.writes.length,
    result = r.api({
      action: 'transact',
      requestId: require('node:crypto').randomUUID(),
      expectedRevision: state.revision,
      operations: [op],
    });
  assert.equal(result.error, 'SCHEMA_CONFLICT');
  assert.equal(r.writes.length, writesBefore);
});

test('broker cent settlement preserves raw leg inputs and exact transferred contribution basis', () => {
  const { r, op } = funds();
  const before = r.state(),
    result = r.transact([{ ...op, inPrice: 2.001, amount: 6 }]);
  assert.equal(result.ok, true, result.message);
  const transfer = r.api({ action: 'read' }).fundTransfers[0];
  assert.equal(transfer.amount, 6);
  assert.equal(transfer.rawOut, 6);
  assert.equal(transfer.rawIn, 6.003);
  assert.ok(Math.abs(transfer.valuationResidual - 0.003) < 1e-12);
  assert.equal(transfer.costBasis, 4);
  assert.equal(transfer.investedBasis, 4);
  assert.deepEqual(r.state().tables.tMovimientos, before.tables.tMovimientos);
  const sourceCapital = 10 - 2 * 3 + (transfer.rawOut - transfer.costBasis),
    destinationCapital = 3 * 2.001 + (transfer.costBasis - transfer.rawIn);
  assert.equal(sourceCapital + destinationCapital, 10);
  assert.equal(
    r.state().tables.tOperaciones.find((t) => t.Tipo === 'Compra').Precio,
    2.001,
  );
  const stable = r.state();
  assert.equal(r.transact([{ ...op, inPrice: 2.001, amount: 6.01 }]).ok, false);
  assert.deepEqual(r.state(), stable);
  assert.ok(r.formulas().some(([, f]) => f.includes('$M$2:$M')));
  assert.ok(r.formulas().some(([, f]) => f.includes('$N$2:$N')));
});
