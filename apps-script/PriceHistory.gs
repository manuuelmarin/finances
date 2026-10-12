function priceHistory_(config, request) {
  const writing = request.action === 'importPriceHistory';
  if (
    Object.keys(request).some(
      (k) =>
        ![
          'action',
          'requestId',
          'expectedRevision',
          'bookKey',
          'product',
          'rows',
          'sourceVerified',
        ].includes(k),
    ) ||
    typeof request.expectedRevision !== 'string' ||
    typeof request.bookKey !== 'string' ||
    (writing && !uuid_(request.requestId)) ||
    (!writing && request.requestId !== undefined)
  )
    fail_('INVALID_REQUEST');
  const requestId = writing ? request.requestId.toLowerCase() : null,
    fingerprint = hash_({
      action: 'importPriceHistory',
      product: request.product,
      rows: request.rows,
      sourceVerified: request.sourceVerified,
    });
  return locked_(() => {
    let before = readState_(config);
    checkRequestBook_(request, before);
    if (writing) {
      const replay = replayPrices_(before, requestId, fingerprint);
      if (replay) return replay;
    }
    if (
      writing &&
      !['requests', 'audit', 'observations', 'funds', 'quotes'].every(
        (k) => before.tech[k],
      )
    )
      fail_(
        'NOT_INITIALIZED',
        'Prepara los metadatos con la entrega vigente antes de importar.',
      );
    if (before.revision !== request.expectedRevision)
      fail_('CONFLICT', 'El libro cambió; revisa el histórico de nuevo.');
    const rows = historyRows_(before, request),
      conflicts = rows.filter((r) => r.status === 'conflict');
    if (!writing)
      return {
        ok: true,
        apiVersion: API_VERSION_,
        buildVersion: BUILD_VERSION_,
        revision: before.revision,
        bookKey: before.bookKey,
        rows,
        canImport: !conflicts.length,
        coverage: {
          from: rows.map((r) => r.date).sort()[0],
          to: rows
            .map((r) => r.date)
            .sort()
            .slice(-1)[0],
          observations: rows.length,
          interpolated: false,
        },
      };
    if (conflicts.length)
      fail_(
        'PRICE_CONFLICT',
        'Ya existe otro NAV para una fecha; el lote no se ha guardado.',
      );
    const now = new Date().toISOString(),
      operations = rows
        .filter((r) => r.status === 'new')
        .map((r) => ({
          process: 'precio',
          product: r.product,
          date: r.date,
          price: r.price,
          source:
            'Export | ' +
            r.provider +
            ' | ' +
            r.isin +
            ' | ' +
            r.classCurrency +
            ' / EUR | ' +
            (r.sourceUrl || 'owner document') +
            ' | ' +
            r.exportedAt,
        }));
    const apply = (state) => {
      const applied = applyOperations_(state, operations, requestId, now);
      rows.forEach((r, i) =>
        applied.state.technical.quotes.push([
          requestId + '-' + (i + 1),
          requestId,
          r.product,
          r.isin,
          r.date,
          r.price,
          r.classCurrency,
          r.provider,
          r.sourceUrl,
          now,
          'historical_' + r.status,
          JSON.stringify(r),
        ]),
      );
      return applied;
    };
    let applied = apply(before);
    before = prepareCapacity_(config, before, applied.state);
    if (before.revision !== request.expectedRevision) fail_('CONFLICT');
    applied = apply(before);
    const response = {
      ok: true,
      apiVersion: API_VERSION_,
      buildVersion: BUILD_VERSION_,
      environment: config.environment,
      requestId,
      revision: applied.state.revision,
      complete: true,
      results: rows,
      replayed: false,
    };
    const requests = mutationRequests_(before, applied.state, requestId, now, {
      operations,
      fingerprint,
      response,
    });
    try {
      Sheets.Spreadsheets.batchUpdate({ requests }, config.id);
    } catch (error) {
      try {
        const replay = replayPrices_(
          readState_(config),
          requestId,
          fingerprint,
        );
        if (replay) return replay;
      } catch (ignored) {}
      fail_(
        'WRITE_UNCERTAIN',
        'Recupera exactamente la misma solicitud histórica.',
      );
    }
    response.historyView = refreshDailyHistorySafely_(config);
    return response;
  });
}

// Explicit owner activation; isolated test and production bindings.
/* global ScriptApp */
