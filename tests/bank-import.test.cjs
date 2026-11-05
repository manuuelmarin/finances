const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { runtime } = require('./helpers/runtime.cjs');
const I = require('../web/bank-import.js');
const { Queue } = require('../web/queue.js');

test('CSV mapping keeps identical legitimate purchases separate and highlights possible existing movements', () => {
  const rows = I.parse(
    'Fecha;Concepto;Importe;Referencia\n02/01/2026;Café;-2,50;one\n02/01/2026;Café;-2,50;two',
    ';',
  );
  const snapshot = {
    tables: {
      tCuentas: [{ Cuenta: 'Banco' }],
      tMovimientos: [
        {
          ID: 'old',
          Fecha: '2026-01-02',
          Tipo: 'Gasto',
          Origen: 'Banco',
          Importe: 2.5,
        },
      ],
    },
    bankImports: [{ account: 'Banco', reference: 'one', movement: 'old' }],
  };
  const result = I.prepare(
    rows,
    { date: 0, concept: 1, amount: 2, reference: 3 },
    { account: 'Banco', dateFormat: 'dmy', decimal: ',' },
    snapshot,
  );
  assert.equal(result[0].existing, 'old');
  assert.equal(result[1].existing, null);
  assert.deepEqual(result[1].possible, ['old']);
  assert.throws(
    () =>
      I.prepare(
        rows,
        { date: 0, concept: 1, amount: 2, reference: 2 },
        { account: 'Banco', dateFormat: 'dmy', decimal: ',' },
        snapshot,
      ),
    /cuatro columnas distintas/,
  );
  assert.throws(() => I.parse('a;b\n"sin cierre;x', ';'), /Comillas/);
  assert.throws(
    () =>
      I.prepare(
        I.parse('a;b;c;d\n31/02/2026;X;12,00;id', ';'),
        { date: 0, concept: 1, amount: 2, reference: 3 },
        { account: 'Banco', dateFormat: 'dmy', decimal: ',' },
        snapshot,
      ),
    /Fecha inexistente/,
  );
});

test('bank references are persisted atomically and reject a second request without touching the book', () => {
  const r = runtime();
  r.init();
  const op = {
    process: 'gasto',
    date: '2026-01-02',
    concept: 'Café',
    account: 'Cuenta A',
    category: 'Café',
    amount: 2.5,
    bankRef: 'BANK-ONE',
  };
  const before = r.state();
  const envelope = {
    action: 'transact',
    requestId: crypto.randomUUID(),
    expectedRevision: before.revision,
    operations: [op],
  };
  assert.equal(r.api(envelope).ok, true);
  assert.equal(r.api(envelope).replayed, true);
  const read = r.api({ action: 'read' });
  assert.equal(read.bankImports[0].reference, 'BANK-ONE');
  const saved = r.state();
  assert.equal(r.transact([op]).ok, false);
  assert.deepEqual(r.state(), saved);
  assert.equal(r.transact([{ ...op, bankRef: 'BANK-TWO' }]).ok, true);
  assert.equal(r.state().tables.tMovimientos.length, 2);
  assert.equal(
    r.transact([
      {
        process: 'renombrar',
        kind: 'cuenta',
        from: 'Cuenta A',
        to: 'Cuenta renombrada',
      },
    ]).ok,
    true,
  );
  const renamed = r.state();
  assert.equal(r.transact([{ ...op, account: 'Cuenta renombrada' }]).ok, false);
  assert.deepEqual(r.state(), renamed);
});

test('a lost response recovers the original import without duplicating the movement or reference', () => {
  const r = runtime();
  r.init();
  r.options.loseResponseOnce = true;
  const result = r.transact([
    {
      process: 'gasto',
      date: '2026-01-02',
      concept: 'Café',
      account: 'Cuenta A',
      category: 'Café',
      amount: 2.5,
      bankRef: 'lost-response',
    },
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.replayed, true);
  assert.equal(r.state().tables.tMovimientos.length, 1);
  assert.equal(r.state().technical.bankImports.length, 1);
});

test('a changed snapshot blocks an import before it enters the queue', async () => {
  let data = {
    snapshot: { revision: 'new', bookKey: 'book' },
    bookKey: 'book',
    queue: [],
  };
  const store = {
    get: async () => data,
    update: async (_key, callback) => {
      data = callback(data);
      return data;
    },
  };
  const queue = new Queue(store, 'fixture', { locks: null });
  await assert.rejects(
    queue.enqueue([], 'Extracto', 'transact', null, 'old'),
    /CONFLICT/,
  );
  assert.equal(data.queue.length, 0);
});

test('duplicate references in one batch reject the whole import', () => {
  const r = runtime();
  r.init();
  const before = r.state();
  const expense = {
    process: 'gasto',
    date: '2026-01-02',
    concept: 'Café',
    account: 'Cuenta A',
    category: 'Café',
    amount: 2.5,
    bankRef: 'same-reference',
  };
  assert.equal(
    r.transact([expense, { ...expense, concept: 'Segundo café' }]).ok,
    false,
  );
  assert.deepEqual(r.state(), before);
});
