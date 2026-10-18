function bridgeTemplate_() {
  const template = HtmlService.createTemplateFromFile('Bridge');
  const raw = template.getRawContent();
  if (
    !/^\s*<!doctype html>/i.test(raw) ||
    !/id=["']payload["']/.test(raw) ||
    !/id=["']origin["']/.test(raw) ||
    raw.indexOf('google.script.run') < 0 ||
    raw.indexOf(API_TRANSPORT_) < 0 ||
    raw.indexOf('financialApiJson') < 0
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
    apiTransport: API_TRANSPORT_,
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
    (!!productionId && productionId === testId)
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
function apiError_(error, context) {
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
    'PRICE_CONFLICT',
    'INVALID_ISIN',
    'READ_REQUIRED',
    'BOOK_CHANGED',
    'TEST_ONLY',
    'UPDATE_REQUIRED',
  ];
  const code =
    codes.indexOf(error.code || error.message) >= 0
      ? error.code || error.message
      : 'API_FAILED';
  const result = {
    ok: false,
    error: code,
    message: error.code && code !== 'API_FAILED' ? error.message : code,
  };
  if (code === 'API_FAILED' && context) {
    result.diagnosticId = Utilities.getUuid();
    result.phase = context.phase;
    // Execution logs stay in the owner's private project. Never return native
    // exceptions: Google errors can contain book IDs, ranges or financial data.
    console.log(
      JSON.stringify({
        diagnosticId: result.diagnosticId,
        phase: context.phase,
        requestId: context.requestId || null,
        error: String(error && (error.stack || error.message || error)),
      }),
    );
  }
  return result;
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

function readState_(config, options) {
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
  if (options?.calculations !== false) {
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
  }
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
  const chartValues = {};
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
      chartValues[spec.calculation] = values;
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
    chartValues,
    bookKey: hash_(config.id),
  };
  validateFinancialState_(state);
  state.revision = revision_(state);
  return state;
}

function checkConnection_() {
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

function serveApplication_(e) {
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
    if (e.parameter.read === '1') {
      const config = authorizedConfig_(),
        snapshot = publicSnapshot_(readState_(config));
      result = Object.assign(result, {
        ok: true,
        environment: snapshot.environment,
        modelVersion: snapshot.modelVersion,
        sheetCount: snapshot.businessSheetCount,
        checkedAt: snapshot.checkedAt,
        apiVersion: API_VERSION_,
        buildVersion: BUILD_VERSION_,
        supportsBookBinding: true,
        snapshot,
      });
    } else result = Object.assign(result, readConnection_());
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
    const safeState = /^[0-9a-f-]{36}$/i.test(state) ? state : '';
    const notice = JSON.stringify({
      type: CONNECTION_TYPE_,
      state: safeState,
      ok: false,
      error: 'UPDATE_REQUIRED',
    });
    return HtmlService.createHtmlOutput(
      '<!doctype html><html lang="es"><meta charset="utf-8"><title>Finanzas · Revisar Bridge</title>' +
        '<h1>Revisa Bridge.html</h1><p>Este archivo debe contener el bloque HTML del archivo Bridge.html de esta entrega. ' +
        'Copia Bridge.html, guarda y publica una Nueva versión de la implementación existente.</p>' +
        '<a href="https://manuuelmarin.github.io/finances/install.html">Abrir instalador</a>' +
        '<script>try{window.top.opener.postMessage(' +
        notice +
        ',"https://manuuelmarin.github.io");}catch(e){}</script></html>',
    );
  }
}
