const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {
  acceptsConnectionMessage,
  validDeploymentUrl,
} = require('../web/connection.js');

const state = '68c0eea1-d067-4af1-a61d-e5b27aacb0b9';
const popup = {};
const pending = { popup, state };
const goodMessage = () => ({
  origin: 'https://example-script.googleusercontent.com',
  source: { top: popup },
  data: {
    type: 'finances.connection.v1',
    state,
    ok: true,
    environment: 'test',
    modelVersion: 3,
    sheetCount: 10,
    checkedAt: '2026-10-06T12:00:00.000Z',
  },
});

test('solo acepta el despliegue HTTPS de producción de Apps Script', () => {
  assert.equal(
    validDeploymentUrl(
      'https://script.google.com/macros/s/fixture-deployment/exec',
    ),
    true,
  );
  for (const url of [
    null,
    '',
    'https://example.com/macros/s/id/exec',
    'http://script.google.com/macros/s/id/exec',
    'https://script.google.com/macros/s/id/dev',
    'https://script.google.com/macros/s/id/exec?state=old',
    'https://user:secret@script.google.com/macros/s/id/exec',
  ]) {
    assert.equal(validDeploymentUrl(url), false);
  }
});

test('acepta la lectura del iframe de Google dentro de la ventana solicitada', () => {
  assert.equal(acceptsConnectionMessage(goodMessage(), pending), true);
  assert.equal(
    acceptsConnectionMessage(
      { ...goodMessage(), origin: 'https://script.googleusercontent.com' },
      pending,
    ),
    true,
  );
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
    { data: { ...goodMessage().data, modelVersion: 2 } },
    { data: { ...goodMessage().data, sheetCount: 9 } },
    { data: { ...goodMessage().data, environment: 'unknown' } },
    { data: { ...goodMessage().data, checkedAt: 'invalid' } },
  ];
  for (const change of variants)
    assert.equal(
      acceptsConnectionMessage({ ...goodMessage(), ...change }, pending),
      false,
    );
  assert.equal(acceptsConnectionMessage(goodMessage(), null), false);
});
test('conexión acepta producción solo tras configuración de dos libros distintos en el servidor', () => {
  assert.equal(
    acceptsConnectionMessage(
      {
        ...goodMessage(),
        data: { ...goodMessage().data, environment: 'production' },
      },
      pending,
    ),
    true,
  );
  const { result, calls } = runBackend({
    properties: {
      ENVIRONMENT: 'production',
      PRODUCTION_SPREADSHEET_ID: 'fixture-production',
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.environment, 'production');
  assert.ok(calls.every((c) => c.id === 'fixture-production'));
  assert.equal(
    runBackend({
      properties: {
        ENVIRONMENT: 'production',
        PRODUCTION_SPREADSHEET_ID: 'fixture-book',
      },
    }).result.ok,
    false,
  );
});

// Cabeceras de la importación revisada; IDs de pestaña ficticios, sin datos financieros.
function sampleBook() {
  const titles = [
    'Resumen financiero',
    'Movimientos',
    'Inversiones',
    'Cuentas',
    'Salario',
    'Objetivos',
    'Inflación',
    'Hipoteca',
    'Configuración',
    'Cálculos',
  ];
  const tables = [
    [
      'Movimientos',
      'tMovimientos',
      [
        'ID',
        'Fecha',
        'Tipo',
        'Concepto',
        'Subcategoría',
        'Origen',
        'Destino',
        'Importe',
        'Recuperable',
        'Localización',
        'Recurrente',
      ],
      7,
      1,
      28,
    ],
    [
      'Inversiones',
      'tProductos',
      [
        'ID',
        'Producto',
        'Cuenta',
        'Clase',
        'Fecha base',
        'Unidades base',
        'Coste base',
        'Participaciones',
        'Aportado neto',
        'Valor',
        'Resultado',
        'Rentabilidad',
        'Peso',
      ],
      28,
      1,
      49,
    ],
    [
      'Inversiones',
      'tOperaciones',
      [
        'ID',
        'Fecha',
        'Producto',
        'Tipo',
        'Participaciones',
        'Precio',
        'Comisión',
        'Retención',
        'Importe',
        'Movimiento',
      ],
      54,
      1,
      85,
    ],
    [
      'Inversiones',
      'tPrecios',
      ['Producto', 'Fecha', 'VL EUR', 'Fuente'],
      90,
      1,
      121,
    ],
    [
      'Cuentas',
      'tCuentas',
      [
        'Cuenta',
        'Saldo inicial',
        'Saldo real',
        'Fecha saldo',
        'Saldo calculado',
      ],
      7,
      1,
      28,
    ],
    [
      'Cuentas',
      'tDeudas',
      ['ID', 'Acreedor', 'Saldo inicial', 'Saldo pendiente'],
      7,
      7,
      28,
    ],
    [
      'Cuentas',
      'tVinculos',
      ['Movimiento', 'Vinculado a', 'Fecha', 'Tipo', 'Importe'],
      33,
      1,
      54,
    ],
    [
      'Salario',
      'tNominas',
      [
        'Movimiento',
        'Fecha cobro',
        'Neto',
        'Bruto',
        'Cotización',
        'IRPF',
        'Otras deducciones',
      ],
      7,
      1,
      28,
    ],
    [
      'Objetivos',
      'tObjetivos',
      ['ID', 'Objetivo', 'Meta', 'Fecha', 'Asignado', 'Pendiente', 'Avance'],
      7,
      1,
      13,
    ],
    [
      'Objetivos',
      'tAsignaciones',
      ['Objetivo', 'Origen', 'Importe'],
      18,
      1,
      29,
    ],
    ['Configuración', 'tParametros', ['Parámetro', 'Valor'], 4, 1, 10],
    [
      'Configuración',
      'tCategorias',
      ['Grupo', 'Subgrupo', 'Categoría', 'Subcategoría'],
      13,
      1,
      34,
    ],
  ];
  return {
    sheets: titles.map((title, sheetId) => ({
      properties: { title, sheetId },
      tables: tables
        .filter((table) => table[0] === title)
        .map(([, name, headers, row, column, end]) => ({
          name,
          range: {
            sheetId,
            startRowIndex: row,
            endRowIndex: end,
            startColumnIndex: column,
            endColumnIndex: column + headers.length,
          },
          columnProperties: headers.map((columnName, columnIndex) =>
            columnIndex === 0 ? { columnName } : { columnName, columnIndex },
          ),
        })),
    })),
  };
}

function runBackend({
  visitor = 'owner@example.test',
  properties = {},
  failure = null,
  version = 3,
  request = {},
  book = sampleBook(),
  parameters = null,
  bridgeContent = fs.readFileSync(
    path.join(__dirname, '../apps-script/Bridge.html'),
    'utf8',
  ),
} = {}) {
  const calls = [];
  let rendered;
  const props = {
    TEST_SPREADSHEET_ID: 'fixture-book',
    OWNER_EMAIL: 'owner@example.test',
    ENVIRONMENT: 'test',
    ...properties,
  };
  const template = {
    getRawContent() {
      return bridgeContent;
    },
    evaluate() {
      rendered = JSON.parse(this.payloadJson);
      return {
        setTitle() {
          return rendered;
        },
      };
    },
  };
  const context = vm.createContext({
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: (name) => props[name] }),
    },
    Session: { getActiveUser: () => ({ getEmail: () => visitor }) },
    HtmlService: {
      createHtmlOutput: (html) => {
        rendered = { html };
        return rendered;
      },
      createTemplateFromFile: (name) => {
        assert.equal(name, 'Bridge');
        return template;
      },
    },
    Sheets: {
      Spreadsheets: {
        get(id, options) {
          calls.push({ id, options });
          if (failure) throw new Error(failure);
          return book;
        },
        Values: {
          get(id, range, options) {
            calls.push({ id, range, options });
            return {
              values: parameters || [
                ['Moneda', 'EUR'],
                ['Versión modelo', version],
              ],
            };
          },
        },
      },
    },
  });
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '../apps-script/Code.gs'), 'utf8'),
    context,
  );
  vm.runInContext(
    `doGet(${JSON.stringify({ parameter: { state, ...request } })})`,
    context,
  );
  return { result: rendered, calls, origin: template.appOrigin };
}

test('Bridge con Code.gs pegado muestra instrucciones concretas sin evaluar o divulgar el código', () => {
  const { result } = runBackend({
    bridgeContent: '// const privateValue = "secret"; <bad-html>',
  });
  assert.match(result.html, /Revisa Bridge.html/);
  assert.match(result.html, /Nueva versión/);
  assert.equal(result.html.includes('secret'), false);
});

test('el servidor lee el libro configurado y no admite cambiarlo desde el cliente', () => {
  const { result, calls, origin } = runBackend({
    request: { spreadsheetId: 'another-book' },
  });
  assert.equal(result.ok, true);
  assert.equal(result.modelVersion, 3);
  assert.equal(result.sheetCount, 10);
  assert.equal(result.environment, 'test');
  assert.equal(origin, 'https://manuuelmarin.github.io');
  assert.equal(calls.length, 2);
  assert.equal(
    calls.every((call) => call.id === 'fixture-book'),
    true,
  );
  assert.equal(calls[1].range, "'Configuración'!B6:C10");
  assert.deepEqual(Object.keys(result).sort(), [
    'apiVersion',
    'backendReady',
    'buildVersion',
    'checkedAt',
    'environment',
    'modelVersion',
    'ok',
    'sheetCount',
    'state',
    'supportsBookBinding',
    'type',
  ]);
});

test('deniega visitantes desconocidos, identidad vacía y configuraciones incompletas antes de leer', () => {
  for (const options of [
    { visitor: '' },
    { visitor: 'other@example.test' },
    { properties: { TEST_SPREADSHEET_ID: null } },
    { properties: { OWNER_EMAIL: '' } },
    { properties: { ENVIRONMENT: 'production' } },
    { request: { state: '<script>' } },
  ]) {
    const { result, calls } = runBackend(options);
    assert.equal(result.ok, false);
    assert.equal(calls.length, 0);
  }
});

test('no publica errores internos ni permite dar por buena una versión vacía', () => {
  const { result } = runBackend({
    failure: 'Private failure with fixture-book and owner@example.test',
  });
  assert.equal(result.error, 'READ_FAILED');
  assert.equal(JSON.stringify(result).includes('fixture-book'), false);
  for (const version of ['', null, 'not-a-version', 0, -1, 2, 4]) {
    const outcome = runBackend({ version }).result;
    assert.equal(outcome.ok, false);
    assert.equal(outcome.error, 'INVALID_MODEL');
  }
});

test('no confunde diez pestañas arbitrarias o tablas incompatibles con el libro válido', () => {
  const changes = [
    (book) => {
      book.sheets[0].properties.title = 'Otro resumen';
    },
    (book) => {
      book.sheets[1].tables = [];
    },
    (book) => {
      book.sheets[2].tables[0].columnProperties[0].columnName = 'Identificador';
    },
    (book) => {
      book.sheets[2].tables[1].range.endColumnIndex += 1;
    },
    (book) => {
      book.sheets[8].tables[0].columnProperties[1].columnIndex = 0;
    },
  ];
  for (const change of changes) {
    const book = sampleBook();
    change(book);
    const { result, calls } = runBackend({ book });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'INVALID_MODEL');
    assert.equal(calls.length, 1);
  }
});

test('encuentra la versión al mover la tabla, cambiar el orden de sus filas y añadir una pestaña', () => {
  const book = sampleBook();
  const parameters = book.sheets[8].tables[0];
  Object.assign(parameters.range, {
    startRowIndex: 30,
    endRowIndex: 36,
    startColumnIndex: 26,
    endColumnIndex: 28,
  });
  book.sheets.reverse();
  book.sheets.push({ properties: { title: 'Notas', sheetId: 10 }, tables: [] });
  const { result, calls } = runBackend({
    book,
    parameters: [
      ['Versión modelo', 3],
      ['Moneda', 'EUR'],
    ],
  });
  assert.equal(result.ok, true);
  assert.equal(result.sheetCount, 11);
  assert.equal(calls[1].range, "'Configuración'!AA32:AB36");
});

test('rechaza una versión ausente o duplicada en la tabla de parámetros', () => {
  for (const parameters of [
    [['Moneda', 'EUR']],
    [
      ['Versión modelo', 3],
      ['Versión modelo', 3],
    ],
  ]) {
    const { result } = runBackend({ parameters });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'INVALID_MODEL');
  }
});

test('los permisos permiten la API de datos y el despliegue continúa privado', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../apps-script/appsscript.json')),
  );
  assert.deepEqual(manifest.oauthScopes, [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/script.external_request',
  ]);
  assert.equal(manifest.webapp.access, 'MYSELF');
  assert.equal(manifest.webapp.executeAs, 'USER_DEPLOYING');
  const config = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../web/config.json')),
  );
  assert.equal(config.appsScriptUrl, null);
});
