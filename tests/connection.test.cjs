const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { acceptsConnectionMessage, validDeploymentUrl } = require('../web/connection.js');

const state = '68c0eea1-d067-4af1-a61d-e5b27aacb0b9';
const popup = {};
const pending = { popup, state };
const goodMessage = () => ({
  origin: 'https://example-script.googleusercontent.com',
  source: { top: popup },
  data: { type: 'finances.connection.v1', state, ok: true, environment: 'test',
    modelVersion: 3, sheetCount: 10, checkedAt: '2026-10-06T12:00:00.000Z' }
});

test('solo acepta el despliegue HTTPS de producción de Apps Script', () => {
  assert.equal(validDeploymentUrl('https://script.google.com/macros/s/fixture-deployment/exec'), true);
  for (const url of [null, '', 'https://example.com/macros/s/id/exec',
    'http://script.google.com/macros/s/id/exec', 'https://script.google.com/macros/s/id/dev',
    'https://script.google.com/macros/s/id/exec?state=old',
    'https://user:secret@script.google.com/macros/s/id/exec']) {
    assert.equal(validDeploymentUrl(url), false);
  }
});

test('acepta la lectura del iframe de Google dentro de la ventana solicitada', () => {
  assert.equal(acceptsConnectionMessage(goodMessage(), pending), true);
});

test('rechaza mensajes ajenos, manipulados y respuestas fuera de una solicitud activa', () => {
  const variants = [
    { origin: 'https://example.com' },
    { origin: 'https://script.google.com.example.com' },
    { origin: 'https://example-script.googleusercontent.com.example.com' },
    { source: { top: {} } },
    { source: null },
    { data: { ...goodMessage().data, state: 'another-request' } },
    { data: { ...goodMessage().data, sheetCount: 0 } },
    { data: { ...goodMessage().data, modelVersion: '3' } },
    { data: { ...goodMessage().data, environment: 'production' } },
    { data: { ...goodMessage().data, checkedAt: 'invalid' } }
  ];
  for (const change of variants) assert.equal(acceptsConnectionMessage({ ...goodMessage(), ...change }, pending), false);
  assert.equal(acceptsConnectionMessage(goodMessage(), null), false);
});

function runBackend({ visitor = 'owner@example.test', properties = {}, failure = null,
  version = 3, request = {} } = {}) {
  const calls = [];
  let rendered;
  const props = { TEST_SPREADSHEET_ID: 'fixture-book', OWNER_EMAIL: 'owner@example.test',
    ENVIRONMENT: 'test', ...properties };
  const template = {
    evaluate() { rendered = JSON.parse(this.payloadJson); return { setTitle() { return rendered; } }; }
  };
  const context = vm.createContext({
    PropertiesService: { getScriptProperties: () => ({ getProperty: name => props[name] }) },
    Session: { getActiveUser: () => ({ getEmail: () => visitor }) },
    HtmlService: { createTemplateFromFile: name => { assert.equal(name, 'Bridge'); return template; } },
    Sheets: { Spreadsheets: {
      get(id, options) {
        calls.push({ id, options });
        if (failure) throw new Error(failure);
        return { sheets: Array.from({ length: 10 }, (_, i) => ({ properties: { sheetId: i } })) };
      },
      Values: { get(id, range, options) { calls.push({ id, range, options }); return { values: [[version]] }; } }
    } }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script/Code.gs'), 'utf8'), context);
  vm.runInContext(`doGet(${JSON.stringify({ parameter: { state, ...request } })})`, context);
  return { result: rendered, calls, origin: template.appOrigin };
}

test('el servidor lee el libro configurado y no admite cambiarlo desde el cliente', () => {
  const { result, calls, origin } = runBackend({ request: { spreadsheetId: 'another-book' } });
  assert.equal(result.ok, true);
  assert.equal(result.modelVersion, 3);
  assert.equal(result.sheetCount, 10);
  assert.equal(result.environment, 'test');
  assert.equal(origin, 'https://manuuelmarin.github.io');
  assert.equal(calls.length, 2);
  assert.equal(calls.every(call => call.id === 'fixture-book'), true);
  assert.equal(calls[1].range, "'Configuración'!C10");
  assert.deepEqual(Object.keys(result).sort(), ['checkedAt', 'environment', 'modelVersion', 'ok', 'sheetCount', 'state', 'type']);
});

test('deniega visitantes desconocidos, identidad vacía y configuraciones incompletas antes de leer', () => {
  for (const options of [{ visitor: '' }, { visitor: 'other@example.test' },
    { properties: { TEST_SPREADSHEET_ID: null } }, { properties: { OWNER_EMAIL: '' } },
    { properties: { ENVIRONMENT: 'production' } }, { request: { state: '<script>' } }]) {
    const { result, calls } = runBackend(options);
    assert.equal(result.ok, false);
    assert.equal(calls.length, 0);
  }
});

test('no publica errores internos ni permite dar por buena una versión vacía', () => {
  const { result } = runBackend({ failure: 'Private failure with fixture-book and owner@example.test' });
  assert.equal(result.error, 'READ_FAILED');
  assert.equal(JSON.stringify(result).includes('fixture-book'), false);
  for (const version of ['', null, 'not-a-version', 0, -1]) {
    const outcome = runBackend({ version }).result;
    assert.equal(outcome.ok, false);
    assert.equal(outcome.error, 'INVALID_MODEL');
  }
});

test('los permisos preparados son de lectura y el despliegue es privado', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../apps-script/appsscript.json')));
  assert.deepEqual(manifest.oauthScopes, [
    'https://www.googleapis.com/auth/spreadsheets.readonly',
    'https://www.googleapis.com/auth/userinfo.email'
  ]);
  assert.equal(manifest.webapp.access, 'MYSELF');
  assert.equal(manifest.webapp.executeAs, 'USER_DEPLOYING');
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../web/config.json')));
  assert.equal(config.appsScriptUrl, null);
});
