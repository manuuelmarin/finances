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
        'Ejecuta prepareApplication para preparar cotizaciones.',
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
  ['archives', 'templates', 'planned', 'transfers', 'migrations'].forEach(
    (kind) => {
      const oldRows = before.technical[kind] || [],
        nextRows = after.technical[kind] || [];
      nextRows.forEach((row, i) => {
        if (canonical_(row) === canonical_(oldRows[i])) return;
        check_(
          !!before.tech[kind],
          'Prepara los metadatos con la entrega vigente.',
        );
        if (i < oldRows.length)
          requests.push({
            updateCells: {
              start: {
                sheetId: before.tech[kind].id,
                rowIndex: i + 1,
                columnIndex: 0,
              },
              rows: [{ values: row.map(cellValue_) }],
              fields: 'userEnteredValue',
            },
          });
        audit.push([
          requestId,
          now,
          kind,
          row[0],
          canonical_(oldRows[i] || null),
          canonical_(row),
        ]);
      });
      if (nextRows.length > oldRows.length)
        appendTechnical_(
          requests,
          before.tech[kind],
          oldRows,
          nextRows.slice(oldRows.length),
        );
    },
  );
  const previousBudgets = before.technical.budgets || [];
  const nextBudgets = after.technical.budgets || [];
  nextBudgets.forEach((row, i) => {
    if (canonical_(row) === canonical_(previousBudgets[i])) return;
    if (!before.tech.budgets)
      fail_(
        'NOT_INITIALIZED',
        'Prepara los presupuestos con la entrega vigente.',
      );
    if (i < previousBudgets.length)
      requests.push({
        updateCells: {
          start: {
            sheetId: before.tech.budgets.id,
            rowIndex: i + 1,
            columnIndex: 0,
          },
          rows: [{ values: row.map(cellValue_) }],
          fields: 'userEnteredValue',
        },
      });
    audit.push([
      requestId,
      now,
      'presupuestos',
      row[0],
      canonical_(previousBudgets[i] || null),
      canonical_(row),
    ]);
  });
  if (nextBudgets.length > previousBudgets.length)
    appendTechnical_(
      requests,
      before.tech.budgets,
      previousBudgets,
      nextBudgets.slice(previousBudgets.length),
    );
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
