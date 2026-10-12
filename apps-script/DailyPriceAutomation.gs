function deactivateDailyPricesTest_() {
  authorizedConfig_();
  return locked_(() => {
    const properties = PropertiesService.getScriptProperties();
    // Desvincular primero hace que cualquier ejecución pendiente se detenga.
    properties.deleteProperty('DAILY_PRICE_TEST_BOOK');
    ScriptApp.getProjectTriggers()
      .filter(
        (t) => t.getHandlerFunction() === 'actualizacionDiariaPreciosTest_',
      )
      .forEach((t) => ScriptApp.deleteTrigger(t));
    [
      'DAILY_PRICE_TEST_OWNER',
      'DAILY_PRICE_TEST_PROJECT',
      'DAILY_PRICE_TEST_TRIGGER',
      'DAILY_PRICE_TEST_SCHEDULE',
      'DAILY_PRICE_TEST_COMPLETE',
      'DAILY_PRICE_TEST_STATE',
      'DAILY_PRICE_TEST_STATUS',
      'DAILY_PRICE_TEST_LEASE',
    ].forEach((key) => properties.deleteProperty(key));
    return { ok: true, enabled: false };
  });
}
// El sufijo _ impide llamadas desde google.script.run.
function actualizacionDiariaPreciosTest_(event) {
  const config = dailyPriceTriggerConfig_(event),
    hour = Number(Utilities.formatDate(new Date(), 'Europe/Madrid', 'HH'));
  if (hour < 20 || hour > 22)
    return { ok: true, skipped: true, reason: 'OUTSIDE_SCHEDULE' };
  return ejecutarActualizacionDiariaPreciosTest_(config);
}
function dailyPriceTriggerConfig_(event) {
  const properties = PropertiesService.getScriptProperties(),
    owner = (properties.getProperty('OWNER_EMAIL') || '').trim().toLowerCase(),
    effective = (Session.getEffectiveUser().getEmail() || '')
      .trim()
      .toLowerCase(),
    id = properties.getProperty('TEST_SPREADSHEET_ID'),
    triggerId = properties.getProperty('DAILY_PRICE_TEST_TRIGGER');
  if (!owner || effective !== owner) fail_('ACCESS_DENIED');
  if (
    !dailyPriceBooksSeparated_(properties) ||
    properties.getProperty('ENVIRONMENT') !== 'test' ||
    !id ||
    properties.getProperty('DAILY_PRICE_TEST_BOOK') !== id ||
    properties.getProperty('DAILY_PRICE_TEST_OWNER') !== owner ||
    (typeof ScriptApp.getScriptId === 'function' &&
      properties.getProperty('DAILY_PRICE_TEST_PROJECT') !==
        ScriptApp.getScriptId()) ||
    !triggerId ||
    !event ||
    String(event.triggerUid) !== String(triggerId) ||
    !ScriptApp.getProjectTriggers().some(
      (t) =>
        t.getHandlerFunction() === 'actualizacionDiariaPreciosTest_' &&
        String(t.getUniqueId()) === String(triggerId),
    )
  )
    fail_(
      'ACCESS_DENIED',
      'El trigger no corresponde al libro de pruebas activado.',
    );
  return { id, owner, environment: 'test' };
}
function assertDailyPriceActivationReady_(config) {
  // Activation is read-only and verifies every technical table refreshPrices_ requires.
  const state = readState_(config);
  if (
    !['requests', 'audit', 'observations', 'funds', 'quotes'].every(
      (kind) => state.tech[kind],
    )
  )
    fail_(
      'NOT_INITIALIZED',
      'Ejecuta prepareApplication desde el editor antes de activar la rutina diaria.',
    );
  return state;
}
function activateDailyPricesProduction_() {
  const config = authorizedConfig_();
  check_(
    config.environment === 'production',
    'La rutina diaria solo está habilitada para el libro de producción.',
  );
  return locked_(() => {
    assertDailyPriceActivationReady_(config);
    const properties = PropertiesService.getScriptProperties(),
      existing = ScriptApp.getProjectTriggers().filter(
        (t) =>
          t.getHandlerFunction() === 'actualizacionDiariaPreciosProduction_',
      ),
      currentId = properties.getProperty('DAILY_PRICE_PRODUCTION_TRIGGER'),
      current = existing.find(
        (t) => String(t.getUniqueId()) === String(currentId),
      ),
      reusable =
        current &&
        properties.getProperty('DAILY_PRICE_PRODUCTION_SCHEDULE') ===
          'hourly-20-22-v1' &&
        properties.getProperty('DAILY_PRICE_PRODUCTION_BOOK') === config.id &&
        properties.getProperty('DAILY_PRICE_PRODUCTION_OWNER') ===
          config.owner &&
        (typeof ScriptApp.getScriptId !== 'function' ||
          properties.getProperty('DAILY_PRICE_PRODUCTION_PROJECT') ===
            ScriptApp.getScriptId());
    const trigger = reusable
      ? current
      : ScriptApp.newTrigger('actualizacionDiariaPreciosProduction_')
          .timeBased()
          .everyHours(1)
          .create();
    existing
      .filter((t) => t !== trigger)
      .forEach((t) => ScriptApp.deleteTrigger(t));
    properties.setProperty(
      'DAILY_PRICE_PRODUCTION_TRIGGER',
      trigger.getUniqueId(),
    );
    properties.setProperty('DAILY_PRICE_PRODUCTION_BOOK', config.id);
    properties.setProperty('DAILY_PRICE_PRODUCTION_OWNER', config.owner);
    if (typeof ScriptApp.getScriptId === 'function')
      properties.setProperty(
        'DAILY_PRICE_PRODUCTION_PROJECT',
        ScriptApp.getScriptId(),
      );
    properties.setProperty(
      'DAILY_PRICE_PRODUCTION_SCHEDULE',
      'hourly-20-22-v1',
    );
    if (!reusable) {
      [
        'DAILY_PRICE_PRODUCTION_COMPLETE',
        'DAILY_PRICE_PRODUCTION_STATE',
        'DAILY_PRICE_PRODUCTION_STATUS',
        'DAILY_PRICE_PRODUCTION_LEASE',
      ].forEach((key) => properties.deleteProperty(key));
    }
    return {
      ok: true,
      environment: 'production',
      enabled: true,
      installed: true,
      schedule: { timezone: 'Europe/Madrid', hours: [20, 21, 22] },
    };
  });
}
function deactivateDailyPricesProduction_() {
  authorizedConfig_();
  return locked_(() => {
    const properties = PropertiesService.getScriptProperties();
    // Desvincular primero hace que cualquier ejecución pendiente se detenga.
    properties.deleteProperty('DAILY_PRICE_PRODUCTION_BOOK');
    ScriptApp.getProjectTriggers()
      .filter(
        (t) =>
          t.getHandlerFunction() === 'actualizacionDiariaPreciosProduction_',
      )
      .forEach((t) => ScriptApp.deleteTrigger(t));
    [
      'DAILY_PRICE_PRODUCTION_OWNER',
      'DAILY_PRICE_PRODUCTION_PROJECT',
      'DAILY_PRICE_PRODUCTION_TRIGGER',
      'DAILY_PRICE_PRODUCTION_SCHEDULE',
      'DAILY_PRICE_PRODUCTION_COMPLETE',
      'DAILY_PRICE_PRODUCTION_STATE',
      'DAILY_PRICE_PRODUCTION_STATUS',
      'DAILY_PRICE_PRODUCTION_LEASE',
    ].forEach((key) => properties.deleteProperty(key));
    return { ok: true, enabled: false };
  });
}
// El sufijo _ impide llamadas desde google.script.run.
function actualizacionDiariaPreciosProduction_(event) {
  const config = dailyPriceProductionTriggerConfig_(event),
    hour = Number(Utilities.formatDate(new Date(), 'Europe/Madrid', 'HH'));
  if (hour < 20 || hour > 22)
    return { ok: true, skipped: true, reason: 'OUTSIDE_SCHEDULE' };
  return ejecutarActualizacionDiariaPreciosTest_(config);
}
function dailyPriceProductionTriggerConfig_(event) {
  const properties = PropertiesService.getScriptProperties(),
    owner = (properties.getProperty('OWNER_EMAIL') || '').trim().toLowerCase(),
    effective = (Session.getEffectiveUser().getEmail() || '')
      .trim()
      .toLowerCase(),
    id = properties.getProperty('PRODUCTION_SPREADSHEET_ID'),
    triggerId = properties.getProperty('DAILY_PRICE_PRODUCTION_TRIGGER');
  if (!owner || effective !== owner) fail_('ACCESS_DENIED');
  if (
    !dailyPriceBooksSeparated_(properties) ||
    properties.getProperty('ENVIRONMENT') !== 'production' ||
    !id ||
    properties.getProperty('DAILY_PRICE_PRODUCTION_BOOK') !== id ||
    properties.getProperty('DAILY_PRICE_PRODUCTION_OWNER') !== owner ||
    (typeof ScriptApp.getScriptId === 'function' &&
      properties.getProperty('DAILY_PRICE_PRODUCTION_PROJECT') !==
        ScriptApp.getScriptId()) ||
    !triggerId ||
    !event ||
    String(event.triggerUid) !== String(triggerId) ||
    !ScriptApp.getProjectTriggers().some(
      (t) =>
        t.getHandlerFunction() === 'actualizacionDiariaPreciosProduction_' &&
        String(t.getUniqueId()) === String(triggerId),
    )
  )
    fail_(
      'ACCESS_DENIED',
      'El trigger no corresponde al libro de producción activado.',
    );
  return { id, owner, environment: 'production' };
}
function updatePricesTest_() {
  const config = authorizedConfig_();
  check_(config.environment === 'test', 'Requiere el libro de pruebas.');
  return ejecutarActualizacionDiariaPreciosTest_(config);
}
function updatePricesProduction_() {
  const config = authorizedConfig_();
  check_(
    config.environment === 'production',
    'Requiere el libro de producción.',
  );
  return ejecutarActualizacionDiariaPreciosTest_(config);
}
function assertDailyPriceBinding_(config) {
  if (
    config.dailyPriceDate &&
    config.dailyPriceDate !==
      Utilities.formatDate(new Date(), 'Europe/Madrid', 'yyyy-MM-dd')
  )
    fail_(
      'DAILY_DAY_CHANGED',
      'Ha cambiado el día de Madrid; se retomará en la siguiente ejecución.',
    );
  const properties = dailyPriceProperties_(config.environment);
  check_(
    dailyPriceBooksSeparated_(properties) &&
      properties.getProperty('ENVIRONMENT') === config.environment &&
      properties.getProperty(
        config.environment === 'production'
          ? 'PRODUCTION_SPREADSHEET_ID'
          : 'TEST_SPREADSHEET_ID',
      ) === config.id &&
      properties.getProperty('DAILY_PRICE_TEST_BOOK') === config.id &&
      properties.getProperty('DAILY_PRICE_TEST_OWNER') === config.owner &&
      (typeof ScriptApp.getScriptId !== 'function' ||
        properties.getProperty('DAILY_PRICE_TEST_PROJECT') ===
          ScriptApp.getScriptId()),
    'La rutina diaria requiere activación expresa para este libro de pruebas o producción.',
  );
}
function ejecutarActualizacionDiariaPreciosTest_(config) {
  const properties = dailyPriceProperties_(config.environment),
    assertBound = () => assertDailyPriceBinding_(config);
  assertBound();
  const today = Utilities.formatDate(new Date(), 'Europe/Madrid', 'yyyy-MM-dd'),
    start = Date.now(),
    token = Utilities.getUuid();
  const acquired = locked_(() => {
    const lease = dailyPriceStored_(properties, 'DAILY_PRICE_TEST_LEASE');
    if (lease && start - lease.started < 360000) return false;
    properties.setProperty(
      'DAILY_PRICE_TEST_LEASE',
      JSON.stringify({ token, started: start }),
    );
    return true;
  });
  if (!acquired) return { ok: true, skipped: true, reason: 'RUNNING' };
  try {
    let state = readState_(config);
    const ids = state.tables.tProductos.map((p) => p.ID),
      selection = hash_(
        ids.map((id) => {
          const p = state.tables.tProductos.find((p) => p.ID === id);
          return fundBinding_(state, p) || { product: id, isin: null };
        }),
      ),
      saved = dailyPriceStored_(properties, 'DAILY_PRICE_TEST_STATE'),
      ledger =
        saved &&
        saved.today === today &&
        saved.bookKey === state.bookKey &&
        saved.selection === selection &&
        object_(saved.batches)
          ? saved
          : { today, bookKey: state.bookKey, selection, batches: {} },
      batches = [];
    const hour = Number(
      Utilities.formatDate(new Date(), 'Europe/Madrid', 'HH'),
    );
    if (ledger.lastHour === hour && ledger.complete)
      return { ok: true, skipped: true, reason: 'ALREADY_COMPLETE' };
    for (let i = 0; i < ids.length; i += PRICE_LIMIT_) {
      if (Date.now() - start > 180000) break;
      assertBound();
      const products = ids.slice(i, i + PRICE_LIMIT_),
        key = String(i / PRICE_LIMIT_),
        batch = ledger.batches[key] || { attempt: 0 };
      if (batch.complete && batch.lastHour === hour) {
        batches.push({ complete: true, skipped: true, products });
        continue;
      }
      if (batch.attempt >= 3) {
        batches.push({
          ok: false,
          complete: false,
          error: 'DAILY_RETRY_LIMIT',
          products,
        });
        continue;
      }
      const digest = hash_({
          book: config.id,
          today,
          selection,
          products,
          attempt: batch.attempt,
        }),
        requestId =
          digest.slice(0, 8) +
          '-' +
          digest.slice(8, 12) +
          '-4' +
          digest.slice(13, 16) +
          '-a' +
          digest.slice(17, 20) +
          '-' +
          digest.slice(20, 32);
      let response;
      try {
        response = refreshPrices_(
          Object.assign({}, config, {
            dailyPriceTest: true,
            dailyPriceDate: today,
          }),
          {
            action: 'refreshPrices',
            requestId,
            expectedRevision: state.revision,
            bookKey: state.bookKey,
            products,
          },
        );
      } catch (error) {
        // Un resultado de escritura incierto conserva UUID e intento para recuperar el receipt.
        batches.push({
          ok: false,
          complete: false,
          error: error.code || 'DAILY_UPDATE_FAILED',
          products,
        });
        state = readState_(config);
        continue;
      }
      batch.complete =
        response.results.length > 0 &&
        response.results.every(
          (r) =>
            r.ok &&
            ['updated', 'unchanged'].indexOf(r.status) >= 0 &&
            r.ageDays >= 0 &&
            r.ageDays <= 4,
        );
      batch.lastHour = hour;
      batch.attempt += 1;
      ledger.batches[key] = batch;
      properties.setProperty('DAILY_PRICE_TEST_STATE', JSON.stringify(ledger));
      batches.push(Object.assign({}, response, { complete: batch.complete }));
      state = readState_(config);
    }
    if (properties.getProperty('DAILY_PRICE_TEST_BOOK') !== config.id)
      return {
        ok: true,
        complete: false,
        skipped: true,
        reason: 'DISABLED_DURING_RUN',
        batches,
      };
    ledger.lastHour = hour;
    ledger.complete =
      ids.length > 0 &&
      batches.length === Math.ceil(ids.length / PRICE_LIMIT_) &&
      batches.every((b) => b.complete);
    properties.setProperty('DAILY_PRICE_TEST_STATE', JSON.stringify(ledger));
    const lastRun = {
      status: !ids.length
        ? 'no_products'
        : ledger.complete
          ? 'complete'
          : batches.some((b) => b.error === 'DAILY_RETRY_LIMIT') ||
              Object.values(ledger.batches).some(
                (b) => !b.complete && b.attempt >= 3,
              )
            ? 'retry_limit'
            : 'partial',
      today,
      hour,
      checkedAt: new Date().toISOString(),
      lastSuccessfulDay: ledger.complete
        ? today
        : (dailyPriceStored_(properties, 'DAILY_PRICE_TEST_STATUS') || {})
            .lastSuccessfulDay || null,
      lastSuccessfulAt: ledger.complete
        ? new Date().toISOString()
        : (dailyPriceStored_(properties, 'DAILY_PRICE_TEST_STATUS') || {})
            .lastSuccessfulAt || null,
      publicationStatus: batches.some((b) =>
        (b.results || []).some((r) => r.status === 'updated'),
      )
        ? 'new_publication'
        : 'publication_pending',
      complete: ledger.complete,
      remaining: Math.max(0, ids.length - batches.length * PRICE_LIMIT_),
      counts: batches.reduce((counts, b) => {
        (b.results || []).forEach((r) => {
          const k = r.warning || r.error || r.status;
          counts[k] = (counts[k] || 0) + 1;
        });
        if (b.error) counts[b.error] = (counts[b.error] || 0) + 1;
        return counts;
      }, {}),
    };
    properties.setProperty('DAILY_PRICE_TEST_STATUS', JSON.stringify(lastRun));
    const result = Object.assign(
      { ok: true, environment: config.environment, batches },
      lastRun,
    );
    console.log(JSON.stringify(result));
    return result;
  } catch (error) {
    if (properties.getProperty('DAILY_PRICE_TEST_BOOK') === config.id)
      properties.setProperty(
        'DAILY_PRICE_TEST_STATUS',
        JSON.stringify({
          status: 'failed',
          today,
          checkedAt: new Date().toISOString(),
          complete: false,
          counts: { [error.code || 'DAILY_UPDATE_FAILED']: 1 },
        }),
      );
    throw error;
  } finally {
    locked_(() => {
      const lease = dailyPriceStored_(properties, 'DAILY_PRICE_TEST_LEASE');
      if (lease && lease.token === token)
        properties.deleteProperty('DAILY_PRICE_TEST_LEASE');
    });
  }
}

// Pruebas de instalación: comprobar no escribe cotizaciones; actualizar sí guarda VL verificados.

function dailyPriceStored_(properties, key) {
  try {
    const value = JSON.parse(properties.getProperty(key) || 'null');
    return object_(value) ? value : null;
  } catch (ignored) {
    return null;
  }
}
function dailyPriceBooksSeparated_(properties) {
  const test = (properties.getProperty('TEST_SPREADSHEET_ID') || '').trim(),
    production = (
      properties.getProperty('PRODUCTION_SPREADSHEET_ID') || ''
    ).trim();
  return !!test && (!production || test !== production);
}
function dailyPriceProperties_(environment) {
  const properties = PropertiesService.getScriptProperties();
  const key = (name) =>
    environment === 'production'
      ? name.replace('DAILY_PRICE_TEST_', 'DAILY_PRICE_PRODUCTION_')
      : name;
  return {
    getProperty: (name) => properties.getProperty(key(name)),
    setProperty: (name, value) => properties.setProperty(key(name), value),
    deleteProperty: (name) => properties.deleteProperty(key(name)),
  };
}
function dailyPriceStatus_(s) {
  const properties = dailyPriceProperties_(s.environment),
    book = properties.getProperty('DAILY_PRICE_TEST_BOOK'),
    bound =
      book &&
      dailyPriceBooksSeparated_(properties) &&
      hash_(book) === s.bookKey &&
      properties.getProperty('DAILY_PRICE_TEST_OWNER') ===
        (properties.getProperty('OWNER_EMAIL') || '').trim().toLowerCase() &&
      (typeof ScriptApp.getScriptId !== 'function' ||
        properties.getProperty('DAILY_PRICE_TEST_PROJECT') ===
          ScriptApp.getScriptId()),
    triggerId = properties.getProperty('DAILY_PRICE_TEST_TRIGGER');
  let installed = false,
    inspection = 'available';
  try {
    installed =
      !!triggerId &&
      ScriptApp.getProjectTriggers().some(
        (t) =>
          t.getHandlerFunction() ===
            (s.environment === 'production'
              ? 'actualizacionDiariaPreciosProduction_'
              : 'actualizacionDiariaPreciosTest_') &&
          String(t.getUniqueId()) === String(triggerId),
      );
  } catch (ignored) {
    inspection = 'unavailable';
  }
  const enabled = !!bound && installed,
    lastRun = bound
      ? dailyPriceStored_(properties, 'DAILY_PRICE_TEST_STATUS')
      : null,
    today = Utilities.formatDate(new Date(), 'Europe/Madrid', 'yyyy-MM-dd'),
    hour = Number(Utilities.formatDate(new Date(), 'Europe/Madrid', 'HH')),
    executionDue =
      enabled &&
      hour >= 20 &&
      hour <= 22 &&
      (!lastRun || lastRun.today !== today || lastRun.hour !== hour);
  return {
    enabled,
    status: !bound
      ? 'disabled'
      : inspection === 'unavailable'
        ? 'inspection_unavailable'
        : !installed
          ? 'trigger_missing'
          : executionDue
            ? 'execution_due'
            : lastRun && lastRun.today === today
              ? lastRun.status
              : 'scheduled',
    schedule: {
      timezone: 'Europe/Madrid',
      hours: [20, 21, 22],
      maxAttemptsPerBatch: 3,
    },
    lastRun,
    executionDue,
    lastSuccessfulRunAgeDays:
      lastRun && lastRun.lastSuccessfulAt
        ? Math.max(
            0,
            serialDate_(
              Utilities.formatDate(new Date(), 'Europe/Madrid', 'yyyy-MM-dd'),
            ) -
              serialDate_(
                lastRun.lastSuccessfulDay ||
                  lastRun.lastSuccessfulAt.slice(0, 10),
              ),
          )
        : null,
  };
}
function activateDailyPricesTest_() {
  const config = authorizedConfig_();
  check_(
    config.environment === 'test',
    'La rutina diaria solo está habilitada para el libro de pruebas.',
  );
  return locked_(() => {
    assertDailyPriceActivationReady_(config);
    const properties = PropertiesService.getScriptProperties(),
      existing = ScriptApp.getProjectTriggers().filter(
        (t) => t.getHandlerFunction() === 'actualizacionDiariaPreciosTest_',
      ),
      currentId = properties.getProperty('DAILY_PRICE_TEST_TRIGGER'),
      current = existing.find(
        (t) => String(t.getUniqueId()) === String(currentId),
      ),
      reusable =
        current &&
        properties.getProperty('DAILY_PRICE_TEST_SCHEDULE') ===
          'hourly-20-22-v1' &&
        properties.getProperty('DAILY_PRICE_TEST_BOOK') === config.id &&
        properties.getProperty('DAILY_PRICE_TEST_OWNER') === config.owner &&
        (typeof ScriptApp.getScriptId !== 'function' ||
          properties.getProperty('DAILY_PRICE_TEST_PROJECT') ===
            ScriptApp.getScriptId());
    const trigger = reusable
      ? current
      : ScriptApp.newTrigger('actualizacionDiariaPreciosTest_')
          .timeBased()
          .everyHours(1)
          .create();
    existing
      .filter((t) => t !== trigger)
      .forEach((t) => ScriptApp.deleteTrigger(t));
    properties.setProperty('DAILY_PRICE_TEST_TRIGGER', trigger.getUniqueId());
    properties.setProperty('DAILY_PRICE_TEST_BOOK', config.id);
    properties.setProperty('DAILY_PRICE_TEST_OWNER', config.owner);
    if (typeof ScriptApp.getScriptId === 'function')
      properties.setProperty(
        'DAILY_PRICE_TEST_PROJECT',
        ScriptApp.getScriptId(),
      );
    properties.setProperty('DAILY_PRICE_TEST_SCHEDULE', 'hourly-20-22-v1');
    if (!reusable) {
      [
        'DAILY_PRICE_TEST_COMPLETE',
        'DAILY_PRICE_TEST_STATE',
        'DAILY_PRICE_TEST_STATUS',
        'DAILY_PRICE_TEST_LEASE',
      ].forEach((key) => properties.deleteProperty(key));
    }
    return {
      ok: true,
      environment: 'test',
      enabled: true,
      installed: true,
      schedule: { timezone: 'Europe/Madrid', hours: [20, 21, 22] },
    };
  });
}
