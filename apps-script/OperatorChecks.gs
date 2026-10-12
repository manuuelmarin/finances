function probePriceSources_() {
  let result;
  try {
    const config = authorizedConfig_(),
      s = readState_(config),
      bindings = s.tables.tProductos
        .map((p) => fundBinding_(s, p))
        .filter(Boolean);
    const results = fetchFundQuotesBatch_(bindings);
    result = {
      ok: true,
      apiVersion: API_VERSION_,
      buildVersion: BUILD_VERSION_,
      environment: config.environment,
      readOnly: true,
      complete: bindings.length > 0 && results.every((r) => r.ok),
      unconfigured: s.tables.tProductos.length - bindings.length,
      results,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    result = apiError_(error);
  }
  console.log(JSON.stringify(result));
  return result;
}
function updatePricesLegacy_() {
  let result;
  try {
    const config = authorizedConfig_(),
      results = [];
    let state = readState_(config),
      ids = state.tables.tProductos.map((p) => p.ID);
    for (let i = 0; i < ids.length; i += PRICE_LIMIT_) {
      const response = refreshPrices_(config, {
        action: 'refreshPrices',
        requestId: Utilities.getUuid(),
        expectedRevision: state.revision,
        bookKey: state.bookKey,
        products: ids.slice(i, i + PRICE_LIMIT_),
      });
      results.push(response);
      state = readState_(config);
    }
    result = {
      ok: true,
      apiVersion: API_VERSION_,
      buildVersion: BUILD_VERSION_,
      environment: config.environment,
      complete: results.every((r) => r.complete),
      batches: results,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    result = apiError_(error);
  }
  console.log(JSON.stringify(result));
  return result;
}

// Comprobación del paso 5: lectura completa, resumen nativo y estados de precios.
function checkReadiness_() {
  let result;
  try {
    const s = readState_(authorizedConfig_()),
      snap = publicSnapshot_(s);
    result = {
      ok: snap.ok,
      apiVersion: API_VERSION_,
      buildVersion: BUILD_VERSION_,
      environment: s.environment,
      backendReady: snap.backendReady,
      calculationReady: snap.calculationReady && !snap.calculationErrors.length,
      calculationErrors: snap.calculationErrors,
      summaryReady: snap.summary.complete,
      missingPrices: snap.summary.missingPrices,
      missingMetrics: snap.summary.missingMetrics,
      bridgeReady: (() => {
        try {
          bridgeTemplate_();
          return true;
        } catch (error) {
          return false;
        }
      })(),
      tableCount: snap.tableCount,
      rows: snap.rows,
      revision: snap.revision,
    };
  } catch (error) {
    result = apiError_(error);
  }
  console.log(JSON.stringify(result));
  return result;
}

// Solo lectura: comprueba estructura, resumen y consulta real de fuentes, sin guardar precios.
function closureReport_(config) {
  const before = readState_(config),
    snap = publicSnapshot_(before);
  let bridgeReady = false;
  try {
    bridgeTemplate_();
    bridgeReady = true;
  } catch (error) {}
  const results = before.tables.tProductos.map((product) => {
    const binding = fundBinding_(before, product);
    return binding
      ? fetchFundQuote_(binding)
      : {
          ok: false,
          referenceName: product.Producto,
          error: 'ISIN_REQUIRED',
          message: 'Configura el ISIN y nombre de referencia de este producto.',
        };
  });
  const after = readState_(config),
    stable = before.revision === after.revision,
    checks = {
      backend: snap.backendReady,
      calculations: snap.calculationReady && !snap.calculationErrors.length,
      summary: snap.summary.complete,
      bridge: bridgeReady,
      sources: results.every((result) => result.ok),
      stable,
    };
  return {
    ok: true,
    apiVersion: API_VERSION_,
    buildVersion: BUILD_VERSION_,
    environment: config.environment,
    bookKey: before.bookKey,
    readOnly: true,
    technicalReady: Object.values(checks).every(Boolean),
    checks,
    revision: before.revision,
    settings: snap.settings,
    missingMetrics: snap.summary.missingMetrics,
    missingPrices: snap.summary.missingPrices,
    calculationErrors: snap.calculationErrors,
    results,
    checkedAt: new Date().toISOString(),
  };
}
function checkClosure_() {
  let result;
  try {
    result = closureReport_(authorizedConfig_());
  } catch (error) {
    result = apiError_(error);
  }
  return result;
}

function prepareApplication_() {
  let result;
  try {
    const config = authorizedConfig_();
    result = locked_(() => {
      const s = prepareCapacity_(config, initializeBackendUnlocked_(config));
      const historyView = refreshDailyHistorySafely_(config);
      return Object.assign(diagnostics_(s), {
        prices: priceSnapshot_(s),
        historyView,
      });
    });
  } catch (error) {
    result = apiError_(error);
  }
  return result;
}
