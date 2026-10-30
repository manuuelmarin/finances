const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  crypto = require('node:crypto');
const { Queue, namespace } = require('../web/queue.js');
const { runtime } = require('./helpers/runtime.cjs');
const clone = (x) => JSON.parse(JSON.stringify(x));
class Store {
  constructor() {
    this.data = {};
  }
  async get(key) {
    return clone(
      this.data[key] || { queue: [], snapshot: null, bookKey: null },
    );
  }
  async update(key, fn) {
    this.data[key] = fn(await this.get(key));
    return clone(this.data[key]);
  }
}
function setup(options = {}) {
  const r = runtime();
  r.init();
  const store = new Store(),
    q = new Queue(store, 'fixture', { locks: null });
  const calls = [];
  const client = {
    read: async () => r.api({ action: 'read' }),
    submit: async (envelope) => {
      calls.push(clone(envelope));
      const res = r.api(envelope);
      if (options.lost) {
        options.lost = false;
        throw Error('RESPONSE_UNCERTAIN');
      }
      return res;
    },
    requestStatus: async (envelope) =>
      r.api({ action: 'requestStatus', requestId: envelope.requestId }),
  };
  return { r, store, q, client, calls };
}
const expense = (n) => ({
  process: 'gasto',
  date: '2026-01-02',
  concept: 'Ficticio ' + n,
  account: 'Cuenta A',
  category: 'Café',
  amount: n,
});
test('cola conserva solicitud tras aplicar y perder respuesta; reapertura consulta sin duplicar', async () => {
  const { q, store, client, r, calls } = setup({ lost: true });
  await q.saveSnapshot(await client.read());
  await q.enqueue([expense(1)], 'Prueba');
  const id = (await q.get()).queue[0].envelope.requestId;
  await q.run(client);
  assert.equal((await q.get()).queue[0].status, 'uncertain');
  assert.equal(r.state().tables.tMovimientos.length, 1);
  const reopened = new Queue(store, 'fixture', { locks: null });
  await reopened.run(client);
  assert.equal((await reopened.get()).queue[0].status, 'confirmed');
  assert.equal((await reopened.get()).queue[0].envelope.requestId, id);
  assert.equal(calls.length, 1);
  assert.equal(r.state().tables.tMovimientos.length, 1);
});
test('lotes sin enviar avanzan solo por la revisión de nuestra propia confirmación', async () => {
  const { q, client, r } = setup();
  await q.saveSnapshot(await client.read());
  await q.enqueue([expense(1)], 'Uno');
  await q.enqueue([expense(2)], 'Dos');
  await q.run(client);
  assert.deepEqual(
    (await q.get()).queue.map((q) => q.status),
    ['confirmed', 'confirmed'],
  );
  assert.equal(r.state().tables.tMovimientos.length, 2);
});
test('edición externa requiere revisión: no cambia el sobre ni reenvía en silencio', async () => {
  const { q, client, r, calls } = setup();
  await q.saveSnapshot(await client.read());
  await q.enqueue([expense(1)], 'Uno');
  const original = (await q.get()).queue[0].envelope;
  r.setInput('tCuentas', 0, 'Saldo inicial', 1001);
  await q.run(client);
  assert.equal((await q.get()).queue[0].status, 'review');
  assert.deepEqual((await q.get()).queue[0].envelope, original);
  assert.equal(calls.length, 0);
});
test('libro diferente o fallo al persistir bloquea todo envío', async () => {
  const { q, client, calls } = setup();
  await q.saveSnapshot(await client.read());
  await q.enqueue([expense(1)], 'Uno');
  const read = client.read;
  client.read = async () => ({ ...(await read()), bookKey: 'otro-libro' });
  await assert.rejects(q.run(client), /BOOK_CHANGED/);
  assert.equal(calls.length, 0);
  const broken = new Queue(
    {
      get: () => q.get(),
      update: () => {
        throw Error('STORAGE_UNAVAILABLE');
      },
    },
    'fixture',
    { locks: null },
  );
  await assert.rejects(
    broken.enqueue([expense(2)], 'Dos'),
    /STORAGE_UNAVAILABLE/,
  );
  await assert.rejects(broken.run(client), /STORAGE_UNAVAILABLE/);
  assert.equal(calls.length, 0);
});
test('no elimina solicitudes sin confirmar; fallo previo se reintenta con el mismo sobre', async () => {
  const { q, client, r, calls } = setup();
  await q.saveSnapshot(await client.read());
  await q.enqueue([expense(1)], 'Uno');
  r.options.failBeforeWrite = true;
  await q.run(client);
  const item = (await q.get()).queue[0];
  assert.equal(item.status, 'uncertain');
  await assert.rejects(q.discard(item.envelope.requestId), /CANNOT_DISCARD/);
  await assert.rejects(q.clear(), /PENDING_OPERATIONS/);
  r.options.failBeforeWrite = false;
  await q.run(client);
  assert.equal((await q.get()).queue[0].status, 'confirmed');
  assert.deepEqual(calls[0], calls[1]);
  assert.equal(r.state().tables.tMovimientos.length, 1);
});
test('validación rechazada se conserva para revisar; descartar no modifica Google', async () => {
  const { q, client, r } = setup();
  await q.saveSnapshot(await client.read());
  await q.enqueue([{ ...expense(1), amount: -1 }], 'Inválido');
  await q.run(client);
  assert.equal((await q.get()).queue[0].status, 'review');
  await q.discard((await q.get()).queue[0].envelope.requestId);
  assert.equal(r.state().tables.tMovimientos.length, 0);
  await q.clear();
  assert.equal((await q.get()).snapshot, null);
});
test('cada implementación tiene un almacén separado; el bloqueo de pestañas evita dos emisores', async () => {
  assert.notEqual(
    await namespace('https://fixture-a', crypto.webcrypto),
    await namespace('https://fixture-b', crypto.webcrypto),
  );
  const { q, client, calls } = setup();
  await q.saveSnapshot(await client.read());
  await q.enqueue([expense(1)], 'Uno');
  q.locks = { request: async (name, options, fn) => fn(null) };
  const result = await q.run(client);
  assert.equal(result.status, 'busy');
  assert.equal((await q.get()).queue[0].status, 'pending');
  assert.equal(calls.length, 0);
});
test('el cliente nuevo conserva sobres compatibles con el backend anterior de pruebas', async () => {
  const { q, client, r } = setup();
  const snapshot = await client.read();
  delete snapshot.supportsBookBinding;
  await q.saveSnapshot(snapshot);
  await q.enqueue([expense(1)], 'Legacy');
  assert.equal(
    Object.hasOwn((await q.get()).queue[0].envelope, 'bookKey'),
    false,
  );
  await q.run(client);
  assert.equal((await q.get()).queue[0].status, 'confirmed');
  assert.equal(r.state().tables.tMovimientos.length, 1);
});

test('fallo del puente después de aplicar conserva la incertidumbre y recupera el recibo sin reenviar', async () => {
  const { q, store, client, r, calls } = setup();
  await q.saveSnapshot(await client.read());
  await q.enqueue([expense(1)], 'Respuesta no confirmada');
  const original = (await q.get()).queue[0].envelope;
  const submit = client.submit;
  client.submit = async (envelope) => {
    await submit(envelope);
    return {
      ok: false,
      error: 'RESPONSE_UNCERTAIN',
      message: 'Google no confirma la respuesta.',
    };
  };
  await q.run(client);
  assert.equal((await q.get()).queue[0].status, 'uncertain');
  await assert.rejects(q.discard(original.requestId), /CANNOT_DISCARD/);
  await assert.rejects(q.clear(), /PENDING_OPERATIONS/);
  const reopened = new Queue(store, 'fixture', { locks: null });
  await reopened.run(client);
  assert.equal((await reopened.get()).queue[0].status, 'confirmed');
  assert.deepEqual((await reopened.get()).queue[0].envelope, original);
  assert.equal(calls.length, 1);
  assert.equal(r.state().tables.tMovimientos.length, 1);
});

test('fallo del puente antes de aplicar consulta el journal y reintenta el mismo sobre', async () => {
  const { q, client, r, calls } = setup();
  await q.saveSnapshot(await client.read());
  await q.enqueue([expense(1)], 'Fallo antes del servidor');
  const original = (await q.get()).queue[0].envelope;
  const submit = client.submit;
  let failed = false,
    statusChecked = false;
  client.submit = async (envelope) => {
    if (!failed) {
      failed = true;
      return { ok: false, error: 'RESPONSE_UNCERTAIN' };
    }
    assert.equal(statusChecked, true);
    assert.deepEqual(envelope, original);
    return submit(envelope);
  };
  const requestStatus = client.requestStatus;
  client.requestStatus = async (envelope) => {
    statusChecked = true;
    return requestStatus(envelope);
  };
  await q.run(client);
  assert.equal((await q.get()).queue[0].status, 'uncertain');
  assert.equal(r.state().tables.tMovimientos.length, 0);
  await q.run(client);
  assert.equal((await q.get()).queue[0].status, 'confirmed');
  assert.equal(calls.length, 1);
  assert.equal(r.state().tables.tMovimientos.length, 1);
});

test('respuesta ambigua heredada como revisión se recupera sin permitir descarte ni otro UUID', async () => {
  const { q, store, client, r, calls } = setup();
  await q.saveSnapshot(await client.read());
  await q.enqueue([expense(1)], 'Cliente anterior');
  const original = (await q.get()).queue[0].envelope;
  await client.submit(original);
  await store.update('fixture', (data) => {
    data.queue[0].status = 'review';
    data.queue[0].result = { ok: false, error: 'RESPONSE_UNCERTAIN' };
    return data;
  });
  const reopened = new Queue(store, 'fixture', { locks: null });
  assert.equal((await reopened.get()).queue[0].status, 'uncertain');
  await assert.rejects(reopened.discard(original.requestId), /CANNOT_DISCARD/);
  await reopened.run(client);
  assert.equal((await reopened.get()).queue[0].status, 'confirmed');
  assert.deepEqual((await reopened.get()).queue[0].envelope, original);
  assert.equal(calls.length, 1);
  assert.equal(r.state().tables.tMovimientos.length, 1);
});

test('API_FAILED before or after commit recovers the original UUID, including legacy review entries', async () => {
  for (const committed of [false, true]) {
    const { q, store, client, r, calls } = setup();
    await q.saveSnapshot(await client.read());
    await q.enqueue([expense(7)], 'Fictional expense');
    const original = (await q.get()).queue[0].envelope;
    if (committed) await client.submit(original);
    await store.update('fixture', (data) => {
      data.queue[0].status = 'review';
      data.queue[0].result = { ok: false, error: 'API_FAILED' };
      return data;
    });
    const reopened = new Queue(store, 'fixture', { locks: null });
    assert.equal((await reopened.get()).queue[0].status, 'uncertain');
    await assert.rejects(
      reopened.discard(original.requestId),
      /CANNOT_DISCARD/,
    );
    let checked = false;
    const lookup = client.requestStatus;
    client.requestStatus = async (envelope) => {
      assert.deepEqual(envelope, original);
      checked = true;
      return lookup(envelope);
    };
    const submit = client.submit;
    client.submit = async (envelope) => {
      assert.equal(checked, true);
      return submit(envelope);
    };
    await reopened.run(client);
    assert.equal((await reopened.get()).queue[0].status, 'confirmed');
    assert.deepEqual((await reopened.get()).queue[0].envelope, original);
    assert.equal(calls.length, 1);
    assert.equal(r.state().tables.tMovimientos.length, 1);
  }
});

test('a repeated internal server failure stays recoverable and never creates another envelope', async () => {
  const { q, client, r } = setup();
  await q.saveSnapshot(await client.read());
  await q.enqueue([expense(3)], 'Fictional failure');
  const original = (await q.get()).queue[0].envelope;
  let receipts = 0,
    sends = 0;
  client.requestStatus = async () => {
    receipts++;
    return { ok: true, found: false };
  };
  client.submit = async (envelope) => {
    assert.deepEqual(envelope, original);
    sends++;
    return { ok: false, error: 'API_FAILED' };
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    const outcome = await q.run(client);
    assert.equal(outcome.status, 'unconfirmed');
    assert.equal((await q.get()).queue[0].status, 'uncertain');
    await assert.rejects(q.discard(original.requestId), /CANNOT_DISCARD/);
  }
  assert.equal(receipts, 1);
  assert.equal(sends, 2);
  assert.equal(r.state().tables.tMovimientos.length, 0);
});

test('explicit outcomes preserve confirmation and transport causes', async () => {
  const { q, client } = setup();
  await q.saveSnapshot(await client.read());
  await q.enqueue([expense(1)], 'Fixture');
  const envelope = (await q.get()).queue[0].envelope;
  const read = client.read;
  let reads = 0;
  client.read = async () => {
    if (reads++) throw Error('READ_TIMEOUT');
    return read();
  };
  const result = await q.run(client);
  assert.equal(result.status, 'confirmed');
  assert.equal(result.reason, 'POST_CONFIRM_READ_FAILED');
  assert.equal(result.readError, 'READ_TIMEOUT');
  assert.deepEqual((await q.get()).queue[0].envelope, envelope);
  assert.equal((await q.get()).queue[0].status, 'confirmed');
  assert.equal((await q.get()).queue[0].awaitingRead, true);
  client.read = read;
  await q.run(client);
  assert.equal((await q.get()).queue[0].awaitingRead, undefined);
});

test('a confirmed correction cannot accept the old snapshot just because its movement already exists', async () => {
  const { q, client, calls } = setup();
  await q.saveSnapshot(await client.read());
  await q.enqueue([expense(2)], 'Original');
  await q.run(client);
  const before = (await q.get()).snapshot;
  const movement = before.tables.tMovimientos[0];
  await q.enqueue(
    [
      {
        ...expense(7),
        process: 'editar_movimiento',
        kind: 'gasto',
        movement: movement.ID,
      },
    ],
    'Correction',
  );
  const read = client.read;
  client.read = async () => before;
  const outcome = await q.run(client);
  assert.equal(outcome.reason, 'POST_CONFIRM_SNAPSHOT_STALE');
  assert.equal((await q.get()).queue[1].awaitingRead, true);
  const reopened = new Queue(q.store, q.key, { locks: null });
  assert.equal(
    (await reopened.run(client)).reason,
    'POST_CONFIRM_SNAPSHOT_STALE',
  );
  assert.equal(calls.length, 2);
  client.read = read;
  await reopened.run(client);
  assert.equal((await reopened.get()).queue[1].awaitingRead, undefined);
  assert.equal(
    (await reopened.get()).snapshot.tables.tMovimientos[0].Importe,
    7,
  );
  assert.equal(calls.length, 2);
});

test('delayed native calculations retain the last coherent snapshot and retry only the read', async () => {
  const { q, client, calls } = setup();
  await q.saveSnapshot(await client.read());
  let ready = false;
  q.readbackReady = () => ready;
  await q.enqueue([expense(5)], 'Delayed calculations');
  assert.equal((await q.run(client)).reason, 'POST_CONFIRM_CALCULATIONS_STALE');
  assert.equal((await q.get()).snapshot.tables.tMovimientos.length, 0);
  assert.equal((await q.get()).queue[0].awaitingRead, true);
  await assert.rejects(q.clear(), /PENDING_OPERATIONS/);
  ready = true;
  assert.equal((await q.run(client)).reason, null);
  assert.equal((await q.get()).snapshot.tables.tMovimientos.length, 1);
  assert.equal((await q.get()).queue[0].awaitingRead, undefined);
  assert.equal(calls.length, 1);
});

test('recovered readback advances never-sent batches only from its own exact receipt revision', async () => {
  const { q, client, calls } = setup();
  await q.saveSnapshot(await client.read());
  await q.enqueue([expense(2)], 'First');
  await q.enqueue([expense(3)], 'Second');
  const read = client.read;
  let fail = true;
  client.read = async () => {
    if (calls.length === 1 && fail) {
      fail = false;
      throw Error('READ_TIMEOUT');
    }
    return read();
  };
  assert.equal((await q.run(client)).reason, 'POST_CONFIRM_READ_FAILED');
  const receiptRevision = (await q.get()).queue[0].result.revision;
  assert.equal((await q.run(client)).reason, null);
  assert.equal(calls[1].expectedRevision, receiptRevision);
  assert.deepEqual(
    (await q.get()).queue.map((q) => q.status),
    ['confirmed', 'confirmed'],
  );
  assert.equal(calls.length, 2);
});

test('a different readback revision does not advance a pending envelope', async () => {
  const { q, client, calls } = setup();
  await q.saveSnapshot(await client.read());
  await q.enqueue([expense(2)], 'First');
  await q.enqueue([expense(3)], 'Second');
  const initialRevision = (await q.get()).queue[1].envelope.expectedRevision;
  const read = client.read;
  client.read = async () => {
    if (calls.length === 1) throw Error('READ_TIMEOUT');
    return read();
  };
  await q.run(client);
  const fresh = await read();
  await q.saveSnapshot({ ...fresh, revision: 'unrelated-revision' });
  const pending = (await q.get()).queue[1];
  assert.equal(pending.status, 'pending');
  assert.equal(pending.envelope.expectedRevision, initialRevision);
  client.read = async () => ({ ...fresh, revision: 'unrelated-revision' });
  await q.run(client);
  assert.equal(calls.length, 1);
  assert.equal((await q.get()).queue[1].status, 'review');
});

test('missing and discarded items cannot be claimed and failures remain recoverable', async () => {
  const { q, client } = setup();
  assert.equal(await q.claim('missing'), null);
  await q.saveSnapshot(await client.read());
  await q.enqueue([expense(1)], 'Fixture');
  const id = (await q.get()).queue[0].envelope.requestId;
  await q.discard(id);
  assert.equal(await q.claim(id), null);
  await q.enqueue([expense(2)], 'Uncertain');
  client.submit = async () => {
    throw Error('GOOGLE_WINDOW_CLOSED');
  };
  const outcome = await q.run(client);
  assert.equal(outcome.status, 'unconfirmed');
  assert.equal(outcome.reason, 'GOOGLE_WINDOW_CLOSED');
  assert.equal((await q.get()).queue[1].result.error, 'GOOGLE_WINDOW_CLOSED');
});

test('historical payload cannot replace the queue-generated envelope identity', async () => {
  const { q, client } = setup();
  await q.saveSnapshot(await client.read());
  await q.enqueue(null, 'History', 'importPriceHistory', {
    product: 'fictional-product',
    rows: [{ date: '2026-01-02', price: 1 }],
    sourceVerified: true,
    requestId: 'replacement',
    action: 'transact',
    expectedRevision: 'replacement',
    bookKey: 'replacement',
  });
  const item = (await q.get()).queue[0];
  assert.notEqual(item.envelope.requestId, 'replacement');
  assert.equal(item.envelope.action, 'importPriceHistory');
  assert.notEqual(item.envelope.expectedRevision, 'replacement');
  assert.notEqual(item.envelope.bookKey, 'replacement');
});

test('exclusive lock recovers an abandoned protected claim through its receipt without resubmitting', async () => {
  const { q, store, client, calls } = setup();
  await q.saveSnapshot(await client.read());
  await q.enqueue([expense(1)], 'Abandoned browser sender');
  const original = (await q.get()).queue[0].envelope;
  await q.claim(original.requestId, true);
  await client.submit(original);
  // The old document ended without persisting a receipt or releasing its claim.
  const reopened = new Queue(store, 'fixture', {
    locks: { request: async (name, options, callback) => callback({ name }) },
  });
  const outcome = await reopened.run(client);
  assert.equal(outcome.status, 'confirmed');
  assert.equal((await reopened.get()).queue[0].status, 'confirmed');
  assert.deepEqual((await reopened.get()).queue[0].envelope, original);
  assert.equal(calls.length, 1);
});

test('exclusive lock never takes over a live claim created without lock protection', async () => {
  const { q, store, client, calls } = setup();
  await q.saveSnapshot(await client.read());
  await q.enqueue([expense(1)], 'Unlocked sender');
  const id = (await q.get()).queue[0].envelope.requestId;
  await q.claim(id);
  const reopened = new Queue(store, 'fixture', {
    locks: { request: async (name, options, callback) => callback({ name }) },
  });
  assert.equal((await reopened.run(client)).status, 'busy');
  assert.equal(calls.length, 0);
  assert.equal((await reopened.get()).queue[0].status, 'uncertain');
});

test('settled uncertainty releases only its own claim in the same saved update', async () => {
  const { q, client } = setup();
  await q.saveSnapshot(await client.read());
  await q.enqueue([expense(1)], 'Settled lost reply');
  const id = (await q.get()).queue[0].envelope.requestId;
  await q.claim(id);
  await q.enqueue([expense(2)], 'Other claim');
  const otherId = (await q.get()).queue[1].envelope.requestId;
  await q.claim(otherId);
  const otherClaim = (await q.get()).queue[1].claim;
  await q.status(id, 'uncertain', { ok: false, error: 'RESPONSE_UNCERTAIN' });
  assert.deepEqual((await q.get()).queue[1].claim, otherClaim);
  const item = (await q.get()).queue[0];
  assert.equal(item.claim, undefined);
  assert.equal(item.result.error, 'RESPONSE_UNCERTAIN');
  assert.equal(item.status, 'uncertain');
});

test('an unrelated successful price receipt never confirms an expense, including recovery', async () => {
  for (const recovered of [false, true]) {
    const { q, store, client, r, calls } = setup();
    await q.saveSnapshot(await client.read());
    await q.enqueue([expense(7)], 'Expected expense');
    const original = (await q.get()).queue[0].envelope;
    const priceReceipt = {
      ok: true,
      requestId: original.requestId,
      revision: r.state().revision,
      results: [{ product: 'PRODUCT-A', status: 'unchanged', ok: true }],
    };
    if (recovered) await q.status(original.requestId, 'uncertain');
    const send = client.submit,
      lookup = client.requestStatus;
    if (recovered) client.requestStatus = async () => priceReceipt;
    else client.submit = async () => priceReceipt;
    const outcome = await q.run(client);
    const uncertain = (await q.get()).queue[0];
    assert.equal(outcome.reason, 'RECEIPT_MISMATCH');
    assert.equal(outcome.confirmed, 0);
    assert.equal(uncertain.status, 'uncertain');
    assert.deepEqual(uncertain.envelope, original);
    assert.deepEqual(uncertain.result.received, priceReceipt);
    await assert.rejects(q.discard(original.requestId), /CANNOT_DISCARD/);
    assert.equal(r.state().tables.tMovimientos.length, 0);
    client.submit = send;
    let checked = false;
    client.requestStatus = async (envelope) => {
      checked = true;
      return lookup(envelope);
    };
    await new Queue(store, 'fixture', { locks: null }).run(client);
    assert.equal(checked, true);
    assert.equal((await q.get()).queue[0].status, 'confirmed');
    assert.deepEqual(calls, [original]);
    assert.equal(r.state().tables.tMovimientos.length, 1);
  }
});

test('receipt contract binds identity, action, book, environment and operation results while retaining legacy receipts', async () => {
  const { receiptMatches, movementReadback } = require('../web/queue.js');
  const { q, client } = setup();
  await q.saveSnapshot(await client.read());
  await q.enqueue([expense(2)], 'Receipt identity');
  const envelope = (await q.get()).queue[0].envelope;
  const result = await client.submit(envelope),
    snapshot = await client.read();
  assert.equal(result.action, envelope.action);
  assert.equal(result.bookKey, snapshot.bookKey);
  assert.equal(receiptMatches(envelope, result, snapshot), true);
  for (const patch of [
    { requestId: 'other' },
    { action: 'refreshPrices' },
    { bookKey: 'other' },
    { environment: 'production' },
    { revision: null },
    { results: [] },
    { results: [{ process: 'ingreso' }] },
    { results: [{ process: 'gasto' }] },
    { results: [{ process: 'gasto', id: 'MOV-other-1' }] },
  ])
    assert.equal(
      receiptMatches(envelope, { ...result, ...patch }, snapshot),
      false,
    );
  assert.equal(receiptMatches(envelope, { ok: true }, snapshot), false);
  const legacy = clone(result);
  delete legacy.action;
  delete legacy.bookKey;
  assert.equal(receiptMatches(envelope, legacy, snapshot), true);
  assert.equal(movementReadback({ result }, snapshot).present, true);
  assert.equal(
    movementReadback({ result }, { ...snapshot, tables: { tMovimientos: [] } })
      .present,
    false,
  );
  assert.equal(
    movementReadback(
      { result: { results: [{ product: 'PRODUCT-A' }] } },
      snapshot,
    ),
    null,
  );
});

test('post-cutoff movement remains in readback; a stale post-confirm read never resubmits the confirmed expense', async () => {
  const { movementReadback } = require('../web/queue.js');
  const { q, client, calls, r } = setup();
  const before = await client.read();
  await q.saveSnapshot(before);
  await q.enqueue([{ ...expense(3), date: '2026-01-04' }], 'After cutoff');
  const read = client.read;
  client.read = async () => before;
  const outcome = await q.run(client);
  assert.equal(outcome.reason, 'POST_CONFIRM_MOVEMENT_MISSING');
  const confirmed = (await q.get()).queue[0];
  assert.equal(confirmed.status, 'confirmed');
  assert.equal(
    movementReadback(confirmed, (await q.get()).snapshot).present,
    false,
  );
  // Model an operator-selected earlier reporting cut after the cash write.
  assert.equal(
    r.transact([{ process: 'fechas', asof: before.settings.asof }]).ok,
    true,
  );
  client.read = read;
  await q.run(client);
  assert.equal(calls.length, 1);
  const current = (await q.get()).snapshot;
  assert.equal(current.settings.asof, before.settings.asof);
  assert.equal(current.tables.tMovimientos[0].Fecha, '2026-01-04');
  assert.equal(movementReadback(confirmed, current).present, true);
});
