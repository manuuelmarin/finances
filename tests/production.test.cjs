const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  crypto = require('node:crypto'),
  fs = require('node:fs');
const { runtime } = require('./helpers/runtime.cjs');
const properties = {
  ENVIRONMENT: 'production',
  PRODUCTION_SPREADSHEET_ID: 'fixture-main',
};
const expense = {
  process: 'gasto',
  date: '2026-01-02',
  concept: 'Ficticio',
  account: 'Cuenta A',
  category: 'Café',
  amount: 1,
};
function setup() {
  const r = runtime({ properties, bookId: 'fixture-main' });
  assert.equal(r.init().ok, true);
  return r;
}
test('producción lee/escribe solo el principal configurado y conserva revisión/idempotencia', () => {
  const r = setup(),
    snap = r.api({ action: 'read' });
  assert.equal(snap.environment, 'production');
  const envelope = {
    action: 'transact',
    requestId: crypto.randomUUID(),
    expectedRevision: snap.revision,
    bookKey: snap.bookKey,
    operations: [expense],
  };
  assert.equal(r.api(envelope).ok, true);
  assert.equal(r.api(envelope).replayed, true);
  assert.equal(
    r.api({
      action: 'requestStatus',
      requestId: envelope.requestId,
      bookKey: snap.bookKey,
    }).replayed,
    true,
  );
  assert.equal(r.state().tables.tMovimientos.length, 1);
  assert.ok(r.readBooks.every((id) => id === 'fixture-main'));
  assert.ok(r.writeBooks.every((id) => id === 'fixture-main'));
});
test('no infiere producción con configuración incompleta, entorno desconocido o mismos libros', () => {
  for (const props of [
    { ENVIRONMENT: 'production' },
    { ENVIRONMENT: 'production', PRODUCTION_SPREADSHEET_ID: 'fixture-book' },
    { ENVIRONMENT: 'other' },
    { ...properties, TEST_SPREADSHEET_ID: '' },
  ]) {
    const r = runtime({ properties: props });
    assert.equal(r.api({ action: 'read' }).error, 'NOT_CONFIGURED');
    assert.equal(r.readBooks.length, 0);
    assert.equal(r.writes.length, 0);
  }
});
test('un sobre de pruebas no puede aplicarse o consultarse en el principal aunque las revisiones coincidan', () => {
  const t = runtime();
  t.init();
  const testSnapshot = t.api({ action: 'read' }),
    r = setup(),
    current = r.api({ action: 'read' }),
    writes = r.writes.length;
  assert.deepEqual(testSnapshot.tables, current.tables);
  for (const action of ['transact', 'refreshPrices', 'requestStatus']) {
    const body = {
      action,
      requestId: crypto.randomUUID(),
      bookKey: testSnapshot.bookKey,
    };
    if (action !== 'requestStatus') body.expectedRevision = current.revision;
    if (action === 'transact') body.operations = [expense];
    assert.equal(r.api(body).error, 'BOOK_CHANGED');
  }
  assert.equal(r.writes.length, writes);
  assert.equal(r.fetches.length, 0);
  assert.equal(
    r.api({
      action: 'transact',
      requestId: crypto.randomUUID(),
      expectedRevision: current.revision,
      operations: [expense],
    }).error,
    'READ_REQUIRED',
  );
});
test('prueba ficticia del editor se rechaza en producción antes de toda lectura/escritura', () => {
  const r = runtime({ properties, bookId: 'fixture-main' }),
    result = r.ctx.probarTransaccionesPaso3();
  assert.equal(result.error, 'TEST_ONLY');
  assert.equal(r.writes.length, 0);
  assert.equal(r.readBooks.length, 0);
});
test('informe de cierre solo lee y conserva fallos de fuente y resumen como pendientes', () => {
  const r = runtime();
  r.init();
  r.ctx.HtmlService = {
    createTemplateFromFile: () => ({
      getRawContent: () => fs.readFileSync('apps-script/Bridge.html', 'utf8'),
    }),
  };
  const count = r.writes.length,
    revision = r.state().revision,
    report = r.api({ action: 'acceptance' });
  assert.equal(report.ok, true);
  assert.equal(report.readOnly, true);
  assert.equal(report.technicalReady, false);
  assert.equal(report.checks.backend, true);
  assert.equal(report.checks.bridge, true);
  assert.equal(report.checks.sources, false);
  assert.equal(report.checks.stable, true);
  assert.equal(r.writes.length, count);
  assert.equal(r.state().revision, revision);
  assert.ok(report.results.every((result) => !result.ok));
});
function completeReportFixture() {
  const r = runtime();
  r.init();
  r.ctx.HtmlService = {
    createTemplateFromFile: () => ({
      getRawContent: () => fs.readFileSync('apps-script/Bridge.html', 'utf8'),
    }),
  };
  const read = r.ctx.readState_;
  r.ctx.readState_ = (config) => {
    const state = read(config);
    state.summaryValues = [
      ['Patrimonio neto', 'Efectivo', 'Inversiones', 'Deuda'],
      [100, 100, 0, 0],
      ['Ingresos', 'Gastos propios', 'Ahorro', 'Tasa de ahorro'],
      [10, 5, 5, 0.5],
    ];
    return state;
  };
  r.ctx.fundBinding_ = () => ({
    isin: 'fixture',
    referenceName: 'Fondo ficticio',
  });
  r.ctx.fetchFundQuote_ = () => ({ ok: true, referenceName: 'Fondo ficticio' });
  return r;
}
test('cierre distingue un sistema correcto de una consulta de fuente fallida sin escribir', () => {
  const r = completeReportFixture(),
    count = r.writes.length;
  assert.equal(r.api({ action: 'acceptance' }).technicalReady, true);
  r.ctx.fetchFundQuote_ = () => ({ ok: false, error: 'SOURCE_FORMAT' });
  const report = r.api({ action: 'acceptance' });
  assert.equal(report.checks.summary, true);
  assert.equal(report.checks.sources, false);
  assert.equal(report.technicalReady, false);
  assert.equal(r.writes.length, count);
});
test('edición concurrente durante la consulta impide dar por buena una lectura anterior', () => {
  const r = completeReportFixture();
  r.ctx.fetchFundQuote_ = () => {
    r.setInput('tCuentas', 0, 'Saldo inicial', 1001);
    return { ok: true };
  };
  const report = r.api({ action: 'acceptance' });
  assert.equal(report.checks.stable, false);
  assert.equal(report.technicalReady, false);
});
test('error en una columna calculada impide el cierre aunque las tarjetas estén completas', () => {
  const r = completeReportFixture();
  r.setInput('tCuentas', 0, 'Saldo calculado', '#REF!');
  const read = r.api({ action: 'read' });
  assert.equal(read.summary.complete, true);
  assert.ok(read.calculationErrors.length > 0);
  const report = r.api({ action: 'acceptance' });
  assert.equal(report.checks.calculations, false);
  assert.equal(report.technicalReady, false);
});
