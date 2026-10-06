// Paso 2: comprobación de lectura. Las propiedades se configuran en Apps Script.
const CONNECTION_TYPE_ = 'finances.connection.v1';
const APP_ORIGIN_ = 'https://manuuelmarin.github.io';
const MODEL_VERSION_ = 3;
const REQUIRED_SHEETS_ = [
  'Resumen financiero', 'Movimientos', 'Inversiones', 'Cuentas', 'Salario',
  'Objetivos', 'Inflación', 'Hipoteca', 'Configuración', 'Cálculos'
];
// Esquema del libro completo. No contiene datos personales ni IDs del libro.
const TABLE_SCHEMA_ = [
  ['Movimientos', 'tMovimientos', ['ID', 'Fecha', 'Tipo', 'Concepto', 'Subcategoría', 'Origen', 'Destino', 'Importe', 'Recuperable', 'Localización', 'Recurrente']],
  ['Inversiones', 'tProductos', ['ID', 'Producto', 'Cuenta', 'Clase', 'Fecha base', 'Unidades base', 'Coste base', 'Participaciones', 'Aportado neto', 'Valor', 'Resultado', 'Rentabilidad', 'Peso']],
  ['Inversiones', 'tOperaciones', ['ID', 'Fecha', 'Producto', 'Tipo', 'Participaciones', 'Precio', 'Comisión', 'Retención', 'Importe', 'Movimiento']],
  ['Inversiones', 'tPrecios', ['Producto', 'Fecha', 'VL EUR', 'Fuente']],
  ['Cuentas', 'tCuentas', ['Cuenta', 'Saldo inicial', 'Saldo real', 'Fecha saldo', 'Saldo calculado']],
  ['Cuentas', 'tDeudas', ['ID', 'Acreedor', 'Saldo inicial', 'Saldo pendiente']],
  ['Cuentas', 'tVinculos', ['Movimiento', 'Vinculado a', 'Fecha', 'Tipo', 'Importe']],
  ['Salario', 'tNominas', ['Movimiento', 'Fecha cobro', 'Neto', 'Bruto', 'Cotización', 'IRPF', 'Otras deducciones']],
  ['Objetivos', 'tObjetivos', ['ID', 'Objetivo', 'Meta', 'Fecha', 'Asignado', 'Pendiente', 'Avance']],
  ['Objetivos', 'tAsignaciones', ['Objetivo', 'Origen', 'Importe']],
  ['Configuración', 'tParametros', ['Parámetro', 'Valor']],
  ['Configuración', 'tCategorias', ['Grupo', 'Subgrupo', 'Categoría', 'Subcategoría']]
];

function doGet(e) {
  const state = String(e && e.parameter && e.parameter.state || '');
  let result = { type: CONNECTION_TYPE_, state: state, ok: false };
  try {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(state)) {
      throw new Error('INVALID_REQUEST');
    }
    result = Object.assign(result, readConnection_());
  } catch (error) {
    // No devolver excepciones de Google: pueden contener identificadores privados.
    const codes = ['INVALID_REQUEST', 'NOT_CONFIGURED', 'ACCESS_DENIED', 'INVALID_MODEL'];
    result.error = codes.indexOf(error.message) >= 0 ? error.message : 'READ_FAILED';
  }
  const template = HtmlService.createTemplateFromFile('Bridge');
  template.payloadJson = JSON.stringify(result);
  template.appOrigin = APP_ORIGIN_;
  return template.evaluate().setTitle('Finanzas · Lectura de prueba');
}

function readConnection_() {
  const properties = PropertiesService.getScriptProperties();
  const spreadsheetId = properties.getProperty('TEST_SPREADSHEET_ID');
  const owner = (properties.getProperty('OWNER_EMAIL') || '').trim().toLowerCase();
  if (!spreadsheetId || !owner || properties.getProperty('ENVIRONMENT') !== 'test') {
    throw new Error('NOT_CONFIGURED');
  }
  // Comprobar al visitante, no solo la identidad que ejecuta el despliegue.
  const visitor = Session.getActiveUser().getEmail().trim().toLowerCase();
  if (!visitor || visitor !== owner) throw new Error('ACCESS_DENIED');

  // Servicio avanzado Sheets, con permiso OAuth exclusivo de lectura.
  // Localizar tablas por nombre evita depender de sus filas actuales.
  const book = Sheets.Spreadsheets.get(spreadsheetId, {
    fields: 'sheets(properties(sheetId,title),tables(name,range,columnProperties(columnIndex,columnName)))'
  });
  const parametersRange = checkBookStructure_(book);
  const values = Sheets.Spreadsheets.Values.get(spreadsheetId, parametersRange, {
    valueRenderOption: 'UNFORMATTED_VALUE'
  });
  const versions = (values.values || []).filter(row => row[0] === 'Versión modelo');
  if (versions.length !== 1) throw new Error('INVALID_MODEL');
  const modelVersion = Number(versions[0][1]);
  const sheetCount = (book.sheets || []).length;
  if (modelVersion !== MODEL_VERSION_) {
    throw new Error('INVALID_MODEL');
  }
  return {
    ok: true,
    environment: 'test',
    modelVersion: modelVersion,
    sheetCount: sheetCount,
    checkedAt: new Date().toISOString()
  };
}

function checkBookStructure_(book) {
  const sheets = book.sheets || [];
  const byTitle = new Map(sheets.map(sheet => [sheet.properties.title, sheet]));
  if (REQUIRED_SHEETS_.some(title => !byTitle.has(title))) throw new Error('INVALID_MODEL');
  let parametersRange;
  TABLE_SCHEMA_.forEach(([title, name, headers]) => {
    const sheet = byTitle.get(title);
    const matches = (sheet.tables || []).filter(table => table.name === name);
    if (matches.length !== 1) throw new Error('INVALID_MODEL');
    const table = matches[0];
    const range = table.range || {};
    const firstRow = range.startRowIndex === undefined ? 0 : range.startRowIndex;
    const firstColumn = range.startColumnIndex === undefined ? 0 : range.startColumnIndex;
    if (range.sheetId !== sheet.properties.sheetId ||
        ![firstRow, firstColumn, range.endRowIndex, range.endColumnIndex].every(Number.isSafeInteger) ||
        firstRow < 0 || firstColumn < 0 || range.endRowIndex <= firstRow + 1 ||
        range.endColumnIndex - firstColumn !== headers.length) throw new Error('INVALID_MODEL');
    const columns = new Map();
    (table.columnProperties || []).forEach(column => {
      const index = column.columnIndex === undefined ? 0 : column.columnIndex;
      if (!Number.isSafeInteger(index) || index < 0 || index >= headers.length || columns.has(index)) {
        throw new Error('INVALID_MODEL');
      }
      columns.set(index, column.columnName);
    });
    if (headers.some((header, index) => columns.get(index) !== header)) throw new Error('INVALID_MODEL');
    if (name === 'tParametros') {
      const quotedTitle = "'" + title.replace(/'/g, "''") + "'";
      parametersRange = quotedTitle + '!' + columnA1_(firstColumn) + (firstRow + 2) +
        ':' + columnA1_(range.endColumnIndex - 1) + range.endRowIndex;
    }
  });
  return parametersRange;
}

function columnA1_(index) {
  let column = '';
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) {
    column = String.fromCharCode(65 + (value - 1) % 26) + column;
  }
  return column;
}
