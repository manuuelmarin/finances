const test = require('node:test');
const assert = require('node:assert/strict');
const { runtime, serial } = require('./helpers/runtime.cjs');

test('daily Histórico uses exact NAV only on dates with an open holding', () => {
  const r = runtime();
  const state = {
    tables: {
      tProductos: [
        {
          ID: 'ES0175902008',
          Producto: 'Sigma A',
          'Fecha base': serial('2026-01-02'),
          'Unidades base': 2,
        },
        {
          ID: 'FUND-B',
          Producto: 'Vanguard Global',
          'Fecha base': serial('2026-01-01'),
          'Unidades base': 0,
        },
      ],
      tOperaciones: [
        {
          Producto: 'FUND-B',
          Fecha: serial('2026-01-03'),
          Tipo: 'Compra',
          Participaciones: 1,
        },
        {
          Producto: 'ES0175902008',
          Fecha: serial('2026-01-04'),
          Tipo: 'Venta',
          Participaciones: 2,
        },
      ],
      tPrecios: [
        { Producto: 'ES0175902008', Fecha: serial('2026-01-01'), 'VL EUR': 10 },
        { Producto: 'ES0175902008', Fecha: serial('2026-01-02'), 'VL EUR': 11 },
        { Producto: 'ES0175902008', Fecha: serial('2026-01-04'), 'VL EUR': 13 },
        { Producto: 'FUND-B', Fecha: serial('2026-01-02'), 'VL EUR': 20 },
        { Producto: 'FUND-B', Fecha: serial('2026-01-03'), 'VL EUR': 21 },
        { Producto: 'FUND-B', Fecha: serial('2026-01-04'), 'VL EUR': 22 },
      ],
    },
  };
  const rows = JSON.parse(
    r.evaluate(
      'JSON.stringify(dailyHistoryRows_(' + JSON.stringify(state) + '))',
    ),
  );
  const today = r.evaluate(
    "serialDate_(Utilities.formatDate(new Date(), 'Europe/Madrid', 'yyyy-MM-dd'))",
  );
  assert.deepEqual(rows[0], [
    'Finanzas · Histórico generado',
    'Sigma A',
    'Vanguard Global',
  ]);
  assert.deepEqual(rows[1], ['Fecha', 'ES0175902008', 'FUND-B']);
  assert.deepEqual(rows[2], [
    'Inicio conocido (o Fecha base)',
    serial('2026-01-02'),
    serial('2026-01-03'),
  ]);
  assert.deepEqual(rows.slice(3, 6), [
    [serial('2026-01-02'), 11, null],
    [serial('2026-01-03'), null, 21],
    [serial('2026-01-04'), null, 22],
  ]);
  assert.equal(rows.at(-1)[0], today);
  assert.equal(rows.length, 3 + today - serial('2026-01-02') + 1);
  assert.deepEqual(rows.at(-1).slice(1), [null, null]);
  const overridden = JSON.parse(
    r.evaluate(
      'JSON.stringify(dailyHistoryRows_(' +
        JSON.stringify(state) +
        ', {"ES0175902008":' +
        serial('2026-01-03') +
        '}))',
    ),
  );
  assert.deepEqual(overridden[2], [
    'Inicio conocido (o Fecha base)',
    serial('2026-01-03'),
    serial('2026-01-03'),
  ]);
  assert.deepEqual(overridden[3], [serial('2026-01-03'), null, 21]);
  assert.equal(overridden.at(-1)[0], today);
  const bound = JSON.parse(
    r.evaluate(
      'JSON.stringify(dailyHistoryRows_(' +
        JSON.stringify({
          ...state,
          technical: { funds: [['FUND-B', 'IE00B03HCZ61']] },
        }) +
        ', {"FUND-B":' +
        serial('2026-01-03') +
        '}))',
    ),
  );
  assert.equal(bound[1][2], 'IE00B03HCZ61');
  assert.equal(bound[2][2], serial('2026-01-03'));
  assert.equal(r.evaluate('dailyHistoryOverrideSerial_("2026-02-30")'), null);
  assert.equal(r.evaluate('dailyHistoryOverrideSerial_(1.5)'), null);
  assert.throws(() =>
    r.evaluate(
      'dailyHistoryRows_(' +
        JSON.stringify({
          tables: {
            tProductos: [],
            tOperaciones: [],
            tPrecios: [
              { Producto: 'P', Fecha: serial('2999-01-01'), 'VL EUR': 1 },
            ],
          },
        }) +
        ')',
    ),
  );
});

test('an unowned existing Histórico sheet is preserved during preparation', () => {
  const r = runtime();
  r.init();
  r.ctx.Sheets.Spreadsheets.batchUpdate(
    {
      requests: [
        {
          addSheet: {
            properties: {
              sheetId: 900,
              title: 'Histórico',
              gridProperties: { rowCount: 1000, columnCount: 26 },
            },
          },
        },
        {
          updateCells: {
            start: { sheetId: 900, rowIndex: 0, columnIndex: 0 },
            rows: [
              {
                values: [
                  { userEnteredValue: { stringValue: 'Datos propios' } },
                ],
              },
            ],
            fields: 'userEnteredValue',
          },
        },
      ],
    },
    'fixture-book',
  );
  const writes = r.writes.length;
  const result = r.evaluate(
    'JSON.stringify(refreshDailyHistory_({id:"fixture-book",environment:"test"},readState_({id:"fixture-book",environment:"test"})))',
  );
  assert.equal(JSON.parse(result).status, 'preserved_existing_sheet');
  assert.equal(r.writes.length, writes);
  assert.equal(r.cell(900, 0, 0).userEnteredValue.stringValue, 'Datos propios');
});

test('owned history reads stay within the current sheet grid', () => {
  const r = runtime();
  r.init();
  r.ctx.Sheets.Spreadsheets.batchUpdate(
    {
      requests: [
        {
          addSheet: {
            properties: {
              sheetId: 900,
              title: 'Histórico',
              gridProperties: { rowCount: 1000, columnCount: 4 },
            },
          },
        },
        {
          updateCells: {
            start: { sheetId: 900, rowIndex: 0, columnIndex: 0 },
            rows: [
              {
                values: [
                  {
                    userEnteredValue: {
                      stringValue: 'Finanzas · Histórico generado',
                    },
                  },
                ],
              },
              {
                values: [
                  { userEnteredValue: { stringValue: 'Fecha' } },
                  { userEnteredValue: { stringValue: 'ES0175902008' } },
                  { userEnteredValue: { stringValue: 'IE00B03HCZ61' } },
                  { userEnteredValue: { stringValue: 'IE0031786696' } },
                ],
              },
            ],
            fields: 'userEnteredValue',
          },
        },
      ],
    },
    'fixture-book',
  );
  const values = r.ctx.Sheets.Spreadsheets.Values,
    originalBatchGet = values.batchGet,
    seenRanges = [];
  values.batchGet = (id, request) => {
    for (const range of request.ranges) {
      seenRanges.push(range);
      const match = range.match(/!([A-Z]+)\d+:([A-Z]+)\d+$/);
      if (match && range.startsWith("'Histórico'!")) {
        const index = (column) =>
          [...column].reduce(
            (value, letter) => value * 26 + letter.charCodeAt(0) - 64,
            0,
          );
        assert.ok(
          index(match[2]) <= 4,
          `range exceeds four-column grid: ${range}`,
        );
      }
    }
    return originalBatchGet(id, request);
  };
  const result = JSON.parse(
    r.evaluate(
      'JSON.stringify(refreshDailyHistorySafely_({id:"fixture-book",environment:"test"}))',
    ),
  );
  assert.equal(result.status, 'updated');
  assert.ok(seenRanges.includes("'Histórico'!B2:D3"));
  assert.ok(seenRanges.every((range) => !range.includes('ZZ')));
});

test('a failed owned-view batch leaves the previous marker, hint, and NAV intact', () => {
  const r = runtime();
  r.init();
  const product = r.transact([
    {
      process: 'producto',
      name: 'Fondo de prueba',
      account: 'Cuenta A',
      class: 'Renta variable',
      date: '2026-01-02',
      units: 1,
      cost: 10,
      isin: 'ES0175902008',
      referenceName: 'Fondo de prueba',
    },
  ]).results[0].id;
  for (const [field, value] of Object.entries({
    Producto: product,
    Fecha: serial('2026-01-02'),
    'VL EUR': 10,
    Fuente: 'Fuente verificada',
  }))
    r.setInput('tPrecios', 0, field, value);
  r.ctx.Sheets.Spreadsheets.batchUpdate(
    {
      requests: [
        {
          addSheet: {
            properties: {
              sheetId: 900,
              title: 'Histórico',
              gridProperties: { rowCount: 1000, columnCount: 26 },
            },
          },
        },
        {
          updateCells: {
            start: { sheetId: 900, rowIndex: 0, columnIndex: 0 },
            rows: [
              {
                values: [
                  {
                    userEnteredValue: {
                      stringValue: 'Finanzas · Histórico generado',
                    },
                  },
                  { userEnteredValue: { stringValue: 'Fondo de prueba' } },
                ],
              },
              {
                values: [
                  { userEnteredValue: { stringValue: 'Fecha' } },
                  { userEnteredValue: { stringValue: 'ES0175902008' } },
                ],
              },
              {
                values: [
                  { userEnteredValue: { stringValue: 'Inicio conocido' } },
                  { userEnteredValue: { numberValue: serial('2026-01-02') } },
                ],
              },
              {
                values: [
                  { userEnteredValue: { numberValue: serial('2026-01-02') } },
                  { userEnteredValue: { numberValue: 10 } },
                ],
              },
            ],
            fields: 'userEnteredValue',
          },
        },
      ],
    },
    'fixture-book',
  );
  const writes = r.writes.length;
  let batchAttempts = 0,
    clearCalls = 0;
  const sheets = r.ctx.Sheets.Spreadsheets,
    values = sheets.Values,
    originalClear = values.clear;
  values.clear = (...args) => {
    clearCalls++;
    return originalClear(...args);
  };
  sheets.batchUpdate = () => {
    batchAttempts++;
    throw Error('simulated batch failure');
  };
  const result = JSON.parse(
    r.evaluate(
      'JSON.stringify(refreshDailyHistorySafely_({id:"fixture-book",environment:"test"}))',
    ),
  );
  assert.equal(result.status, 'not_updated');
  assert.equal(batchAttempts, 1);
  assert.equal(clearCalls, 0);
  assert.equal(r.writes.length, writes);
  assert.equal(
    r.cell(900, 0, 0).userEnteredValue.stringValue,
    'Finanzas · Histórico generado',
  );
  assert.equal(
    r.cell(900, 2, 1).userEnteredValue.numberValue,
    serial('2026-01-02'),
  );
  assert.equal(r.cell(900, 3, 1).userEnteredValue.numberValue, 10);
});
