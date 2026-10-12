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
function supportFormulaRequests_(state, originalOnly) {
  const blocks = supportRanges_(state),
    requests = [];
  const fill = (kind, make) => {
    const range = blocks[kind].range,
      rows = [];
    for (let i = range.startRowIndex; i < range.endRowIndex; i++) {
      const row = make(i + 1, i - range.startRowIndex);
      if (
        kind === 'history' &&
        !originalOnly &&
        (state.technical.migrations || []).some(
          (r) => r[1] === 'fund-transfer-v1',
        )
      )
        row[5] = fundCapitalAdjustedFormula_(
          row[5],
          'C' + (i + 1),
          'D' + (i + 1),
        );
      rows.push(row);
    }
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

// Vista auxiliar del registro de precios. No es una tabla financiera ni participa
// en la validación del modelo: tPrecios sigue siendo la única fuente de VL.
function dailyHistoryRows_(s, firstHeldOverrides) {
  const products = s.tables.tProductos.slice(),
    prices = new Map(),
    events = new Map(),
    knownTradeStarts = new Map(),
    overrides = firstHeldOverrides || {};
  let latestPriceDate = 0,
    firstDate = Infinity;
  products.forEach((p) => events.set(p.ID, []));
  s.tables.tPrecios.forEach((p) => {
    prices.set(p.Producto + '|' + p.Fecha, p['VL EUR']);
    latestPriceDate = Math.max(latestPriceDate, p.Fecha);
  });
  const todaySerial = serialDate_(
    Utilities.formatDate(new Date(), 'Europe/Madrid', 'yyyy-MM-dd'),
  );
  if (latestPriceDate > todaySerial)
    fail_('HISTORY_RANGE', 'El NAV futuro impide actualizar la vista diaria.');
  const lastDate = todaySerial;
  products.forEach((p) => {
    if (p['Unidades base'] > 0) {
      const key = dailyHistoryProductKey_(p.ID),
        start = overrides[key] || p['Fecha base'];
      events.get(p.ID).push({ date: start, units: p['Unidades base'] });
      firstDate = Math.min(firstDate, start);
    }
  });
  s.tables.tOperaciones.forEach((o) => {
    const units =
      o.Tipo === 'Compra'
        ? o.Participaciones
        : o.Tipo === 'Venta'
          ? -o.Participaciones
          : 0;
    const key = dailyHistoryProductKey_(o.Producto);
    if (units && (!overrides[key] || o.Fecha >= overrides[key])) {
      events.get(o.Producto).push({ date: o.Fecha, units });
      if (units > 0) {
        firstDate = Math.min(firstDate, o.Fecha);
        knownTradeStarts.set(
          key,
          Math.min(knownTradeStarts.get(key) || Infinity, o.Fecha),
        );
      }
    }
  });
  const rows = [
    [DAILY_HISTORY_MARKER_, ...products.map((p) => p.Producto)],
    ['Fecha', ...products.map((p) => dailyHistoryHeader_(s, p))],
    [
      'Inicio conocido (o Fecha base)',
      ...products.map((p) => {
        const key = dailyHistoryProductKey_(p.ID);
        return (
          overrides[key] ||
          (p['Unidades base'] > 0
            ? p['Fecha base']
            : knownTradeStarts.get(key) || null)
        );
      }),
    ],
  ];
  if (!lastDate || !Number.isFinite(firstDate) || firstDate > lastDate)
    return rows;
  if (lastDate - firstDate > DAILY_HISTORY_MAX_DAYS_)
    fail_('HISTORY_RANGE', 'El intervalo del Histórico supera 100 años.');
  const ordered = new Map();
  events.forEach((list, id) =>
    ordered.set(
      id,
      list.sort((a, b) => a.date - b.date),
    ),
  );
  for (let date = firstDate; date <= lastDate; date++) {
    const row = [date];
    products.forEach((p) => {
      const held = (ordered.get(p.ID) || [])
        .filter((event) => event.date <= date)
        .reduce((units, event) => units + event.units, 0);
      row.push(
        held > 1e-8
          ? prices.has(p.ID + '|' + date)
            ? prices.get(p.ID + '|' + date)
            : null
          : null,
      );
    });
    rows.push(row);
  }
  return rows;
}
