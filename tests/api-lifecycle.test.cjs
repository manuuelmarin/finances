const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { FinanceApiClient } = require('../web/api.js');
global.acceptsConnectionMessage =
  require('../web/connection.js').acceptsConnectionMessage;
function channel() {
  const listeners = new Set(),
    timers = new Map(),
    polls = new Map(),
    sent = [];
  let count = 0;
  const popup = {
    closed: false,
    close() {
      this.closed = true;
    },
  };
  const source = { top: popup, postMessage: (data) => sent.push(data) };
  const runtime = {
    crypto,
    open: () => popup,
    addEventListener: (_, fn) => listeners.add(fn),
    removeEventListener: (_, fn) => listeners.delete(fn),
    setTimeout: (fn) => {
      timers.set(++count, fn);
      return count;
    },
    clearTimeout: (id) => timers.delete(id),
    setInterval: (fn) => {
      polls.set(++count, fn);
      return count;
    },
    clearInterval: (id) => polls.delete(id),
  };
  const client = new FinanceApiClient(
    'https://script.google.com/macros/s/fixture-channel/exec',
    runtime,
  );
  const emit = (data) => {
    for (const fn of listeners)
      fn({
        origin: 'https://fixture-script.googleusercontent.com',
        source,
        data,
      });
  };
  return { client, popup, source, emit, listeners, timers, polls, sent };
}
async function connected(c, extra = {}) {
  const p = c.client.connect();
  c.emit({
    type: 'finances.connection.v1',
    state: c.client.session.state,
    ok: true,
    apiVersion: '3.3.0',
    apiTransport: 'finances.rpc.json.v1',
    rpcReady: true,
    modelVersion: 3,
    sheetCount: 10,
    environment: 'test',
    checkedAt: '2026-01-02T00:00:00Z',
    ...extra,
  });
  await p;
}
test('cerrar una conexión antes del saludo rechaza y retira listener, timer y popup', async () => {
  const c = channel();
  const p = c.client.connect();
  c.client.close();
  await assert.rejects(p, /NOT_CONNECTED/);
  assert.equal(c.listeners.size, 0);
  assert.equal(c.timers.size, 0);
  assert.equal(c.polls.size, 0);
  assert.equal(c.popup.closed, true);
});
test('un puente antiguo se rechaza al saludar, sin intentar llamadas financieras', async () => {
  const c = channel();
  const p = c.client.connect();
  c.emit({
    type: 'finances.connection.v1',
    state: c.client.session.state,
    ok: true,
    apiVersion: '3.3.0',
    modelVersion: 3,
    sheetCount: 10,
    environment: 'test',
    checkedAt: '2026-01-02T00:00:00Z',
  });
  await assert.rejects(p, /UPDATE_REQUIRED/);
  assert.equal(c.sent.length, 0);
});
test('el tiempo de espera y cierre distinguen lectura fallida de envío incierto', async () => {
  for (const action of ['read', 'transact']) {
    const c = channel();
    await connected(c);
    const request = c.client.request({ action });
    [...c.timers.values()][0]();
    await assert.rejects(
      request,
      action === 'read' ? /READ_TIMEOUT/ : /RESPONSE_UNCERTAIN/,
    );
    assert.equal(c.listeners.size, 0);
    assert.equal(c.polls.size, 0);
    c.client.close();
  }
});
test('el progreso solo procede del marco autorizado y no prolonga el límite total', async () => {
  const c = channel();
  await connected(c);
  const progress = [];
  c.client.onProgress = (p) => progress.push(p);
  const request = c.client.request({ action: 'read' }),
    m = c.sent[0];
  c.emit({
    type: 'finances.api.progress.v1',
    state: m.state,
    callId: m.callId,
    phase: 'received',
  });
  c.emit({
    type: 'finances.api.progress.v1',
    state: m.state,
    callId: m.callId,
    phase: 'unknown',
  });
  assert.equal(progress.length, 1);
  assert.equal(c.timers.size, 1);
  c.emit({
    type: 'finances.api.response.v1',
    state: m.state,
    callId: m.callId,
    result: { ok: true },
  });
  await request;
  c.client.close();
});
test('snapshot RPC incompleto no sustituye la revisión validada del cliente', async () => {
  const c = channel();
  await connected(c);
  c.client.revision = 'previous-valid';
  const request = c.client.read(),
    m = c.sent[0];
  c.emit({
    type: 'finances.api.response.v1',
    state: m.state,
    callId: m.callId,
    result: { ok: true, revision: 'invalid-copy' },
  });
  await assert.rejects(request, /INVALID_SNAPSHOT/);
  assert.equal(c.client.revision, 'previous-valid');
  c.client.close();
});
