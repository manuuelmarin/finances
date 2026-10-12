const { test } = require('node:test');
const assert = require('node:assert/strict');
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

test('la fachada publica elimina los nombres de operador antiguos sin aliases', () => {
  const context = vm.createContext({});
  for (const filename of manifest.scripts)
    vm.runInContext(
      fs.readFileSync(path.join(root, 'apps-script', filename), 'utf8'),
      context,
      { filename },
    );
  for (const name of [
    'comprobarInstalacion',
    'comprobarPaso3',
    'probarTransaccionesPaso3',
    'comprobarPaso4',
    'probarFuentesPaso4',
    'actualizarPreciosPaso4',
    'comprobarPaso5',
    'comprobarCierre',
    'financialApi',
  ])
    assert.equal(context[name], undefined, name);
});
