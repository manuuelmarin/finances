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
  await q.run(client);
  assert.equal(calls.length, 0);
});
test('el cliente nuevo conserva sobres compatibles con el backend anterior de pruebas', async () => {
  const { q, client } = setup();
  const snapshot = await client.read();
  delete snapshot.supportsBookBinding;
  await q.saveSnapshot(snapshot);
  await q.enqueue([expense(1)], 'Legacy');
  assert.equal(
    Object.hasOwn((await q.get()).queue[0].envelope, 'bookKey'),
    false,
  );
});
