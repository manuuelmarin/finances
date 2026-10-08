const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const { runtime } = require('./helpers/runtime.cjs');

test('el transporte JSON autentica antes de tocar Sheets y conserva el contrato de agentes', () => {
  for (const visitor of ['', 'other@example.test']) {
    const r = runtime({ visitor });
    assert.equal(
      JSON.parse(r.ctx.financialApiJson('{"action":"read"}')).error,
      'ACCESS_DENIED',
    );
    assert.equal(
      JSON.parse(r.ctx.financialApiJson('{"action":"ping"}')).error,
      'ACCESS_DENIED',
    );
    assert.equal(r.readBooks.length, 0);
    assert.equal(r.writes.length, 0);
  }
  const r = runtime();
  r.init();
  const json = JSON.parse(r.ctx.financialApiJson('{"action":"read"}'));
  const direct = r.api({ action: 'read' });
  assert.equal(json.revision, direct.revision);
  assert.deepEqual(json.tables, direct.tables);
  assert.deepEqual(json.summary, direct.summary);
  assert.equal(json.bookKey, direct.bookKey);
});

test('ping comprueba el servidor autenticado sin leer ni modificar registros', () => {
  const r = runtime();
  const result = JSON.parse(r.ctx.financialApiJson('{"action":"ping"}'));
  assert.equal(result.ok, true);
  assert.equal(result.buildVersion, '3.6.0');
  assert.equal(result.apiTransport, 'finances.rpc.json.v1');
  assert.equal(result.environment, 'test');
  assert.equal(r.readBooks.length, 0);
  assert.equal(r.writes.length, 0);
  for (const json of [
    '{',
    'null',
    '[]',
    'false',
    '"x"',
    '{"action":"ping","bookKey":"other"}',
    'x'.repeat(60001),
  ])
    assert.equal(JSON.parse(r.ctx.financialApiJson(json)).ok, false);
});

test('la carga inicial privada lleva el mismo snapshot que read, sin escribir y sin permitir cambiar de libro', () => {
  const r = runtime();
  r.init();
  let template;
  r.ctx.HtmlService = {
    createTemplateFromFile() {
      template = {
        getRawContent: () => fs.readFileSync('apps-script/Bridge.html', 'utf8'),
        evaluate: () => ({ setTitle: () => JSON.parse(template.payloadJson) }),
      };
      return template;
    },
  };
  const writes = r.writes.length;
  const result = r.ctx.doGet({
    parameter: {
      state: crypto.randomUUID(),
      read: '1',
      spreadsheetId: 'another-book',
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.snapshot.ok, true);
  assert.equal(result.sheetCount, 10);
  assert.equal(result.buildVersion, '3.6.0');
  assert.equal(result.snapshot.revision, r.api({ action: 'read' }).revision);
  assert.deepEqual(
    JSON.parse(JSON.stringify(result.snapshot.tables)),
    r.api({ action: 'read' }).tables,
  );
  assert.ok(r.readBooks.every((id) => id === 'fixture-book'));
  assert.equal(r.writes.length, writes);
  assert.equal(template.appOrigin, 'https://manuuelmarin.github.io');
});

test('las operaciones JSON conservan atomicidad, UUID, journal y correcciones del contrato original', () => {
  const r = runtime();
  r.init();
  const snap = r.api({ action: 'read' });
  const envelope = {
    action: 'transact',
    requestId: crypto.randomUUID(),
    expectedRevision: snap.revision,
    bookKey: snap.bookKey,
    operations: [
      {
        process: 'gasto',
        date: '2026-01-02',
        concept: 'Prueba ficticia',
        account: 'Cuenta A',
        category: 'Café',
        amount: 1.23,
      },
    ],
  };
  const json = JSON.stringify(envelope);
  const first = JSON.parse(r.ctx.financialApiJson(json));
  assert.equal(first.ok, true);
  const retry = JSON.parse(r.ctx.financialApiJson(json));
  assert.equal(retry.replayed, true);
  assert.equal(r.state().tables.tMovimientos.length, 1);
  const receipt = JSON.parse(
    r.ctx.financialApiJson(
      JSON.stringify({
        action: 'requestStatus',
        requestId: envelope.requestId,
        bookKey: snap.bookKey,
      }),
    ),
  );
  assert.equal(receipt.replayed, true);
  assert.equal(receipt.revision, first.revision);
});
