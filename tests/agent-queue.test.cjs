const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  os = require('node:os'),
  path = require('node:path');
const { openQueue, FileStore } = require('../tools/agent-queue.cjs'),
  { prepare } = require('../tools/agent-envelope.cjs'),
  { runtime } = require('./helpers/runtime.cjs');
const deploymentUrl = 'https://script.google.com/macros/s/fixture/exec';
const expense = {
  process: 'gasto',
  date: '2026-01-02',
  concept: 'Ficticio',
  account: 'Cuenta A',
  category: 'Café',
  amount: 1,
};
async function directory(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'finance-agent-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}
test('agente persiste antes de enviar y recupera cierre/respuesta perdida sin duplicar', async (t) => {
  const dir = await directory(t),
    r = runtime();
  r.init();
  let lost = true,
    sends = 0;
  const client = {
    read: async () => r.api({ action: 'read' }),
    submit: async (envelope) => {
      sends++;
      const res = r.api(envelope);
      if (lost) {
        lost = false;
        throw Error('RESPONSE_UNCERTAIN');
      }
      return res;
    },
    requestStatus: async (envelope) =>
      r.api({
        action: 'requestStatus',
        requestId: envelope.requestId,
        bookKey: envelope.bookKey,
      }),
  };
  const q = await openQueue({ directory: dir, deploymentUrl });
  await q.saveSnapshot(await client.read());
  await q.enqueue([expense], 'Ficticio');
  const original = (await q.get()).queue[0].envelope;
  await q.run(client);
  assert.equal((await q.get()).queue[0].status, 'uncertain');
  const reopened = await openQueue({ directory: dir, deploymentUrl });
  await reopened.run(client);
  assert.equal((await reopened.get()).queue[0].status, 'confirmed');
  assert.deepEqual((await reopened.get()).queue[0].envelope, original);
  assert.equal(sends, 1);
  assert.equal(r.state().tables.tMovimientos.length, 1);
  const files = await fs.readdir(dir);
  assert.equal(files.length, 1);
  if (process.platform !== 'win32')
    assert.equal((await fs.stat(path.join(dir, files[0]))).mode & 0o777, 0o600);
});
test('otro libro conserva pendientes y bloquea al agente antes de enviar', async (t) => {
  const dir = await directory(t),
    q = await openQueue({ directory: dir, deploymentUrl }),
    r = runtime();
  r.init();
  const snap = r.api({ action: 'read' });
  await q.saveSnapshot(snap);
  await q.enqueue([expense], 'Ficticio');
  let sends = 0;
  await assert.rejects(
    q.run({
      read: async () => ({ ...snap, bookKey: 'different' }),
      submit: async () => {
        sends++;
      },
    }),
    /BOOK_CHANGED/,
  );
  assert.equal(sends, 0);
  assert.equal((await q.get()).queue[0].status, 'pending');
  const other = await openQueue({
    directory: dir,
    deploymentUrl: deploymentUrl.replace('fixture', 'other'),
  });
  assert.equal((await other.get()).queue.length, 0);
});
test('bloqueo o archivo corrupto impide reemplazar datos de la cola', async (t) => {
  const dir = await directory(t),
    file = path.join(dir, 'store.json'),
    store = new FileStore(file);
  await store.update('key', () => ({ queue: [{ status: 'pending' }] }));
  const original = await fs.readFile(file, 'utf8');
  await fs.writeFile(file + '.lock', 'owner');
  await assert.rejects(
    store.update('key', () => ({})),
    /STORAGE_BUSY/,
  );
  assert.equal(await fs.readFile(file, 'utf8'), original);
  await fs.unlink(file + '.lock');
  await fs.writeFile(file, 'bad json');
  await assert.rejects(
    store.update('key', () => ({})),
    /STORAGE_UNAVAILABLE/,
  );
  assert.equal(await fs.readFile(file, 'utf8'), 'bad json');
});
test('adaptador genera referencias y vínculo de libro para ambos entornos; datos desconocidos se rechazan', () => {
  for (const environment of ['test', 'production']) {
    const snap = {
        environment,
        apiVersion: '3.3.0',
        bookKey: 'fixture-hash',
        supportsBookBinding: true,
        revision: 'r1',
      },
      envelope = prepare(snap, [expense]);
    assert.equal(envelope.bookKey, snap.bookKey);
    assert.match(envelope.requestId, /^[a-f0-9-]{36}$/);
    assert.notEqual(envelope.requestId, prepare(snap, [expense]).requestId);
  }
  assert.throws(
    () =>
      prepare(
        {
          environment: 'unknown',
          apiVersion: '3.3.0',
          bookKey: 'b',
          revision: 'r',
        },
        [expense],
      ),
    /READ_REQUIRED/,
  );
});
