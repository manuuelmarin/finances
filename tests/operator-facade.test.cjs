const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runtime } = require('./helpers/runtime.cjs');

const operators = [
  'prepareApplication',
  'checkApplication',
  'enableDailyPrices',
  'updatePrices',
  'disableDailyPrices',
];

function stubOperatorImplementations(r) {
  const calls = [];
  const result = (name) => {
    calls.push(name);
    return { ok: true, selected: name };
  };
  r.ctx.prepareApplication_ = () => result('prepareApplication_');
  r.ctx.checkClosure_ = () => result('checkClosure_');
  r.ctx.dailyPriceStatus_ = () => ({ enabled: false });
  r.ctx.activateDailyPricesTest_ = () => result('activateDailyPricesTest_');
  r.ctx.activateDailyPricesProduction_ = () =>
    result('activateDailyPricesProduction_');
  r.ctx.updatePricesTest_ = () => result('updatePricesTest_');
  r.ctx.updatePricesProduction_ = () => result('updatePricesProduction_');
  r.ctx.deactivateDailyPricesTest_ = () => result('deactivateDailyPricesTest_');
  r.ctx.deactivateDailyPricesProduction_ = () =>
    result('deactivateDailyPricesProduction_');
  return calls;
}

test('las cinco operaciones públicas despachan al entorno de prueba autorizado y registran cada resultado', () => {
  const r = runtime();
  const calls = stubOperatorImplementations(r);
  for (const name of operators) assert.equal(typeof r.ctx[name], 'function');
  r.ctx.prepareApplication();
  r.ctx.checkApplication();
  r.ctx.enableDailyPrices();
  r.ctx.updatePrices();
  r.ctx.disableDailyPrices();
  assert.deepEqual(calls, [
    'prepareApplication_',
    'checkClosure_',
    'activateDailyPricesTest_',
    'updatePricesTest_',
    'deactivateDailyPricesTest_',
  ]);
  assert.equal(r.logs.length, 5);
  assert.deepEqual(
    r.logs.map((entry) => JSON.parse(entry).selected),
    calls,
  );
});

test('las operaciones de precios seleccionan producción solo con configuración autorizada y aislada', () => {
  const r = runtime({
    properties: {
      ENVIRONMENT: 'production',
      PRODUCTION_SPREADSHEET_ID: 'production-book',
    },
  });
  const calls = stubOperatorImplementations(r);
  r.ctx.enableDailyPrices();
  r.ctx.updatePrices();
  r.ctx.disableDailyPrices();
  assert.deepEqual(calls, [
    'activateDailyPricesProduction_',
    'updatePricesProduction_',
    'deactivateDailyPricesProduction_',
  ]);
  assert.equal(r.readBooks.length, 0);

  const duplicateBook = runtime({
    properties: {
      ENVIRONMENT: 'production',
      PRODUCTION_SPREADSHEET_ID: 'fixture-book',
    },
  });
  const deniedCalls = stubOperatorImplementations(duplicateBook);
  assert.equal(duplicateBook.ctx.enableDailyPrices().error, 'NOT_CONFIGURED');
  assert.equal(duplicateBook.ctx.updatePrices().error, 'NOT_CONFIGURED');
  assert.equal(duplicateBook.ctx.disableDailyPrices().error, 'NOT_CONFIGURED');
  assert.deepEqual(deniedCalls, []);
});

test('ninguna operación pública accede al libro ni despacha con propietario incorrecto', () => {
  const r = runtime({ visitor: 'other@example.test' });
  const prepareApplication = r.ctx.prepareApplication_;
  const calls = stubOperatorImplementations(r);
  r.ctx.prepareApplication_ = prepareApplication;
  for (const name of operators)
    assert.equal(r.ctx[name]().error, 'ACCESS_DENIED', name);
  assert.deepEqual(calls, []);
  assert.equal(r.readBooks.length, 0);
  assert.equal(r.writeBooks.length, 0);
});

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, 'apps-script/modules.json'), 'utf8'),
);

test('los módulos nativos se evalúan en orden normal e inverso sin depender del orden de carga', () => {
  for (const scripts of [manifest.scripts, [...manifest.scripts].reverse()]) {
    const context = vm.createContext({});
    for (const filename of scripts)
      vm.runInContext(
        fs.readFileSync(path.join(root, 'apps-script', filename), 'utf8'),
        context,
        { filename },
      );
    for (const name of [
      'prepareApplication',
      'checkApplication',
      'enableDailyPrices',
      'updatePrices',
      'disableDailyPrices',
      'doGet',
      'financialApiJson',
    ])
      assert.equal(typeof context[name], 'function', name);
  }
});
