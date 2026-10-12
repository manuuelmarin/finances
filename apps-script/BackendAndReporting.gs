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
    priceReady: ['requests', 'audit', 'observations', 'funds', 'quotes'].every(
      (k) => s.tech[k],
    ),
    priceProviders: ['VDOS / Quefondos'],
    dailyPrices: dailyPriceStatus_(s),
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
    supportsBudgets: true,
    supportsPlanning: !!s.tech.planned,
    fundTransfers: (s.technical.transfers || [])
      .filter((r) => r[9])
      .map((r) => ({
        id: r[0],
        date: isoDate_(r[1]),
        fromProduct: r[2],
        toProduct: r[3],
        outTradeID: r[4],
        inTradeID: r[5],
        costBasis: r[6],
        investedBasis: r[7],
        amount: r[8],
        concept: r[11],
        rawOut: r[12],
        rawIn: r[13],
        valuationResidual: r[13] - r[12],
      })),
    capabilities: {
      archives: true,
      templates: true,
      planned: true,
      payrollCorrection: true,
      contextualCorrection: true,
      fundTransfers: true,
    },
    archives: {
      accounts: (s.technical.archives || [])
        .filter((r) => r[1] === 'account' && r[3])
        .map((r) => r[2]),
      categories: (s.technical.archives || [])
        .filter((r) => r[1] === 'category' && r[3])
        .map((r) => r[2]),
    },
    templates: (s.technical.templates || [])
      .filter((r) => r[3])
      .map((r) => ({ id: r[0], name: r[1], operation: JSON.parse(r[2]) })),
    planned: (s.technical.planned || [])
      .filter((r) => r[7])
      .map((r) => ({
        id: r[0],
        date: isoDate_(r[1]),
        concept: r[2],
        account: r[3],
        category: r[4],
        amount: r[5],
        kind: r[6],
        active: true,
      })),
    budgets: (s.technical.budgets || [])
      .filter((r) => r[4])
      .map((r) => ({ month: r[1], category: r[2], amount: r[3] })),
    charts: nativeCharts_(s, data),
    summary: nativeSummary_(s, data),
    bookKey: s.bookKey,
  });
}

function nativeCharts_(s, data) {
  const finite = (v) =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;
  const block = (kind) => (s.chartValues || {})[SUPPORT_NAMES_[kind]] || [];
  const summary = s.summaryValues || [];
  const headerIndex = summary.findIndex((r) =>
    ['Mes', 'Ingresos', 'Gastos', 'Efectivo'].every((label) =>
      r.includes(label),
    ),
  );
  const monthly = [];
  if (headerIndex >= 0) {
    const header = summary[headerIndex];
    for (const row of summary.slice(headerIndex + 1, headerIndex + 13)) {
      if (blank_(row[header.indexOf('Mes')])) continue;
      monthly.push({
        label: String(row[header.indexOf('Mes')]),
        income: finite(row[header.indexOf('Ingresos')]),
        expense: finite(row[header.indexOf('Gastos')]),
        cash: finite(row[header.indexOf('Efectivo')]),
      });
    }
  }
  const pairs = (kind) =>
    block(kind)
      .filter((r) => !blank_(r[0]))
      .map((r) => ({ label: String(r[0]), value: finite(r[1]) }));
  const investments = block('months')
    .filter((r) => !blank_(r[0]))
    .map((r) => ({
      label:
        typeof r[0] === 'number' ? isoDate_(r[0]).slice(0, 7) : String(r[0]),
      capital: finite(r[1]),
      value: finite(r[2]),
    }));
  const missing = new Set(nativeSummary_(s, data).missingPrices);
  const positions = data.tProductos.map((p) => ({
    label: p.Producto,
    group: p.Clase,
    value: missing.has(p.Producto) ? null : finite(p.Valor),
  }));
  return {
    source: 'Sheets · cálculos y tablas nativas',
    monthly,
    categories: pairs('categories'),
    cities: pairs('cities'),
    investments,
    positions,
    salary: data.tNominas.map((n) => {
      const m = data.tMovimientos.find((row) => row.ID === n.Movimiento);
      return { label: m?.Fecha || 'Sin fecha', value: finite(m?.Importe) };
    }),
  };
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

function financialApi_(request) {
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
            'product',
            'rows',
            'sourceVerified',
          ].indexOf(k) < 0,
      )
    )
      fail_('INVALID_REQUEST');
    if (request.action === 'ping') {
      if (Object.keys(request).length !== 1) fail_('INVALID_REQUEST');
      return {
        ok: true,
        apiVersion: API_VERSION_,
        buildVersion: BUILD_VERSION_,
        apiTransport: API_TRANSPORT_,
        environment: config.environment,
      };
    }
    if (request.action === 'quotePrices') return quotePrices_(request, config);
    if (['previewPriceHistory', 'importPriceHistory'].includes(request.action))
      return priceHistory_(config, request);
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
        fail_('NOT_INITIALIZED', 'Ejecuta prepareApplication desde el editor.');
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
      if (
        [
          'budgets',
          'archives',
          'templates',
          'planned',
          'transfers',
          'migrations',
        ].some((k) => applied.state.technical[k].length && !before.tech[k])
      )
        before = initializeBackendUnlocked_(config);
      // La preparación de estructura no registra operaciones: las entradas, caja y solicitud
      // siguen en un único lote. Un fallo aquí permite reintentar el mismo sobre sin duplicar.
      before = prepareCapacity_(config, before, applied.state);
      if (before.revision !== request.expectedRevision)
        fail_(
          'CONFLICT',
          'El libro cambió durante la preparación. Vuelve a leer.',
        );
      applied = applyOperations_(before, request.operations, requestId, now);
      const formulaRequests = prepareFundFormulaMigration_(
        config,
        before,
        applied.state,
        requestId,
        now,
      );
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
      requests.push(...formulaRequests);
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
function checkTransactionLayer_() {
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
function probeTransactions_() {
  let id = null,
    config,
    initial,
    outcome;
  function send(operations, requestId, revision) {
    const response = financialApi_({
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
        const cleanup = financialApi_({
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

function financialApiJson_(requestJson) {
  try {
    authorizedConfig_();
    if (typeof requestJson !== 'string' || requestJson.length > 60000)
      fail_('INVALID_REQUEST');
    let request;
    try {
      request = JSON.parse(requestJson);
    } catch (error) {
      fail_('INVALID_REQUEST');
    }
    return JSON.stringify(financialApi_(request));
  } catch (error) {
    return JSON.stringify(apiError_(error));
  }
}
