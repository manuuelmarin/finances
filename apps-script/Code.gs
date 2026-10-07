// Pasos 2, 3 y 4: conexión privada, API financiera y cotizaciones por ISIN.
// Libros privados separados por ENVIRONMENT; no incluye datos personales.
const CONNECTION_TYPE_ = 'finances.connection.v1';
const APP_ORIGIN_ = 'https://manuuelmarin.github.io';
const MODEL_VERSION_ = 3;
const REQUIRED_SHEETS_ = [
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
// Esquema del libro completo. No contiene datos personales ni IDs del libro.
const TABLE_SCHEMA_ = [
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
  ],
  ['Inversiones', 'tPrecios', ['Producto', 'Fecha', 'VL EUR', 'Fuente']],
  [
    'Cuentas',
    'tCuentas',
    ['Cuenta', 'Saldo inicial', 'Saldo real', 'Fecha saldo', 'Saldo calculado'],
  ],
  [
    'Cuentas',
    'tDeudas',
    ['ID', 'Acreedor', 'Saldo inicial', 'Saldo pendiente'],
  ],
  [
    'Cuentas',
    'tVinculos',
    ['Movimiento', 'Vinculado a', 'Fecha', 'Tipo', 'Importe'],
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
  ],
  [
    'Objetivos',
    'tObjetivos',
    ['ID', 'Objetivo', 'Meta', 'Fecha', 'Asignado', 'Pendiente', 'Avance'],
  ],
  ['Objetivos', 'tAsignaciones', ['Objetivo', 'Origen', 'Importe']],
  ['Configuración', 'tParametros', ['Parámetro', 'Valor']],
  [
    'Configuración',
    'tCategorias',
    ['Grupo', 'Subgrupo', 'Categoría', 'Subcategoría'],
  ],
];

const API_VERSION_ = '3.3.0';
const BUILD_VERSION_ = '3.4.0';
// El motor de fórmulas no cambia en el paso 4; conserva su sello de capacidad.
const CAPACITY_VERSION_ = '3.1.0';
const INPUT_SCHEMA_ = {
  tMovimientos: {
    inputs: [
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
    key: 'ID',
  },
  tCuentas: {
    inputs: ['Cuenta', 'Saldo inicial', 'Saldo real', 'Fecha saldo'],
    key: 'Cuenta',
  },
  tDeudas: {
    inputs: ['ID', 'Acreedor', 'Saldo inicial'],
    key: 'ID',
  },
  tVinculos: {
    inputs: ['Movimiento', 'Vinculado a'],
    key: 'Movimiento',
  },
  tProductos: {
    inputs: [
      'ID',
      'Producto',
      'Cuenta',
      'Clase',
      'Fecha base',
      'Unidades base',
      'Coste base',
    ],
    key: 'ID',
  },
  tOperaciones: {
    inputs: [
      'ID',
      'Fecha',
      'Producto',
      'Tipo',
      'Participaciones',
      'Precio',
      'Comisión',
      'Retención',
      'Movimiento',
    ],
    key: 'ID',
  },
  tPrecios: {
    inputs: ['Producto', 'Fecha', 'VL EUR', 'Fuente'],
    key: ['Producto', 'Fecha'],
  },
  tNominas: {
    inputs: ['Movimiento', 'Bruto', 'Cotización', 'IRPF', 'Otras deducciones'],
    key: 'Movimiento',
  },
  tCategorias: {
    inputs: ['Grupo', 'Subgrupo', 'Categoría', 'Subcategoría'],
    key: 'Subcategoría',
  },
  tObjetivos: {
    inputs: ['ID', 'Objetivo', 'Meta', 'Fecha'],
    key: 'ID',
  },
  tAsignaciones: {
    inputs: ['Objetivo', 'Origen', 'Importe'],
    key: ['Objetivo', 'Origen'],
  },
};
const PROCESS_FIELDS_ = {
  gasto: [
    'date',
    'concept',
    'account',
    'category',
    'amount',
    'recoverable',
    'location',
    'recurring',
    'alias',
  ],
  ingreso: [
    'date',
    'concept',
    'account',
    'category',
    'amount',
    'location',
    'alias',
  ],
  nomina: [
    'date',
    'concept',
    'account',
    'category',
    'amount',
    'gross',
    'contribution',
    'tax',
    'otherDeductions',
    'location',
    'alias',
  ],
  traspaso: ['date', 'concept', 'from', 'to', 'amount', 'location', 'alias'],
  cobro_compartido: [
    'date',
    'concept',
    'account',
    'original',
    'amount',
    'location',
    'alias',
  ],
  devolucion_gasto: [
    'date',
    'concept',
    'account',
    'original',
    'amount',
    'recoverable',
    'location',
    'alias',
  ],
  prestamo: [
    'date',
    'concept',
    'account',
    'debt',
    'amount',
    'location',
    'alias',
  ],
  pago_deuda: [
    'date',
    'concept',
    'account',
    'debt',
    'amount',
    'location',
    'alias',
  ],
  compra: [
    'date',
    'concept',
    'product',
    'units',
    'price',
    'fee',
    'historical',
    'location',
    'alias',
  ],
  venta: [
    'date',
    'concept',
    'product',
    'units',
    'price',
    'fee',
    'tax',
    'historical',
    'location',
    'alias',
  ],
  rendimiento: [
    'date',
    'concept',
    'product',
    'gross',
    'fee',
    'tax',
    'historical',
    'location',
    'alias',
  ],
  precio: ['product', 'date', 'price', 'source', 'replace', 'alias'],
  cuenta: ['account', 'opening', 'observed', 'observedDate', 'alias'],
  saldo_observado: [
    'account',
    'date',
    'amount',
    'time',
    'scope',
    'source',
    'alias',
  ],
  deuda_inicial: ['creditor', 'opening', 'alias'],
  categoria: ['group', 'subgroup', 'category', 'subcategory', 'alias'],
  producto: [
    'name',
    'account',
    'class',
    'date',
    'units',
    'cost',
    'alias',
    'isin',
    'referenceName',
  ],
  vincular_isin: ['product', 'isin', 'referenceName', 'alias'],
  objetivo: ['name', 'amount', 'date', 'alias'],
  asignacion: ['goal', 'origin', 'amount', 'alias'],
  fechas: ['start', 'asof', 'valuation', 'alias'],
  corregir: ['table', 'key', 'changes', 'alias'],
  renombrar: ['kind', 'from', 'to', 'alias'],
  eliminar: ['table', 'key', 'alias'],
};

// Ejecutar desde el editor para autorizar y comprobar la instalación.
// Solo imprime un resumen seguro; no exige una referencia manual de solicitud.
function comprobarInstalacion() {
  let result;
  try {
    result = readConnection_();
  } catch (error) {
    const codes = ['NOT_CONFIGURED', 'ACCESS_DENIED', 'INVALID_MODEL'];
    result = {
      ok: false,
      error: codes.indexOf(error.message) >= 0 ? error.message : 'READ_FAILED',
    };
  }
  console.log(JSON.stringify(result));
  return result;
}

function doGet(e) {
  const state = String((e && e.parameter && e.parameter.state) || '');
  let result = { type: CONNECTION_TYPE_, state: state, ok: false };
  try {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        state,
      )
    ) {
      throw new Error('INVALID_REQUEST');
    }
    result = Object.assign(result, readConnection_());
  } catch (error) {
    // No devolver excepciones de Google: pueden contener identificadores privados.
    const codes = [
      'INVALID_REQUEST',
      'NOT_CONFIGURED',
      'ACCESS_DENIED',
      'INVALID_MODEL',
    ];
    result.error =
      codes.indexOf(error.message) >= 0 ? error.message : 'READ_FAILED';
  }
  try {
    const template = bridgeTemplate_();
    template.payloadJson = JSON.stringify(result);
    template.appOrigin = APP_ORIGIN_;
    return template.evaluate().setTitle('Finanzas · Tu libro');
  } catch (error) {
    return HtmlService.createHtmlOutput(
      '<!doctype html><html lang="es"><meta charset="utf-8"><title>Finanzas · Revisar Bridge</title>' +
        '<h1>Revisa Bridge.html</h1><p>Este archivo debe contener el bloque HTML del archivo 2 de 3. ' +
        'Copia Bridge.html, guarda y publica una Nueva versión de la implementación existente.</p>' +
        '<a href="https://manuuelmarin.github.io/finances/install.html">Abrir instalador</a></html>',
    );
  }
}
function bridgeTemplate_() {
  const template = HtmlService.createTemplateFromFile('Bridge');
  const raw = template.getRawContent();
  if (
    !/^\s*<!doctype html>/i.test(raw) ||
    !/id=["']payload["']/.test(raw) ||
    !/id=["']origin["']/.test(raw) ||
    raw.indexOf('google.script.run') < 0
  )
    throw new Error('BRIDGE_INVALID');
  return template;
}

function readConnection_() {
  const config = authorizedConfig_(),
    spreadsheetId = config.id;

  // Esta función usa solo lecturas. El manifiesto permite además las escrituras de la API del paso 3.
  // Localizar tablas por nombre evita depender de sus filas actuales.
  const book = Sheets.Spreadsheets.get(spreadsheetId, {
    fields:
      'sheets(properties(sheetId,title),tables(name,range,columnProperties(columnIndex,columnName)))',
  });
  const parametersRange = checkBookStructure_(book);
  const values = Sheets.Spreadsheets.Values.get(
    spreadsheetId,
    parametersRange,
    {
      valueRenderOption: 'UNFORMATTED_VALUE',
    },
  );
  const versions = (values.values || []).filter(
    (row) => row[0] === 'Versión modelo',
  );
  if (versions.length !== 1) throw new Error('INVALID_MODEL');
  const modelVersion = Number(versions[0][1]);
  const sheetCount = (book.sheets || []).filter(
    (sheet) => !/^_Finanzas_/.test(sheet.properties.title),
  ).length;
  if (modelVersion !== MODEL_VERSION_) {
    throw new Error('INVALID_MODEL');
  }
  return {
    ok: true,
    environment: config.environment,
    modelVersion: modelVersion,
    sheetCount: sheetCount,
    checkedAt: new Date().toISOString(),
    apiVersion: API_VERSION_,
    buildVersion: BUILD_VERSION_,
    supportsBookBinding: true,
    backendReady: [
      '_Finanzas_Solicitudes',
      '_Finanzas_Auditoria',
      '_Finanzas_Observaciones',
    ].every((title) =>
      (book.sheets || []).some((sheet) => sheet.properties.title === title),
    ),
  };
}

function checkBookStructure_(book) {
  const sheets = book.sheets || [];
  const byTitle = new Map(
    sheets.map((sheet) => [sheet.properties.title, sheet]),
  );
  if (REQUIRED_SHEETS_.some((title) => !byTitle.has(title)))
    throw new Error('INVALID_MODEL');
  let parametersRange;
  TABLE_SCHEMA_.forEach(([title, name, headers]) => {
    const sheet = byTitle.get(title);
    const matches = (sheet.tables || []).filter((table) => table.name === name);
    if (matches.length !== 1) throw new Error('INVALID_MODEL');
    const table = matches[0];
    const range = table.range || {};
    const firstRow =
      range.startRowIndex === undefined ? 0 : range.startRowIndex;
    const firstColumn =
      range.startColumnIndex === undefined ? 0 : range.startColumnIndex;
    if (
      range.sheetId !== sheet.properties.sheetId ||
      ![firstRow, firstColumn, range.endRowIndex, range.endColumnIndex].every(
        Number.isSafeInteger,
      ) ||
      firstRow < 0 ||
      firstColumn < 0 ||
      range.endRowIndex <= firstRow + 1 ||
      range.endColumnIndex - firstColumn !== headers.length
    )
      throw new Error('INVALID_MODEL');
    const columns = new Map();
    (table.columnProperties || []).forEach((column) => {
      const index = column.columnIndex === undefined ? 0 : column.columnIndex;
      if (
        !Number.isSafeInteger(index) ||
        index < 0 ||
        index >= headers.length ||
        columns.has(index)
      ) {
        throw new Error('INVALID_MODEL');
      }
      columns.set(index, column.columnName);
    });
    if (headers.some((header, index) => columns.get(index) !== header))
      throw new Error('INVALID_MODEL');
    if (name === 'tParametros') {
      const quotedTitle = "'" + title.replace(/'/g, "''") + "'";
      parametersRange =
        quotedTitle +
        '!' +
        columnA1_(firstColumn) +
        (firstRow + 2) +
        ':' +
        columnA1_(range.endColumnIndex - 1) +
        range.endRowIndex;
    }
  });
  return parametersRange;
}

function columnA1_(index) {
  let column = '';
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) {
    column = String.fromCharCode(65 + ((value - 1) % 26)) + column;
  }
  return column;
}

// Todas las funciones internas acaban en _: no se exponen a google.script.run.
const TECH_SCHEMA_ = {
  requests: [
    '_Finanzas_Solicitudes',
    ['Solicitud', 'Huella', 'Fecha registro', 'Resultado'],
  ],
  audit: [
    '_Finanzas_Auditoria',
    ['Solicitud', 'Fecha registro', 'Tabla', 'Clave', 'Antes', 'Después'],
  ],
  observations: [
    '_Finanzas_Observaciones',
    [
      'ID',
      'Cuenta',
      'Importe',
      'Fecha',
      'Hora',
      'Alcance',
      'Fuente',
      'Fecha registro',
    ],
  ],
  funds: [
    '_Finanzas_Fondos',
    ['Producto', 'ISIN', 'Nombre referencia', 'Fecha registro'],
  ],
  quotes: [
    '_Finanzas_Cotizaciones',
    [
      'Consulta',
      'Solicitud',
      'Producto',
      'ISIN',
      'Fecha VL',
      'VL EUR',
      'Moneda clase',
      'Proveedor',
      'URL',
      'Consultado el',
      'Estado',
      'Detalle',
    ],
  ],
};
const DATE_FIELDS_ = ['Fecha', 'Fecha base', 'Fecha saldo'];
const MOVEMENT_TYPES_ = [
  'Ingreso',
  'Gasto',
  'Transferencia',
  'Compra inversión',
  'Venta inversión',
  'Rendimiento inversión',
  'Préstamo recibido',
  'Devolución deuda',
  'Cobro compartido',
  'Devolución gasto',
];
const ASSET_CLASSES_ = [
  'Renta variable',
  'Renta fija',
  'Cripto',
  'Monetario',
  'Mixto',
  'Otros',
];
const PARAMETER_NAMES_ = {
  start: 'Inicio seguimiento',
  asof: 'Fecha informe',
  valuation: 'Valoración inversiones',
};

function fail_(code, message) {
  const error = new Error(message || code);
  error.code = code;
  throw error;
}
function check_(condition, message) {
  if (!condition) fail_('INVALID_DATA', message);
}
function blank_(v) {
  return v === undefined || v === null || v === '';
}
function object_(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}
function uuid_(v) {
  return (
    typeof v === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      v,
    )
  );
}
function clone_(v) {
  return JSON.parse(JSON.stringify(v));
}
function canonical_(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical_).join(',') + ']';
  if (object_(v))
    return (
      '{' +
      Object.keys(v)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + canonical_(v[k]))
        .join(',') +
      '}'
    );
  return JSON.stringify(v === undefined ? null : v);
}
function hash_(v) {
  return Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    canonical_(v),
    Utilities.Charset.UTF_8,
  )
    .map((b) => ('0' + ((b + 256) % 256).toString(16)).slice(-2))
    .join('');
}
function text_(v, label) {
  check_(
    typeof v === 'string' && v.trim().length > 0 && v.length <= 1000,
    label + ': texto obligatorio de hasta 1000 caracteres.',
  );
}
function number_(v, label, optional, min, positive) {
  if (optional && blank_(v)) return;
  min = min === undefined ? 0 : min;
  check_(
    typeof v === 'number' &&
      Number.isFinite(v) &&
      Math.abs(v) <= 1e12 &&
      (positive ? v > min : v >= min),
    label + ': número fuera de rango.',
  );
}
function money_(v) {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}
function moneyInput_(v, label) {
  number_(v, label, false, 0, true);
  check_(Math.abs(v - money_(v)) < 1e-7, label + ': máximo dos decimales.');
  return v;
}
function serialDate_(v) {
  if (typeof v === 'number' && Number.isSafeInteger(v) && v > 0 && v < 100000)
    return v;
  check_(
    typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v),
    'Fecha inválida; utiliza AAAA-MM-DD.',
  );
  const parts = v.split('-').map(Number),
    date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  check_(date.toISOString().slice(0, 10) === v, 'Fecha inexistente.');
  const serial = (date.getTime() - Date.UTC(1899, 11, 30)) / 86400000;
  check_(serial > 0 && serial < 100000, 'Fecha fuera de rango.');
  return serial;
}
function isoDate_(v) {
  return new Date(Date.UTC(1899, 11, 30) + serialDate_(v) * 86400000)
    .toISOString()
    .slice(0, 10);
}
function recurrence_(v) {
  if (blank_(v)) return null;
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  check_(v === 'Sí' || v === 'No', 'Recurrente solo admite Sí, No o vacío.');
  return v;
}
function authorizedConfig_() {
  const p = PropertiesService.getScriptProperties(),
    owner = (p.getProperty('OWNER_EMAIL') || '').trim().toLowerCase();
  const environment = p.getProperty('ENVIRONMENT'),
    testId = (p.getProperty('TEST_SPREADSHEET_ID') || '').trim(),
    productionId = (p.getProperty('PRODUCTION_SPREADSHEET_ID') || '').trim(),
    id = environment === 'production' ? productionId : testId;
  if (
    !testId ||
    !id ||
    !owner ||
    !['test', 'production'].includes(environment) ||
    (environment === 'production' && productionId === testId)
  )
    fail_('NOT_CONFIGURED');
  const visitor = (Session.getActiveUser().getEmail() || '')
    .trim()
    .toLowerCase();
  if (!visitor || visitor !== owner) fail_('ACCESS_DENIED');
  return { id, owner, environment };
}
function checkRequestBook_(request, state) {
  if (request.bookKey === undefined && state.environment === 'test') return;
  if (!request.bookKey)
    fail_('READ_REQUIRED', 'Lee el libro antes de preparar la solicitud.');
  if (request.bookKey !== state.bookKey)
    fail_(
      'BOOK_CHANGED',
      'La solicitud pertenece a otro libro. Conserva el pendiente y abre su implementación original.',
    );
}
function locked_(callback) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000))
    fail_(
      'BUSY',
      'Otra operación está en curso. Reintenta la misma solicitud.',
    );
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}
function apiError_(error) {
  const codes = [
    'NOT_CONFIGURED',
    'ACCESS_DENIED',
    'INVALID_MODEL',
    'NOT_INITIALIZED',
    'INVALID_REQUEST',
    'INVALID_DATA',
    'NOT_FOUND',
    'CONFLICT',
    'REQUEST_CONFLICT',
    'CAPACITY_REACHED',
    'BUSY',
    'SCHEMA_CONFLICT',
    'WRITE_UNCERTAIN',
    'INVALID_ISIN',
    'READ_REQUIRED',
    'BOOK_CHANGED',
    'TEST_ONLY',
  ];
  const code =
    codes.indexOf(error.code || error.message) >= 0
      ? error.code || error.message
      : 'API_FAILED';
  return {
    ok: false,
    error: code,
    message: error.code && code !== 'API_FAILED' ? error.message : code,
  };
}
function rangeA1_(title, r) {
  return (
    "'" +
    title.replace(/'/g, "''") +
    "'!" +
    columnA1_(r.startColumnIndex || 0) +
    (r.startRowIndex + 1) +
    ':' +
    columnA1_(r.endColumnIndex - 1) +
    r.endRowIndex
  );
}
function keyFields_(name) {
  const k = INPUT_SCHEMA_[name].key;
  return Array.isArray(k) ? k : [k];
}
function rowKey_(name, row) {
  return canonical_(keyFields_(name).map((k) => row[k]));
}
function inputs_(name, row) {
  const out = {};
  INPUT_SCHEMA_[name].inputs.forEach(
    (h) => (out[h] = blank_(row[h]) ? null : row[h]),
  );
  return out;
}
function normalizeRow_(name, row) {
  const out = inputs_(name, row);
  DATE_FIELDS_.forEach((k) => {
    if (!blank_(out[k])) out[k] = serialDate_(out[k]);
  });
  if (name === 'tMovimientos') out.Recurrente = recurrence_(out.Recurrente);
  return out;
}

function readState_(config) {
  const book = Sheets.Spreadsheets.get(config.id, {
    fields:
      'namedRanges,sheets(properties(sheetId,title,gridProperties),tables(tableId,name,range,columnProperties(columnIndex,columnName)))',
  });
  checkBookStructure_(book);
  const layout = {},
    specs = [];
  TABLE_SCHEMA_.forEach(([title, name, headers]) => {
    const sheet = book.sheets.find((s) => s.properties.title === title),
      table = sheet.tables.find((t) => t.name === name);
    const range = Object.assign(
      { startColumnIndex: 0, startRowIndex: 0 },
      table.range,
    );
    layout[name] = { title, headers, range, tableId: table.tableId };
    specs.push({ name, range: rangeA1_(title, range) });
  });
  const tech = {};
  const supportSheet = book.sheets.find(
    (s) => s.properties.title === 'Cálculos',
  );
  specs.push({ support: true, range: "'Cálculos'!T8:T8" });
  specs.push({ summary: true, range: "'Resumen financiero'!B2:U80" });
  (book.namedRanges || [])
    .filter((n) => Object.values(SUPPORT_NAMES_).indexOf(n.name) >= 0)
    .forEach((n) => {
      const sheet = book.sheets.find(
        (s) => s.properties.sheetId === n.range.sheetId,
      );
      specs.push({
        calculation: n.name,
        range: rangeA1_(sheet.properties.title, n.range),
      });
    });
  Object.keys(TECH_SCHEMA_).forEach((kind) => {
    const [title, headers] = TECH_SCHEMA_[kind],
      sheet = book.sheets.find((s) => s.properties.title === title);
    if (sheet) {
      tech[kind] = {
        title,
        headers,
        id: sheet.properties.sheetId,
        rowCount: sheet.properties.gridProperties.rowCount,
      };
      specs.push({
        tech: kind,
        range:
          "'" +
          title +
          "'!A1:" +
          columnA1_(headers.length - 1) +
          sheet.properties.gridProperties.rowCount,
      });
    }
  });
  // Configuración técnica y entradas se leen en un mismo lote; nunca desde IDs enviados por el cliente.
  const response = Sheets.Spreadsheets.Values.batchGet(config.id, {
    ranges: specs.map((s) => s.range),
    valueRenderOption: 'UNFORMATTED_VALUE',
    dateTimeRenderOption: 'SERIAL_NUMBER',
  });
  const tables = {},
    raw = {},
    technical = Object.fromEntries(
      Object.keys(TECH_SCHEMA_).map((k) => [k, []]),
    ),
    calculationErrors = [];
  let parameters = [],
    supportSignature = null,
    summaryValues = [];
  specs.forEach((spec, i) => {
    const values = (response.valueRanges[i] || {}).values || [];
    if (spec.support) {
      supportSignature = (values[0] || [])[0] || null;
      return;
    }
    if (spec.summary) {
      summaryValues = values;
      return;
    }
    if (spec.calculation) {
      values.forEach((row, i) =>
        row.forEach((v, j) => {
          if (
            typeof v === 'string' &&
            /^#(?:REF!?|VALUE!?|DIV\/0!?|N\/A|NAME\?|NUM!?|ERROR!?)/.test(v)
          )
            calculationErrors.push({
              block: spec.calculation,
              row: i + 1,
              column: j + 1,
              error: v,
            });
        }),
      );
      return;
    }
    if (spec.tech) {
      const headers = TECH_SCHEMA_[spec.tech][1];
      if (canonical_(values[0] || []) !== canonical_(headers))
        fail_('SCHEMA_CONFLICT', 'Cabecera técnica incompatible.');
      const records = values.slice(1);
      let gap = false;
      records.forEach((r) => {
        if (blank_(r[0])) gap = true;
        else if (gap)
          fail_(
            'SCHEMA_CONFLICT',
            'El registro técnico contiene huecos internos.',
          );
      });
      technical[spec.tech] = records
        .filter((r) => !blank_(r[0]))
        .map((r) => headers.map((h, j) => (blank_(r[j]) ? null : r[j])));
      if (spec.tech === 'requests')
        check_(
          new Set(technical.requests.map((r) => r[0])).size ===
            technical.requests.length,
          'Solicitud técnica duplicada.',
        );
      return;
    }
    const meta = layout[spec.name];
    if (canonical_(values[0] || []) !== canonical_(meta.headers))
      fail_('INVALID_MODEL');
    if (spec.name === 'tParametros') {
      parameters = values.slice(1);
      return;
    }
    raw[spec.name] = [];
    tables[spec.name] = [];
    for (
      let slot = 0;
      slot < meta.range.endRowIndex - meta.range.startRowIndex - 1;
      slot++
    ) {
      const cells = values[slot + 1] || [],
        row = {};
      meta.headers.forEach(
        (h, j) => (row[h] = blank_(cells[j]) ? null : cells[j]),
      );
      const input = normalizeRow_(spec.name, row),
        used = INPUT_SCHEMA_[spec.name].inputs.some((h) => !blank_(input[h]));
      raw[spec.name].push({
        row: meta.range.startRowIndex + 1 + slot,
        input,
        full: row,
      });
      if (used) tables[spec.name].push(input);
    }
  });
  [
    'Inicio seguimiento',
    'Fecha informe',
    'Valoración inversiones',
    'Moneda',
    'Versión modelo',
  ].forEach((name) =>
    check_(
      parameters.filter((r) => r[0] === name).length === 1,
      'Parámetro ausente o duplicado.',
    ),
  );
  const params = Object.fromEntries(
    parameters.filter((r) => !blank_(r[0])).map((r) => [r[0], r[1]]),
  );
  if (params['Versión modelo'] !== 3 || params.Moneda !== 'EUR')
    fail_('INVALID_MODEL');
  const settings = {};
  Object.keys(PARAMETER_NAMES_).forEach(
    (k) => (settings[k] = serialDate_(params[PARAMETER_NAMES_[k]])),
  );
  const state = {
    environment: config.environment || 'test',
    book,
    layout,
    tech,
    tables,
    raw,
    parameters,
    settings,
    technical,
    supportSignature,
    calculationErrors,
    summaryValues,
    bookKey: hash_(config.id),
  };
  validateFinancialState_(state);
  state.revision = revision_(state);
  return state;
}
function revision_(s) {
  const tables = {};
  Object.keys(s.tables).forEach(
    (name) =>
      (tables[name] = s.tables[name]
        .slice()
        .sort((a, b) => rowKey_(name, a).localeCompare(rowKey_(name, b)))),
  );
  return hash_({
    tables,
    settings: s.settings,
    observations: s.technical.observations,
    funds: s.technical.funds,
  });
}

function tradeAmount_(r) {
  const fee = r.Comisión || 0,
    tax = r.Retención || 0;
  return r.Tipo === 'Compra'
    ? r.Participaciones * r.Precio + fee
    : r.Tipo === 'Venta'
      ? r.Participaciones * r.Precio - fee - tax
      : r.Precio - fee - tax;
}
function validateFinancialState_(s) {
  const t = s.tables,
    cfg = s.settings;
  check_(
    cfg.start <= cfg.asof && cfg.valuation <= cfg.asof,
    'Cortes de fechas incompatibles.',
  );
  Object.keys(INPUT_SCHEMA_).forEach((name) => {
    const seen = new Set();
    t[name].forEach((row) => {
      keyFields_(name).forEach((k) =>
        text_(
          row[k] === undefined ? null : String(row[k] || ''),
          'Clave ' + name,
        ),
      );
      if (keyFields_(name).indexOf('ID') >= 0) text_(row.ID, 'ID');
      const key = rowKey_(name, row);
      check_(!seen.has(key), 'Clave duplicada en ' + name + '.');
      seen.add(key);
    });
  });
  const by = (name, key) => new Map(t[name].map((r) => [r[key], r]));
  const accounts = by('tCuentas', 'Cuenta'),
    categories = by('tCategorias', 'Subcategoría'),
    movements = by('tMovimientos', 'ID');
  const products = by('tProductos', 'ID'),
    debts = by('tDeudas', 'ID'),
    goals = by('tObjetivos', 'ID'),
    links = by('tVinculos', 'Movimiento');
  check_(
    new Set(t.tProductos.map((r) => r.Producto)).size === products.size,
    'Nombre de producto duplicado.',
  );
  accounts.forEach((a) => {
    text_(a.Cuenta, 'Cuenta');
    number_(a['Saldo inicial'], 'Saldo inicial', false, -1e12);
    number_(a['Saldo real'], 'Saldo observado', true, -1e12);
    check_(
      blank_(a['Saldo real']) === blank_(a['Fecha saldo']),
      'Observación y fecha deben venir juntas.',
    );
  });
  s.technical.observations.forEach((row) =>
    check_(
      accounts.has(row[1]),
      'Una cuenta con observaciones históricas debe conservarse.',
    ),
  );
  categories.forEach((c) =>
    INPUT_SCHEMA_.tCategorias.inputs.forEach((h) => text_(c[h], h)),
  );
  movements.forEach((m) => {
    text_(m.Concepto, 'Concepto');
    check_(
      MOVEMENT_TYPES_.indexOf(m.Tipo) >= 0,
      'Tipo de movimiento inválido.',
    );
    number_(m.Importe, 'Importe', false, 0, true);
    number_(m.Recuperable, 'Recuperable', true);
    check_((m.Recuperable || 0) <= m.Importe, 'Recuperable mayor que importe.');
    check_(m.Fecha >= cfg.start, 'Movimiento anterior al seguimiento.');
    ['Origen', 'Destino'].forEach((k) =>
      check_(blank_(m[k]) || accounts.has(m[k]), 'Cuenta desconocida.'),
    );
    check_(
      blank_(m.Localización) || typeof m.Localización === 'string',
      'Localización debe ser texto.',
    );
    check_(
      blank_(m.Recurrente) || m.Tipo === 'Gasto',
      'Recurrencia solo para gastos.',
    );
    const out =
      ['Gasto', 'Compra inversión', 'Devolución deuda'].indexOf(m.Tipo) >= 0;
    const incoming =
      [
        'Ingreso',
        'Venta inversión',
        'Rendimiento inversión',
        'Préstamo recibido',
        'Cobro compartido',
        'Devolución gasto',
      ].indexOf(m.Tipo) >= 0;
    if (out)
      check_(
        !blank_(m.Origen) && blank_(m.Destino),
        'Movimiento de salida requiere solo Origen.',
      );
    if (incoming)
      check_(
        !blank_(m.Destino) && blank_(m.Origen),
        'Movimiento de entrada requiere solo Destino.',
      );
    if (m.Tipo === 'Transferencia')
      check_(
        m.Origen && m.Destino && m.Origen !== m.Destino,
        'Transferencia entre dos cuentas distintas.',
      );
    check_(
      blank_(m.Subcategoría) || categories.has(m.Subcategoría),
      'Subcategoría desconocida.',
    );
    if (['Ingreso', 'Gasto', 'Devolución gasto'].indexOf(m.Tipo) >= 0)
      check_(
        categories.has(m.Subcategoría) &&
          categories.get(m.Subcategoría).Grupo ===
            (m.Tipo === 'Ingreso' ? 'Ingresos' : 'Gastos'),
        'Grupo de subcategoría incompatible.',
      );
    if (['Gasto', 'Devolución gasto'].indexOf(m.Tipo) < 0)
      check_(!(m.Recuperable || 0), 'Recuperable no permitido.');
  });
  links.forEach((l) => {
    check_(movements.has(l.Movimiento), 'Vínculo sin movimiento.');
    const m = movements.get(l.Movimiento);
    if (['Préstamo recibido', 'Devolución deuda'].indexOf(m.Tipo) >= 0)
      check_(debts.has(l['Vinculado a']), 'Deuda desconocida.');
    else {
      const original = movements.get(l['Vinculado a']);
      check_(
        ['Cobro compartido', 'Devolución gasto'].indexOf(m.Tipo) >= 0 &&
          original &&
          original.Tipo === 'Gasto',
        'Vínculo incompatible.',
      );
      check_(m.Fecha >= original.Fecha, 'Cobro anterior al gasto.');
      if (m.Tipo === 'Devolución gasto')
        check_(
          m.Subcategoría === original.Subcategoría,
          'Categoría de devolución incompatible.',
        );
    }
  });
  movements.forEach((m) => {
    if (
      [
        'Préstamo recibido',
        'Devolución deuda',
        'Cobro compartido',
        'Devolución gasto',
      ].indexOf(m.Tipo) >= 0
    )
      check_(links.has(m.ID), 'Falta vínculo.');
  });
  debts.forEach((d) => {
    text_(d.Acreedor, 'Acreedor');
    number_(d['Saldo inicial'], 'Deuda inicial');
    let balance = d['Saldo inicial'];
    [...movements.values()]
      .filter((m) => links.has(m.ID) && links.get(m.ID)['Vinculado a'] === d.ID)
      .sort(
        (a, b) =>
          a.Fecha - b.Fecha ||
          (a.Tipo === 'Préstamo recibido' ? 0 : 1) -
            (b.Tipo === 'Préstamo recibido' ? 0 : 1),
      )
      .forEach((m) => {
        balance += m.Tipo === 'Préstamo recibido' ? m.Importe : -m.Importe;
        check_(balance >= -0.005, 'Devolución superior a la deuda.');
      });
  });
  movements.forEach((original) => {
    if (original.Tipo !== 'Gasto') return;
    let recoverable = original.Recuperable || 0,
      refunded = 0;
    [...movements.values()]
      .filter(
        (m) =>
          links.has(m.ID) && links.get(m.ID)['Vinculado a'] === original.ID,
      )
      .sort((a, b) => a.Fecha - b.Fecha)
      .forEach((m) => {
        if (m.Tipo === 'Cobro compartido') recoverable -= m.Importe;
        else {
          refunded += m.Importe;
          recoverable -= m.Recuperable || 0;
        }
        check_(
          recoverable >= -0.005 && refunded <= original.Importe + 0.005,
          'Cobro o devolución excesivo.',
        );
      });
  });
  products.forEach((p) => {
    ['Producto', 'Cuenta', 'Clase'].forEach((k) => text_(p[k], k));
    check_(accounts.has(p.Cuenta), 'Cuenta de producto desconocida.');
    check_(ASSET_CLASSES_.indexOf(p.Clase) >= 0, 'Clase de activo inválida.');
    number_(p['Unidades base'], 'Unidades base');
    number_(p['Coste base'], 'Coste base');
  });
  const linked = new Map();
  t.tOperaciones.forEach((r) => {
    const p = products.get(r.Producto);
    check_(!!p, 'Producto desconocido.');
    check_(
      ['Compra', 'Venta', 'Cobro'].indexOf(r.Tipo) >= 0,
      'Tipo de inversión inválido.',
    );
    check_(
      r.Fecha >= p['Fecha base'],
      'Operación anterior a la posición base.',
    );
    number_(
      r.Participaciones,
      'Participaciones',
      r.Tipo === 'Cobro',
      0,
      r.Tipo !== 'Cobro',
    );
    number_(r.Precio, 'Precio', false, 0, true);
    number_(r.Comisión, 'Comisión', true);
    number_(r.Retención, 'Retención', true);
    check_(
      r.Tipo !== 'Cobro' || !(r.Participaciones || 0),
      'Cobro no cambia participaciones.',
    );
    check_(r.Tipo !== 'Compra' || !(r.Retención || 0), 'Compra con retención.');
    check_(tradeAmount_(r) > 0, 'Neto de inversión no positivo.');
    if (blank_(r.Movimiento))
      check_(r.Fecha < cfg.start, 'Operación actual sin movimiento de caja.');
    else {
      const m = movements.get(r.Movimiento);
      check_(!!m, 'Movimiento de caja inexistente.');
      check_(
        m.Tipo ===
          {
            Compra: 'Compra inversión',
            Venta: 'Venta inversión',
            Cobro: 'Rendimiento inversión',
          }[r.Tipo] && m.Fecha === r.Fecha,
        'Tipo o fecha de inversión no coincide con caja.',
      );
      check_(
        m[r.Tipo === 'Compra' ? 'Origen' : 'Destino'] === p.Cuenta,
        'Cuenta de inversión incompatible.',
      );
      linked.set(m.ID, (linked.get(m.ID) || 0) + tradeAmount_(r));
    }
  });
  movements.forEach((m) => {
    if (
      ['Compra inversión', 'Venta inversión', 'Rendimiento inversión'].indexOf(
        m.Tipo,
      ) >= 0
    )
      check_(
        linked.has(m.ID) && Math.abs(linked.get(m.ID) - m.Importe) <= 0.011,
        'Inversión y efectivo no cuadran.',
      );
  });
  products.forEach((p) => {
    let units = p['Unidades base'];
    t.tOperaciones
      .filter((r) => r.Producto === p.ID)
      .sort(
        (a, b) =>
          a.Fecha - b.Fecha ||
          (a.Tipo === 'Compra' ? 0 : 1) - (b.Tipo === 'Compra' ? 0 : 1),
      )
      .forEach((r) => {
        units +=
          r.Tipo === 'Compra'
            ? r.Participaciones
            : r.Tipo === 'Venta'
              ? -r.Participaciones
              : 0;
        check_(
          units >= -1e-8,
          'Venta superior a las participaciones disponibles.',
        );
      });
  });
  t.tPrecios.forEach((p) => {
    check_(products.has(p.Producto), 'Precio de producto desconocido.');
    number_(p['VL EUR'], 'VL', false, 0, true);
    text_(p.Fuente, 'Fuente');
  });
  t.tNominas.forEach((n) => {
    const m = movements.get(n.Movimiento);
    check_(m && m.Tipo === 'Ingreso', 'Nómina sin ingreso.');
    const cols = ['Bruto', 'Cotización', 'IRPF', 'Otras deducciones'];
    cols.forEach((k) => number_(n[k], k, true));
    if (cols.every((k) => !blank_(n[k])))
      check_(
        Math.abs(
          n.Bruto - n.Cotización - n.IRPF - n['Otras deducciones'] - m.Importe,
        ) <= 0.011,
        'Desglose de nómina incompatible con el neto.',
      );
  });
  goals.forEach((g) => {
    text_(g.Objetivo, 'Objetivo');
    number_(g.Meta, 'Meta', false, 0, true);
  });
  t.tAsignaciones.forEach((a) => {
    check_(goals.has(a.Objetivo), 'Objetivo inexistente.');
    check_(
      accounts.has(a.Origen) || products.has(a.Origen),
      'Origen de asignación desconocido.',
    );
    number_(a.Importe, 'Asignación');
  });
}

function resolveReference_(s, table, value, aliases, label) {
  if (typeof value === 'string' && value.charAt(0) === '$')
    value = aliases[value.slice(1)];
  const key = keyFields_(table)[0],
    fields =
      table === 'tProductos'
        ? ['ID', 'Producto']
        : table === 'tDeudas'
          ? ['ID', 'Acreedor']
          : table === 'tObjetivos'
            ? ['ID', 'Objetivo']
            : [key];
  const matches = s.tables[table].filter((row) =>
    fields.some((k) => row[k] === value),
  );
  if (matches.length !== 1)
    fail_('NOT_FOUND', label + ': referencia ausente o ambigua.');
  return matches[0][key];
}
function putRow_(s, name, row, replace) {
  row = normalizeRow_(name, row);
  const key = rowKey_(name, row),
    rows = s.tables[name],
    index = rows.findIndex((r) => rowKey_(name, r) === key);
  if (index >= 0) {
    if (!replace && canonical_(rows[index]) !== canonical_(row))
      fail_('CONFLICT', 'Registro existente con contenido distinto.');
    rows[index] = row;
  } else rows.push(row);
  return row;
}
function dropRow_(s, name, key) {
  const index = s.tables[name].findIndex(
    (r) => rowKey_(name, r) === rowKey_(name, key),
  );
  if (index >= 0) return s.tables[name].splice(index, 1)[0];
  return null;
}
function synchronizeTradeCash_(s) {
  const groups = new Map();
  s.tables.tOperaciones.forEach((r) => {
    if (r.Movimiento) {
      if (!groups.has(r.Movimiento)) groups.set(r.Movimiento, []);
      groups.get(r.Movimiento).push(r);
    }
  });
  groups.forEach((trades, id) => {
    const cash = s.tables.tMovimientos.find((m) => m.ID === id);
    check_(!!cash, 'Falta movimiento asociado a la inversión.');
    const first = trades[0],
      p = s.tables.tProductos.find((p) => p.ID === first.Producto);
    check_(
      !!p &&
        trades.every(
          (r) =>
            r.Tipo === first.Tipo &&
            r.Fecha === first.Fecha &&
            s.tables.tProductos.some(
              (q) => q.ID === r.Producto && q.Cuenta === p.Cuenta,
            ),
        ),
      'Operaciones agrupadas incompatibles.',
    );
    cash.Fecha = first.Fecha;
    cash.Tipo = {
      Compra: 'Compra inversión',
      Venta: 'Venta inversión',
      Cobro: 'Rendimiento inversión',
    }[first.Tipo];
    cash.Origen = first.Tipo === 'Compra' ? p.Cuenta : null;
    cash.Destino = first.Tipo === 'Compra' ? null : p.Cuenta;
    cash.Importe = money_(trades.reduce((sum, r) => sum + tradeAmount_(r), 0));
  });
}
function applyOperations_(initial, operations, requestId, now) {
  const s = clone_(initial),
    results = [],
    aliases = {};
  function required(o, k) {
    check_(!blank_(o[k]), 'Falta ' + k + '.');
    return o[k];
  }
  function cash(o, type, id, origin, destination, category, amount) {
    const row = putRow_(
      s,
      'tMovimientos',
      {
        ID: id,
        Fecha: serialDate_(required(o, 'date')),
        Tipo: type,
        Concepto: required(o, 'concept'),
        Subcategoría: category || null,
        Origen: origin || null,
        Destino: destination || null,
        Importe: moneyInput_(
          amount === undefined ? required(o, 'amount') : amount,
          'Importe',
        ),
        Recuperable: o.recoverable || 0,
        Localización: blank_(o.location) ? null : o.location,
        Recurrente: type === 'Gasto' ? recurrence_(o.recurring) : null,
      },
      false,
    );
    s.settings.asof = Math.max(s.settings.asof, row.Fecha);
    return row;
  }
  operations.forEach((original, index) => {
    check_(object_(original), 'Operación inválida.');
    const o = clone_(original),
      p = o.process,
      allowed = PROCESS_FIELDS_[p];
    check_(
      Object.prototype.hasOwnProperty.call(PROCESS_FIELDS_, p),
      'Proceso desconocido.',
    );
    check_(
      Object.keys(o).every((k) => k === 'process' || allowed.indexOf(k) >= 0),
      'Campo desconocido, calculado o ID manual.',
    );
    if (o.alias)
      check_(
        typeof o.alias === 'string' &&
          /^[A-Za-z][A-Za-z0-9_-]{0,40}$/.test(o.alias) &&
          !Object.prototype.hasOwnProperty.call(aliases, o.alias),
        'Alias inválido o duplicado.',
      );
    const id = 'MOV-' + requestId + '-' + (index + 1),
      tradeId = 'INV-' + requestId + '-' + (index + 1);
    let result = { process: p },
      primary = null;
    if (['gasto', 'ingreso', 'nomina'].indexOf(p) >= 0) {
      const a = resolveReference_(
          s,
          'tCuentas',
          required(o, 'account'),
          aliases,
          'Cuenta',
        ),
        type = p === 'gasto' ? 'Gasto' : 'Ingreso';
      const row = cash(
        o,
        type,
        id,
        p === 'gasto' ? a : null,
        p === 'gasto' ? null : a,
        required(o, 'category'),
      );
      if (p === 'nomina')
        putRow_(
          s,
          'tNominas',
          {
            Movimiento: row.ID,
            Bruto: o.gross,
            Cotización: o.contribution,
            IRPF: o.tax,
            'Otras deducciones': o.otherDeductions,
          },
          false,
        );
      primary = row.ID;
    } else if (p === 'traspaso') {
      primary = cash(
        o,
        'Transferencia',
        id,
        resolveReference_(
          s,
          'tCuentas',
          required(o, 'from'),
          aliases,
          'Origen',
        ),
        resolveReference_(s, 'tCuentas', required(o, 'to'), aliases, 'Destino'),
      ).ID;
    } else if (
      [
        'cobro_compartido',
        'devolucion_gasto',
        'prestamo',
        'pago_deuda',
      ].indexOf(p) >= 0
    ) {
      const isDebt = ['prestamo', 'pago_deuda'].indexOf(p) >= 0;
      const target = resolveReference_(
        s,
        isDebt ? 'tDeudas' : 'tMovimientos',
        required(o, isDebt ? 'debt' : 'original'),
        aliases,
        'Vínculo',
      );
      const original = s.tables.tMovimientos.find((m) => m.ID === target);
      const a = resolveReference_(
        s,
        'tCuentas',
        required(o, 'account'),
        aliases,
        'Cuenta',
      );
      const type = {
        cobro_compartido: 'Cobro compartido',
        devolucion_gasto: 'Devolución gasto',
        prestamo: 'Préstamo recibido',
        pago_deuda: 'Devolución deuda',
      }[p];
      const row = cash(
        o,
        type,
        id,
        p === 'pago_deuda' ? a : null,
        p === 'pago_deuda' ? null : a,
        p === 'devolucion_gasto' && original ? original.Subcategoría : null,
      );
      putRow_(
        s,
        'tVinculos',
        { Movimiento: row.ID, 'Vinculado a': target },
        false,
      );
      primary = row.ID;
    } else if (['compra', 'venta', 'rendimiento'].indexOf(p) >= 0) {
      const product = resolveReference_(
          s,
          'tProductos',
          required(o, 'product'),
          aliases,
          'Producto',
        ),
        prd = s.tables.tProductos.find((r) => r.ID === product);
      const type = { compra: 'Compra', venta: 'Venta', rendimiento: 'Cobro' }[
          p
        ],
        date = serialDate_(required(o, 'date'));
      if (o.historical !== undefined)
        check_(
          typeof o.historical === 'boolean',
          'historical debe ser booleano.',
        );
      check_(
        !o.historical || date < s.settings.start,
        'Histórico solo antes del inicio del seguimiento.',
      );
      const r = {
        ID: tradeId,
        Fecha: date,
        Producto: product,
        Tipo: type,
        Participaciones: type === 'Cobro' ? 0 : required(o, 'units'),
        Precio: required(o, type === 'Cobro' ? 'gross' : 'price'),
        Comisión: o.fee || 0,
        Retención: o.tax || 0,
        Movimiento: o.historical ? null : id,
      };
      if (!o.historical)
        cash(
          o,
          {
            compra: 'Compra inversión',
            venta: 'Venta inversión',
            rendimiento: 'Rendimiento inversión',
          }[p],
          id,
          p === 'compra' ? prd.Cuenta : null,
          p === 'compra' ? null : prd.Cuenta,
          null,
          money_(tradeAmount_(r)),
        );
      putRow_(s, 'tOperaciones', r, false);
      s.settings.valuation = Math.max(s.settings.valuation, date);
      primary = tradeId;
      result.movement = r.Movimiento;
    } else if (p === 'precio') {
      const r = {
        Producto: resolveReference_(
          s,
          'tProductos',
          required(o, 'product'),
          aliases,
          'Producto',
        ),
        Fecha: serialDate_(required(o, 'date')),
        'VL EUR': required(o, 'price'),
        Fuente: required(o, 'source'),
      };
      putRow_(s, 'tPrecios', r, o.replace === true);
      s.settings.valuation = Math.max(s.settings.valuation, r.Fecha);
      s.settings.asof = Math.max(s.settings.asof, r.Fecha);
      result.key = [r.Producto, isoDate_(r.Fecha)];
    } else if (p === 'cuenta') {
      check_(
        blank_(o.observed) && blank_(o.observedDate),
        'Añade la observación mediante saldo_observado para conservar su historial.',
      );
      primary = required(o, 'account');
      putRow_(
        s,
        'tCuentas',
        {
          Cuenta: primary,
          'Saldo inicial': o.opening === undefined ? 0 : o.opening,
          'Saldo real': null,
          'Fecha saldo': null,
        },
        false,
      );
    } else if (p === 'saldo_observado') {
      const account = resolveReference_(
          s,
          'tCuentas',
          required(o, 'account'),
          aliases,
          'Cuenta',
        ),
        amount = required(o, 'amount'),
        date = serialDate_(required(o, 'date'));
      number_(amount, 'Saldo observado', false, -1e12);
      const scope = o.scope || 'desconocido';
      check_(
        ['desconocido', 'cierre_dia', 'intradía'].indexOf(scope) >= 0,
        'Alcance de observación inválido.',
      );
      const time = blank_(o.time) ? null : o.time;
      check_(
        time === null ||
          (typeof time === 'string' &&
            /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(time)),
        'Hora inválida.',
      );
      if (scope === 'intradía')
        check_(time !== null, 'Una observación intradía necesita hora.');
      const source = o.source || 'usuario';
      text_(source, 'Fuente');
      const obs = [
        'OBS-' + requestId + '-' + (index + 1),
        account,
        amount,
        date,
        time,
        scope,
        source,
        now,
      ];
      s.technical.observations.push(obs);
      primary = obs[0];
      const row = s.tables.tCuentas.find((a) => a.Cuenta === account);
      if (blank_(row['Fecha saldo']) || date >= row['Fecha saldo']) {
        row['Saldo real'] = amount;
        row['Fecha saldo'] = date;
      }
      s.settings.asof = Math.max(s.settings.asof, date);
    } else if (p === 'deuda_inicial') {
      primary = 'DEU-' + requestId + '-' + (index + 1);
      putRow_(
        s,
        'tDeudas',
        {
          ID: primary,
          Acreedor: required(o, 'creditor'),
          'Saldo inicial': o.opening === undefined ? 0 : o.opening,
        },
        false,
      );
    } else if (p === 'categoria') {
      const r = {};
      ['Grupo', 'Subgrupo', 'Categoría', 'Subcategoría'].forEach(
        (h, i) =>
          (r[h] = required(
            o,
            ['group', 'subgroup', 'category', 'subcategory'][i],
          )),
      );
      putRow_(s, 'tCategorias', r, false);
      primary = r.Subcategoría;
    } else if (p === 'producto') {
      primary = 'PRO-' + requestId + '-' + (index + 1);
      putRow_(
        s,
        'tProductos',
        {
          ID: primary,
          Producto: required(o, 'name'),
          Cuenta: resolveReference_(
            s,
            'tCuentas',
            required(o, 'account'),
            aliases,
            'Cuenta',
          ),
          Clase: required(o, 'class'),
          'Fecha base': serialDate_(required(o, 'date')),
          'Unidades base': o.units === undefined ? 0 : o.units,
          'Coste base': o.cost === undefined ? 0 : o.cost,
        },
        false,
      );
      if (!blank_(o.isin))
        bindFund_(s, primary, o.isin, o.referenceName || o.name, now);
      else
        check_(
          blank_(o.referenceName),
          'El nombre de referencia necesita un ISIN.',
        );
    } else if (p === 'vincular_isin') {
      primary = resolveReference_(
        s,
        'tProductos',
        required(o, 'product'),
        aliases,
        'Producto',
      );
      bindFund_(
        s,
        primary,
        required(o, 'isin'),
        required(o, 'referenceName'),
        now,
      );
    } else if (p === 'objetivo') {
      primary = 'OBJ-' + requestId + '-' + (index + 1);
      putRow_(
        s,
        'tObjetivos',
        {
          ID: primary,
          Objetivo: required(o, 'name'),
          Meta: required(o, 'amount'),
          Fecha: blank_(o.date) ? null : serialDate_(o.date),
        },
        false,
      );
    } else if (p === 'asignacion') {
      const goal = resolveReference_(
        s,
        'tObjetivos',
        required(o, 'goal'),
        aliases,
        'Objetivo',
      );
      let origin = o.origin;
      if (typeof origin === 'string' && origin.charAt(0) === '$')
        origin = aliases[origin.slice(1)];
      if (!s.tables.tCuentas.some((a) => a.Cuenta === origin))
        origin = resolveReference_(s, 'tProductos', origin, aliases, 'Origen');
      putRow_(
        s,
        'tAsignaciones',
        { Objetivo: goal, Origen: origin, Importe: required(o, 'amount') },
        true,
      );
      result.key = [goal, origin];
    } else if (p === 'fechas') {
      Object.keys(PARAMETER_NAMES_).forEach((k) => {
        if (o[k] !== undefined) s.settings[k] = serialDate_(o[k]);
      });
    } else if (p === 'corregir') {
      const name = required(o, 'table');
      check_(
        Object.prototype.hasOwnProperty.call(INPUT_SCHEMA_, name) &&
          object_(o.key) &&
          object_(o.changes) &&
          Object.keys(o.changes).length > 0,
        'Corrección incompleta.',
      );
      const key = normalizeRow_(name, o.key),
        row = s.tables[name].find(
          (r) => rowKey_(name, r) === rowKey_(name, key),
        );
      if (!row) fail_('NOT_FOUND', 'Registro desconocido.');
      check_(
        Object.keys(o.changes).every(
          (k) =>
            INPUT_SCHEMA_[name].inputs.indexOf(k) >= 0 &&
            keyFields_(name).indexOf(k) < 0,
        ),
        'No se corrigen claves ni columnas calculadas.',
      );
      if (name === 'tCuentas')
        check_(
          !Object.prototype.hasOwnProperty.call(o.changes, 'Saldo real') &&
            !Object.prototype.hasOwnProperty.call(o.changes, 'Fecha saldo'),
          'Usa saldo_observado para conservar las observaciones.',
        );
      if (name === 'tOperaciones')
        check_(
          !Object.prototype.hasOwnProperty.call(o.changes, 'Movimiento'),
          'El movimiento enlazado lo administra el backend.',
        );
      if (
        name === 'tMovimientos' &&
        s.tables.tOperaciones.some((r) => r.Movimiento === row.ID)
      )
        check_(
          Object.keys(o.changes).every(
            (k) => ['Concepto', 'Localización'].indexOf(k) >= 0,
          ),
          'Corrige la operación de inversión para cambiar su efectivo.',
        );
      putRow_(s, name, Object.assign({}, row, o.changes), true);
      if (name === 'tOperaciones' || name === 'tProductos')
        synchronizeTradeCash_(s);
      s.tables.tMovimientos.forEach(
        (m) => (s.settings.asof = Math.max(s.settings.asof, m.Fecha)),
      );
      s.tables.tOperaciones.forEach(
        (r) => (s.settings.valuation = Math.max(s.settings.valuation, r.Fecha)),
      );
    } else if (p === 'renombrar') {
      const spec = {
        cuenta: ['tCuentas', 'Cuenta'],
        subcategoria: ['tCategorias', 'Subcategoría'],
      }[o.kind];
      check_(
        !!spec,
        'Solo se renombran cuentas o subcategorías; los IDs internos permanecen estables.',
      );
      const [name, field] = spec,
        old = required(o, 'from'),
        value = required(o, 'to');
      text_(value, 'Nuevo nombre');
      const row = s.tables[name].find((r) => r[field] === old);
      if (!row) fail_('NOT_FOUND', 'Nombre anterior desconocido.');
      check_(
        !s.tables[name].some((r) => r[field] === value),
        'Nombre ya utilizado.',
      );
      row[field] = value;
      const refs =
        o.kind === 'cuenta'
          ? {
              tMovimientos: ['Origen', 'Destino'],
              tProductos: ['Cuenta'],
              tAsignaciones: ['Origen'],
            }
          : { tMovimientos: ['Subcategoría'] };
      Object.keys(refs).forEach((t) =>
        s.tables[t].forEach((r) =>
          refs[t].forEach((k) => {
            if (r[k] === old) r[k] = value;
          }),
        ),
      );
      if (o.kind === 'cuenta')
        s.technical.observations.forEach((r) => {
          if (r[1] === old) r[1] = value;
        });
      // Conserva los filtros existentes; el adaptador de escritura actualiza la selección si coincide.
      s.renames = (s.renames || []).concat([
        { kind: o.kind, from: old, to: value },
      ]);
      primary = value;
    } else if (p === 'eliminar') {
      const name = required(o, 'table');
      check_(
        Object.prototype.hasOwnProperty.call(INPUT_SCHEMA_, name) &&
          object_(o.key),
        'Anulación incompleta.',
      );
      const key = normalizeRow_(name, o.key),
        row = dropRow_(s, name, key);
      if (row && name === 'tMovimientos') {
        s.tables.tOperaciones = s.tables.tOperaciones.filter(
          (r) => r.Movimiento !== row.ID,
        );
        s.tables.tNominas = s.tables.tNominas.filter(
          (r) => r.Movimiento !== row.ID,
        );
        s.tables.tVinculos = s.tables.tVinculos.filter(
          (r) => r.Movimiento !== row.ID,
        );
      }
      if (
        row &&
        name === 'tOperaciones' &&
        row.Movimiento &&
        !s.tables.tOperaciones.some((r) => r.Movimiento === row.Movimiento)
      )
        dropRow_(s, 'tMovimientos', { ID: row.Movimiento });
      if (row && name === 'tOperaciones') synchronizeTradeCash_(s);
      if (row && name === 'tObjetivos')
        s.tables.tAsignaciones = s.tables.tAsignaciones.filter(
          (r) => r.Objetivo !== row.ID,
        );
      result.result = row ? 'anulado' : 'ya ausente';
    }
    if (primary !== null) {
      result.id = primary;
      if (o.alias) aliases[o.alias] = primary;
    }
    results.push(result);
  });
  validateFinancialState_(s);
  s.revision = revision_(s);
  return { state: s, results };
}

function cellValue_(v) {
  if (blank_(v)) return {};
  return {
    userEnteredValue:
      typeof v === 'number'
        ? { numberValue: v }
        : typeof v === 'boolean'
          ? { boolValue: v }
          : { stringValue: String(v) },
  };
}
function cellRequest_(sheetId, row, column, value) {
  return {
    updateCells: {
      start: { sheetId, rowIndex: row, columnIndex: column },
      rows: [{ values: [cellValue_(value)] }],
      fields: 'userEnteredValue',
    },
  };
}
function appendTechnical_(requests, meta, existing, rows) {
  if (!rows.length) return;
  const needed = 1 + existing.length + rows.length;
  if (needed > meta.rowCount)
    requests.push({
      appendDimension: {
        sheetId: meta.id,
        dimension: 'ROWS',
        length: Math.max(100, needed - meta.rowCount),
      },
    });
  requests.push({
    updateCells: {
      start: {
        sheetId: meta.id,
        rowIndex: existing.length + 1,
        columnIndex: 0,
      },
      rows: rows.map((row) => ({ values: row.map(cellValue_) })),
      fields: 'userEnteredValue',
    },
  });
}
function mutationRequests_(before, after, requestId, now, result) {
  const requests = [],
    audit = [];
  Object.keys(INPUT_SCHEMA_).forEach((name) => {
    const meta = before.layout[name],
      original = before.raw[name],
      assigned = new Map(),
      available = [];
    const remaining = new Map(
      after.tables[name].map((r) => [rowKey_(name, r), r]),
    );
    original.forEach((slot) => {
      const key = rowKey_(name, slot.input);
      if (remaining.has(key)) {
        assigned.set(slot.row, remaining.get(key));
        remaining.delete(key);
      } else available.push(slot.row);
    });
    if (remaining.size > available.length)
      fail_(
        'CAPACITY_REACHED',
        'No quedan filas preparadas en ' +
          name +
          '. Amplía su capacidad y fórmulas antes de registrar este lote.',
      );
    remaining.forEach((row) => assigned.set(available.shift(), row));
    original.forEach((slot) => {
      const row = assigned.get(slot.row) || inputs_(name, {});
      if (canonical_(row) === canonical_(slot.input)) return;
      INPUT_SCHEMA_[name].inputs.forEach((h) => {
        if (canonical_(row[h]) !== canonical_(slot.input[h]))
          requests.push(
            cellRequest_(
              meta.range.sheetId,
              slot.row,
              (meta.range.startColumnIndex || 0) + meta.headers.indexOf(h),
              row[h],
            ),
          );
      });
      audit.push([
        requestId,
        now,
        name,
        rowKey_(
          name,
          blank_(
            keyFields_(name)
              .map((k) => row[k])
              .find((v) => !blank_(v)),
          )
            ? slot.input
            : row,
        ),
        canonical_(slot.input),
        canonical_(row),
      ]);
      if (
        name === 'tProductos' &&
        !blank_(slot.input.ID) &&
        row.ID === slot.input.ID &&
        row.Producto !== slot.input.Producto
      ) {
        const sheet = before.book.sheets.find(
          (s) => s.properties.title === 'Inversiones',
        );
        requests.push({
          findReplace: {
            find: slot.input.Producto,
            replacement: row.Producto,
            matchCase: true,
            matchEntireCell: true,
            includeFormulas: false,
            range: {
              sheetId: sheet.properties.sheetId,
              startRowIndex: 3,
              endRowIndex: 4,
              startColumnIndex: 3,
              endColumnIndex: 4,
            },
          },
        });
      }
    });
  });
  const param = before.layout.tParametros;
  Object.keys(PARAMETER_NAMES_).forEach((k) => {
    if (before.settings[k] === after.settings[k]) return;
    const i = before.parameters.findIndex((r) => r[0] === PARAMETER_NAMES_[k]);
    check_(i >= 0, 'Parámetro temporal ausente.');
    requests.push(
      cellRequest_(
        param.range.sheetId,
        param.range.startRowIndex + 1 + i,
        (param.range.startColumnIndex || 0) + 1,
        after.settings[k],
      ),
    );
    audit.push([
      requestId,
      now,
      'tParametros',
      PARAMETER_NAMES_[k],
      String(before.settings[k]),
      String(after.settings[k]),
    ]);
  });
  // Un renombrado de cuenta conserva su selección en el filtro, sin modificar otros filtros.
  (after.renames || [])
    .filter((r) => r.kind === 'cuenta')
    .forEach((rename) => {
      const summary = before.book.sheets.find(
        (s) => s.properties.title === 'Resumen financiero',
      );
      requests.push({
        findReplace: {
          find: rename.from,
          replacement: rename.to,
          matchCase: true,
          matchEntireCell: true,
          includeFormulas: false,
          range: {
            sheetId: summary.properties.sheetId,
            startRowIndex: 3,
            endRowIndex: 4,
            startColumnIndex: 16,
            endColumnIndex: 17,
          },
        },
      });
    });
  const oldObs = before.technical.observations,
    newObs = after.technical.observations;
  for (let i = 0; i < oldObs.length; i++)
    if (canonical_(oldObs[i]) !== canonical_(newObs[i])) {
      requests.push({
        updateCells: {
          start: {
            sheetId: before.tech.observations.id,
            rowIndex: i + 1,
            columnIndex: 0,
          },
          rows: [{ values: newObs[i].map(cellValue_) }],
          fields: 'userEnteredValue',
        },
      });
      audit.push([
        requestId,
        now,
        'observaciones',
        oldObs[i][0],
        canonical_(oldObs[i]),
        canonical_(newObs[i]),
      ]);
    }
  const addedObs = newObs.slice(oldObs.length);
  appendTechnical_(requests, before.tech.observations, oldObs, addedObs);
  addedObs.forEach((row) =>
    audit.push([
      requestId,
      now,
      'observaciones',
      row[0],
      'null',
      canonical_(row),
    ]),
  );
  ['funds', 'quotes'].forEach((kind) => {
    const added = after.technical[kind].slice(before.technical[kind].length);
    if (added.length && !before.tech[kind])
      fail_(
        'NOT_INITIALIZED',
        'Ejecuta comprobarPaso4 para preparar cotizaciones.',
      );
    if (added.length)
      appendTechnical_(
        requests,
        before.tech[kind],
        before.technical[kind],
        added,
      );
    added.forEach((row) =>
      audit.push([requestId, now, kind, row[0], 'null', canonical_(row)]),
    );
  });
  appendTechnical_(requests, before.tech.audit, before.technical.audit, audit);
  appendTechnical_(requests, before.tech.requests, before.technical.requests, [
    [
      requestId,
      result.fingerprint || hash_(result.operations),
      now,
      JSON.stringify(result.response),
    ],
  ]);
  return requests;
}

function initializeBackend_(config) {
  return locked_(() => initializeBackendUnlocked_(config));
}
function initializeBackendUnlocked_(config) {
  const state = readState_(config),
    missing = Object.keys(TECH_SCHEMA_).filter((k) => !state.tech[k]);
  if (!missing.length) return state;
  // Una creación incompleta o un nombre ocupado se investiga; no se sobrescriben hojas ajenas.
  const base = ['requests', 'audit', 'observations'].filter(
    (k) => state.tech[k],
  );
  if (base.length && base.length !== 3)
    fail_('SCHEMA_CONFLICT', 'La configuración técnica está incompleta.');
  const requests = [],
    ids = new Set(state.book.sheets.map((s) => s.properties.sheetId));
  const now = new Date().toISOString();
  Object.keys(TECH_SCHEMA_).forEach((kind, i) => {
    if (state.tech[kind]) return;
    const [title, headers] = TECH_SCHEMA_[kind];
    let id = 1700000000 + i;
    while (ids.has(id)) id++;
    ids.add(id);
    requests.push({
      addSheet: {
        properties: {
          sheetId: id,
          title,
          hidden: true,
          gridProperties: {
            rowCount: 1000,
            columnCount: headers.length,
            frozenRowCount: 1,
          },
        },
      },
    });
    const rows = [headers];
    if (kind === 'observations')
      state.tables.tCuentas
        .filter((a) => !blank_(a['Saldo real']))
        .forEach((a) =>
          rows.push([
            'LEGACY-' +
              hash_([a.Cuenta, a['Saldo real'], a['Fecha saldo']]).slice(0, 24),
            a.Cuenta,
            a['Saldo real'],
            a['Fecha saldo'],
            null,
            'desconocido',
            'origen_sin_hora',
            now,
          ]),
        );
    if (kind === 'funds')
      state.tables.tProductos
        .filter((p) => validIsin_(p.ID))
        .forEach((p) =>
          rows.push([p.ID, normalizeIsin_(p.ID), p.Producto, now]),
        );
    requests.push({
      updateCells: {
        start: { sheetId: id, rowIndex: 0, columnIndex: 0 },
        rows: rows.map((row) => ({ values: row.map(cellValue_) })),
        fields: 'userEnteredValue',
      },
    });
  });
  Sheets.Spreadsheets.batchUpdate({ requests }, config.id);
  return readState_(config);
}
function diagnostics_(s) {
  const capacityReady =
    Object.keys(supportRanges_(s)).length ===
      Object.keys(SUPPORT_NAMES_).length &&
    s.supportSignature === capacitySignature_(s);
  const calculationReady = !(s.calculationErrors || []).length;
  return {
    ok: true,
    apiVersion: API_VERSION_,
    buildVersion: BUILD_VERSION_,
    supportsBookBinding: true,
    environment: s.environment,
    modelVersion: 3,
    businessSheetCount: REQUIRED_SHEETS_.length,
    tableCount: TABLE_SCHEMA_.length,
    backendReady:
      ['requests', 'audit', 'observations'].every((k) => s.tech[k]) &&
      capacityReady &&
      calculationReady,
    priceReady: Object.keys(TECH_SCHEMA_).every((k) => s.tech[k]),
    priceProviders: ['VDOS / Quefondos'],
    capacityReady,
    calculationReady,
    calculationErrors: s.calculationErrors || [],
    rows: Object.fromEntries(
      Object.keys(s.tables).map((k) => [
        k,
        { used: s.tables[k].length, capacity: s.raw[k].length },
      ]),
    ),
    revision: s.revision,
    checkedAt: new Date().toISOString(),
  };
}
function publicSnapshot_(s) {
  const data = {};
  Object.keys(s.raw).forEach((name) => {
    data[name] = s.raw[name]
      .filter((slot) =>
        INPUT_SCHEMA_[name].inputs.some((h) => !blank_(slot.input[h])),
      )
      .map((slot) => {
        const row = Object.assign({}, slot.full, slot.input);
        DATE_FIELDS_.concat(name === 'tNominas' ? ['Fecha cobro'] : []).forEach(
          (k) => {
            if (!blank_(row[k])) row[k] = isoDate_(row[k]);
          },
        );
        return row;
      });
  });
  const observations = s.technical.observations.map((row) => {
    const account = s.tables.tCuentas.find((a) => a.Cuenta === row[1]);
    let difference = null,
      status = 'referencia_sin_corte_comparable';
    if (row[5] === 'cierre_dia' && row[3] >= s.settings.start && account) {
      const balance =
        account['Saldo inicial'] +
        s.tables.tMovimientos
          .filter((m) => m.Fecha >= s.settings.start && m.Fecha <= row[3])
          .reduce(
            (sum, m) =>
              sum +
              (m.Destino === row[1] ? m.Importe : 0) -
              (m.Origen === row[1] ? m.Importe : 0),
            0,
          );
      difference = money_(balance - row[2]);
      status =
        Math.abs(difference) < 0.005
          ? 'coincide_al_corte'
          : 'diferencia_al_corte';
    }
    return {
      id: row[0],
      account: row[1],
      amount: row[2],
      date: isoDate_(row[3]),
      time: row[4],
      scope: row[5],
      source: row[6],
      recordedAt: row[7],
      comparisonStatus: status,
      difference,
    };
  });
  const calculationErrors = (s.calculationErrors || []).slice();
  Object.keys(data).forEach((name) =>
    data[name].forEach((row) =>
      s.layout[name].headers
        .filter((h) => INPUT_SCHEMA_[name].inputs.indexOf(h) < 0)
        .forEach((h) => {
          if (
            typeof row[h] === 'string' &&
            /^#(?:REF!|VALUE!|DIV\/0!|N\/A|NAME\?|NUM!|ERROR!)/.test(row[h])
          )
            calculationErrors.push({
              table: name,
              key: rowKey_(name, row),
              column: h,
              error: row[h],
            });
        }),
    ),
  );
  return Object.assign(diagnostics_(s), {
    calculationState: calculationErrors.length ? 'needs_review' : 'ready',
    calculationErrors,
    settings: Object.fromEntries(
      Object.keys(s.settings).map((k) => [k, isoDate_(s.settings[k])]),
    ),
    tables: data,
    observations,
    prices: priceSnapshot_(s),
    summary: nativeSummary_(s, data),
    bookKey: s.bookKey,
  });
}

// Resumen leído del motor nativo, con cabeceras verificadas; nunca un motor paralelo.
function nativeSummary_(s, data) {
  const groups = [
    ['Patrimonio neto', 'Efectivo', 'Inversiones', 'Deuda'],
    ['Ingresos', 'Gastos propios', 'Ahorro', 'Tasa de ahorro'],
  ];
  const rows = s.summaryValues || [];
  // Identificar las dos filas de tarjetas completas. Las tablas/gráficas inferiores
  // reutilizan Ingresos, Ahorro y Efectivo; sus cabeceras no son tarjetas duplicadas.
  const metrics = groups.flatMap((labels) => {
    const matches = rows
      .map((row, i) => ({ row, i }))
      .filter(({ row }) => labels.every((label) => row.includes(label)));
    const header = matches.length === 1 ? matches[0] : null;
    return labels.map((label) => {
      const columns = header
        ? header.row.reduce((out, value, j) => {
            if (value === label) out.push(j);
            return out;
          }, [])
        : [];
      const value =
        columns.length === 1 && (rows[header.i + 1] || [])[columns[0]];
      return {
        label,
        value:
          typeof value === 'number' && Number.isFinite(value) ? value : null,
      };
    });
  });
  const filters = {};
  ['Año', 'Periodo', 'Cuenta'].forEach((label) => {
    const row = (s.summaryValues || []).find((r) => r.indexOf(label) >= 0);
    if (row)
      filters[label] =
        row.slice(row.indexOf(label) + 1).find((v) => !blank_(v)) || null;
  });
  const missingPrices = data.tProductos
    .filter(
      (p) =>
        typeof p.Participaciones !== 'number' ||
        (p.Participaciones > 1e-8 &&
          !s.tables.tPrecios.some(
            (q) => q.Producto === p.ID && q.Fecha <= s.settings.valuation,
          )),
    )
    .map((p) => p.Producto);
  if (missingPrices.length)
    metrics
      .filter((m) => ['Patrimonio neto', 'Inversiones'].indexOf(m.label) >= 0)
      .forEach((m) => (m.value = null));
  return {
    source: 'Sheets · Resumen financiero',
    metrics,
    filters,
    missingPrices,
    missingMetrics: metrics.filter((m) => m.value === null).map((m) => m.label),
    complete: !missingPrices.length && metrics.every((m) => m.value !== null),
    settings: Object.fromEntries(
      Object.keys(s.settings).map((k) => [k, isoDate_(s.settings[k])]),
    ),
  };
}

// Único punto remoto de la API. No se admiten IDs de libro o instrucciones de celda.
function financialApi(request) {
  try {
    const config = authorizedConfig_();
    if (
      !object_(request) ||
      JSON.stringify(request).length > 60000 ||
      Object.keys(request).some(
        (k) =>
          [
            'action',
            'requestId',
            'expectedRevision',
            'operations',
            'funds',
            'products',
            'bookKey',
          ].indexOf(k) < 0,
      )
    )
      fail_('INVALID_REQUEST');
    if (request.action === 'quotePrices') return quotePrices_(request, config);
    if (request.action === 'refreshPrices')
      return refreshPrices_(config, request);
    if (
      Object.keys(request).some(
        (k) =>
          [
            'action',
            'requestId',
            'expectedRevision',
            'operations',
            'bookKey',
          ].indexOf(k) < 0,
      )
    )
      fail_('INVALID_REQUEST');
    if (request.action === 'read' || request.action === 'diagnostics') {
      const s = readState_(config);
      return request.action === 'read' ? publicSnapshot_(s) : diagnostics_(s);
    }
    if (request.action === 'acceptance') return closureReport_(config);
    if (request.action === 'requestStatus') {
      if (!uuid_(request.requestId)) fail_('INVALID_REQUEST');
      const s = readState_(config);
      checkRequestBook_(request, s);
      const row = s.technical.requests.find(
        (r) => r[0] === request.requestId.toLowerCase(),
      );
      return row
        ? Object.assign(JSON.parse(row[3]), { replayed: true })
        : { ok: true, found: false };
    }
    if (
      request.action !== 'transact' ||
      !uuid_(request.requestId) ||
      typeof request.expectedRevision !== 'string' ||
      !Array.isArray(request.operations) ||
      request.operations.length < 1 ||
      request.operations.length > 20
    )
      fail_('INVALID_REQUEST');
    const requestId = request.requestId.toLowerCase(),
      fingerprint = hash_(request.operations);
    return locked_(() => {
      let before = readState_(config);
      checkRequestBook_(request, before);
      if (!['requests', 'audit', 'observations'].every((k) => before.tech[k]))
        fail_('NOT_INITIALIZED', 'Ejecuta comprobarPaso3 desde el editor.');
      const stored = before.technical.requests.find((r) => r[0] === requestId);
      // La consulta de solicitudes precede al control de revisión: una respuesta perdida es reintentable.
      if (stored) {
        if (stored[1] !== fingerprint)
          fail_(
            'REQUEST_CONFLICT',
            'La solicitud ya existe con contenido distinto.',
          );
        return Object.assign(JSON.parse(stored[3]), { replayed: true });
      }
      if (before.revision !== request.expectedRevision)
        fail_(
          'CONFLICT',
          'El libro cambió. Vuelve a leer antes de preparar una nueva operación.',
        );
      const now = new Date().toISOString();
      let applied = applyOperations_(
        before,
        request.operations,
        requestId,
        now,
      );
      // La preparación de estructura no registra operaciones: las entradas, caja y solicitud
      // siguen en un único lote. Un fallo aquí permite reintentar el mismo sobre sin duplicar.
      before = prepareCapacity_(config, before, applied.state);
      if (before.revision !== request.expectedRevision)
        fail_(
          'CONFLICT',
          'El libro cambió durante la preparación. Vuelve a leer.',
        );
      applied = applyOperations_(before, request.operations, requestId, now);
      const response = {
        ok: true,
        apiVersion: API_VERSION_,
        buildVersion: BUILD_VERSION_,
        environment: config.environment,
        requestId,
        revision: applied.state.revision,
        results: applied.results,
        replayed: false,
        checkedAt: now,
      };
      const requests = mutationRequests_(
        before,
        applied.state,
        requestId,
        now,
        { operations: request.operations, response },
      );
      try {
        Sheets.Spreadsheets.batchUpdate({ requests }, config.id);
      } catch (error) {
        // Puede haberse aplicado el lote aunque se perdiera la respuesta. No generar otra solicitud.
        try {
          const state = readState_(config),
            saved = state.technical.requests.find((r) => r[0] === requestId);
          if (saved && saved[1] === fingerprint)
            return Object.assign(JSON.parse(saved[3]), { replayed: true });
        } catch (ignored) {}
        fail_(
          'WRITE_UNCERTAIN',
          'No se pudo confirmar el lote. Consulta o reintenta exactamente la misma solicitud.',
        );
      }
      return response;
    });
  } catch (error) {
    return apiError_(error);
  }
}

// Prepara las hojas técnicas ocultas y comprueba lectura; no modifica registros financieros.
function comprobarPaso3() {
  let result;
  try {
    const config = authorizedConfig_();
    result = locked_(() =>
      diagnostics_(
        prepareCapacity_(config, initializeBackendUnlocked_(config)),
      ),
    );
  } catch (error) {
    result = apiError_(error);
  }
  console.log(JSON.stringify(result));
  return result;
}

// Solo pruebas: gasto e inversión ficticios de 0,01 €, reintentos, correcciones y anulaciones.
// El historial técnico conserva la prueba. Las entradas financieras finales deben quedar idénticas.
function probarTransaccionesPaso3() {
  let id = null,
    config,
    initial,
    outcome;
  function send(operations, requestId, revision) {
    const response = financialApi({
      action: 'transact',
      requestId: requestId || Utilities.getUuid(),
      expectedRevision: revision || readState_(config).revision,
      operations,
    });
    if (!response.ok) fail_(response.error, response.message);
    return response;
  }
  try {
    config = authorizedConfig_();
    if (config.environment !== 'test')
      fail_(
        'TEST_ONLY',
        'Las transacciones ficticias solo se ejecutan en pruebas.',
      );
    initial = initializeBackend_(config);
    const account = initial.tables.tCuentas[0],
      category = initial.tables.tCategorias.find((c) => c.Grupo === 'Gastos');
    check_(
      !!account && !!category,
      'Se necesita una cuenta y una categoría de gastos.',
    );
    const requestId = Utilities.getUuid(),
      operations = [
        {
          process: 'gasto',
          date: isoDate_(initial.settings.asof),
          concept: 'PRUEBA TÉCNICA API — se anula automáticamente',
          account: account.Cuenta,
          category: category.Subcategoría,
          amount: 0.01,
          recurring: false,
        },
      ];
    id = 'MOV-' + requestId.toLowerCase() + '-1';
    const first = send(operations, requestId, initial.revision);
    id = first.results[0].id;
    const replay = send(operations, requestId, initial.revision);
    check_(
      replay.replayed && replay.results[0].id === id,
      'Reintento duplicado.',
    );
    send([
      {
        process: 'corregir',
        table: 'tMovimientos',
        key: { ID: id },
        changes: { Importe: 0.02 },
      },
    ]);
    send([{ process: 'eliminar', table: 'tMovimientos', key: { ID: id } }]);
    id = null;
    const product = initial.tables.tProductos[0];
    let investmentAndCashChecked = false;
    if (product) {
      const buyRequest = Utilities.getUuid(),
        buyOps = [
          {
            process: 'compra',
            date: isoDate_(initial.settings.asof),
            concept: 'PRUEBA TÉCNICA INVERSIÓN — se anula automáticamente',
            product: product.ID,
            units: 0.01,
            price: 1,
            fee: 0,
            location: 'N/A',
          },
        ];
      id = 'MOV-' + buyRequest.toLowerCase() + '-1';
      const bought = send(buyOps, buyRequest),
        tradeId = bought.results[0].id;
      check_(
        send(buyOps, buyRequest, bought.revision).replayed,
        'Compra duplicada al reintentar.',
      );
      let state = readState_(config),
        op = state.tables.tOperaciones.find((r) => r.ID === tradeId),
        cash = state.tables.tMovimientos.find((m) => m.ID === op.Movimiento);
      check_(cash && cash.Importe === 0.01, 'Compra sin efectivo asociado.');
      id = cash.ID;
      send([
        {
          process: 'corregir',
          table: 'tOperaciones',
          key: { ID: tradeId },
          changes: { Precio: 2 },
        },
      ]);
      state = readState_(config);
      check_(
        state.tables.tMovimientos.find((m) => m.ID === id).Importe === 0.02,
        'Corrección sin actualización de efectivo.',
      );
      send([
        { process: 'eliminar', table: 'tOperaciones', key: { ID: tradeId } },
      ]);
      id = null;
      send([
        {
          process: 'fechas',
          start: isoDate_(initial.settings.start),
          asof: isoDate_(initial.settings.asof),
          valuation: isoDate_(initial.settings.valuation),
        },
      ]);
      investmentAndCashChecked = true;
    }
    const final = readState_(config);
    check_(
      canonical_(initial.tables) === canonical_(final.tables) &&
        canonical_(initial.settings) === canonical_(final.settings),
      'Entradas financieras distintas después de la prueba.',
    );
    outcome = {
      ok: true,
      environment: 'test',
      apiVersion: API_VERSION_,
      buildVersion: BUILD_VERSION_,
      duplicatePrevented: true,
      correctionChecked: true,
      cancellationChecked: true,
      investmentAndCashChecked,
      financialInputsRestored: true,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    outcome = apiError_(error);
    if (id && config) {
      try {
        const cleanup = financialApi({
          action: 'transact',
          requestId: Utilities.getUuid(),
          expectedRevision: readState_(config).revision,
          operations: [
            { process: 'eliminar', table: 'tMovimientos', key: { ID: id } },
          ],
        });
        outcome.cleanupConfirmed = cleanup.ok;
        if (!cleanup.ok) outcome.testMovementToReview = id;
      } catch (ignored) {
        outcome.cleanupConfirmed = false;
        outcome.testMovementToReview = id;
      }
    }
  }
  console.log(JSON.stringify(outcome));
  return outcome;
}

// Crecimiento del libro nativo: conserva las tablas, fórmulas, gráficos y validaciones.
const SUPPORT_NAMES_ = {
  movements: 'Finanzas_CalculoMovimientos',
  categories: 'Finanzas_CalculoCategorias',
  history: 'Finanzas_HistoricoProductos',
  products: 'Finanzas_GraficoProductos',
  months: 'Finanzas_MesesInversiones',
  cities: 'Finanzas_GraficoCiudades',
};
function supportRanges_(state) {
  const named = state.book.namedRanges || [],
    out = {};
  Object.keys(SUPPORT_NAMES_).forEach((k) => {
    const found = named.filter((n) => n.name === SUPPORT_NAMES_[k]);
    if (found.length > 1) fail_('SCHEMA_CONFLICT');
    if (found.length) out[k] = found[0];
  });
  return out;
}
function discoverSupport_(config, state) {
  const existing = supportRanges_(state);
  if (Object.keys(existing).length === Object.keys(SUPPORT_NAMES_).length)
    return [];
  const calc = state.book.sheets.find((s) => s.properties.title === 'Cálculos'),
    invest = state.book.sheets.find(
      (s) => s.properties.title === 'Inversiones',
    );
  const specs = [
    {
      sheet: calc,
      range:
        "'Cálculos'!B1:Q" +
        Math.min(calc.properties.gridProperties.rowCount, 2000),
    },
    {
      sheet: invest,
      range:
        "'Inversiones'!B1:E" +
        Math.min(invest.properties.gridProperties.rowCount, 2000),
    },
  ];
  const data = Sheets.Spreadsheets.Values.batchGet(config.id, {
    ranges: specs.map((s) => s.range),
    valueRenderOption: 'FORMULA',
  }).valueRanges;
  const definitions = {
    movements: [0, 0, ['ID', 'Fecha', 'Tipo'], 13],
    categories: [0, 0, ['Categoría', 'Gasto propio'], 5],
    history: [0, 0, ['Mes', 'Producto', 'Corte'], 10],
    products: [0, 3, ['Producto', 'Valor'], 2],
    months: [
      1,
      0,
      ['Mes', 'Capital invertido', 'Valor de mercado', 'Resultado'],
      4,
    ],
    cities: [0, 14, ['Localización', 'Gasto propio'], 2],
  };
  return Object.keys(definitions)
    .filter((k) => !existing[k])
    .map((kind) => {
      const [index, column, headers, width] = definitions[kind],
        rows = data[index].values || [];
      const matches = [];
      rows.forEach((r, i) => {
        if (headers.every((h, j) => r[column + j] === h)) matches.push(i);
      });
      if (matches.length !== 1)
        fail_('SCHEMA_CONFLICT', 'No se localiza de forma única ' + kind + '.');
      const start = matches[0] + 1;
      let end = start;
      while (end < rows.length && !blank_((rows[end] || [])[column])) end++;
      check_(end > start, 'Bloque de cálculo sin plantilla.');
      return {
        addNamedRange: {
          namedRange: {
            name: SUPPORT_NAMES_[kind],
            range: {
              sheetId: specs[index].sheet.properties.sheetId,
              startRowIndex: start,
              endRowIndex: end,
              startColumnIndex: column + 1,
              endColumnIndex: column + 1 + width,
            },
          },
        },
      };
    });
}
function growBusinessRequests_(state, desired, minimum) {
  const groups = new Map();
  Object.keys(INPUT_SCHEMA_).forEach((name) => {
    const meta = state.layout[name],
      cap = state.raw[name].length,
      needed = Math.max(desired.tables[name].length, minimum || 0);
    if (needed <= cap) return;
    const delta = Math.ceil((needed - cap) / 100) * 100,
      key = meta.range.sheetId + ':' + (meta.range.endRowIndex - 1);
    groups.set(key, Math.max(groups.get(key) || 0, delta));
  });
  const requests = [];
  [...groups]
    .map(([key, delta]) => ({
      id: Number(key.split(':')[0]),
      at: Number(key.split(':')[1]),
      delta,
    }))
    .sort((a, b) => a.id - b.id || b.at - a.at)
    .forEach((g) => {
      requests.push({
        insertDimension: {
          range: {
            sheetId: g.id,
            dimension: 'ROWS',
            startIndex: g.at,
            endIndex: g.at + g.delta,
          },
          inheritFromBefore: true,
        },
      });
      Object.keys(INPUT_SCHEMA_).forEach((name) => {
        const m = state.layout[name],
          r = m.range;
        if (
          r.sheetId !== g.id ||
          g.at <= r.startRowIndex ||
          g.at >= r.endRowIndex
        )
          return;
        const source = {
          sheetId: g.id,
          startRowIndex: g.at + g.delta,
          endRowIndex: g.at + g.delta + 1,
          startColumnIndex: r.startColumnIndex || 0,
          endColumnIndex: r.endColumnIndex,
        };
        const destination = Object.assign({}, source, {
          startRowIndex: g.at,
          endRowIndex: g.at + g.delta,
        });
        ['PASTE_FORMAT', 'PASTE_DATA_VALIDATION'].forEach((pasteType) =>
          requests.push({
            copyPaste: {
              source,
              destination,
              pasteType,
              pasteOrientation: 'NORMAL',
            },
          }),
        );
        m.headers
          .filter((h) => INPUT_SCHEMA_[name].inputs.indexOf(h) < 0)
          .forEach((h) => {
            const col = (r.startColumnIndex || 0) + m.headers.indexOf(h);
            requests.push({
              copyPaste: {
                source: Object.assign({}, source, {
                  startColumnIndex: col,
                  endColumnIndex: col + 1,
                }),
                destination: Object.assign({}, destination, {
                  startColumnIndex: col,
                  endColumnIndex: col + 1,
                }),
                pasteType: 'PASTE_FORMULA',
                pasteOrientation: 'NORMAL',
              },
            });
          });
        // Rango explícito: también funciona si el servicio no autoamplía la tabla.
        check_(!!m.tableId, 'Tabla nativa sin identificador.');
        requests.push({
          updateTable: {
            table: {
              tableId: m.tableId,
              range: Object.assign({}, r, {
                endRowIndex: r.endRowIndex + g.delta,
              }),
            },
            fields: 'range',
          },
        });
      });
    });
  return requests;
}
function monthSpan_(s) {
  const bases = s.tables.tProductos.map((p) => p['Fecha base']);
  const first = new Date(
      Date.UTC(1899, 11, 30) +
        Math.min(s.settings.valuation, ...bases) * 86400000,
    ),
    last = new Date(Date.UTC(1899, 11, 30) + s.settings.valuation * 86400000);
  return Math.max(
    1,
    (last.getUTCFullYear() - first.getUTCFullYear()) * 12 +
      last.getUTCMonth() -
      first.getUTCMonth() +
      1,
  );
}
function growSupportRequests_(state, desired) {
  const ranges = supportRanges_(state),
    needed = {
      movements: state.raw.tMovimientos.length,
      categories: state.raw.tCategorias.length,
      products: state.raw.tProductos.length,
      history:
        Math.max(1, desired.tables.tProductos.length) * monthSpan_(desired),
      months: monthSpan_(desired),
      cities:
        ranges.cities.range.endRowIndex - ranges.cities.range.startRowIndex,
    };
  const requests = [];
  Object.keys(ranges)
    .map((k) => ({
      k,
      r: ranges[k].range,
      delta:
        needed[k] -
        (ranges[k].range.endRowIndex - ranges[k].range.startRowIndex),
    }))
    .filter((g) => g.delta > 0)
    .sort(
      (a, b) => a.r.sheetId - b.r.sheetId || b.r.endRowIndex - a.r.endRowIndex,
    )
    .forEach((g) => {
      const r = g.r,
        at = r.endRowIndex - 1;
      requests.push({
        insertDimension: {
          range: {
            sheetId: r.sheetId,
            dimension: 'ROWS',
            startIndex: at,
            endIndex: at + g.delta,
          },
          inheritFromBefore: true,
        },
      });
      const source = Object.assign({}, r, {
          startRowIndex: at + g.delta,
          endRowIndex: at + g.delta + 1,
        }),
        destination = Object.assign({}, r, {
          startRowIndex: at,
          endRowIndex: at + g.delta,
        });
      requests.push({
        copyPaste: {
          source,
          destination,
          pasteType: 'PASTE_FORMAT',
          pasteOrientation: 'NORMAL',
        },
      });
      requests.push({
        updateNamedRange: {
          namedRange: {
            namedRangeId: ranges[g.k].namedRangeId,
            range: Object.assign({}, r, {
              endRowIndex: r.endRowIndex + g.delta,
            }),
          },
          fields: 'range',
        },
      });
    });
  return requests;
}
function formulaBlock_(range, rows, state) {
  return {
    updateCells: {
      start: {
        sheetId: range.sheetId,
        rowIndex: range.startRowIndex,
        columnIndex: range.startColumnIndex,
      },
      rows: rows.map((row) => ({
        values: row.map((formulaValue) => ({
          userEnteredValue: {
            formulaValue: state
              ? nativeFormula_(state, formulaValue)
              : formulaValue,
          },
        })),
      })),
      fields: 'userEnteredValue',
    },
  };
}
function nativeFormula_(state, formula) {
  // El parser de escritura por API requiere A1 aunque la importación conserve
  // referencias de tabla. Las coordenadas se obtienen de las tablas actuales.
  return formula.replace(/(t[A-Za-z]+)\[([^\]]+)\]/g, (whole, name, header) => {
    const meta = state.layout[name];
    if (!meta) return whole;
    const index = meta.headers.indexOf(header);
    check_(index >= 0, 'Columna calculada desconocida.');
    const r = meta.range,
      col = columnA1_((r.startColumnIndex || 0) + index);
    return (
      "'" +
      meta.title.replace(/'/g, "''") +
      "'!$" +
      col +
      '$' +
      (r.startRowIndex + 2) +
      ':$' +
      col +
      '$' +
      r.endRowIndex
    );
  });
}
function supportFormulaRequests_(state) {
  const blocks = supportRanges_(state),
    requests = [];
  const fill = (kind, make) => {
    const range = blocks[kind].range,
      rows = [];
    for (let i = range.startRowIndex; i < range.endRowIndex; i++)
      rows.push(make(i + 1, i - range.startRowIndex));
    requests.push(formulaBlock_(range, rows, state));
  };
  const mr = blocks.movements.range,
    md = state.layout.tMovimientos.range.startRowIndex + 2;
  fill('movements', (r, index) => {
    const source = md + index,
      guard = 'Movimientos!B' + source + '=""';
    const columns = ['B', 'C', 'D', 'F'];
    const out = columns.map(
      (c) =>
        '=IF(OR(' +
        guard +
        ';Movimientos!' +
        c +
        source +
        '="");"";Movimientos!' +
        c +
        source +
        ')',
    );
    out.push(
      '=IF(E' +
        r +
        '="";"";INDEX(tCategorias[Categoría];MATCH(E' +
        r +
        ';tCategorias[Subcategoría];0)))',
    );
    ['G', 'H', 'I', 'J'].forEach((c) =>
      out.push(
        '=IF(OR(' +
          guard +
          ';Movimientos!' +
          c +
          source +
          '="");"";Movimientos!' +
          c +
          source +
          ')',
      ),
    );
    out.push(
      '=IF(B' +
        r +
        '="";"";IF(OR(D' +
        r +
        '="Ingreso";D' +
        r +
        '="Rendimiento inversión");I' +
        r +
        ';0))',
      '=IF(B' +
        r +
        '="";"";IF(D' +
        r +
        '="Gasto";I' +
        r +
        '-J' +
        r +
        ';IF(D' +
        r +
        '="Devolución gasto";-I' +
        r +
        '+J' +
        r +
        ';0)))',
      '=IF(B' +
        r +
        '="";"";IF(D' +
        r +
        '="Gasto";J' +
        r +
        ';IF(D' +
        r +
        '="Cobro compartido";-I' +
        r +
        ';IF(D' +
        r +
        '="Devolución gasto";-J' +
        r +
        ';0))))',
      '=IF(B' + r + '="";"";IF(G' + r + '<>"";G' + r + ';H' + r + '))',
    );
    return out;
  });
  const ref = (c) =>
    "'Cálculos'!$" +
    c +
    '$' +
    (mr.startRowIndex + 1) +
    ':$' +
    c +
    '$' +
    mr.endRowIndex;
  const city = blocks.cities.range,
    move = state.layout.tMovimientos.range,
    loc =
      "'Movimientos'!$K$" +
      (move.startRowIndex + 2) +
      ':$K$' +
      move.endRowIndex,
    cityRows = [];
  for (let r = city.startRowIndex + 1; r <= city.endRowIndex; r++) {
    const label = columnA1_(city.startColumnIndex) + r,
      sum =
        'SUMIFS(' +
        ref('L') +
        ';' +
        ref('C') +
        ';">="&$C$4;' +
        ref('C') +
        ';"<"&$D$4;' +
        loc +
        ';' +
        label;
    cityRows.push([
      '=IF(' +
        label +
        '="";"";IF(\'Resumen financiero\'!$Q$4="Todas";' +
        sum +
        ');' +
        sum +
        ';' +
        ref('N') +
        ";'Resumen financiero'!$Q$4)))",
    ]);
  }
  requests.push(
    formulaBlock_(
      Object.assign({}, city, { startColumnIndex: city.startColumnIndex + 1 }),
      cityRows,
      state,
    ),
  );
  fill('categories', (r, index) => {
    const label =
      '=IFERROR(INDEX(UNIQUE(FILTER(tCategorias[Categoría];tCategorias[Grupo]="Gastos"));' +
      (index + 1) +
      ');"")';
    const sum =
      'SUMIFS(' +
      ref('L') +
      ';' +
      ref('F') +
      ';B' +
      r +
      ';' +
      ref('C') +
      ';">="&$C$4;' +
      ref('C') +
      ';"<"&$D$4';
    return [
      label,
      '=IF(B' +
        r +
        '="";"";IF(\'Resumen financiero\'!$Q$4="Todas";' +
        sum +
        ');' +
        sum +
        ';' +
        ref('N') +
        ";'Resumen financiero'!$Q$4)))",
      '=""',
      label,
      '=IF(COUNT(C' + r + ')=0;"";MAX(0;C' + r + '))',
    ];
  });
  fill('products', (r, index) => [
    '=IFERROR(INDEX(FILTER(tProductos[Producto];tProductos[ID]<>"");' +
      (index + 1) +
      ');"")',
    '=IF(E' +
      r +
      '="";"";INDEX(tProductos[Valor];MATCH(E' +
      r +
      ';tProductos[Producto];0)))',
  ]);
  const first =
    "DATE(YEAR(IF(COUNT(tProductos[Fecha base])=0;'Configuración'!$C$8;MIN(tProductos[Fecha base])));MONTH(IF(COUNT(tProductos[Fecha base])=0;'Configuración'!$C$8;MIN(tProductos[Fecha base])));1)";
  fill('history', (r, index) => {
    const date =
      'EDATE(' + first + ';INT(' + index + '/MAX(1;COUNTA(tProductos[ID]))))';
    const base = (h) =>
      'INDEX(tProductos[' + h + '];MATCH(C' + r + ';tProductos[ID];0))';
    const sum = (column, type) =>
      'SUMIFS(tOperaciones[' +
      column +
      '];tOperaciones[Producto];C' +
      r +
      ';tOperaciones[Fecha];">="&' +
      base('Fecha base') +
      ';tOperaciones[Fecha];"<="&D' +
      r +
      ';tOperaciones[Tipo];"' +
      type +
      '")';
    return [
      '=IF(' + date + '>EOMONTH(\'Configuración\'!$C$8;0);"";' + date + ')',
      '=IF(B' +
        r +
        '="";"";IFERROR(INDEX(FILTER(tProductos[ID];tProductos[ID]<>"");MOD(' +
        index +
        ';MAX(1;COUNTA(tProductos[ID])))+1);""))',
      '=IF(C' + r + '="";"";MIN(EOMONTH(B' + r + ";0);'Configuración'!$C$8))",
      '=IF(C' + r + '="";0;IF(D' + r + '<' + base('Fecha base') + ';0;1))',
      '=IF(E' +
        r +
        '=0;"";' +
        base('Unidades base') +
        '+' +
        sum('Participaciones', 'Compra') +
        '-' +
        sum('Participaciones', 'Venta') +
        ')',
      '=IF(E' +
        r +
        '=0;"";' +
        base('Coste base') +
        '+' +
        sum('Importe', 'Compra') +
        '-' +
        sum('Importe', 'Venta') +
        ')',
      '=IF(E' +
        r +
        '=0;"";MAXIFS(tPrecios[Fecha];tPrecios[Producto];C' +
        r +
        ';tPrecios[Fecha];"<="&D' +
        r +
        '))',
      '=IF(OR(E' +
        r +
        '=0;H' +
        r +
        '=0);"";SUMIFS(tPrecios[VL EUR];tPrecios[Producto];C' +
        r +
        ';tPrecios[Fecha];H' +
        r +
        '))',
      '=IF(E' +
        r +
        '=0;"";IF(F' +
        r +
        '=0;0;IF(COUNT(I' +
        r +
        ')=0;"";F' +
        r +
        '*I' +
        r +
        ')))',
      '=IF(COUNT(J' + r + ')=0;0;1)',
    ];
  });
  const hr = blocks.history.range,
    hs = hr.startRowIndex + 1,
    he = hr.endRowIndex;
  const historyRef = (c) => "'Cálculos'!$" + c + '$' + hs + ':$' + c + '$' + he;
  fill('months', (r, index) => {
    const date = 'EDATE(' + first + ';' + index + ')',
      blank = date + ">EOMONTH('Configuración'!$C$8;0)";
    const total = (value, coverage) =>
      '=IF(' +
      blank +
      ';"";IF(Inversiones!$D$4="Todos";IF(SUMIFS(' +
      historyRef(coverage) +
      ';' +
      historyRef('B') +
      ';' +
      date +
      ')=COUNTA(tProductos[ID]);SUMIFS(' +
      historyRef(value) +
      ';' +
      historyRef('B') +
      ';' +
      date +
      ');"");IF(SUMIFS(' +
      historyRef(coverage) +
      ';' +
      historyRef('B') +
      ';' +
      date +
      ';' +
      historyRef('C') +
      ";'Cálculos'!$I$4)=1;SUMIFS(" +
      historyRef(value) +
      ';' +
      historyRef('B') +
      ';' +
      date +
      ';' +
      historyRef('C') +
      ';\'Cálculos\'!$I$4);"")))';
    return [
      '=IF(' + blank + ';"";TEXT(' + date + ';"mmm yyyy"))',
      total('G', 'E'),
      total('J', 'K'),
      '=IF(COUNT(C' + r + ';D' + r + ')<2;"";D' + r + '-C' + r + ')',
    ];
  });
  const calc = state.book.sheets.find((s) => s.properties.title === 'Cálculos'),
    cr = calc.properties.gridProperties.rowCount;
  const movement = state.layout.tMovimientos.range;
  requests.push({
    setDataValidation: {
      range: {
        sheetId: movement.sheetId,
        startRowIndex: movement.startRowIndex + 1,
        endRowIndex: movement.endRowIndex,
        startColumnIndex: movement.startColumnIndex + 10,
        endColumnIndex: movement.startColumnIndex + 11,
      },
      rule: {
        condition: {
          type: 'CUSTOM_FORMULA',
          values: [
            {
              userEnteredValue:
                '=OR(L' +
                (movement.startRowIndex + 2) +
                '="";AND($D' +
                (movement.startRowIndex + 2) +
                '="Gasto";OR(L' +
                (movement.startRowIndex + 2) +
                '="Sí";L' +
                (movement.startRowIndex + 2) +
                '="No")))',
            },
          ],
        },
        strict: true,
        inputMessage: 'Sí o No solo en gastos.',
      },
    },
  });
  // Los selectores nuevos usan columnas vacías, lejos del gráfico por ciudad.
  const selectors = {
    ListaFiltroCuentas: [
      19,
      '="Todas"',
      '=IFERROR(FILTER(tCuentas[Cuenta];tCuentas[Cuenta]<>"");"")',
    ],
    ListaFiltroProductos: [
      20,
      '="Todos"',
      '=IFERROR(FILTER(tProductos[Producto];tProductos[ID]<>"");"")',
    ],
  };
  Object.keys(selectors).forEach((name) => {
    const [col, firstFormula, listFormula] = selectors[name];
    requests.push(
      formulaBlock_(
        {
          sheetId: calc.properties.sheetId,
          startRowIndex: 8,
          startColumnIndex: col,
        },
        [[firstFormula], [listFormula]],
        state,
      ),
    );
    const found = (state.book.namedRanges || []).find((n) => n.name === name),
      range = {
        sheetId: calc.properties.sheetId,
        startRowIndex: 8,
        endRowIndex: cr,
        startColumnIndex: col,
        endColumnIndex: col + 1,
      };
    requests.push(
      found
        ? {
            updateNamedRange: {
              namedRange: { namedRangeId: found.namedRangeId, range },
              fields: 'range',
            },
          }
        : { addNamedRange: { namedRange: { name, range } } },
    );
  });
  requests.push(
    cellRequest_(calc.properties.sheetId, 7, 19, capacitySignature_(state)),
  );
  return requests;
}
function capacitySignature_(state) {
  return (
    'API-' +
    CAPACITY_VERSION_ +
    '-A1-' +
    hash_({
      tables: Object.fromEntries(
        Object.keys(state.layout).map((k) => [k, state.layout[k].range]),
      ),
      support: Object.fromEntries(
        Object.entries(supportRanges_(state)).map(([k, v]) => [k, v.range]),
      ),
    })
  );
}
function prepareCapacity_(config, before, desired) {
  desired = desired || before;
  let state = before,
    changed = false;
  const anchors = discoverSupport_(config, state);
  if (anchors.length) {
    Sheets.Spreadsheets.batchUpdate({ requests: anchors }, config.id);
    state = readState_(config);
    changed = true;
  }
  const business = growBusinessRequests_(
    state,
    desired,
    state.supportSignature ? 0 : 100,
  );
  if (business.length) {
    Sheets.Spreadsheets.batchUpdate({ requests: business }, config.id);
    state = readState_(config);
    changed = true;
  }
  const support = growSupportRequests_(state, desired);
  if (support.length) {
    Sheets.Spreadsheets.batchUpdate({ requests: support }, config.id);
    state = readState_(config);
    changed = true;
  }
  if (changed || state.supportSignature !== capacitySignature_(state)) {
    Sheets.Spreadsheets.batchUpdate(
      { requests: supportFormulaRequests_(state) },
      config.id,
    );
    state = readState_(config);
  }
  return state;
}

// Paso 4. La resolución depende del ISIN, nunca de una lista de fondos conocidos.
const PRICE_LIMIT_ = 20;
const PRICE_PROVIDER_ = 'VDOS / Quefondos';
const PRICE_BASE_ =
  'https://www.quefondos.com/es/fondos/ficha/index.html?isin=';

function validIsin_(value) {
  if (typeof value !== 'string') return false;
  const isin = value.trim().toUpperCase();
  if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) return false;
  const digits = isin.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let sum = 0;
  for (let i = digits.length - 1, odd = false; i >= 0; i--, odd = !odd) {
    let n = Number(digits[i]);
    if (odd) n *= 2;
    sum += n > 9 ? n - 9 : n;
  }
  return sum % 10 === 0;
}
function normalizeIsin_(value) {
  if (!validIsin_(value))
    fail_(
      'INVALID_ISIN',
      'ISIN inválido: revisa sus doce caracteres y dígito de control.',
    );
  return value.trim().toUpperCase();
}
function fundBinding_(s, product) {
  const row = s.technical.funds
    .slice()
    .reverse()
    .find((r) => r[0] === product.ID);
  if (row)
    return {
      product: product.ID,
      isin: normalizeIsin_(row[1]),
      referenceName: row[2],
    };
  return validIsin_(product.ID)
    ? {
        product: product.ID,
        isin: normalizeIsin_(product.ID),
        referenceName: product.Producto,
      }
    : null;
}
function bindFund_(s, id, isin, name, now) {
  check_(!!s.tech.funds, 'Ejecuta comprobarPaso4 antes de vincular fondos.');
  text_(name, 'Nombre de referencia');
  const product = s.tables.tProductos.find((p) => p.ID === id),
    normalized = normalizeIsin_(isin),
    current = fundBinding_(s, product);
  check_(
    !current || current.isin === normalized,
    'Este producto ya identifica otro ISIN. Crea un producto nuevo para conservar su historial.',
  );
  if (!current || current.referenceName !== name.trim())
    s.technical.funds.push([id, normalized, name.trim(), now]);
}
function priceText_(html) {
  const entities = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    Uacute: 'Ú',
    uacute: 'ú',
    Oacute: 'Ó',
    oacute: 'ó',
    Aacute: 'Á',
    aacute: 'á',
    Eacute: 'É',
    eacute: 'é',
    Iacute: 'Í',
    iacute: 'í',
    ntilde: 'ñ',
    Ntilde: 'Ñ',
    uuml: 'ü',
    Uuml: 'Ü',
    middot: '·',
    ndash: '–',
    mdash: '—',
  };
  return String(html)
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[A-Za-z]+);/gi, (all, e) => {
      if (e[0] === '#') {
        const n =
          e[1].toLowerCase() === 'x'
            ? parseInt(e.slice(2), 16)
            : Number(e.slice(1));
        return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ' ';
      }
      return Object.prototype.hasOwnProperty.call(entities, e)
        ? entities[e]
        : all;
    })
    .replace(/\s+/g, ' ')
    .trim();
}
function priceFailure_(code, message) {
  const e = new Error(message);
  e.priceCode = code;
  throw e;
}
function verifyFundName_(reference, actual) {
  text_(reference, 'Nombre de referencia');
  const normalize = (v) =>
    v
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ');
  // El ISIN selecciona la clase. El nombre confirma la identidad; no sirve para elegir otra clase.
  const r = normalize(reference),
    a = normalize(actual),
    currencies = ['eur', 'usd', 'gbp', 'chf', 'jpy', 'cad', 'aud'];
  const currency = currencies.find((c) =>
    new RegExp('\\b' + c + '\\b').test(r),
  );
  if (currency && !new RegExp('\\b' + currency + '\\b').test(a))
    priceFailure_(
      'NAME_MISMATCH',
      'La moneda indicada en el nombre no coincide con la clase de la fuente.',
    );
  if (
    /\b(acc|acumulacion|accumulation)\b/.test(r) &&
    !/\b(acc|acumulacion|accumulation|cap)\b/.test(a)
  )
    priceFailure_(
      'NAME_MISMATCH',
      'La referencia indica acumulación y la fuente no confirma esa clase.',
    );
  if (
    /\b(dist|distribucion|income|inc)\b/.test(r) &&
    !/\b(dist|distribucion|income|inc)\b/.test(a)
  )
    priceFailure_(
      'NAME_MISMATCH',
      'La referencia indica distribución y la fuente no confirma esa clase.',
    );
  const share =
    r.match(/\b(?:class|clase)\s+([a-z0-9]{1,3})\b/) ||
    r.match(/\b([a-z0-9]{1,3})\s+(?:acc|inc|dist|cap)\b/);
  if (share && !new RegExp('\\b' + share[1] + '\\b').test(a))
    priceFailure_(
      'NAME_MISMATCH',
      'La clase indicada en la referencia no coincide con la ficha.',
    );
  const stop = new Set([
    'fund',
    'funds',
    'fondo',
    'fondos',
    'fi',
    'sicav',
    'de',
    'del',
    'the',
    'a',
    'p',
    'acc',
    'acumulacion',
    'accumulation',
    'inc',
    'dist',
    'distribucion',
    'class',
    'clase',
    'index',
    ...currencies,
  ]);
  const tokens = [
      ...new Set(r.split(' ').filter((t) => t.length > 1 && !stop.has(t))),
    ],
    source = new Set(a.split(' '));
  if (
    !tokens.length ||
    tokens.filter((t) => source.has(t)).length < Math.min(2, tokens.length)
  )
    priceFailure_(
      'NAME_MISMATCH',
      'El nombre de referencia no confirma el fondo del ISIN. Revisa el nombre, sin cambiar el ISIN por aproximación.',
    );
}
function parseFundPage_(html, isin, fetchedAt, today) {
  const h1 =
      html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i) ||
      html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i),
    page = priceText_(html);
  const identity = page.match(/\bISIN\s*:\s*([A-Z0-9]{12})\b/i);
  let heading = h1 && priceText_(h1[1]);
  const headingIsin = heading && heading.match(/\(([A-Z0-9]{12})\)/);
  if (
    (identity && identity[1] !== isin) ||
    (headingIsin && headingIsin[1] !== isin)
  )
    priceFailure_(
      'IDENTITY_MISMATCH',
      'La ficha recibida pertenece a otro ISIN.',
    );
  if (!headingIsin) {
    // La ficha móvil publica el nombre en h2 dentro del informe y el ISIN
    // en Otras características; h1/title solo dicen «Características».
    const report = html.match(
      /<div\b[^>]*class=["'][^"']*\binforme\b[^"']*["'][^>]*>\s*<h2\b[^>]*>([\s\S]*?)<\/h2>/i,
    );
    heading = report ? priceText_(report[1]) : null;
  }
  if (!identity || !heading)
    priceFailure_(
      /no se (?:ha encontrado|encuentra)|fondo no encontrado/i.test(page)
        ? 'FUND_NOT_FOUND'
        : 'SOURCE_FORMAT',
      'La respuesta no contiene una identidad de fondo verificable. Consulta el diagnóstico de la fuente; se conserva el precio anterior.',
    );
  const blocks = html.split(/<h4\b[^>]*>/i),
    raw = blocks.find((b) =>
      /^Última valoración\b/i.test(priceText_(b.split(/<\/h4>/i)[0])),
    );
  if (!raw)
    priceFailure_(
      'SOURCE_FORMAT',
      'La ficha ha cambiado: falta el bloque de última valoración.',
    );
  const valuation = priceText_(raw),
    value = valuation.match(/Valor liquidativo:\s*([\d.,]+)\s+([A-Z]{3})\b/),
    date = valuation.match(/\bFecha:\s*(\d{2})\/(\d{2})\/(\d{4})\b/),
    currency = page.match(/\bDivisa:\s*([A-Z]{3})\b/);
  if (!value || !date || !currency)
    priceFailure_(
      'SOURCE_FORMAT',
      'La ficha no permite verificar precio, fecha y moneda.',
    );
  if (value[2] !== 'EUR')
    priceFailure_(
      'UNSUPPORTED_CURRENCY',
      'La fuente no publica este valor liquidativo en EUR.',
    );
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+),\d{1,12}$/.test(value[1]))
    priceFailure_(
      'INVALID_PRICE',
      'Formato de valor liquidativo no reconocido.',
    );
  const price = Number(value[1].replace(/\./g, '').replace(',', '.')),
    effectiveDate = date[3] + '-' + date[2] + '-' + date[1];
  if (!Number.isFinite(price) || price <= 0 || price > 1e12)
    priceFailure_('INVALID_PRICE', 'Valor liquidativo fuera de rango.');
  let serial;
  try {
    serial = serialDate_(effectiveDate);
  } catch (error) {
    priceFailure_('INVALID_DATE', 'Fecha de valor liquidativo inexistente.');
  }
  const ageDays = serialDate_(today) - serial;
  if (ageDays < 0)
    priceFailure_(
      'FUTURE_DATE',
      'La fecha publicada es posterior al día actual de Madrid.',
    );
  return {
    isin,
    name: heading.split('(' + isin + ')')[0].trim(),
    price,
    date: effectiveDate,
    quoteCurrency: 'EUR',
    classCurrency: currency[1],
    conversion: currency[1] === 'EUR' ? 'none' : 'provider_eur',
    originalClassPrice: null,
    provider: PRICE_PROVIDER_,
    url: PRICE_BASE_ + isin,
    fetchedAt,
    ageDays,
    warning: ageDays > 4 ? 'PUBLICATION_DELAY' : null,
  };
}
function fetchFundQuote_(fund) {
  const checkedAt = new Date().toISOString();
  let isin,
    responseInfo = null;
  try {
    isin = normalizeIsin_(fund.isin);
    text_(fund.referenceName, 'Nombre de referencia');
    const key = 'nav-v3-' + isin;
    let cache = null,
      stored = null;
    try {
      cache = CacheService.getScriptCache();
      stored = cache.get(key);
    } catch (ignored) {}
    let quote = stored ? JSON.parse(stored) : null;
    if (!quote) {
      const urls = [
        PRICE_BASE_ + isin,
        'https://www.quefondos.com/m/es/fondos/ficha/index.html?isin=' + isin,
      ];
      const attempts = [];
      for (let index = 0; index < urls.length; index++) {
        const response = UrlFetchApp.fetch(urls[index], {
          method: 'get',
          followRedirects: false,
          muteHttpExceptions: true,
        });
        if (response.getResponseCode() !== 200)
          priceFailure_(
            'SOURCE_UNAVAILABLE',
            'La fuente no está disponible (HTTP ' +
              response.getResponseCode() +
              ').',
          );
        const html = response.getContentText('UTF-8');
        const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
        responseInfo = {
          httpStatus: response.getResponseCode(),
          length: html.length,
          title: title ? priceText_(title[1]).slice(0, 180) : null,
          containsRequestedIsin: html.indexOf(isin) >= 0,
          hasIdentityLabel: /\bISIN\s*:/i.test(priceText_(html)),
          fingerprint: hash_(html),
          url: urls[index],
          hasValuationBlock: /Última valoración/i.test(priceText_(html)),
          hasNavLabel: /Valor liquidativo\s*:/i.test(priceText_(html)),
          hasCurrencyLabel: /Divisa\s*:/i.test(priceText_(html)),
        };
        attempts.push(Object.assign({}, responseInfo));
        responseInfo.attempts = attempts;
        if (html.length > 1500000)
          priceFailure_(
            'SOURCE_FORMAT',
            'La respuesta de la fuente supera el tamaño admitido.',
          );
        try {
          quote = parseFundPage_(
            html,
            isin,
            checkedAt,
            Utilities.formatDate(new Date(), 'Europe/Madrid', 'yyyy-MM-dd'),
          );
          quote.url = urls[index];
          verifyFundName_(fund.referenceName, quote.name);
          break;
        } catch (error) {
          // Solo una variante de formato permite consultar la ficha móvil oficial.
          // ISIN/clase/nombre/precio/fecha incoherentes se rechazan sin sustitución.
          if (error.priceCode !== 'SOURCE_FORMAT' || index === urls.length - 1)
            throw error;
        }
      }
      try {
        if (cache) cache.put(key, JSON.stringify(quote), 300);
      } catch (ignored) {}
    }
    verifyFundName_(fund.referenceName, quote.name);
    // La antigüedad se vuelve a calcular incluso al cruzar medianoche con caché.
    quote.ageDays =
      serialDate_(
        Utilities.formatDate(new Date(), 'Europe/Madrid', 'yyyy-MM-dd'),
      ) - serialDate_(quote.date);
    if (quote.ageDays < 0)
      priceFailure_('FUTURE_DATE', 'Fecha de cotización futura.');
    quote.warning = quote.ageDays > 4 ? 'PUBLICATION_DELAY' : null;
    return Object.assign(
      {
        ok: true,
        referenceName: fund.referenceName,
        checkedAt,
        cached: !!stored,
      },
      quote,
    );
  } catch (error) {
    return {
      ok: false,
      isin: isin || fund.isin,
      referenceName: fund.referenceName,
      provider: PRICE_PROVIDER_,
      url: isin ? PRICE_BASE_ + isin : null,
      checkedAt,
      responseInfo,
      error:
        error.priceCode ||
        (['INVALID_ISIN', 'INVALID_DATA'].indexOf(error.code) >= 0
          ? error.code
          : 'SOURCE_UNAVAILABLE'),
      message:
        error.priceCode || error.code
          ? error.message
          : 'No se pudo consultar la fuente. Se conserva el último precio válido.',
    };
  }
}
function quotePrices_(request, config) {
  if (
    Object.keys(request).some((k) => ['action', 'funds'].indexOf(k) < 0) ||
    !Array.isArray(request.funds) ||
    !request.funds.length ||
    request.funds.length > PRICE_LIMIT_
  )
    fail_(
      'INVALID_REQUEST',
      'Consulta de uno a veinte ISIN y nombres de referencia.',
    );
  request.funds.forEach((f) => {
    if (
      !object_(f) ||
      Object.keys(f).some((k) => ['isin', 'referenceName'].indexOf(k) < 0)
    )
      fail_('INVALID_REQUEST');
  });
  const results = request.funds.map(fetchFundQuote_);
  return {
    ok: true,
    apiVersion: API_VERSION_,
    buildVersion: BUILD_VERSION_,
    environment: config.environment,
    readOnly: true,
    complete: results.every((r) => r.ok),
    results,
    checkedAt: new Date().toISOString(),
  };
}
function priceSnapshot_(s) {
  return s.tables.tProductos.map((product) => {
    const binding = fundBinding_(s, product),
      latest = s.tables.tPrecios
        .filter((p) => p.Producto === product.ID)
        .sort((a, b) => b.Fecha - a.Fecha)[0];
    const attempt = s.technical.quotes
      .slice()
      .reverse()
      .find((r) => r[2] === product.ID);
    return {
      product: product.ID,
      name: product.Producto,
      isin: binding && binding.isin,
      referenceName: binding && binding.referenceName,
      lastValid: latest
        ? {
            date: isoDate_(latest.Fecha),
            price: latest['VL EUR'],
            source: latest.Fuente,
          }
        : null,
      lastAttempt: attempt
        ? {
            status: attempt[10],
            checkedAt: attempt[9],
            detail: JSON.parse(attempt[11]),
          }
        : null,
      status: binding ? 'configured' : 'ISIN_REQUIRED',
    };
  });
}
function pricePlan_(state, selected, quotes, requestId, now) {
  const operations = [],
    results = [];
  selected.forEach((item, i) => {
    const quote = quotes[i],
      result = Object.assign(
        { product: item.product, status: 'failed' },
        quote,
      );
    if (quote.ok) {
      const date = serialDate_(quote.date),
        prices = state.tables.tPrecios.filter(
          (p) => p.Producto === item.product,
        ),
        latest = prices.reduce((max, p) => Math.max(max, p.Fecha), 0),
        same = prices.find((p) => p.Fecha === date);
      if (date < latest) result.status = 'older';
      else if (same && same['VL EUR'] === quote.price)
        result.status = 'unchanged';
      else if (same) {
        result.status = 'needs_review';
        result.error = 'PRICE_CONFLICT';
        result.message =
          'Ya existe otro precio para ese producto y fecha. Se conserva el guardado.';
      } else {
        result.status = 'updated';
        operations.push({
          process: 'precio',
          product: item.product,
          date: quote.date,
          price: quote.price,
          source: quote.provider + ' | ' + quote.isin + ' | ' + quote.url,
        });
      }
    }
    results.push(result);
  });
  const applied = applyOperations_(state, operations, requestId, now);
  results.forEach((r, i) =>
    applied.state.technical.quotes.push([
      requestId + '-' + (i + 1),
      requestId,
      r.product,
      r.isin || null,
      r.ok ? r.date : null,
      r.ok ? r.price : null,
      r.classCurrency || null,
      r.provider || null,
      r.url || null,
      r.checkedAt || now,
      r.status,
      JSON.stringify(r),
    ]),
  );
  return { state: applied.state, operations, results };
}
function replayPrices_(s, id, fingerprint) {
  const saved = s.technical.requests.find((r) => r[0] === id);
  if (!saved) return null;
  if (saved[1] !== fingerprint)
    fail_('REQUEST_CONFLICT', 'La solicitud ya existe con contenido distinto.');
  return Object.assign(JSON.parse(saved[3]), { replayed: true });
}
function refreshPrices_(config, request) {
  if (
    Object.keys(request).some(
      (k) =>
        [
          'action',
          'requestId',
          'expectedRevision',
          'products',
          'bookKey',
        ].indexOf(k) < 0,
    ) ||
    !uuid_(request.requestId) ||
    typeof request.expectedRevision !== 'string' ||
    (request.products !== undefined &&
      (!Array.isArray(request.products) ||
        !request.products.length ||
        request.products.length > PRICE_LIMIT_ ||
        request.products.some((p) => typeof p !== 'string')))
  )
    fail_('INVALID_REQUEST');
  const requestId = request.requestId.toLowerCase(),
    fingerprint = hash_({
      action: 'refreshPrices',
      products: request.products || null,
    });
  const prepared = locked_(() => {
    const state = readState_(config);
    checkRequestBook_(request, state);
    const replay = replayPrices_(state, requestId, fingerprint);
    if (replay) return { replay };
    if (!Object.keys(TECH_SCHEMA_).every((k) => state.tech[k]))
      fail_('NOT_INITIALIZED', 'Ejecuta comprobarPaso4 desde el editor.');
    if (state.revision !== request.expectedRevision)
      fail_(
        'CONFLICT',
        'El libro cambió; vuelve a leer antes de actualizar precios.',
      );
    const ids = request.products
      ? request.products.map((p) =>
          resolveReference_(state, 'tProductos', p, {}, 'Producto'),
        )
      : state.tables.tProductos.map((p) => p.ID);
    if (ids.length > PRICE_LIMIT_ || new Set(ids).size !== ids.length)
      fail_(
        'INVALID_REQUEST',
        'Selecciona hasta veinte productos distintos por actualización.',
      );
    return {
      selected: ids.map((id) => {
        const p = state.tables.tProductos.find((p) => p.ID === id);
        return (
          fundBinding_(state, p) || {
            product: id,
            isin: null,
            referenceName: p.Producto,
          }
        );
      }),
    };
  });
  if (prepared.replay) return prepared.replay;
  // La red se consulta fuera del bloqueo. La revisión se verifica otra vez antes del lote.
  const quotes = prepared.selected.map((f) =>
    f.isin
      ? fetchFundQuote_(f)
      : {
          ok: false,
          error: 'ISIN_REQUIRED',
          message: 'Vincula el ISIN y nombre de referencia de este producto.',
          isin: null,
          referenceName: f.referenceName,
          checkedAt: new Date().toISOString(),
        },
  );
  return locked_(() => {
    let before = readState_(config);
    checkRequestBook_(request, before);
    const replay = replayPrices_(before, requestId, fingerprint);
    if (replay) return replay;
    if (before.revision !== request.expectedRevision)
      fail_(
        'CONFLICT',
        'El libro cambió durante la consulta. No se han escrito precios.',
      );
    const now = new Date().toISOString();
    let plan = pricePlan_(before, prepared.selected, quotes, requestId, now);
    before = prepareCapacity_(config, before, plan.state);
    if (before.revision !== request.expectedRevision)
      fail_(
        'CONFLICT',
        'El libro cambió durante la preparación. No se han escrito precios.',
      );
    plan = pricePlan_(before, prepared.selected, quotes, requestId, now);
    const counts = {};
    plan.results.forEach(
      (r) => (counts[r.status] = (counts[r.status] || 0) + 1),
    );
    const response = {
      ok: true,
      apiVersion: API_VERSION_,
      buildVersion: BUILD_VERSION_,
      environment: config.environment,
      requestId,
      revision: plan.state.revision,
      complete: plan.results.every((r) => r.ok && r.status !== 'needs_review'),
      results: plan.results,
      counts,
      replayed: false,
      checkedAt: now,
    };
    const requests = mutationRequests_(before, plan.state, requestId, now, {
      operations: plan.operations,
      fingerprint,
      response,
    });
    try {
      Sheets.Spreadsheets.batchUpdate({ requests }, config.id);
    } catch (error) {
      try {
        const replay = replayPrices_(
          readState_(config),
          requestId,
          fingerprint,
        );
        if (replay) return replay;
      } catch (ignored) {}
      fail_(
        'WRITE_UNCERTAIN',
        'Consulta o reintenta exactamente la misma solicitud de precios.',
      );
    }
    return response;
  });
}
// Pruebas de instalación: comprobar no escribe cotizaciones; actualizar sí guarda VL verificados.
function comprobarPaso4() {
  let result;
  try {
    const config = authorizedConfig_();
    result = locked_(() => {
      const s = prepareCapacity_(config, initializeBackendUnlocked_(config));
      return Object.assign(diagnostics_(s), { prices: priceSnapshot_(s) });
    });
  } catch (error) {
    result = apiError_(error);
  }
  console.log(JSON.stringify(result));
  return result;
}
function probarFuentesPaso4() {
  let result;
  try {
    const config = authorizedConfig_(),
      s = readState_(config),
      bindings = s.tables.tProductos
        .map((p) => fundBinding_(s, p))
        .filter(Boolean);
    const results = bindings.map(fetchFundQuote_);
    result = {
      ok: true,
      apiVersion: API_VERSION_,
      buildVersion: BUILD_VERSION_,
      environment: config.environment,
      readOnly: true,
      complete: bindings.length > 0 && results.every((r) => r.ok),
      unconfigured: s.tables.tProductos.length - bindings.length,
      results,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    result = apiError_(error);
  }
  console.log(JSON.stringify(result));
  return result;
}
function actualizarPreciosPaso4() {
  let result;
  try {
    const config = authorizedConfig_(),
      results = [];
    let state = readState_(config),
      ids = state.tables.tProductos.map((p) => p.ID);
    for (let i = 0; i < ids.length; i += PRICE_LIMIT_) {
      const response = refreshPrices_(config, {
        action: 'refreshPrices',
        requestId: Utilities.getUuid(),
        expectedRevision: state.revision,
        bookKey: state.bookKey,
        products: ids.slice(i, i + PRICE_LIMIT_),
      });
      results.push(response);
      state = readState_(config);
    }
    result = {
      ok: true,
      apiVersion: API_VERSION_,
      buildVersion: BUILD_VERSION_,
      environment: config.environment,
      complete: results.every((r) => r.complete),
      batches: results,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    result = apiError_(error);
  }
  console.log(JSON.stringify(result));
  return result;
}

// Comprobación del paso 5: lectura completa, resumen nativo y estados de precios.
function comprobarPaso5() {
  let result;
  try {
    const s = readState_(authorizedConfig_()),
      snap = publicSnapshot_(s);
    result = {
      ok: snap.ok,
      apiVersion: API_VERSION_,
      buildVersion: BUILD_VERSION_,
      environment: s.environment,
      backendReady: snap.backendReady,
      calculationReady: snap.calculationReady && !snap.calculationErrors.length,
      calculationErrors: snap.calculationErrors,
      summaryReady: snap.summary.complete,
      missingPrices: snap.summary.missingPrices,
      missingMetrics: snap.summary.missingMetrics,
      bridgeReady: (() => {
        try {
          bridgeTemplate_();
          return true;
        } catch (error) {
          return false;
        }
      })(),
      tableCount: snap.tableCount,
      rows: snap.rows,
      revision: snap.revision,
    };
  } catch (error) {
    result = apiError_(error);
  }
  console.log(JSON.stringify(result));
  return result;
}

// Solo lectura: comprueba estructura, resumen y consulta real de fuentes, sin guardar precios.
function closureReport_(config) {
  const before = readState_(config),
    snap = publicSnapshot_(before);
  let bridgeReady = false;
  try {
    bridgeTemplate_();
    bridgeReady = true;
  } catch (error) {}
  const results = before.tables.tProductos.map((product) => {
    const binding = fundBinding_(before, product);
    return binding
      ? fetchFundQuote_(binding)
      : {
          ok: false,
          referenceName: product.Producto,
          error: 'ISIN_REQUIRED',
          message: 'Configura el ISIN y nombre de referencia de este producto.',
        };
  });
  const after = readState_(config),
    stable = before.revision === after.revision,
    checks = {
      backend: snap.backendReady,
      calculations: snap.calculationReady && !snap.calculationErrors.length,
      summary: snap.summary.complete,
      bridge: bridgeReady,
      sources: results.every((result) => result.ok),
      stable,
    };
  return {
    ok: true,
    apiVersion: API_VERSION_,
    buildVersion: BUILD_VERSION_,
    environment: config.environment,
    bookKey: before.bookKey,
    readOnly: true,
    technicalReady: Object.values(checks).every(Boolean),
    checks,
    revision: before.revision,
    settings: snap.settings,
    missingMetrics: snap.summary.missingMetrics,
    missingPrices: snap.summary.missingPrices,
    calculationErrors: snap.calculationErrors,
    results,
    checkedAt: new Date().toISOString(),
  };
}
function comprobarCierre() {
  let result;
  try {
    result = closureReport_(authorizedConfig_());
  } catch (error) {
    result = apiError_(error);
  }
  console.log(JSON.stringify(result));
  return result;
}
