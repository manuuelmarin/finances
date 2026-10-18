const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { runtime } = require('./helpers/runtime.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { buildRuntime } = require('../tools/build-runtime.cjs');
const bundle = buildRuntime();
const services = [
  'console',
  'Utilities',
  'CacheService',
  'UrlFetchApp',
  'PropertiesService',
  'Session',
  'LockService',
  'Sheets',
  'ScriptApp',
  'HtmlService',
];
function installed(environment, legacy = false) {
  const id =
    environment === 'production' ? 'production-fixture' : 'fixture-book';
  const r = runtime({
    bookId: id,
    properties: {
      ENVIRONMENT: environment,
      PRODUCTION_SPREADSHEET_ID: 'production-fixture',
    },
  });
  r.init();
  const ctx =
    legacy === true
      ? r.ctx
      : vm.createContext(
          Object.fromEntries(
            services
              .filter((key) => r.ctx[key])
              .map((key) => [key, r.ctx[key]]),
          ),
        );
  vm.runInContext(bundle, ctx);
  if (legacy === 'after') {
    const directory = path.resolve(__dirname, '../apps-script');
    const manifest = JSON.parse(
      fs.readFileSync(path.join(directory, 'modules.json'), 'utf8'),
    );
    for (const name of [...manifest.scripts]
      .reverse()
      .filter((name) => name !== 'Code.gs'))
      vm.runInContext(fs.readFileSync(path.join(directory, name), 'utf8'), ctx);
  }
  // Both missing helpers reported by the owner are deliberately broken globally.
  ctx.applyOperations_ = undefined;
  ctx.capacityReady_ = () => {
    throw Error('STALE_MODULE');
  };
  ctx.prepareCapacity_ = undefined;
  const api = (request) =>
    JSON.parse(ctx.financialApiJson(JSON.stringify(request)));
  return { r, ctx, api };
}
for (const environment of ['test', 'production']) {
  for (const legacy of [false, true, 'after']) {
    test(`installed backend sends and recovers exactly once: ${environment}, legacy=${legacy}`, () => {
      const { r, ctx, api } = installed(environment, legacy);
      const before = r.writes.length;
      const diagnostic = ctx.checkSending();
      assert.equal(diagnostic.ok, true);
      assert.equal(diagnostic.prepared, true);
      assert.equal(diagnostic.runtimeDelivery, 'single-file');
      assert.equal(diagnostic.writeVerified, false);
      assert.equal(r.writes.length, before);
      const state = r.state();
      const envelope = {
        action: 'transact',
        bookKey: state.bookKey,
        requestId: crypto.randomUUID(),
        expectedRevision: state.revision,
        operations: [
          {
            process: 'gasto',
            date: '2026-01-02',
            concept: 'Fictional bundled expense',
            account: 'Cuenta A',
            category: 'Café',
            amount: 12,
            recurring: false,
          },
        ],
      };
      r.options.failBeforeWrite = true;
      assert.equal(api(envelope).error, 'WRITE_UNCERTAIN');
      assert.equal(r.state().tables.tMovimientos.length, 0);
      r.options.failBeforeWrite = false;
      r.options.loseResponseOnce = true;
      const result = api(envelope);
      assert.equal(result.ok, true);
      assert.equal(result.replayed, true);
      assert.equal(
        api({
          action: 'requestStatus',
          bookKey: state.bookKey,
          requestId: envelope.requestId,
        }).replayed,
        true,
      );
      const writes = r.writes.length;
      assert.equal(api(envelope).replayed, true);
      assert.equal(r.writes.length, writes);
      assert.equal(r.state().tables.tMovimientos.length, 1);
      assert.equal(r.state().technical.requests.length, 1);
      assert.equal(
        api({
          ...envelope,
          requestId: crypto.randomUUID(),
          bookKey: 'another-book',
        }).error,
        'BOOK_CHANGED',
      );
      r.options.visitor = 'other@example.test';
      assert.equal(api({ action: 'read' }).error, 'ACCESS_DENIED');
    });
  }
}
