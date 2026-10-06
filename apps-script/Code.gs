// Paso 2: comprobación de lectura. Las propiedades se configuran en Apps Script.
const CONNECTION_TYPE_ = 'finances.connection.v1';
const APP_ORIGIN_ = 'https://manuuelmarin.github.io';

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
  const book = Sheets.Spreadsheets.get(spreadsheetId, {
    fields: 'sheets(properties(sheetId))'
  });
  const values = Sheets.Spreadsheets.Values.get(spreadsheetId, "'Configuración'!C10", {
    valueRenderOption: 'UNFORMATTED_VALUE'
  });
  const rawVersion = values.values && values.values[0] && values.values[0][0];
  const modelVersion = Number(rawVersion);
  const sheetCount = (book.sheets || []).length;
  if (!Number.isSafeInteger(modelVersion) || modelVersion <= 0 || sheetCount <= 0) {
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
