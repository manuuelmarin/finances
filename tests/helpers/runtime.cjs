// Servicio de Sheets simulado con datos ficticios; ninguna credencial o dato personal.
const fs = require('node:fs'),
  path = require('node:path'),
  vm = require('node:vm'),
  crypto = require('node:crypto');
const serial = (date) =>
  Math.round(
    (Date.parse(date + 'T00:00:00Z') - Date.UTC(1899, 11, 30)) / 86400000,
  );
const clone = (value) => JSON.parse(JSON.stringify(value));
function runtime(options = {}) {
  const bookId = options.bookId || 'fixture-book',
    readBooks = [],
    writeBooks = [];
  let book = { sheets: [], namedRanges: [] },
    grid = new Map(),
    busy = false;
  const writes = [],
    logs = [],
    fetches = [],
    cache = new Map();
  const ctx = vm.createContext({
    console: { log: (text) => logs.push(text) },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      computeDigest: (algo, value) =>
        [...crypto.createHash(algo).update(value).digest()].map((b) =>
          b > 127 ? b - 256 : b,
        ),
    },
    CacheService: {
      getScriptCache: () => ({
        get: (key) => cache.get(key) || null,
        put: (key, value) => cache.set(key, value),
      }),
    },
    UrlFetchApp: {
      fetch: (url, params) => {
        fetches.push({ url, params });
        const reply =
          typeof options.fetch === 'function'
            ? options.fetch(url, params)
            : options.responses?.[url];
        if (!reply) throw Error('No fixture for URL');
        return {
          getResponseCode: () => reply.status || 200,
          getContentText: () => reply.body,
        };
      },
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (name) =>
          ({
            TEST_SPREADSHEET_ID: 'fixture-book',
            OWNER_EMAIL: 'owner@example.test',
            ENVIRONMENT: 'test',
            ...options.properties,
          })[name],
      }),
    },
    Session: {
      getActiveUser: () => ({
        getEmail: () =>
          options.visitor === undefined
            ? 'owner@example.test'
            : options.visitor,
      }),
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => {
          if (options.busy || busy) return false;
          busy = true;
          return true;
        },
        releaseLock: () => {
          busy = false;
        },
      }),
    },
    Sheets: {
      Spreadsheets: {
        get: (id) => {
          readBooks.push(id);
          if (id !== bookId) throw Error('Wrong fixture id');
          return clone(book);
        },
        Values: {
          batchGet: (id, request) => ({
            valueRanges: request.ranges.map((range) => ({
              values: values(range, request.valueRenderOption),
            })),
          }),
        },
        batchUpdate: (body, id) => {
          if (id !== bookId) throw Error('Wrong fixture id');
          writeBooks.push(id);
          writes.push(clone(body));
          if (options.failBeforeWrite)
            throw Error('Transport failure before application');
          if (
            options.failFormulaMaintenanceOnce &&
            body.requests.some((r) =>
              r.updateCells?.rows?.some((row) =>
                row.values?.some((c) => c.userEnteredValue?.formulaValue),
              ),
            )
          ) {
            options.failFormulaMaintenanceOnce = false;
            throw Error('Formula maintenance interrupted before commit');
          }
          const nextBook = clone(book),
            nextGrid = new Map(grid);
          body.requests.forEach((request) => {
            if (request.addSheet)
              nextBook.sheets.push({
                properties: clone(request.addSheet.properties),
                tables: [],
              });
            else if (request.appendDimension) {
              const req = request.appendDimension,
                sheet = nextBook.sheets.find(
                  (s) => s.properties.sheetId === req.sheetId,
                );
              sheet.properties.gridProperties.rowCount += req.length;
            } else if (request.insertDimension) {
              const q = request.insertDimension.range,
                delta = q.endIndex - q.startIndex,
                sheet = nextBook.sheets.find(
                  (s) => s.properties.sheetId === q.sheetId,
                );
              if (q.dimension !== 'ROWS')
                throw Error('Fixture only inserts rows');
              const moved = [];
              for (const [key, cell] of nextGrid) {
                const [sid, row, col] = key.split(':').map(Number);
                if (sid === q.sheetId && row >= q.startIndex) {
                  moved.push([[sid, row + delta, col].join(':'), cell]);
                  nextGrid.delete(key);
                }
              }
              moved.forEach(([key, cell]) => nextGrid.set(key, cell));
              sheet.properties.gridProperties.rowCount += delta;
              [
                ...sheet.tables.map((t) => t.range),
                ...(nextBook.namedRanges || [])
                  .map((n) => n.range)
                  .filter((r) => r.sheetId === q.sheetId),
              ].forEach((r) => {
                if (r.startRowIndex >= q.startIndex) {
                  r.startRowIndex += delta;
                  r.endRowIndex += delta;
                } else if (r.endRowIndex > q.startIndex) r.endRowIndex += delta;
              });
            } else if (request.updateTable) {
              const q = request.updateTable.table,
                table = nextBook.sheets
                  .flatMap((s) => s.tables)
                  .find((t) => t.tableId === q.tableId);
              table.range = clone(q.range);
            } else if (request.addNamedRange) {
              nextBook.namedRanges.push({
                ...clone(request.addNamedRange.namedRange),
                namedRangeId: 'named-' + nextBook.namedRanges.length,
              });
            } else if (request.updateNamedRange) {
              const q = request.updateNamedRange.namedRange,
                n = nextBook.namedRanges.find(
                  (n) => n.namedRangeId === q.namedRangeId,
                );
              n.range = clone(q.range);
            } else if (request.copyPaste) {
              const q = request.copyPaste,
                s = q.source,
                d = q.destination;
              for (let r = d.startRowIndex; r < d.endRowIndex; r++)
                for (let c = d.startColumnIndex; c < d.endColumnIndex; c++) {
                  const key = [d.sheetId, r, c].join(':'),
                    source =
                      nextGrid.get(
                        [
                          s.sheetId,
                          s.startRowIndex +
                            ((r - d.startRowIndex) %
                              (s.endRowIndex - s.startRowIndex)),
                          s.startColumnIndex +
                            ((c - d.startColumnIndex) %
                              (s.endColumnIndex - s.startColumnIndex)),
                        ].join(':'),
                      ) || {},
                    current = clone(nextGrid.get(key) || {});
                  const field = {
                    PASTE_FORMAT: 'userEnteredFormat',
                    PASTE_DATA_VALIDATION: 'dataValidation',
                    PASTE_FORMULA: 'userEnteredValue',
                  }[q.pasteType];
                  if (
                    source[field] &&
                    (q.pasteType !== 'PASTE_FORMULA' ||
                      source[field].formulaValue)
                  )
                    current[field] = clone(source[field]);
                  nextGrid.set(key, current);
                }
            } else if (request.setDataValidation) {
              const q = request.setDataValidation,
                r = q.range;
              for (let row = r.startRowIndex; row < r.endRowIndex; row++)
                for (
                  let col = r.startColumnIndex;
                  col < r.endColumnIndex;
                  col++
                ) {
                  const key = [r.sheetId, row, col].join(':');
                  nextGrid.set(key, {
                    ...nextGrid.get(key),
                    dataValidation: clone(q.rule),
                  });
                }
            } else if (request.updateCells) {
              const { start, rows } = request.updateCells,
                sheet = nextBook.sheets.find(
                  (s) => s.properties.sheetId === start.sheetId,
                );
              if (
                !sheet ||
                start.rowIndex + rows.length >
                  sheet.properties.gridProperties.rowCount
              )
                throw Error('Invalid grid write');
              rows.forEach((row, ri) =>
                row.values.forEach((cell, ci) => {
                  if (
                    cell.userEnteredValue?.formulaValue &&
                    /\bt[A-Za-z]+\[[^\]]+\]/.test(
                      cell.userEnteredValue.formulaValue,
                    )
                  )
                    throw Error(
                      'API parser does not accept imported table references',
                    );
                  if (
                    start.columnIndex + ci >=
                    sheet.properties.gridProperties.columnCount
                  )
                    throw Error('Invalid column');
                  const key = [
                      start.sheetId,
                      start.rowIndex + ri,
                      start.columnIndex + ci,
                    ].join(':'),
                    result = { ...(nextGrid.get(key) || {}), ...clone(cell) };
                  if (!cell.userEnteredValue) {
                    delete result.userEnteredValue;
                    delete result.effectiveValue;
                  } else if (!cell.userEnteredValue.formulaValue)
                    delete result.effectiveValue;
                  nextGrid.set(key, result);
                }),
              );
            } else if (request.findReplace) {
              const r = request.findReplace;
              for (
                let row = r.range.startRowIndex;
                row < r.range.endRowIndex;
                row++
              )
                for (
                  let col = r.range.startColumnIndex;
                  col < r.range.endColumnIndex;
                  col++
                ) {
                  const key = [r.range.sheetId, row, col].join(':'),
                    cell = nextGrid.get(key);
                  if (
                    cell &&
                    cell.userEnteredValue &&
                    cell.userEnteredValue.stringValue === r.find
                  )
                    nextGrid.set(key, {
                      userEnteredValue: { stringValue: r.replacement },
                    });
                }
            } else throw Error('Unknown fixture request');
          });
          book = nextBook;
          grid = nextGrid;
          if (options.loseResponseOnce) {
            options.loseResponseOnce = false;
            throw Error('Response lost after commit');
          }
          return { replies: body.requests.map(() => ({})) };
        },
      },
    },
  });
  ctx.Utilities.formatDate = (date, zone) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '../../apps-script/Code.gs'), 'utf8'),
    ctx,
  );
  const schemas = JSON.parse(
    vm.runInContext('JSON.stringify(TABLE_SCHEMA_)', ctx),
  );
  const inputSchema = JSON.parse(
    vm.runInContext('JSON.stringify(INPUT_SCHEMA_)', ctx),
  );
  const positions = {
    tMovimientos: [7, 1, 28],
    tProductos: [28, 1, 49],
    tOperaciones: [54, 1, 85],
    tPrecios: [90, 1, 121],
    tCuentas: [7, 1, 28],
    tDeudas: [7, 7, 28],
    tVinculos: [33, 1, 54],
    tNominas: [7, 1, 28],
    tObjetivos: [7, 1, 13],
    tAsignaciones: [18, 1, 29],
    tParametros: [4, 1, 10],
    tCategorias: [13, 1, 34],
  };
  const titles = JSON.parse(
    vm.runInContext('JSON.stringify(REQUIRED_SHEETS_)', ctx),
  );
  book.sheets = titles.map((title, sheetId) => ({
    properties: {
      title,
      sheetId,
      gridProperties: { rowCount: 1000, columnCount: 26 },
    },
    tables: schemas
      .filter((s) => s[0] === title)
      .map(([, name, headers]) => {
        const [startRowIndex, startColumnIndex, endRowIndex] = positions[name];
        return {
          name,
          tableId: 'table-' + name,
          range: {
            sheetId,
            startRowIndex,
            startColumnIndex,
            endRowIndex,
            endColumnIndex: startColumnIndex + headers.length,
          },
          columnProperties: headers.map((columnName, columnIndex) => ({
            columnName,
            columnIndex,
          })),
        };
      }),
  }));
  function setValue(sheetId, row, column, value) {
    grid.set([sheetId, row, column].join(':'), {
      userEnteredValue:
        typeof value === 'number'
          ? { numberValue: value }
          : value === null
            ? {}
            : { stringValue: value },
    });
  }
  schemas.forEach(([title, name, headers]) => {
    const sheet = book.sheets.find((s) => s.properties.title === title),
      table = sheet.tables.find((t) => t.name === name),
      range = table.range;
    headers.forEach((h, i) =>
      setValue(
        range.sheetId,
        range.startRowIndex,
        range.startColumnIndex + i,
        h,
      ),
    );
    if (inputSchema[name])
      for (let row = range.startRowIndex + 1; row < range.endRowIndex; row++)
        headers.forEach((h, i) => {
          if (!inputSchema[name].inputs.includes(h))
            grid.set(
              [range.sheetId, row, range.startColumnIndex + i].join(':'),
              {
                userEnteredValue: {
                  formulaValue: '=FIXTURE_FORMULA(' + row + ')',
                },
                effectiveValue: { numberValue: 0 },
              },
            );
        });
  });
  const data = {
    tCuentas: [
      {
        Cuenta: 'Cuenta A',
        'Saldo inicial': 1000,
        'Saldo real': 1000,
        'Fecha saldo': serial('2026-01-01'),
      },
      {
        Cuenta: 'Cuenta B',
        'Saldo inicial': 0,
        'Saldo real': null,
        'Fecha saldo': null,
      },
    ],
    tCategorias: [
      {
        Grupo: 'Gastos',
        Subgrupo: 'Hogar',
        Categoría: 'Alimentación',
        Subcategoría: 'Café',
      },
      {
        Grupo: 'Ingresos',
        Subgrupo: 'Trabajo',
        Categoría: 'Ingresos',
        Subcategoría: 'Nómina',
      },
    ],
    tProductos: [
      {
        ID: 'PRODUCT-A',
        Producto: 'Fondo A',
        Cuenta: 'Cuenta A',
        Clase: 'Renta variable',
        'Fecha base': serial('2025-01-01'),
        'Unidades base': 5,
        'Coste base': 10,
      },
    ],
    tPrecios: [
      {
        Producto: 'PRODUCT-A',
        Fecha: serial('2026-01-01'),
        'VL EUR': 3,
        Fuente: 'Fuente ficticia',
      },
    ],
    tParametros: [
      { Parámetro: 'Inicio seguimiento', Valor: serial('2026-01-01') },
      { Parámetro: 'Fecha informe', Valor: serial('2026-01-02') },
      { Parámetro: 'Valoración inversiones', Valor: serial('2026-01-01') },
      { Parámetro: 'Moneda', Valor: 'EUR' },
      { Parámetro: 'Versión modelo', Valor: 3 },
    ],
    ...options.data,
  };
  Object.entries(data).forEach(([name, rows]) => {
    const spec = schemas.find((s) => s[1] === name),
      sheet = book.sheets.find((s) => s.properties.title === spec[0]),
      range = sheet.tables.find((t) => t.name === name).range;
    rows.forEach((r, i) =>
      spec[2].forEach((h, j) => {
        if (Object.prototype.hasOwnProperty.call(r, h))
          setValue(
            range.sheetId,
            range.startRowIndex + 1 + i,
            range.startColumnIndex + j,
            r[h],
          );
      }),
    );
  });
  // Plantillas de cálculo nativo. Solo se simula la estructura, no un segundo motor financiero.
  const calc = book.sheets.find((s) => s.properties.title === 'Cálculos')
      .properties.sheetId,
    invest = book.sheets.find((s) => s.properties.title === 'Inversiones')
      .properties.sheetId;
  const blocks = [
    [calc, 7, 1, ['ID', 'Fecha', 'Tipo'], 20, 13],
    [calc, 49, 1, ['Categoría', 'Gasto propio'], 9, 5],
    [calc, 65, 1, ['Mes', 'Producto', 'Corte'], 18, 10],
    [calc, 124, 4, ['Producto', 'Valor'], 1, 2],
    [
      invest,
      126,
      1,
      ['Mes', 'Capital invertido', 'Valor de mercado', 'Resultado'],
      18,
      4,
    ],
    [calc, 15, 15, ['Localización', 'Gasto propio'], 5, 2],
  ];
  blocks.forEach(([id, row, col, headers, count, width]) => {
    headers.forEach((h, i) => setValue(id, row, col + i, h));
    for (let i = 1; i <= count; i++)
      for (let j = 0; j < width; j++)
        grid.set([id, row + i, col + j].join(':'), {
          userEnteredValue: { formulaValue: '=FIXTURE_SUPPORT(' + i + ')' },
          effectiveValue: { numberValue: i },
        });
  });
  function col(s) {
    let n = 0;
    for (const c of s) n = n * 26 + c.charCodeAt(0) - 64;
    return n - 1;
  }
  function values(range, mode) {
    const m = range.match(/^'((?:[^']|'')+)'!([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
    if (!m) throw Error('Unsupported fixture A1 ' + range);
    const sheet = book.sheets.find(
      (s) => s.properties.title === m[1].replace(/''/g, "'"),
    );
    if (!sheet) throw Error('Sheet missing');
    const rows = [];
    for (let row = Number(m[3]) - 1; row < Number(m[5]); row++) {
      const cells = [];
      for (let c = col(m[2]); c <= col(m[4]); c++) {
        const cell =
            grid.get([sheet.properties.sheetId, row, c].join(':')) || {},
          v = cell.effectiveValue || cell.userEnteredValue || {};
        cells.push(
          mode === 'FORMULA' && cell.userEnteredValue?.formulaValue
            ? cell.userEnteredValue.formulaValue
            : v.numberValue === undefined
              ? v.stringValue === undefined
                ? ''
                : v.stringValue
              : v.numberValue,
        );
      }
      while (cells.length && cells.at(-1) === '') cells.pop();
      rows.push(cells);
    }
    while (rows.length && !rows.at(-1).length) rows.pop();
    return rows;
  }
  return {
    ctx,
    writes,
    logs,
    fetches,
    cache,
    options,
    readBooks,
    writeBooks,
    schemas,
    inputSchema,
    state: () =>
      ctx.readState_({
        id: bookId,
        environment: options.properties?.ENVIRONMENT || 'test',
      }),
    init: () => JSON.parse(JSON.stringify(ctx.comprobarPaso3())),
    api: (request) => JSON.parse(JSON.stringify(ctx.financialApi(request))),
    transact: (operations) =>
      JSON.parse(
        JSON.stringify(
          ctx.financialApi({
            action: 'transact',
            requestId: crypto.randomUUID(),
            expectedRevision: ctx.readState_({
              id: bookId,
              environment: options.properties?.ENVIRONMENT || 'test',
            }).revision,
            operations,
          }),
        ),
      ),
    formulas: () =>
      [...grid]
        .filter(
          ([key, cell]) =>
            cell.userEnteredValue &&
            cell.userEnteredValue.formulaValue &&
            Number(key.split(':')[0]) !== calc,
        )
        .map(([key, cell]) => [key, cell.userEnteredValue.formulaValue]),
    cell: (sheetId, row, col) =>
      clone(grid.get([sheetId, row, col].join(':')) || {}),
    setInput: (name, index, field, value) => {
      const spec = schemas.find((s) => s[1] === name),
        sheet = book.sheets.find((s) => s.properties.title === spec[0]),
        r = sheet.tables.find((t) => t.name === name).range;
      setValue(
        r.sheetId,
        r.startRowIndex + 1 + index,
        r.startColumnIndex + spec[2].indexOf(field),
        value,
      );
    },
    removeTechnical: (title) => {
      const s = book.sheets.find((s) => s.properties.title === title);
      book.sheets = book.sheets.filter((s) => s.properties.title !== title);
      for (const key of grid.keys())
        if (key.startsWith(s.properties.sheetId + ':')) grid.delete(key);
    },
    book: () => clone(book),
  };
}
module.exports = { runtime, serial, clone };
