const { test } = require('node:test'),
  assert = require('node:assert/strict');
const { acceptsApiMessage } = require('../web/api.js');
const popup = {},
  source = { top: popup },
  session = {
    popup,
    source,
    origin: 'https://example-script.googleusercontent.com',
    state: 'session-nonce',
  },
  callId = 'call-nonce';
const good = () => ({
  origin: 'https://example-script.googleusercontent.com',
  source,
  data: {
    type: 'finances.api.response.v1',
    state: session.state,
    callId,
    result: { ok: true },
  },
});
test('canal API acepta solo Google, la ventana iniciada y referencias correspondientes', () => {
  assert.equal(acceptsApiMessage(good(), session, callId), true);
  for (const changed of [
    { origin: 'https://example.com' },
    { origin: 'https://script.googleusercontent.com.example.com' },
    { origin: 'https://another-script.googleusercontent.com' },
    { source: { top: popup } },
    { source: { top: {} } },
    { source: null },
    { data: { ...good().data, state: 'another' } },
    { data: { ...good().data, callId: 'another' } },
    { data: { ...good().data, type: 'finances.connection.v1' } },
    { data: { ...good().data, result: { ok: 'true' } } },
  ])
    assert.equal(
      acceptsApiMessage({ ...good(), ...changed }, session, callId),
      false,
    );
  assert.equal(acceptsApiMessage(good(), null, callId), false);
});
test('el cliente bloquea conexiones desde páginas incrustadas antes de abrir Google', async () => {
  const { FinanceApiClient } = require('../web/api.js');
  let opened = false;
  const client = new FinanceApiClient(
    'https://script.google.com/macros/s/fixture-deployment/exec',
    { top: {}, self: {}, open: () => (opened = true) },
  );
  await assert.rejects(client.connect(), /EMBEDDED_CONTEXT/);
  assert.equal(opened, false);
});
test('una respuesta de una sesión cerrada no actualiza el libro de la sesión nueva', async () => {
  const { FinanceApiClient } = require('../web/api.js');
  let listener, timeout;
  const client = new FinanceApiClient(
    'https://script.google.com/macros/s/fixture-deployment/exec',
    {
      crypto: { randomUUID: () => callId },
      addEventListener: (_, fn) => (listener = fn),
      removeEventListener: () => {},
      setTimeout: (fn) => (timeout = fn),
      clearTimeout: () => {},
    },
  );
  client.session = { ...session, source: { ...source, postMessage() {} } };
  const previous = client.session;
  const request = client.read();
  client.session = { ...session, state: 'next-session' };
  listener({
    ...good(),
    source: previous.source,
    data: { ...good().data, result: { ok: true, revision: 'stale' } },
  });
  assert.equal(client.revision, null);
  timeout();
  await assert.rejects(request, /RESPONSE_UNCERTAIN/);
});
test('Bridge valida origen, ventana, sesión y llamada antes de ejecutar la función autenticada de Google', () => {
  const fs = require('node:fs'),
    vm = require('node:vm'),
    path = require('node:path');
  const html = fs.readFileSync(
    path.join(__dirname, '../apps-script/Bridge.html'),
    'utf8',
  );
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const calls = [],
    messages = [],
    opener = { postMessage: (v, origin) => messages.push({ v, origin }) };
  let listener;
  const payload = {
    ok: true,
    environment: 'test',
    modelVersion: 3,
    sheetCount: 10,
    state: 'session-nonce',
  };
  const runner = {
    withSuccessHandler(fn) {
      this.success = fn;
      return this;
    },
    withFailureHandler(fn) {
      return this;
    },
    financialApi(request) {
      calls.push(request);
      this.success({ ok: true });
    },
  };
  const elements = {
    payload: { textContent: JSON.stringify(payload) },
    origin: { textContent: 'https://manuuelmarin.github.io' },
    status: {},
    detail: {},
  };
  vm.runInNewContext(script, {
    window: {
      top: { opener },
      addEventListener: (type, fn) => (listener = fn),
    },
    document: { getElementById: (id) => elements[id] },
    google: { script: { run: runner } },
  });
  const valid = {
    origin: 'https://manuuelmarin.github.io',
    source: opener,
    data: {
      type: 'finances.api.request.v1',
      state: 'session-nonce',
      callId: '68c0eea1-d067-4af1-a61d-e5b27aacb0b9',
      request: { action: 'read' },
    },
  };
  for (const changed of [
    { origin: 'https://example.com' },
    { source: {} },
    { data: { ...valid.data, state: 'another' } },
    { data: { ...valid.data, callId: 'invalid' } },
    { data: { ...valid.data, type: 'other' } },
  ])
    listener({ ...valid, ...changed });
  assert.equal(calls.length, 0);
  listener(valid);
  assert.equal(calls.length, 1);
  assert.equal(messages.at(-1).v.type, 'finances.api.response.v1');
  assert.equal(messages.at(-1).origin, 'https://manuuelmarin.github.io');
});
test('cliente prepara actualización con UUID automático y revisión, y conserva el sobre para reintentos', () => {
  const { FinanceApiClient } = require('../web/api.js'),
    crypto = require('node:crypto');
  const client = new FinanceApiClient(
    'https://script.google.com/macros/s/fixture-deployment/exec',
    { crypto },
  );
  assert.throws(() => client.preparePrices(['Fondo A']), /READ_REQUIRED/);
  client.revision = 'book-revision';
  const envelope = client.preparePrices(['Fondo A']);
  assert.equal(envelope.action, 'refreshPrices');
  assert.equal(envelope.expectedRevision, 'book-revision');
  assert.match(envelope.requestId, /^[0-9a-f-]{36}$/);
  assert.deepEqual(envelope.products, ['Fondo A']);
  const calls = [];
  client.request = (body) => {
    calls.push(body);
    return body;
  };
  client.submit(envelope);
  client.submit(envelope);
  assert.equal(calls[0], calls[1]);
  client.quotePrices([
    { isin: 'ES0112611001', referenceName: 'Azvalor Internacional' },
  ]);
  assert.equal(calls.at(-1).action, 'quotePrices');
  client.requestStatus(envelope);
  assert.equal(calls.at(-1).requestId, envelope.requestId);
});
