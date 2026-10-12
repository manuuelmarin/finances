function dailyHistoryProductKey_(id) {
  return validIsin_(id) ? normalizeIsin_(id) : id;
}
function dailyHistoryHeader_(s, product) {
  if (validIsin_(product.ID)) return normalizeIsin_(product.ID);
  const binding = (s.technical?.funds || []).find(
    (row) => row[0] === product.ID,
  );
  return validIsin_(binding?.[1]) ? normalizeIsin_(binding[1]) : product.ID;
}
function dailyHistoryOverrideSerial_(value) {
  if (Number.isSafeInteger(value) && value > 0 && value < 100000) return value;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    try {
      return serialDate_(value);
    } catch (ignored) {}
  }
  return null;
}
function refreshDailyHistory_(config, s) {
  const existing = (s.book.sheets || []).find(
    (sheet) => sheet.properties.title === 'Histórico',
  );
  let firstHeldOverrides = {};
  if (existing) {
    const columnCount = existing.properties.gridProperties.columnCount || 1,
      ranges = ["'Histórico'!A1:A1"];
    let headerRangeIndex = -1;
    if (columnCount > 1) {
      headerRangeIndex = ranges.length;
      ranges.push("'Histórico'!B2:" + columnA1_(columnCount - 1) + '3');
    }
    const rowRangeIndex = ranges.length;
    ranges.push(
      "'Histórico'!A1:A" + existing.properties.gridProperties.rowCount,
    );
    const read = Sheets.Spreadsheets.Values.batchGet(config.id, {
      ranges,
      valueRenderOption: 'UNFORMATTED_VALUE',
    });
    const marker = read.valueRanges?.[0]?.values?.[0]?.[0];
    if (marker !== DAILY_HISTORY_MARKER_)
      return { status: 'preserved_existing_sheet' };
    const headerValues =
      headerRangeIndex >= 0
        ? read.valueRanges?.[headerRangeIndex]?.values || []
        : [];
    const oldHeaders = headerValues[0] || [],
      oldStarts = headerValues[1] || [];
    const currentProducts = new Map(
      s.tables.tProductos.map((p) => [dailyHistoryHeader_(s, p), p]),
    );
    check_(
      currentProducts.size === s.tables.tProductos.length,
      'Hay productos con el mismo ISIN en Histórico.',
    );
    const todaySerial = serialDate_(
      Utilities.formatDate(new Date(), 'Europe/Madrid', 'yyyy-MM-dd'),
    );
    oldHeaders.forEach((id, i) => {
      const value = oldStarts[i];
      if (blank_(value)) return;
      check_(
        typeof id === 'string' && currentProducts.has(id),
        'Inicio conocido sin un producto vigente.',
      );
      const date = dailyHistoryOverrideSerial_(value);
      check_(
        date !== null &&
          date <= todaySerial &&
          todaySerial - date <= DAILY_HISTORY_MAX_DAYS_,
        'Inicio conocido inválido o fuera del intervalo permitido.',
      );
      const latest = Math.max(
        0,
        ...s.tables.tPrecios.map((price) => price.Fecha),
      );
      check_(
        !latest || Math.abs(latest - date) <= DAILY_HISTORY_MAX_DAYS_,
        'Inicio conocido fuera del intervalo permitido.',
      );
      firstHeldOverrides[dailyHistoryProductKey_(currentProducts.get(id).ID)] =
        date;
    });
    const oldRows = read.valueRanges?.[rowRangeIndex]?.values?.length || 0,
      oldColumns = Math.min(
        1 + oldHeaders.length,
        existing.properties.gridProperties.columnCount,
      );
    if (oldRows && oldColumns) {
      existing.clearOwnedRange = {
        rowCount: oldRows,
        columnCount: oldColumns,
      };
    }
  }
  const rows = dailyHistoryRows_(s, firstHeldOverrides),
    columns = Math.max(1, rows[1].length),
    requests = [];
  let sheetId;
  if (existing) {
    sheetId = existing.properties.sheetId;
    const grid = existing.properties.gridProperties || {};
    if ((grid.rowCount || 0) < rows.length)
      requests.push({
        appendDimension: {
          sheetId,
          dimension: 'ROWS',
          length: rows.length - grid.rowCount,
        },
      });
    if ((grid.columnCount || 0) < columns)
      requests.push({
        appendDimension: {
          sheetId,
          dimension: 'COLUMNS',
          length: columns - grid.columnCount,
        },
      });
  } else {
    sheetId =
      Math.max(...s.book.sheets.map((sheet) => sheet.properties.sheetId)) + 1;
    requests.push({
      addSheet: {
        properties: {
          sheetId,
          title: 'Histórico',
          gridProperties: {
            rowCount: Math.max(1000, rows.length),
            columnCount: Math.max(26, columns),
            frozenRowCount: 3,
          },
        },
      },
    });
  }
  if (existing?.clearOwnedRange) {
    const { rowCount, columnCount } = existing.clearOwnedRange;
    requests.push({
      updateCells: {
        start: { sheetId, rowIndex: 0, columnIndex: 0 },
        rows: Array.from({ length: rowCount }, () => ({
          values: Array.from({ length: columnCount }, () => ({})),
        })),
        fields: 'userEnteredValue',
      },
    });
  }
  requests.push({
    updateCells: {
      start: { sheetId, rowIndex: 0, columnIndex: 0 },
      rows: rows.map((row) => ({ values: row.map(cellValue_) })),
      fields: 'userEnteredValue',
    },
  });
  if (columns > 1) {
    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 2,
          endRowIndex: 3,
          startColumnIndex: 1,
          endColumnIndex: columns,
        },
        cell: {
          userEnteredFormat: {
            numberFormat: { type: 'DATE', pattern: 'yyyy-mm-dd' },
          },
        },
        fields: 'userEnteredFormat.numberFormat',
      },
    });
  }
  if (rows.length > 3) {
    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 3,
          endRowIndex: rows.length,
          startColumnIndex: 0,
          endColumnIndex: 1,
        },
        cell: {
          userEnteredFormat: {
            numberFormat: { type: 'DATE', pattern: 'yyyy-mm-dd' },
          },
        },
        fields: 'userEnteredFormat.numberFormat',
      },
    });
  }
  Sheets.Spreadsheets.batchUpdate({ requests }, config.id);
  return { status: 'updated' };
}
function refreshDailyHistorySafely_(config) {
  try {
    return refreshDailyHistory_(config, readState_(config));
  } catch (error) {
    console.log(
      'Histórico derivado sin actualizar: ' + (error.code || error.message),
    );
    return { status: 'not_updated' };
  }
}

// Paso 4. La resolución depende del ISIN, nunca de una lista de fondos conocidos.
