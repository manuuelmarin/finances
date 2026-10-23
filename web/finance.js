/* global currentDeployment */
'use strict';

(() => {
  const $ = (id) => document.getElementById(id);
  // La vista previa solo muestra la interfaz pública. Nunca carga datos locales.
  if (window.top !== window.self) {
    $('finance-state').textContent =
      'Abre Finanzas en su propia ventana para acceder a tu libro.';
    for (const button of document.querySelectorAll(
      '.workspace-controls button, #finance-new, [data-operation], [data-open-book]',
    ))
      button.disabled = true;
    return;
  }
  const D = FinanceDomain;
  const money = new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  });
  const numbers = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 12 });
  let queue = null,
    client = null,
    openingClient = null,
    snapshot = null,
    url = null,
    review = null,
    editing = null,
    loading = false,
    awaitingRead = false,
    configurationEpoch = 0,
    limit = 50,
    activityLimit = 50,
    activityFilter = 'all',
    historyFilter = 'all',
    recoveryRequested = false,
    recoveryAttempts = 0,
    recoveryTimer = null;
  const store = new FinanceSync.BrowserStore();
  const el = (tag, text, cls) => {
    const e = document.createElement(tag);
    if (text !== undefined) e.textContent = presentation(text);
    if (cls) e.className = cls;
    return e;
  };
  const button = (label, action) => {
    const b = el('button', label, 'text-button');
    b.type = 'button';
    b.addEventListener('click', action);
    return b;
  };
  const errorText = (error) =>
    ({
      ACCESS_DENIED: 'Accede a Google con la cuenta propietaria del libro.',
      NOT_CONFIGURED: 'Configura primero el enlace privado de Google.',
      INVALID_MODEL:
        'Revisa el libro conectado: sus pestañas y tablas deben corresponder al modelo actual.',
      READ_FAILED:
        'Google no ha completado la lectura. Revisa los permisos de la implementación y vuelve a abrir el libro.',
      EMBEDDED_CONTEXT:
        'Abre Finanzas en su propia ventana para acceder a tu libro.',
      UPDATE_REQUIRED:
        'Actualiza Apps Script con el instalador 3.10.7 y publica una nueva versión.',
      POPUP_BLOCKED:
        'Permite abrir la ventana de Google y vuelve a pulsar Abrir mi libro.',
      NOT_CONNECTED: 'Abre Google para leer o enviar los pendientes.',
      CANNOT_DISCARD_IN_FLIGHT:
        'La solicitud ya está en curso o sin confirmar. Consulta su recibo; no se puede descartar.',
      CANNOT_DISCARD:
        'La solicitud ya no se puede descartar. Actualiza Actividad para ver su estado.',
      BOOK_BUSY:
        'Hay una lectura o un envío en curso. Espera a que termine y vuelve a comprobar.',
      CONNECTION_TIMEOUT:
        'No se ha confirmado la conexión. Los pendientes se conservan.',
      READ_TIMEOUT:
        'Google no ha respondido a la lectura. Vuelve a abrir el libro y mantén abierta la ventana de Google. No se ha enviado ninguna operación.',
      READ_CHANNEL_FAILED:
        'El canal privado no ha completado la lectura. Vuelve a abrir el libro; si persiste, actualiza la implementación desde el instalador.',
      GOOGLE_WINDOW_CLOSED:
        'Se ha cerrado la ventana de Google durante la lectura. Pulsa Abrir mi libro y mantenla abierta mientras usas el libro.',
      TRANSPORT_UNAVAILABLE:
        'Google no ha iniciado el canal privado. Vuelve a abrir el libro con la sesión de Google iniciada y la implementación actualizada.',
      TRANSPORT_TIMEOUT:
        'Google no ha respondido a la comprobación del canal. Mantén abierta su ventana y vuelve a abrir el libro.',
      INVALID_RESPONSE:
        'Google no ha devuelto el formato vigente. Actualiza los archivos de esta entrega desde el instalador y publica Nueva versión.',
      SUBMIT_FAILED:
        'El canal falló durante el envío. Se conserva la solicitud para consultar su recibo.',
      STATUS_FAILED:
        'No se pudo consultar el recibo. La solicitud se conserva sin confirmar.',
      RECEIPT_MISMATCH:
        'La respuesta no corresponde a esta solicitud. Se conserva el envío y se consultará su recibo; no lo vuelvas a crear.',
      REVIEW_REQUIRED: 'Hay solicitudes que requieren revisión en Actividad.',
      RESPONSE_UNCERTAIN:
        'Envío sin confirmar. La solicitud se conserva para consultar el recibo antes de reintentar.',
      API_FAILED:
        'Google no ha completado la solicitud. Se consultará su recibo antes de reintentar, conservando los mismos datos.',
      STORAGE_UNAVAILABLE:
        'Este navegador no permite guardar cambios. No se enviará ninguna operación hasta disponer de almacenamiento local.',
      BOOK_CHANGED:
        'La implementación apunta a otro libro. Se han conservado los pendientes y se ha bloqueado su envío.',
      PENDING_OPERATIONS:
        'Hay operaciones pendientes o sin confirmar. Revísalas antes de borrar la copia local.',
      READ_REQUIRED: 'Primero abre el libro para cargar cuentas y productos.',
      INVALID_SNAPSHOT:
        'La respuesta no identifica el libro. Actualiza Google a API 3.3.0.',
      CONFLICT: 'El libro cambió. Revisa el pendiente con la lectura actual.',
      CONFIGURATION_CHANGED:
        'La configuración cambió durante la conexión. Abre Google de nuevo para leer la implementación seleccionada.',
    })[error.message] ||
    error.message ||
    'No se ha confirmado la operación.';
  function status(text, state) {
    $('finance-state').textContent = text;
    for (const target of document.querySelectorAll('[data-finance-state]'))
      target.textContent = text;
    if (state) {
      document.documentElement.dataset.bookState = state;
      const labels = {
        loaded: 'Datos cargados',
        offline: 'Copia local',
        loading: 'Cargando libro',
        error: 'Revisar lectura',
        readonly: 'Datos · solo lectura',
        unread: 'Libro sin cargar',
      };
      for (const label of document.querySelectorAll('[data-connection-label]'))
        label.textContent = labels[state];
      for (const indicator of document.querySelectorAll(
        '[data-connection-indicator]',
      ))
        indicator.dataset.state =
          state === 'loaded'
            ? 'success'
            : state === 'error'
              ? 'error'
              : 'pending';
    }
  }
  function enabled() {
    document.documentElement.dataset.bookBusy = String(loading);
    $('finance-new').disabled = loading || awaitingRead;
    $('finance-prices').disabled = !snapshot || loading || awaitingRead;
    const channelBlocked = client?.session?.rpcReady === false || awaitingRead;
    $('operation-connection').hidden = Boolean(snapshot) && !channelBlocked;
    $('operation-load').disabled = loading;
    $('operation-review').disabled = !snapshot || loading || channelBlocked;
    for (const target of document.querySelectorAll('[data-operation]'))
      target.disabled = loading || awaitingRead;
    for (const target of document.querySelectorAll('[data-open-book]'))
      target.disabled = loading;
    for (const id of ['finance-refresh', 'finance-sync'])
      $(id).disabled = !client?.session || loading;
  }
  async function saved() {
    return queue ? queue.get() : { queue: [], snapshot: null };
  }
  async function configure() {
    const next = currentDeployment();
    if (openingClient && openingClient.url !== next) {
      openingClient.close();
      openingClient = null;
    }
    if (url === next && queue) return;
    const epoch = ++configurationEpoch;
    // Un borrador/revisión pertenece al libro del que se cargaron sus referencias.
    if (url && url !== next) {
      review = null;
      editing = null;
      for (const id of ['review-dialog', 'operation-dialog', 'budget-dialog'])
        if ($(id).open) $(id).close();
    }
    client?.close();
    client = null;
    snapshot = null;
    queue = null;
    url = next;
    if (url) {
      const key = await FinanceSync.namespace(next);
      if (epoch !== configurationEpoch) return;
      const configuredQueue = new FinanceSync.Queue(store, key, {
        readbackReady: FinanceAnalytics.cashBalancesMatch,
      });
      const data = await configuredQueue.get();
      if (epoch !== configurationEpoch) return;
      queue = configuredQueue;
      snapshot = data.snapshot;
      status(
        snapshot
          ? 'Copia local · sin conexión. Abre Google para leer cambios o enviar pendientes.'
          : 'Abre Google para cargar los registros de tu libro.',
        snapshot ? 'offline' : 'unread',
      );
    } else
      status('Configura el enlace de Google para leer tu libro.', 'unread');
    await render();
  }
  async function refresh() {
    const readingClient = client,
      readingQueue = queue,
      epoch = configurationEpoch;
    const result = await readingClient.read();
    if (
      epoch !== configurationEpoch ||
      client !== readingClient ||
      queue !== readingQueue
    )
      throw Error('CONFIGURATION_CHANGED');
    if (!result.ok) throw Error(result.message || result.error);
    const data = await readingQueue.saveSnapshot(result);
    if (
      epoch !== configurationEpoch ||
      client !== readingClient ||
      queue !== readingQueue
    )
      throw Error('CONFIGURATION_CHANGED');
    snapshot = data.snapshot;
    const readPending = data.queue.some((item) => item.awaitingRead);
    if (readPending) {
      recoveryAttempts = 0;
      recoveryRequested = true;
      status(
        'Guardado en Google. Actualizando automáticamente todas las pestañas…',
        'loading',
      );
    } else
      status(
        (readingClient.session?.rpcReady === false
          ? 'Datos leídos · solo lectura. Actualiza la implementación desde el instalador para habilitar las operaciones. '
          : 'Lectura confirmada · ') +
          new Date(result.checkedAt).toLocaleString('es-ES', {
            timeZone: 'Europe/Madrid',
          }),
        readingClient.session?.rpcReady === false ? 'readonly' : 'loaded',
      );
    await render();
    if (
      epoch !== configurationEpoch ||
      client !== readingClient ||
      queue !== readingQueue
    )
      throw Error('CONFIGURATION_CHANGED');
  }
  function liveSession() {
    return Boolean(
      client?.session &&
      client.session.rpcReady === true &&
      !client.session.popup?.closed &&
      client.url === currentDeployment() &&
      client.url === url,
    );
  }
  async function connect(propagate = false) {
    if (loading) {
      if (propagate) throw Error('BOOK_BUSY');
      return false;
    }
    // Abrir la ventana en el clic, antes de esperar IndexedDB.
    const next = currentDeployment();
    if (!next) {
      if (propagate) throw Error('NOT_CONFIGURED');
      location.hash = 'connection';
      $('setup-toggle').click();
      return false;
    }
    const reuse = liveSession();
    if (!reuse) client?.close();
    const opening = reuse ? client : new FinanceApiClient(next);
    openingClient = opening;
    opening.onProgress = ({ action }) => {
      if (client !== opening) return;
      status(
        ['transact', 'refreshPrices'].includes(action)
          ? 'Google ha recibido la solicitud. Esperando su confirmación…'
          : 'Google está leyendo el libro. Mantén abierta su ventana…',
      );
    };
    const handshake = reuse ? Promise.resolve() : opening.connect();
    let epoch;
    loading = true;
    enabled();
    status(
      'Cargando el libro desde Google… Usa la cuenta propietaria y mantén abierta su ventana.',
      'loading',
    );
    try {
      const configuration = configure();
      epoch = configurationEpoch;
      await Promise.all([configuration, handshake]);
      if (
        epoch !== configurationEpoch ||
        currentDeployment() !== next ||
        url !== next ||
        !queue ||
        !opening.session
      )
        throw Error('CONFIGURATION_CHANGED');
      client = opening;
      await refresh();
      if (epoch !== configurationEpoch || client !== opening || !queue)
        throw Error('CONFIGURATION_CHANGED');
      return true;
    } catch (error) {
      opening.close();
      if (client === opening) {
        client.close();
        client = null;
      }
      if (epoch !== configurationEpoch) error = Error('CONFIGURATION_CHANGED');
      status(errorText(error), 'error');
      if (propagate) throw error;
      return false;
    } finally {
      if (openingClient === opening) openingClient = null;
      loading = false;
      enabled();
      scheduleRecovery();
    }
  }
  // Todas las comprobaciones usan el mismo canal que las operaciones del libro.
  globalThis.FinanceBook = {
    errorText,
    async check(action) {
      if (!['connection', 'diagnostics', 'acceptance'].includes(action))
        throw Error('INVALID_REQUEST');
      if (loading) throw Error('BOOK_BUSY');
      if (action === 'connection' || !liveSession()) await connect(true);
      if (!client?.session || !queue || !snapshot)
        throw Error('CONFIGURATION_CHANGED');
      const checkedClient = client,
        checkedQueue = queue,
        epoch = configurationEpoch;
      loading = true;
      enabled();
      try {
        const result =
          action === 'connection'
            ? {
                ok: true,
                environment: snapshot.environment,
                modelVersion: snapshot.modelVersion,
                sheetCount: snapshot.businessSheetCount,
                checkedAt: snapshot.checkedAt,
                apiVersion: snapshot.apiVersion,
                buildVersion: snapshot.buildVersion,
                rpcReady: checkedClient.session.rpcReady,
                bridgeVersion: checkedClient.session.bridgeVersion,
              }
            : await checkedClient[action]();
        if (
          epoch !== configurationEpoch ||
          checkedClient !== client ||
          checkedQueue !== queue
        )
          throw Error('CONFIGURATION_CHANGED');
        if (!result.ok) throw Error(result.error || result.message);
        return result;
      } catch (error) {
        if (
          epoch !== configurationEpoch ||
          checkedClient !== client ||
          checkedQueue !== queue
        )
          throw Error('CONFIGURATION_CHANGED');
        throw error;
      } finally {
        loading = false;
        enabled();
        scheduleRecovery();
      }
    },
  };
  const priceHistory = globalThis.FinanceHistory?.bind({
    getSnapshot: () => snapshot,
    preview: async (payload) => {
      if (!liveSession()) throw Error('NOT_CONNECTED');
      return client.request(payload);
    },
    enqueue: async (label, action, payload) => {
      if (!queue || !snapshot) throw Error('READ_REQUIRED');
      if (action !== 'importPriceHistory') throw Error('INVALID_REQUEST');
      const submittedQueue = queue;
      const data = await submittedQueue.enqueue(null, label, action, payload);
      const item = data.queue[data.queue.length - 1];
      await render();
      if (liveSession()) await sync();
      if (queue !== submittedQueue) throw Error('CONFIGURATION_CHANGED');
      return { requestId: item.envelope.requestId };
    },
    receipt: async (requestId) =>
      (await saved()).queue.find(
        (item) => item.envelope.requestId === requestId,
      ) || null,
    status,
  });
  async function sync() {
    if (loading) {
      recoveryRequested = true;
      return;
    }
    if (!client?.session) {
      status('Abre Google para enviar los pendientes.');
      return;
    }
    loading = true;
    enabled();
    status('Consultando y enviando pendientes…');
    try {
      const outcome = await queue.run(client, () => {
        void render();
      });
      snapshot = (await saved()).snapshot;
      if (outcome.confirmed > 0) recoveryAttempts = 0;
      const needsRead = outcome.reason?.startsWith('POST_CONFIRM_');
      if (
        recoveryAttempts < 3 &&
        (needsRead ||
          (recoveryAttempts > 0 &&
            ['unconfirmed', 'busy'].includes(outcome.status)))
      )
        recoveryRequested = true;
      status(
        outcome.status === 'busy'
          ? 'Otra ventana está comprobando o enviando los pendientes.'
          : needsRead
            ? 'Guardado en Google. Actualizando automáticamente todas las pestañas…'
            : outcome.status === 'unconfirmed'
              ? 'Quedan envíos sin confirmar. ' +
                errorText(Error(outcome.reason))
              : outcome.status === 'review'
                ? 'Hay operaciones que requieren revisión. Consulta Actividad.'
                : 'Datos actualizados en todas las pestañas.',
        needsRead ? 'loading' : snapshot ? 'loaded' : 'unread',
      );
    } catch (error) {
      if ((awaitingRead || recoveryAttempts > 0) && recoveryAttempts < 3)
        recoveryRequested = true;
      status(errorText(error), 'error');
    } finally {
      loading = false;
      await render();
      scheduleRecovery();
    }
  }
  function presentation(value) {
    return typeof value === 'string'
      ? value.replace(/\bEFECTIVO\b/g, 'Efectivo')
      : value;
  }
  const displayValue = (key, value, book) =>
    presentation(D.displayValue(key, value, book));
  function priceSource(value) {
    const raw = String(value || 'Sin dato');
    try {
      const url = new URL(raw);
      if (
        url.protocol === 'https:' &&
        url.hostname === 'www.quefondos.com' &&
        !url.username &&
        !url.password &&
        (!url.port || url.port === '443')
      ) {
        const link = el('a', 'Fuente');
        link.href = url.href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.setAttribute(
          'aria-label',
          'Fuente de precios · Quefondos (abre en otra pestaña)',
        );
        return link;
      }
      return el('span', 'Fuente sin enlace verificado');
    } catch {
      return el(
        'span',
        /(?:https?:|javascript:|data:|www\.)/i.test(raw)
          ? 'Fuente sin enlace verificado'
          : raw,
      );
    }
  }
  const tableState = new Map();
  function cell(key, value) {
    if (
      key === 'Recurrente' &&
      (value === null || value === undefined || value === '')
    )
      return 'No';
    const labels = {
      desconocido: 'Hora o corte desconocido',
      cierre_dia: 'Cierre del día',
      intradía: 'Durante el día',
      referencia_sin_corte_comparable:
        'Referencia histórica sin corte comparable',
      coincide_al_corte: 'Coincide en el mismo corte',
      diferencia_al_corte: 'Diferencia en el mismo corte',
    };
    if (['scope', 'comparisonStatus'].includes(key) && labels[value])
      return labels[value];
    if (value === null || value === undefined || value === '')
      return 'Sin dato';
    if (/Fecha|^date$/.test(key) && /^\d{4}-\d{2}-\d{2}$/.test(value))
      return new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC' }).format(
        new Date(value + 'T00:00:00Z'),
      );
    if (typeof value === 'number') {
      if (/Rentabilidad|Peso|Avance/.test(key))
        return new Intl.NumberFormat('es-ES', {
          style: 'percent',
          maximumFractionDigits: 2,
        }).format(value);
      if (/Participaciones|Unidades|VL EUR|Precio/.test(key))
        return numbers.format(value);
      return money.format(value);
    }
    return displayValue(key, value, snapshot);
  }
  function table(parent, rows, columns, name, actions = true) {
    parent.replaceChildren();
    const state = tableState.get(name) || { filters: {}, sort: null };
    tableState.set(name, state);
    const visibleColumns = columns;
    const numericColumn = (key) =>
      rows.some((row) => typeof row[key] === 'number') ||
      /Importe|Saldo|Valor|Resultado|Rentabilidad|Peso|Participaciones|Precio|Comisión|Retención|Recuperable|Meta|Asignado|Pendiente|Avance|Neto|Bruto|Cotización|IRPF|deducciones|VL EUR|amount|difference/.test(
        key,
      );
    const percentageColumn = (key) => /Rentabilidad|Peso|Avance/.test(key);
    const categoricalColumn = (key) =>
      /^(Tipo|Origen|Destino|Subcategoría|Localización|Recurrente|Cuenta|Clase|Grupo|Subgrupo|Categoría|Objetivo|Origen|Alcance|Comparación)$/.test(
        key,
      );
    const dateColumn = (key) => /Fecha|^date$/.test(key);
    const categoryFilterValue = (key, value) => {
      if (
        key === 'Recurrente' &&
        (value === null ||
          value === undefined ||
          value === '' ||
          value === false ||
          value === 'No')
      )
        return 'No';
      if (key === 'Recurrente' && (value === true || value === 'Sí'))
        return 'Sí';
      return value === null || value === undefined || value === ''
        ? '__empty__'
        : String(value);
    };
    const categoryFilterLabel = (key, value) =>
      value === '__empty__' ? 'Sin dato' : cell(key, value);
    const filtered = rows.filter((row) =>
      visibleColumns.every(([key]) => {
        const filter = state.filters[key] || {};
        if (numericColumn(key) || dateColumn(key)) {
          if (!filter.min && !filter.max) return true;
          const value = row[key];
          if (value === null || value === undefined || value === '')
            return false;
          return (
            (!filter.min ||
              value >=
                (numericColumn(key)
                  ? Number(filter.min) / (percentageColumn(key) ? 100 : 1)
                  : filter.min)) &&
            (!filter.max ||
              value <=
                (numericColumn(key)
                  ? Number(filter.max) / (percentageColumn(key) ? 100 : 1)
                  : filter.max))
          );
        }
        if (categoricalColumn(key))
          return (
            !Array.isArray(filter.values) ||
            filter.values.includes(categoryFilterValue(key, row[key]))
          );
        return (
          !filter.text ||
          D.normalize(cell(key, row[key])).includes(D.normalize(filter.text))
        );
      }),
    );
    if (state.sort)
      filtered.sort((a, b) => {
        const key = state.sort.key,
          av = a[key],
          bv = b[key];
        if (av === null || av === undefined || av === '')
          return bv === null || bv === undefined || bv === '' ? 0 : 1;
        if (bv === null || bv === undefined || bv === '') return -1;
        const order = numericColumn(key)
          ? av - bv
          : String(dateColumn(key) ? av : cell(key, av)).localeCompare(
              String(dateColumn(key) ? bv : cell(key, bv)),
              'es',
              { numeric: true },
            );
        return state.sort.direction === 'ascending' ? order : -order;
      });
    const wrap = el('div', undefined, 'table-scroll');
    const t = el('table', undefined, 'finance-table');
    const compact = name === 'tMovimientos';
    const caption = el(
      'caption',
      `${Math.min(filtered.length, limit)}${filtered.length > limit ? ' de ' + filtered.length : ''} registros`,
    );
    const tools = el('div', undefined, 'table-tools');
    tools.append(
      button('Limpiar filtros', () => {
        state.filters = {};
        state.openFilterKey = null;
        state.focusFilterValue = undefined;
        table(parent, rows, columns, name, actions);
        parent.querySelector('.table-tools button')?.focus();
      }),
      button('Exportar CSV filtrado', () => {
        const blob = new Blob([D.csv(filtered, visibleColumns)], {
          type: 'text/csv;charset=utf-8',
        });
        const link = el('a');
        const href = URL.createObjectURL(blob);
        link.href = href;
        link.download = name + '.csv';
        link.click();
        URL.revokeObjectURL(href);
      }),
    );
    t.append(caption);
    const head = el('thead'),
      hr = el('tr');
    const filterRow = el('tr', undefined, 'table-filter-row');
    for (const [key, label] of visibleColumns) {
      const title = label || key;
      const th = el('th');
      th.scope = 'col';
      th.setAttribute(
        'aria-sort',
        state.sort?.key === key ? state.sort.direction : 'none',
      );
      const sort = button(title, () => {
        state.sort = {
          key,
          direction:
            state.sort?.key === key && state.sort.direction === 'ascending'
              ? 'descending'
              : 'ascending',
        };
        table(parent, rows, columns, name, actions);
        parent.querySelector(`[data-sort-key="${key}"]`)?.focus();
      });
      sort.classList.add('column-sort');
      sort.dataset.sortKey = key;
      sort.setAttribute('aria-label', 'Ordenar por ' + title);
      th.append(sort);
      const filterCell = el('td');
      filterCell.dataset.label = 'Filtrar ' + title;
      if (categoricalColumn(key)) {
        const dropdown = el('details', undefined, 'column-multiselect');
        dropdown.dataset.filterKey = key + '-values';
        dropdown.open = state.openFilterKey === key;
        dropdown.style.position = 'relative';
        dropdown.style.minWidth = '120px';
        const selected = state.filters[key]?.values;
        const values = [
          ...new Set(rows.map((row) => categoryFilterValue(key, row[key]))),
        ].sort((a, b) =>
          categoryFilterLabel(key, a).localeCompare(
            categoryFilterLabel(key, b),
            'es',
            { numeric: true },
          ),
        );
        const allSelected =
          selected === undefined || selected.length === values.length;
        const summary = el(
          'summary',
          allSelected
            ? 'Todos'
            : `${selected.length} ${selected.length === 1 ? 'seleccionado' : 'seleccionados'}`,
        );
        summary.setAttribute('aria-label', 'Filtrar ' + title);
        summary.style.display = 'flex';
        summary.style.alignItems = 'center';
        summary.style.minHeight = '44px';
        summary.style.padding = '8px';
        summary.style.border = '1px solid var(--line)';
        summary.style.borderRadius = '6px';
        summary.style.background = 'var(--bg)';
        summary.style.cursor = 'pointer';
        const checklist = el('div', undefined, 'column-multiselect-options');
        checklist.style.position = 'absolute';
        checklist.style.top = '100%';
        checklist.style.left = '0';
        checklist.style.zIndex = '5';
        checklist.style.minWidth = '180px';
        checklist.style.maxHeight = '200px';
        checklist.style.overflowY = 'auto';
        checklist.style.padding = '6px';
        checklist.style.border = '1px solid var(--line)';
        checklist.style.borderRadius = '6px';
        checklist.style.background = 'var(--panel, var(--bg))';
        for (const value of values) {
          const item = el('label', undefined, 'column-multiselect-option');
          item.style.display = 'flex';
          item.style.alignItems = 'center';
          item.style.gap = '8px';
          item.style.minHeight = '38px';
          item.style.padding = '4px 6px';
          const checkbox = el('input');
          checkbox.type = 'checkbox';
          checkbox.value = value;
          checkbox.checked = selected?.includes(value) || allSelected;
          checkbox.dataset.filterValue = value;
          checkbox.setAttribute(
            'aria-label',
            title + ': ' + categoryFilterLabel(key, value),
          );
          checkbox.addEventListener('change', () => {
            const next = new Set(state.filters[key]?.values || values);
            if (checkbox.checked) next.add(value);
            else next.delete(value);
            state.filters[key] = { values: [...next] };
            state.openFilterKey = key;
            state.focusFilterValue = value;
            limit = 50;
            table(parent, rows, columns, name, actions);
          });
          item.append(checkbox, el('span', categoryFilterLabel(key, value)));
          checklist.append(item);
        }
        dropdown.addEventListener('toggle', () => {
          if (!dropdown.isConnected) return;
          state.openFilterKey = dropdown.open ? key : null;
        });
        dropdown.append(summary, checklist);
        filterCell.append(dropdown);
      } else {
        for (const part of numericColumn(key) || dateColumn(key)
          ? ['min', 'max']
          : ['text']) {
          const input = el('input', undefined, 'column-filter');
          input.type = dateColumn(key)
            ? 'date'
            : numericColumn(key)
              ? 'number'
              : 'search';
          if (input.type === 'number') input.step = 'any';
          input.value = state.filters[key]?.[part] || '';
          input.setAttribute(
            'aria-label',
            'Filtrar ' +
              title +
              (part === 'min' ? ' desde' : part === 'max' ? ' hasta' : '') +
              (percentageColumn(key) ? ' en porcentaje' : ''),
          );
          input.dataset.filterKey = key + '-' + part;
          input.placeholder =
            (part === 'min' ? 'Desde' : part === 'max' ? 'Hasta' : 'Filtrar') +
            (percentageColumn(key) ? ' %' : '');
          input.addEventListener('change', () => {
            state.filters[key] = { ...state.filters[key], [part]: input.value };
            limit = 50;
            table(parent, rows, columns, name, actions);
            parent.querySelector(`[data-filter-key="${key}-${part}"]`)?.focus();
          });
          filterCell.append(input);
        }
      }
      filterRow.append(filterCell);
      if (rows.some((row) => typeof row[key] === 'number'))
        th.className = 'numeric';
      hr.append(th);
    }
    if (actions) hr.append(el('th', 'Acciones'));
    if (actions) filterRow.append(el('td'));
    head.append(hr, filterRow);
    t.append(head);
    const body = el('tbody');
    for (const [index, row] of filtered.slice(0, limit).entries()) {
      const tr = el('tr');
      for (const [key, label] of visibleColumns) {
        const td = el('td');
        if (key === 'Fuente') td.append(priceSource(row[key]));
        else
          td.textContent =
            name === 'tPrecios' && typeof row[key] === 'number'
              ? numbers.format(row[key])
              : cell(key, row[key]);
        td.dataset.label = label || key;
        if (typeof row[key] === 'number') td.className = 'numeric';
        if (name === 'tPrecios' && typeof row[key] === 'number')
          td.classList.add('price-value');
        tr.append(td);
      }
      let detailRow;
      if (actions) {
        const td = el('td', undefined, 'row-actions');
        td.dataset.label = 'Acciones';
        if (compact) {
          detailRow = el('tr', undefined, 'record-detail');
          detailRow.hidden = true;
          detailRow.id = `record-detail-${name}-${index}`;
          const detailCell = el('td');
          detailCell.colSpan = visibleColumns.length + 1;
          const fields = el('dl', undefined, 'record-fields');
          for (const [key, label] of columns) {
            const pair = el('div');
            pair.append(el('dt', label || key), el('dd', cell(key, row[key])));
            fields.append(pair);
          }
          detailCell.append(fields);
          detailRow.append(detailCell);
          const toggle = button('Detalles', () => {
            detailRow.hidden = !detailRow.hidden;
            toggle.setAttribute('aria-expanded', String(!detailRow.hidden));
          });
          toggle.setAttribute('aria-expanded', 'false');
          toggle.setAttribute('aria-controls', detailRow.id);
          td.append(toggle);
        }
        if (name === 'tPrecios') {
          for (const quote of row.__quotes || []) {
            const label =
              snapshot?.tables?.tProductos?.find((p) => p.ID === quote.Producto)
                ?.Producto || 'precio';
            td.append(
              button('Corregir ' + label, () => editRow(name, quote)),
              button('Anular ' + label, () => cancelRow(name, quote)),
            );
          }
        }
        if (['tCuentas', 'tCategorias'].includes(name)) {
          const kind = name === 'tCuentas' ? 'account' : 'category',
            reference = row[name === 'tCuentas' ? 'Cuenta' : 'Subcategoría'];
          const archived =
            snapshot.archives?.[
              kind === 'account' ? 'accounts' : 'categories'
            ]?.includes(reference);
          td.append(
            button(archived ? 'Recuperar' : 'Archivar', () => {
              if (!snapshot.capabilities?.archives) {
                status('Actualiza el backend para archivar referencias.');
                return;
              }
              showReview(
                [{ process: 'archivar', kind, reference, archived: !archived }],
                (archived ? 'Recuperar ' : 'Archivar ') + reference,
                null,
                'El historial se conserva. Las referencias archivadas se ocultan al crear operaciones y siguen disponibles al corregir registros.',
              );
            }),
          );
        }
        if (name !== 'tPrecios')
          td.append(
            button('Corregir', () => editRow(name, row)),
            button('Anular', () => cancelRow(name, row)),
          );
        tr.append(td);
      }
      body.append(tr);
      if (detailRow) body.append(detailRow);
    }
    if (!filtered.length) {
      const empty = el('tr'),
        message = el(
          'td',
          snapshot
            ? 'No hay registros para esta selección.'
            : 'Abre el libro para cargar sus registros.',
          'empty-state',
        );
      message.colSpan = visibleColumns.length + (actions ? 1 : 0);
      empty.append(message);
      body.append(empty);
    }
    t.append(body);
    wrap.append(tools, t);
    parent.append(wrap);
    if (state.openFilterKey) {
      const dropdown = parent.querySelector(
        `[data-filter-key="${state.openFilterKey}-values"]`,
      );
      if (dropdown) {
        dropdown.open = true;
        const value = state.focusFilterValue;
        if (value !== undefined) {
          [...dropdown.querySelectorAll('input[type="checkbox"]')]
            .find((input) => input.value === value)
            ?.focus();
          state.focusFilterValue = undefined;
        }
      }
    }
    if (filtered.length > limit)
      parent.append(
        button(`Mostrar más (${filtered.length - limit})`, () => {
          limit += 50;
          table(parent, rows, columns, name, actions);
        }),
      );
  }
  const columns = {
    tMovimientos: [
      ['Fecha'],
      ['Tipo'],
      ['Concepto'],
      ['Subcategoría'],
      ['Origen'],
      ['Destino'],
      ['Importe'],
      ['Recuperable'],
      ['Localización'],
      ['Recurrente'],
    ],
    tProductos: [
      ['Producto'],
      ['ISIN'],
      ['Cuenta'],
      ['Clase'],
      ['Participaciones'],
      ['Aportado neto'],
      ['Valor'],
      ['Resultado'],
      ['Rentabilidad'],
    ],
    tOperaciones: [
      ['Fecha'],
      ['Producto'],
      ['ISIN'],
      ['Tipo'],
      ['Concepto'],
      ['Participaciones'],
      ['Precio'],
      ['Comisión'],
      ['Retención'],
      ['Importe'],
    ],
    tPrecios: [['Fecha']],
    tCuentas: [
      ['Cuenta'],
      ['Saldo inicial'],
      ['Saldo calculado'],
      ['Saldo real', 'Último saldo observado'],
      ['Fecha saldo'],
    ],
    tDeudas: [['Acreedor'], ['Saldo inicial'], ['Saldo pendiente']],
    tNominas: [
      ['Fecha cobro'],
      ['Neto'],
      ['Bruto'],
      ['Cotización'],
      ['IRPF'],
      ['Otras deducciones'],
    ],
    tObjetivos: [
      ['Objetivo'],
      ['Meta'],
      ['Fecha'],
      ['Asignado'],
      ['Pendiente'],
      ['Avance'],
    ],
    tAsignaciones: [['Objetivo'], ['Origen'], ['Importe']],
    tCategorias: [['Grupo'], ['Subgrupo'], ['Categoría'], ['Subcategoría']],
    observations: [
      ['account', 'Cuenta'],
      ['amount', 'Saldo observado'],
      ['date', 'Fecha'],
      ['time', 'Hora'],
      ['scope', 'Alcance'],
      ['source', 'Fuente'],
      ['comparisonStatus', 'Comparación'],
      ['difference', 'Diferencia al corte'],
    ],
  };
  const registerViews = {
    book: [['tMovimientos', 'Movimientos']],
    investments: [
      ['tProductos', 'Posiciones'],
      ['tOperaciones', 'Operaciones'],
      ['tPrecios', 'Precios'],
    ],
    accounts: [
      ['tCuentas', 'Cuentas'],
      ['tDeudas', 'Deudas'],
      ['observations', 'Saldos observados'],
    ],
    salary: [['tNominas', 'Nóminas']],
    goals: [
      ['tObjetivos', 'Objetivos'],
      ['tAsignaciones', 'Asignaciones'],
    ],
    connection: [['tCategorias', 'Categorías']],
  };
  const registerSelection = new Map(),
    registerFilters = new Map();
  let registerView = 'book',
    activeView = location.hash.slice(1) || 'home';
  function selectRegister(name, focus = false) {
    registerFilters.set($('finance-section').value, {
      search: $('finance-search').value,
      from: $('finance-from').value,
      to: $('finance-to').value,
    });
    $('finance-section').value = name;
    registerSelection.set(registerView, name);
    const filters = registerFilters.get(name) || {};
    $('finance-search').value = filters.search || '';
    $('finance-from').value = filters.from || '';
    $('finance-to').value = filters.to || '';
    for (const tab of $('register-tabs').querySelectorAll('button')) {
      const selected = tab.dataset.registerTable === name;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected) {
        $('finance-register').setAttribute('aria-labelledby', tab.id);
        if (focus) tab.focus();
      }
    }
    limit = 50;
    renderRegister();
  }
  function registerContext(view) {
    activeView = view;
    if (view === 'budgets') view = 'goals';
    if (!registerViews[view]) return;
    registerView = view;
    document
      .querySelector(`[data-register-slot="${view}"]`)
      .append($('register-panel'));
    const tabs = $('register-tabs');
    tabs.replaceChildren();
    tabs.hidden = registerViews[view].length === 1;
    for (const [name, label] of registerViews[view]) {
      const tab = button(label, () => selectRegister(name));
      tab.id = 'register-tab-' + name;
      tab.dataset.registerTable = name;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', 'finance-register');
      tab.addEventListener('keydown', (event) => {
        const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
        if (!keys.includes(event.key)) return;
        event.preventDefault();
        const choices = registerViews[view];
        const index = choices.findIndex(([key]) => key === name);
        const next =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? choices.length - 1
              : (index +
                  (event.key === 'ArrowRight' ? 1 : choices.length - 1)) %
                choices.length;
        selectRegister(choices[next][0], true);
      });
      tabs.append(tab);
    }
    selectRegister(registerSelection.get(view) || registerViews[view][0][0]);
  }
  function renderRegister() {
    const name = $('finance-section').value;
    const query = D.normalize($('finance-search').value),
      from = $('finance-from').value,
      to = $('finance-to').value;
    const dated = columns[name].some(([key]) =>
      ['Fecha', 'Fecha cobro', 'date'].includes(key),
    );
    for (const field of document.querySelectorAll('[data-date-filter]'))
      field.hidden = !dated;
    $('finance-search').placeholder =
      name === 'tMovimientos'
        ? 'Concepto, cuenta o categoría'
        : 'Buscar en este registro';
    let rows =
      name === 'observations'
        ? snapshot?.observations || []
        : snapshot?.tables[name] || [];
    if (['tProductos', 'tOperaciones', 'tPrecios'].includes(name))
      rows = rows.map((row) => ({
        ...row,
        ISIN:
          snapshot?.prices?.find(
            (price) =>
              price.product === (name === 'tProductos' ? row.ID : row.Producto),
          )?.isin || null,
      }));
    if (name === 'tOperaciones') {
      const transferConcepts = new Map();
      for (const transfer of snapshot?.fundTransfers || []) {
        if (transfer.outTradeID)
          transferConcepts.set(transfer.outTradeID, transfer.concept);
        if (transfer.inTradeID)
          transferConcepts.set(transfer.inTradeID, transfer.concept);
      }
      rows = rows.map((row) => ({
        ...row,
        Concepto: transferConcepts.get(row.ID) || null,
      }));
    }
    let viewColumns = columns[name];
    if (name === 'tPrecios') {
      const products = snapshot?.tables?.tProductos || [];
      const byDate = new Map();
      for (const quote of rows) {
        const date = quote.Fecha;
        if (!byDate.has(date)) byDate.set(date, { Fecha: date });
        byDate.get(date)[quote.Producto] = quote['VL EUR'];
        (byDate.get(date).__quotes ||= []).push(quote);
      }
      rows = [...byDate.values()];
      viewColumns = [['Fecha'], ...products.map((p) => [p.ID, p.Producto])];
    }
    rows = rows.filter((row) => {
      const date = row.Fecha || row['Fecha cobro'] || row.date;
      return (
        (!from || (date && date >= from)) &&
        (!to || (date && date <= to)) &&
        (!query ||
          viewColumns.some(([k]) =>
            D.normalize(displayValue(k, row[k], snapshot)).includes(query),
          ))
      );
    });
    if (name === 'tProductos')
      rows = rows.map((r) => {
        const missing = snapshot?.summary?.missingPrices || [];
        return missing.includes(r.Producto)
          ? { ...r, Valor: null, Resultado: null, Rentabilidad: null }
          : r;
      });
    if (
      [
        'tMovimientos',
        'tOperaciones',
        'tPrecios',
        'tNominas',
        'observations',
      ].includes(name)
    )
      rows = rows
        .slice()
        .sort((a, b) =>
          String(b.Fecha || b['Fecha cobro'] || b.date).localeCompare(
            String(a.Fecha || a['Fecha cobro'] || a.date),
          ),
        );
    const parent = $('finance-register');
    table(parent, rows, viewColumns, name, name !== 'observations');
    if (name === 'tProductos' || name === 'tPrecios') {
      const panel = el('details', undefined, 'price-panel');
      panel.append(el('summary', 'Fuentes de precios'));
      for (const price of snapshot?.prices || []) {
        const p = el('p');
        p.append(
          el('strong', price.name + ' · '),
          document.createTextNode(
            price.lastValid
              ? `Último precio guardado: ${numbers.format(price.lastValid.price)} EUR · ${price.lastValid.date}. `
              : 'Sin precio guardado. ',
          ),
        );
        if (price.lastValid?.source)
          p.append(
            priceSource(price.lastValid.source),
            document.createTextNode('. '),
          );
        const attempt = price.lastAttempt?.detail;
        p.append(
          document.createTextNode(
            attempt
              ? `Último intento: ${attempt.ok ? price.lastAttempt.status : attempt.message || attempt.error} · ${price.lastAttempt.checkedAt}. `
              : 'Sin consulta registrada. ',
          ),
        );
        if (price.isin) p.append(document.createTextNode('ISIN ' + price.isin));
        else
          p.append(
            document.createTextNode(
              'Configura el ISIN y su nombre de referencia.',
            ),
          );
        panel.append(p);
      }
      parent.prepend(panel);
    }
    $('finance-register-note').textContent =
      name === 'tCuentas' || name === 'observations'
        ? 'Solo se comparan saldos con el mismo corte. Las observaciones no crean ajustes automáticos.'
        : '';
  }
  async function render() {
    const epoch = configurationEpoch,
      renderingQueue = queue;
    const data = await saved();
    if (epoch !== configurationEpoch || renderingQueue !== queue) return;
    snapshot = data.snapshot;
    awaitingRead = data.queue.some((item) => item.awaitingRead);
    priceHistory?.refresh(snapshot);
    enabled();
    for (const label of document.querySelectorAll('[data-finance-environment]'))
      label.textContent = snapshot
        ? snapshot.environment === 'production'
          ? 'Libro principal'
          : 'Copia de pruebas'
        : 'Sin libro abierto';
    $('finance-cut').textContent = snapshot
      ? 'Informe ' +
        cell('date', snapshot.settings.asof) +
        (snapshot.settings.valuation !== snapshot.settings.asof
          ? ' · valoración ' + cell('date', snapshot.settings.valuation)
          : '')
      : '';
    let reportInfo = $('report-source-info');
    if (!reportInfo) {
      reportInfo = el('details', undefined, 'report-info');
      reportInfo.id = 'report-source-info';
      const summary = el('summary', 'i');
      summary.setAttribute('aria-label', 'Alcance de los datos del informe');
      reportInfo.append(summary, el('p'));
      $('finance-cut').after(reportInfo);
    }
    reportInfo.hidden = !snapshot;
    reportInfo.querySelector('p').textContent = snapshot
      ? 'Seguimiento desde ' +
        cell('date', snapshot.settings.start) +
        '. Filtros del resumen de Sheets: ' +
        Object.entries(snapshot.summary?.filters || {})
          .map(([key, value]) => key + ': ' + value)
          .join(' · ')
      : '';
    const warnings = [];
    if (awaitingRead)
      warnings.push(
        'Google guardó cambios. Falta actualizar las pestañas con la lectura de Google; no vuelvas a registrar la operación.',
      );
    if (snapshot?.calculationState === 'needs_review')
      warnings.push(
        'Hay errores de fórmulas en Sheets. Revisa el libro antes de registrar.',
      );
    if (snapshot?.summary?.missingPrices?.length)
      warnings.push(
        'Valoración incompleta: falta precio al corte para ' +
          snapshot.summary.missingPrices.join(', ') +
          '.',
      );
    if (
      snapshot?.summary &&
      !snapshot.summary.complete &&
      !snapshot.summary.missingPrices.length
    )
      warnings.push(
        'El resumen nativo no está completo; no se han supuesto importes cero.',
      );
    const failed = (snapshot?.prices || []).filter(
      (p) => p.lastAttempt?.detail?.ok === false,
    );
    if (failed.length)
      warnings.push(
        'La última consulta de precios falló para ' +
          failed.map((p) => p.name).join(', ') +
          '. Se conserva el último valor guardado.',
      );
    $('finance-warning').textContent = warnings.join(' ');
    $('finance-warning').hidden = !warnings.length;
    renderRegister();
    renderQueue(data.queue);
    FinanceDashboard.render(snapshot, { review: showReview });
  }
  function renderQueue(items) {
    const parent = $('finance-queue');
    parent.replaceChildren();
    const history = $('finance-history');
    history.replaceChildren();
    const labels = {
      pending: 'Pendiente de enviar',
      uncertain: 'Enviada · sin confirmar',
      confirmed: 'Confirmada por Google',
      review: 'Requiere revisión',
      discarded: 'Descartada sin enviar',
    };
    // A confirmed write still awaiting its snapshot needs attention. Everything
    // else terminal belongs only in the collapsed history, without deleting it.
    const needsAttention = (item) =>
      item.awaitingRead || !['confirmed', 'discarded'].includes(item.status);
    const active = items.filter(needsAttention).slice().reverse();
    const archived = items
      .filter((item) => !needsAttention(item))
      .slice()
      .reverse();
    const filtered = active.filter(
      (item) => activityFilter === 'all' || item.status === activityFilter,
    );
    const historyItems = archived.filter(
      (item) => historyFilter === 'all' || item.status === historyFilter,
    );
    const filter = el('select');
    filter.setAttribute('aria-label', 'Filtrar actividad');
    filter.append(new Option('Todas las pendientes', 'all'));
    for (const value of ['pending', 'uncertain', 'review', 'confirmed'])
      filter.append(new Option(labels[value], value));
    filter.value = activityFilter;
    filter.addEventListener('change', () => {
      activityFilter = filter.value;
      activityLimit = 50;
      void render();
    });
    if (active.length) parent.append(filter);
    const historySelect = el('select');
    historySelect.setAttribute('aria-label', 'Filtrar historial');
    historySelect.append(new Option('Todo el historial', 'all'));
    for (const value of ['confirmed', 'discarded'])
      historySelect.append(new Option(labels[value], value));
    historySelect.value = historyFilter;
    historySelect.addEventListener('change', () => {
      historyFilter = historySelect.value;
      activityLimit = 50;
      void render();
    });
    if (archived.length) history.append(historySelect);
    const confirmed = archived.filter((item) => item.status === 'confirmed');
    const confirmedMovements = confirmed.filter(
      (item) =>
        item.envelope.action === 'transact' &&
        (item.result?.results || []).some((row) => row.id?.startsWith('MOV-')),
    ).length;
    if (archived.length)
      history.append(
        el(
          'p',
          confirmedMovements +
            ' solicitudes con movimientos confirmados · ' +
            confirmed.filter((item) => item.envelope.action === 'refreshPrices')
              .length +
            ' actualizaciones de precios.',
        ),
      );
    const pendingCount = active.length;
    $('pending-total').textContent = String(pendingCount);
    $('history-total').textContent = String(archived.length);
    $('finance-sync').hidden = !pendingCount;
    for (const badge of document.querySelectorAll('[data-pending-count]')) {
      badge.textContent = String(pendingCount);
      badge.hidden = !pendingCount;
    }
    if (!filtered.length) {
      parent.append(
        el(
          'p',
          active.length
            ? 'Sin pendientes para este filtro.'
            : 'No hay operaciones pendientes.',
          'empty-state',
        ),
      );
    }
    if (!historyItems.length)
      history.append(
        el('p', 'Sin solicitudes en este historial.', 'empty-state'),
      );
    for (const [target, rows] of [
      [parent, filtered],
      [history, historyItems],
    ])
      if (rows.length > activityLimit)
        target.append(
          button('Mostrar más actividad', () => {
            activityLimit += 50;
            void render();
          }),
        );
    for (const item of [
      ...filtered.slice(0, activityLimit),
      ...historyItems.slice(0, activityLimit),
    ]) {
      const card = el('article', undefined, 'queue-item');
      card.dataset.state = item.status;
      card.append(
        el('strong', item.label),
        el(
          'span',
          item.awaitingRead
            ? 'Guardada · actualizando pestañas'
            : labels[item.status],
        ),
        ...(item.claim?.until > Date.now()
          ? [el('p', 'En curso en otra ventana; espera su confirmación.')]
          : []),
        el(
          'small',
          new Date(item.createdAt).toLocaleString('es-ES', {
            timeZone: 'Europe/Madrid',
          }),
        ),
      );
      card.append(el('small', 'Solicitud: ' + item.envelope.requestId));
      if (item.result?.error === 'API_FAILED') {
        card.append(el('p', errorText(Error('API_FAILED'))));
        if (item.result.diagnosticId)
          card.append(el('small', 'Diagnóstico: ' + item.result.diagnosticId));
      } else if (item.result?.message)
        card.append(el('p', item.result.message));
      else if (item.result?.error)
        card.append(el('p', errorText(Error(item.result.error))));
      card.append(
        el(
          'p',
          item.envelope.action === 'refreshPrices'
            ? 'Actualización de precios · no crea movimientos.'
            : item.envelope.action === 'importPriceHistory'
              ? 'Importación de precios · no crea movimientos.'
              : (item.envelope.operations || [])
                  .map((op) =>
                    [
                      D.processes[op.process]?.label || op.process,
                      op.concept,
                      op.date,
                      typeof op.amount === 'number'
                        ? money.format(op.amount)
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · '),
                  )
                  .join('; '),
        ),
      );
      if (item.status === 'confirmed') {
        card.append(
          el(
            'p',
            'Recibo de Google confirmado y conservado en este navegador.',
          ),
        );
        const readback = FinanceSync.movementReadback(item, snapshot);
        if (readback) {
          card.append(
            el(
              'p',
              readback.present
                ? 'Movimiento presente en la última lectura del libro.'
                : 'El recibo confirma un movimiento que no aparece en la última lectura. Actualiza los datos; no lo vuelvas a enviar.',
            ),
          );
          for (const id of readback.ids)
            card.append(el('small', 'Movimiento: ' + id));
          if (readback.present)
            card.append(
              button('Ver movimiento', () => {
                const movement = snapshot.tables.tMovimientos.find(
                  (row) => row.ID === readback.ids[0],
                );
                registerContext('book');
                $('finance-section').value = 'tMovimientos';
                $('finance-search').value = movement.Concepto || '';
                $('finance-from').value = movement.Fecha;
                $('finance-to').value = movement.Fecha;
                registerFilters.set('tMovimientos', {
                  search: movement.Concepto || '',
                  from: movement.Fecha,
                  to: movement.Fecha,
                });
                tableState.delete('tMovimientos');
                location.hash = 'book';
                renderRegister();
              }),
            );
        }
      }
      if (item.result?.complete === false)
        card.append(
          el(
            'p',
            'Solicitud confirmada con precios pendientes: ' +
              item.result.results
                .filter((r) => !r.ok || r.status === 'needs_review')
                .map(
                  (r) =>
                    (r.referenceName ||
                      snapshot?.tables.tProductos.find(
                        (p) => p.ID === r.product,
                      )?.Producto ||
                      'Producto') +
                    ': ' +
                    (r.message || r.status),
                )
                .join(' · '),
          ),
        );
      if (['pending', 'review'].includes(item.status)) {
        card.append(
          button('Revisar', () => reviewQueued(item)),
          button('Descartar', () => {
            showReview(
              [],
              item.label,
              (bookQueue) => bookQueue.discard(item.envelope.requestId),
              'Se descarta este pendiente sin modificar Google.',
            );
          }),
        );
      }
      if (item.status === 'uncertain')
        card.append(
          el(
            'p',
            'Se consultará la misma solicitud antes de reintentar. No la vuelvas a crear.',
          ),
        );
      (needsAttention(item) ? parent : history).append(card);
    }
  }
  function fieldInput(f, value) {
    const label = el('label', f.label, 'field');
    let input;
    if (['select', 'boolean', 'nullableBoolean'].includes(f.type)) {
      input = el('select');
      input.append(
        new Option(
          f.type === 'nullableBoolean'
            ? 'No'
            : f.required
              ? 'Selecciona…'
              : 'Sin dato',
          f.type === 'nullableBoolean' ? 'false' : '',
        ),
      );
      const values =
        f.type === 'select'
          ? D.options(f.source, snapshot, $('operation-kind').value, {
              ...editing?.row,
              _allowArchived: !!editing,
              _editingMovement: editing?.contextual,
              ...Object.fromEntries(new FormData($('operation-form'))),
            })
          : f.type === 'nullableBoolean'
            ? [['true', 'Sí']]
            : [
                ['true', 'Sí'],
                ['false', 'No'],
              ];
      if (f.key === 'product' && $('operation-kind').value === 'compra')
        values.push(['__new_product__', '＋ Nuevo producto']);
      for (const [id, name] of values)
        input.append(new Option(presentation(name), id));
    } else {
      input = el('input');
      input.type = ['date', 'time'].includes(f.type) ? f.type : 'text';
      if (['decimal', 'money', 'signedMoney'].includes(f.type))
        input.inputMode = 'decimal';
      input.maxLength = 300;
      input.autocomplete = 'off';
    }
    input.name = f.key;
    input.id = 'operation-' + f.key;
    input.required = f.required;
    if (value !== null && value !== undefined) input.value = String(value);
    if (f.key === 'product' && $('operation-kind').value === 'compra')
      input.addEventListener('change', () => {
        if (input.value === '__new_product__')
          processFields(Object.fromEntries(new FormData($('operation-form'))));
      });
    label.append(input);
    return label;
  }
  function processFields(values = {}) {
    editing = null;
    const process = $('operation-kind').value,
      spec = D.processes[process];
    $('operation-title').textContent = spec.label;
    const parent = $('operation-fields');
    const additionalOpen =
      parent.querySelector('.operation-additional')?.open || false;
    parent.replaceChildren();
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Madrid',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const simple = ['gasto', 'ingreso', 'traspaso'].includes(process);
    const investment = ['compra', 'venta', 'rendimiento'].includes(process);
    const additional = el('details', undefined, 'operation-additional');
    additional.open = additionalOpen;
    additional.append(
      el(
        'summary',
        investment ? 'Opciones avanzadas ⓘ' : 'Opciones adicionales',
      ),
    );
    if (investment)
      additional.append(
        el(
          'p',
          'Comisiones y retenciones son opcionales. Una operación histórica reconstruye una inversión ya incluida en tus saldos iniciales.',
        ),
      );
    for (const f of spec.fields) {
      let initial = f.initial;
      if (f.type === 'date' && f.required)
        initial = snapshot?.settings[f.key] || today;
      if (Object.hasOwn(values, f.key)) initial = values[f.key];
      const optionalConcept = simple && f.key === 'concept';
      const field = fieldInput(
        optionalConcept
          ? { ...f, required: false, label: 'Concepto (opcional)' }
          : f,
        initial,
      );
      const advancedInvestmentField =
        investment && ['fee', 'tax', 'historical'].includes(f.key);
      if (
        (simple &&
          !['date', 'account', 'from', 'to', 'category', 'amount'].includes(
            f.key,
          )) ||
        advancedInvestmentField
      ) {
        additional.append(field);
        if (f.key === 'historical')
          additional.append(
            el(
              'small',
              'Por ejemplo, una compra anterior al seguimiento que ya está incluida en el saldo de apertura. Evita descontarla otra vez de la cuenta.',
              'field-hint',
            ),
          );
      } else parent.append(field);
    }
    if (simple) {
      additional.append(
        el(
          'p',
          'Si dejas el concepto vacío se guardará «' +
            spec.label +
            '». Revisa esa descripción antes de confirmar.',
        ),
      );
      parent.append(additional);
    }
    if (investment) parent.append(additional);
    if (process === 'compra' && values.product === '__new_product__') {
      const section = el('section', undefined, 'inline-new-product');
      section.append(
        el('h3', 'Nuevo producto'),
        el(
          'p',
          'Se añadirá el producto y se registrará esta compra. Para consultar automáticamente cotizaciones de fondos, indica su ISIN.',
        ),
      );
      const productSpec = D.processes.producto.fields;
      for (const original of productSpec) {
        if (
          ['units', 'cost', 'isin', 'referenceName', 'date'].includes(
            original.key,
          )
        )
          continue;
        const key = 'newProduct_' + original.key;
        let initial =
          original.key === 'date' ? values.date || today : original.initial;
        if (Object.hasOwn(values, key)) initial = values[key];
        section.append(fieldInput({ ...original, key }, initial));
      }
      for (const key of ['isin', 'referenceName']) {
        const original = productSpec.find((field) => field.key === key);
        const prefixed = { ...original, key: 'newProduct_' + key };
        section.append(fieldInput(prefixed, values[prefixed.key]));
      }
      parent.append(section);
    }
    if (investment) {
      const advanced = el('details', undefined, 'operation-advanced-links');
      advanced.append(
        el('summary', 'ⓘ ISIN y precios manuales'),
        el(
          'p',
          'El producto es la inversión registrada en tu libro. El ISIN identifica la clase de fondo para consultar cotizaciones. Un precio manual añade una valoración fechada y no cambia tus participaciones.',
        ),
        button('Configurar ISIN', () => {
          $('operation-dialog').close();
          void newOperation('vincular_isin');
        }),
        button('Registrar precio manual', () => {
          $('operation-dialog').close();
          void newOperation('precio');
        }),
        button('Registrar dividendo o distribución', () => {
          $('operation-dialog').close();
          void newOperation('rendimiento');
        }),
      );
      parent.append(advanced);
    }
    if (
      [
        'gasto',
        'ingreso',
        'nomina',
        'traspaso',
        'prestamo',
        'pago_deuda',
        'cobro_compartido',
        'devolucion_gasto',
      ].includes(process)
    ) {
      const templates = el('details', undefined, 'operation-templates');
      templates.append(el('summary', 'ⓘ Plantillas de este libro'));
      templates.append(
        el(
          'p',
          'Una plantilla reutiliza los datos de un movimiento. Por ejemplo, «Café habitual» guarda la cuenta y la categoría; puedes cambiar fecha e importe antes de confirmar. Guardar la plantilla no registra un gasto.',
        ),
      );
      if (!snapshot?.capabilities?.templates)
        templates.append(
          el('p', 'Actualiza el backend para guardar y reutilizar plantillas.'),
        );
      else {
        const name = el('input');
        name.placeholder = 'Nombre de la plantilla';
        name.setAttribute('aria-label', 'Nombre de la plantilla');
        templates.append(
          name,
          button('Guardar como plantilla', () => {
            try {
              const values = Object.fromEntries(
                new FormData($('operation-form')),
              );
              if (!values.concept) values.concept = spec.label;
              const operation = D.operation(process, values);
              if (!name.value.trim())
                throw Error('Introduce un nombre para la plantilla.');
              showReview(
                [{ process: 'plantilla', name: name.value.trim(), operation }],
                'Guardar plantilla · ' + name.value.trim(),
                null,
                'Se guarda una propuesta reutilizable. No se registra ningún movimiento.',
              );
            } catch (error) {
              status(errorText(error));
            }
          }),
        );
        for (const template of snapshot.templates || []) {
          const card = el('div');
          card.append(
            el('span', template.name),
            button('Usar', () => {
              operationChoices(template.operation.process);
              $('operation-kind').value = template.operation.process;
              processFields(template.operation);
            }),
            button('Actualizar con estos datos', () => {
              try {
                const values = Object.fromEntries(
                  new FormData($('operation-form')),
                );
                if (!values.concept) values.concept = spec.label;
                showReview(
                  [
                    {
                      process: 'plantilla',
                      id: template.id,
                      name: name.value.trim() || template.name,
                      operation: D.operation(process, values),
                    },
                  ],
                  'Actualizar plantilla · ' + template.name,
                  null,
                  'La plantilla cambia; no se registra dinero.',
                );
              } catch (error) {
                status(errorText(error));
              }
            }),
            button('Eliminar plantilla', () =>
              showReview(
                [{ process: 'quitar_plantilla', id: template.id }],
                'Eliminar plantilla · ' + template.name,
                null,
                'Se retira únicamente la plantilla. Su historial y las operaciones confirmadas se conservan.',
              ),
            ),
          );
          templates.append(card);
        }
      }
      parent.append(templates);
    }
    if (process === 'renombrar')
      $('operation-kind').form.elements.kind.addEventListener('change', () => {
        const current =
          $('operation-fields').querySelector('[name=from]').parentElement;
        current.replaceWith(fieldInput(spec.fields[1]));
      });
    $('operation-note').textContent =
      {
        traspaso_fondo:
          'Las dos partes deben liquidar el mismo importe ejecutado en céntimos. El valor bruto puede diferir por la precisión de participaciones o valor liquidativo; esa diferencia se muestra al revisar. Se trasladan participaciones y aportaciones; no se crea caja ni ingreso. El backend verifica y conserva las fórmulas revisadas antes de registrar el lote.',
        producto:
          'La posición base recoge lo que ya tienes en esa fecha. No crea compras ni caja. Si cambias de fondo, crea otro producto para conservar su historial.',
        asignacion:
          'Asigna activos existentes. No registra un ingreso ni mueve dinero.',
        nomina:
          'Un único ingreso neto. Deja en blanco cualquier desglose desconocido.',
        saldo_observado:
          'Conserva lo visto en el banco, su fecha y su alcance. No se ajusta el saldo calculado.',
        precio:
          'Introduce la fecha efectiva del valor liquidativo, su fuente y el precio en EUR con su precisión original.',
        fechas:
          'Estas fechas cambian los cortes del informe de Sheets. Revisa la valoración antes de confirmar.',
        renombrar:
          'Conserva las relaciones y el historial del nombre anterior.',
      }[process] ||
      'Libro: ' +
        (snapshot?.environment === 'production'
          ? 'el libro principal'
          : 'la copia de pruebas') +
        '. Revisa los datos antes de confirmar.';
    $('operation-error').hidden = true;
  }
  async function newOperation(process) {
    try {
      if ($('operation-dialog').open) return;
      operationChoices(process);
      if (typeof process === 'string') $('operation-kind').value = process;
      editing = null;
      $('operation-kind-field').hidden = false;
      processFields();
      enabled();
      // Mostrar la entrada en el clic, aunque Google no responda o no se abra.
      $('operation-dialog').showModal();
      if (!snapshot) await loadOperation();
    } catch (error) {
      status(errorText(error));
    }
  }
  async function loadOperation() {
    try {
      if (!(await connect()) || !$('operation-dialog').open || editing) return;
      // La lectura completa los selectores sin borrar lo escrito mientras se esperaba.
      processFields(Object.fromEntries(new FormData($('operation-form'))));
      enabled();
    } catch (error) {
      status(errorText(error));
    }
  }
  const editSpec = {
    tMovimientos: [
      ['Fecha', 'date'],
      ['Concepto', 'text'],
      ['Subcategoría', 'select', 'categories'],
      ['Origen', 'select', 'accounts'],
      ['Destino', 'select', 'accounts'],
      ['Importe', 'money'],
      ['Recuperable', 'money'],
      ['Localización', 'select', 'locations'],
      ['Recurrente', 'nullableBoolean'],
    ],
    tOperaciones: [
      ['Fecha', 'date'],
      ['Participaciones', 'decimal'],
      ['Precio', 'decimal'],
      ['Comisión', 'money'],
      ['Retención', 'money'],
    ],
    tProductos: [
      ['Producto', 'text'],
      ['Cuenta', 'select', 'accounts'],
      ['Clase', 'select', 'classes'],
      ['Fecha base', 'date'],
      ['Unidades base', 'decimal'],
      ['Coste base', 'money'],
    ],
    tCuentas: [['Saldo inicial', 'signedMoney']],
    tDeudas: [
      ['Acreedor', 'text'],
      ['Saldo inicial', 'money'],
    ],
    tNominas: [
      ['Bruto', 'money'],
      ['Cotización', 'money'],
      ['IRPF', 'money'],
      ['Otras deducciones', 'money'],
    ],
    tObjetivos: [
      ['Objetivo', 'text'],
      ['Meta', 'money'],
      ['Fecha', 'date'],
    ],
    tAsignaciones: [['Importe', 'money']],
    tPrecios: [
      ['VL EUR', 'decimal'],
      ['Fuente', 'text'],
    ],
    tCategorias: [
      ['Grupo', 'select', 'groups'],
      ['Subgrupo', 'text'],
      ['Categoría', 'text'],
    ],
  };
  function editRow(name, row) {
    const payroll =
      name === 'tNominas'
        ? row
        : name === 'tMovimientos'
          ? snapshot.tables.tNominas.find((n) => n.Movimiento === row.ID)
          : null;
    if (payroll) {
      const movement = snapshot.tables.tMovimientos.find(
        (m) => m.ID === payroll.Movimiento,
      );
      if (!snapshot.capabilities?.payrollCorrection) {
        status('Actualiza el backend para corregir la nómina completa.');
        return;
      }
      const values = {
        date: movement.Fecha,
        concept: movement.Concepto,
        account: movement.Destino,
        category: movement.Subcategoría,
        amount: movement.Importe,
        gross: payroll.Bruto,
        contribution: payroll.Cotización,
        tax: payroll.IRPF,
        otherDeductions: payroll['Otras deducciones'],
        location: movement.Localización,
      };
      editing = {
        name,
        row: values,
        sourceRow: row,
        payroll: movement.ID,
        fields: D.processes.nomina.fields,
      };
      $('operation-title').textContent =
        'Corregir nómina · ' + movement.Concepto;
      $('operation-kind-field').hidden = true;
      $('operation-kind').value = 'nomina';
      $('operation-fields').replaceChildren();
      for (const f of editing.fields)
        $('operation-fields').append(fieldInput(f, values[f.key]));
      $('operation-note').textContent =
        'Fecha, cuenta, neto y desglose se revisan juntos. El ingreso conserva su ID.';
      $('operation-error').hidden = true;
      $('operation-dialog').showModal();
      return;
    }
    const kinds = {
      Gasto: 'gasto',
      Ingreso: 'ingreso',
      Transferencia: 'traspaso',
      'Préstamo recibido': 'prestamo',
      'Devolución deuda': 'pago_deuda',
      'Cobro compartido': 'cobro_compartido',
      'Devolución gasto': 'devolucion_gasto',
    };
    if (
      name === 'tMovimientos' &&
      kinds[row.Tipo] &&
      snapshot.capabilities?.contextualCorrection
    ) {
      const kind = kinds[row.Tipo],
        link = snapshot.tables.tVinculos.find((r) => r.Movimiento === row.ID);
      const values = {
        date: row.Fecha,
        concept: row.Concepto,
        account:
          row.Tipo === 'Gasto' || row.Tipo === 'Devolución deuda'
            ? row.Origen
            : row.Destino,
        from: row.Origen,
        to: row.Destino,
        category: row.Subcategoría,
        amount: row.Importe,
        recoverable: row.Recuperable,
        original: link?.['Vinculado a'],
        debt: link?.['Vinculado a'],
        location: row.Localización,
        recurring:
          row.Recurrente === 'Sí'
            ? true
            : row.Recurrente === 'No'
              ? false
              : null,
      };
      editing = {
        name,
        row: values,
        sourceRow: row,
        contextual: row.ID,
        kind,
        fields: D.processes[kind].fields,
      };
      $('operation-title').textContent =
        'Corregir ' + D.readable(name, row, snapshot);
      $('operation-kind-field').hidden = true;
      $('operation-kind').value = kind;
      $('operation-fields').replaceChildren();
      const label = el('label', 'Tipo de movimiento', 'field'),
        select = el('select');
      select.name = 'editKind';
      for (const [type, value] of Object.entries(kinds))
        select.append(new Option(type, value));
      select.value = kind;
      select.addEventListener('change', () =>
        editRow(name, {
          ...row,
          Tipo: Object.keys(kinds).find((k) => kinds[k] === select.value),
        }),
      );
      label.append(select);
      $('operation-fields').append(label);
      for (const f of editing.fields)
        $('operation-fields').append(fieldInput(f, values[f.key]));
      $('operation-note').textContent =
        'La corrección conserva el ID y actualiza el vínculo en el mismo lote. Google comprueba el saldo pendiente y el recuperable.';
      $('operation-error').hidden = true;
      $('operation-dialog').showModal();
      return;
    }
    if (
      name === 'tOperaciones' &&
      snapshot.fundTransfers?.some((t) =>
        [t.outTradeID, t.inTradeID].includes(row.ID),
      )
    ) {
      status('Anula el traspaso completo y prepara sus dos partes corregidas.');
      return;
    }
    const linked =
      name === 'tMovimientos' &&
      snapshot.tables.tOperaciones.some((r) => r.Movimiento === row.ID);
    editing = {
      name,
      row,
      fields: (linked
        ? [
            ['Concepto', 'text'],
            ['Localización', 'select', 'locations'],
          ]
        : editSpec[name]
      ).map(([key, type, source]) => ({
        key,
        label: key,
        type,
        source,
        required: ![
          'Subcategoría',
          'Origen',
          'Destino',
          'Localización',
          'Recurrente',
          'Fecha',
          'Bruto',
          'Cotización',
          'IRPF',
          'Otras deducciones',
        ].includes(key),
      })),
    };
    $('operation-title').textContent =
      'Corregir ' + D.readable(name, row, snapshot);
    $('operation-kind-field').hidden = true;
    $('operation-kind').value = ['Gasto', 'Devolución gasto'].includes(row.Tipo)
      ? 'gasto'
      : 'ingreso';
    const fields = $('operation-fields');
    fields.replaceChildren();
    for (const f of editing.fields) fields.append(fieldInput(f, row[f.key]));
    $('operation-note').textContent = linked
      ? 'Este movimiento pertenece a una inversión. Para cambiar fecha, participaciones o importe, corrige la operación de inversión.'
      : 'Solo se modificarán las entradas que cambies. Google verifica las relaciones; las columnas calculadas se conservan.';
    $('operation-error').hidden = true;
    $('operation-dialog').showModal();
  }
  function cancelRow(tableName, row) {
    const transfer =
      tableName === 'tOperaciones' &&
      snapshot.fundTransfers?.find((t) =>
        [t.outTradeID, t.inTradeID].includes(row.ID),
      );
    if (transfer) {
      showReview(
        [{ process: 'anular_traspaso_fondo', id: transfer.id }],
        'Anular traspaso entre fondos',
        null,
        'Se retiran las dos partes juntas y se restituye el capital aportado trasladado. No se crea ningún movimiento de caja. Las operaciones posteriores deben conservar participaciones suficientes.',
      );
      return;
    }
    const label = 'Anular ' + D.readable(tableName, row, snapshot);
    showReview(
      [
        {
          process: 'eliminar',
          table: tableName,
          key: D.rowKey(tableName, row),
        },
      ],
      label,
      null,
      (() => {
        const t = snapshot.tables;
        if (tableName === 'tMovimientos') {
          const payrolls = t.tNominas.filter(
              (n) => n.Movimiento === row.ID,
            ).length,
            trades = t.tOperaciones.filter(
              (o) => o.Movimiento === row.ID,
            ).length,
            links = t.tVinculos.filter((v) => v.Movimiento === row.ID).length;
          const dependents = t.tVinculos.filter(
            (v) => v['Vinculado a'] === row.ID,
          ).length;
          return (
            `Se retira ${row.Importe} EUR de ${row.Origen || row.Destino || 'su cuenta'} en ${row.Fecha}. Se anulan ${payrolls} nóminas, ${trades} operaciones de inversión y ${links} vínculos asociados.` +
            (dependents
              ? ` Hay ${dependents} cobros o devoluciones que lo utilizan: anúlalos o corrígelos primero.`
              : ' El ID dejará de existir.')
          );
        }
        if (tableName === 'tOperaciones')
          return `Se retiran ${row.Participaciones || 0} participaciones de esta operación. ${row.Movimiento ? 'Se recalcula su caja agrupada; se retira el movimiento si no quedan operaciones enlazadas.' : 'No hay movimiento de caja asociado.'}`;
        if (tableName === 'tNominas')
          return 'Se retira únicamente el desglose de nómina. El ingreso y su ID se conservan.';
        if (tableName === 'tObjetivos')
          return `Se retira el objetivo y ${t.tAsignaciones.filter((a) => a.Objetivo === row.ID).length} asignaciones. No se mueve dinero.`;
        if (tableName === 'tAsignaciones')
          return 'Se libera esta asignación del objetivo. No se mueve dinero.';
        if (['tCuentas', 'tCategorias', 'tDeudas'].includes(tableName)) {
          const reference =
            tableName === 'tCuentas'
              ? row.Cuenta
              : tableName === 'tCategorias'
                ? row.Subcategoría
                : row.ID;
          const keys =
            tableName === 'tCuentas'
              ? ['account', 'from', 'to']
              : tableName === 'tCategorias'
                ? ['category']
                : ['debt'];
          const templates = (snapshot.templates || []).filter((template) =>
            keys.some((key) => template.operation[key] === reference),
          ).length;
          const plans = (snapshot.planned || []).filter(
            (plan) =>
              (tableName === 'tCuentas'
                ? plan.account
                : tableName === 'tCategorias'
                  ? plan.category
                  : null) === reference,
          ).length;
          const archived = (
            tableName === 'tCuentas'
              ? snapshot.archives?.accounts
              : tableName === 'tCategorias'
                ? snapshot.archives?.categories
                : []
          )?.includes(reference);
          return (
            `Hay ${templates} plantillas activas y ${plans} obligaciones previstas que utilizan esta referencia.` +
            (archived
              ? ' La referencia está archivada: recupérala antes de anularla.'
              : '') +
            (templates || plans
              ? ' Elimina o cambia esas referencias primero; la anulación se bloqueará mientras se utilicen.'
              : ' Google comprueba además los movimientos y observaciones que la utilizan. Para conservar el historial de cuentas o subcategorías, utiliza Archivar.')
          );
        }
        if (
          tableName === 'tCuentas' ||
          tableName === 'tCategorias' ||
          tableName === 'tProductos' ||
          tableName === 'tDeudas'
        )
          return 'Una referencia utilizada impide la anulación. Para conservar el historial de cuentas o subcategorías, utiliza Archivar.';
        return 'Se retira este registro; las referencias y columnas calculadas se validan antes de guardar.';
      })(),
    );
  }
  function showReview(operations, label, action, note) {
    review = {
      operations,
      label,
      action,
      epoch: configurationEpoch,
      queue,
      url,
      bookKey: snapshot?.bookKey,
      client,
    };
    const dl = $('review-fields');
    dl.replaceChildren();
    for (const op of operations) {
      for (const [key, value] of Object.entries(op)) {
        if (['process', 'table', 'key'].includes(key)) continue;
        if (key === 'changes') {
          for (const [k, v] of Object.entries(value)) {
            const before = editing?.row?.[k];
            dl.append(
              el('dt', k),
              el(
                'dd',
                `${displayValue(k, before, snapshot)} → ${displayValue(k, v, snapshot)}`,
              ),
            );
          }
          continue;
        }
        if (key === 'operation') {
          for (const [k, v] of Object.entries(value)) {
            if (k === 'process') continue;
            const field = D.processes[value.process]?.fields.find(
              (f) => f.key === k,
            );
            dl.append(
              el('dt', field?.label || k),
              el('dd', displayValue(k, v, snapshot)),
            );
          }
          continue;
        }
        const f = D.processes[op.process]?.fields.find((f) => f.key === key);
        dl.append(
          el('dt', f?.label || key),
          el(
            'dd',
            editing && !['movement', 'kind'].includes(key)
              ? `${displayValue(key, editing.row[key], snapshot)} → ${displayValue(key, value, snapshot)}`
              : displayValue(key, value, snapshot),
          ),
        );
      }
    }
    $('review-title').textContent = label;
    $('review-note').textContent =
      note ||
      'La solicitud queda guardada en este navegador. Se enviará si Google está abierto; aparecerá confirmada cuando responda.';
    $('review-error').hidden = true;
    $('review-dialog').showModal();
  }
  function reviewQueued(item) {
    if (
      item.envelope.action === 'importPriceHistory' &&
      item.status === 'review'
    ) {
      showReview(
        [],
        item.label,
        async () => {
          status(
            'Revisa de nuevo el archivo histórico con los datos actuales antes de preparar otra solicitud.',
          );
        },
        'Google rechazó este lote histórico. El sobre se conserva. Descarta la solicitud rechazada y vuelve a previsualizar el archivo con la lectura actual; no se crea otro envío automáticamente.',
      );
      return;
    }
    if (item.status === 'pending') {
      showReview(
        item.envelope.operations || [],
        item.label,
        async () => {
          await sync();
        },
        'Este pendiente conserva la misma solicitud. Se enviará al abrir Google y sincronizar.',
      );
      return;
    }
    if (item.envelope.action === 'refreshPrices') {
      showReview(
        [],
        item.label,
        async (bookQueue) => {
          await bookQueue.discard(item.envelope.requestId);
          await bookQueue.enqueue(
            [],
            item.label,
            'refreshPrices',
            item.envelope.products,
          );
        },
        'Se prepara una nueva consulta con la revisión actual del libro.',
      );
      return;
    }
    showReview(
      item.envelope.operations,
      item.label,
      async (bookQueue) => {
        await bookQueue.enqueue(item.envelope.operations, item.label);
        await bookQueue.discard(item.envelope.requestId);
      },
      'Google rechazó el envío anterior. Revisa los datos de la lectura actual antes de preparar una nueva solicitud. Si necesita cambiar campos, descarta este pendiente y crea la operación corregida.',
    );
  }
  $('operation-form').addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      if (!snapshot || !queue) throw Error('READ_REQUIRED');
      const values = Object.fromEntries(new FormData(event.target));
      let op,
        label,
        operations = null;
      if (editing?.payroll || editing?.contextual) {
        const kind = editing.payroll ? 'nomina' : editing.kind;
        op = D.operation(kind, values);
        op = {
          ...op,
          process: editing.payroll ? 'corregir_nomina' : 'editar_movimiento',
          movement: editing.payroll || editing.contextual,
        };
        if (editing.contextual) op.kind = kind;
        label =
          'Corregir ' + D.readable(editing.name, editing.sourceRow, snapshot);
      } else if (editing) {
        const changes = {};
        for (const f of editing.fields) {
          const value = values[f.key] ?? '';
          let converted =
            value === ''
              ? null
              : ['money', 'signedMoney', 'decimal'].includes(f.type)
                ? D.decimal(
                    value,
                    f.type !== 'decimal',
                    f.type === 'signedMoney',
                  )
                : ['boolean', 'nullableBoolean'].includes(f.type)
                  ? value === 'true'
                  : value;
          if (converted !== editing.row[f.key]) changes[f.key] = converted;
        }
        if (!Object.keys(changes).length)
          throw Error('No hay cambios que guardar.');
        op = {
          process: 'corregir',
          table: editing.name,
          key: D.rowKey(editing.name, editing.row),
          changes,
        };
        label = 'Corregir ' + D.readable(editing.name, editing.row, snapshot);
      } else {
        const process = $('operation-kind').value;
        if (
          process === 'traspaso_fondo' &&
          !snapshot.capabilities?.fundTransfers
        )
          throw Error(
            'Actualiza el backend para registrar traspasos entre fondos.',
          );
        if (
          ['gasto', 'ingreso', 'traspaso'].includes(process) &&
          !String(values.concept || '').trim()
        )
          values.concept = D.processes[process].label;
        if (process === 'compra' && values.product === '__new_product__') {
          const productName = values.newProduct_name;
          const product = D.operation('producto', {
            name: productName,
            account: values.newProduct_account,
            class: values.newProduct_class,
            date: values.date,
            units: '0',
            cost: '0',
          });
          product.alias = 'newProduct';
          const bind = String(values.newProduct_isin || '').trim()
            ? D.operation('vincular_isin', {
                product: '$newProduct',
                isin: values.newProduct_isin,
                referenceName: values.newProduct_referenceName || productName,
              })
            : null;
          op = D.operation('compra', { ...values, product: '$newProduct' });
          operations = [product, ...(bind ? [bind] : []), op];
          label = 'Compra · ' + (op.concept || productName);
        } else {
          op = D.operation(process, values);
          label =
            D.processes[process].label +
            (op.concept ? ' · ' + op.concept : op.name ? ' · ' + op.name : '');
        }
      }
      const transferNote =
        op.process === 'traspaso_fondo'
          ? `Importe ejecutado: ${displayValue('amount', op.amount, snapshot)}. Valor bruto de salida: ${(op.outUnits * op.outPrice).toLocaleString('es-ES', { maximumFractionDigits: 12 })} EUR; valor bruto de entrada: ${(op.inUnits * op.inPrice).toLocaleString('es-ES', { maximumFractionDigits: 12 })} EUR. Diferencia de valoración por precisión: ${(op.inUnits * op.inPrice - op.outUnits * op.outPrice).toLocaleString('es-ES', { maximumFractionDigits: 12 })} EUR. Se conservan las participaciones y los valores liquidativos reales. No se registra caja; las aportaciones se trasladan sin esa diferencia.`
          : undefined;
      showReview(
        operations || [op],
        label,
        null,
        operations
          ? 'Se guardarán juntos el producto y esta compra. El importe de la compra se descontará una sola vez de la cuenta.'
          : transferNote,
      );
    } catch (error) {
      $('operation-error').textContent = errorText(error);
      $('operation-error').hidden = false;
    }
  });
  $('review-confirm').addEventListener('click', async () => {
    if (!review) return;
    const current = review;
    $('review-confirm').disabled = true;
    try {
      if (
        current.epoch !== configurationEpoch ||
        current.queue !== queue ||
        current.url !== currentDeployment() ||
        current.bookKey !== snapshot?.bookKey
      )
        throw Error('CONFIGURATION_CHANGED');
      if (current.action) await current.action(current.queue, current.client);
      else await current.queue.enqueue(current.operations, current.label);
      if (current.epoch !== configurationEpoch || current.queue !== queue)
        throw Error('CONFIGURATION_CHANGED');
      $('review-dialog').close();
      $('operation-dialog').close();
      $('budget-dialog').close();
      review = null;
      status(
        current.action
          ? 'Revisión aplicada. Comprueba el estado de los pendientes.'
          : 'Pendiente guardado en este navegador.',
      );
      await render();
      if (client?.session) await sync();
    } catch (error) {
      $('review-error').textContent = errorText(error);
      $('review-error').hidden = false;
    } finally {
      $('review-confirm').disabled = false;
    }
  });
  $('review-cancel').addEventListener('click', () =>
    $('review-dialog').close(),
  );
  $('operation-cancel').addEventListener('click', () =>
    $('operation-dialog').close(),
  );
  const viewProcesses = {
    book: [
      'gasto',
      'ingreso',
      'traspaso',
      'devolucion_gasto',
      'cobro_compartido',
    ],
    investments: ['compra', 'venta', 'traspaso_fondo'],
    accounts: [
      'cuenta',
      'saldo_observado',
      'deuda_inicial',
      'prestamo',
      'pago_deuda',
      'renombrar',
    ],
    salary: ['nomina'],
    goals: ['objetivo', 'asignacion'],
    connection: ['categoria', 'fechas', 'renombrar'],
  };
  function operationChoices(process) {
    const choices =
      activeView === 'home'
        ? ['gasto', 'ingreso', 'traspaso']
        : viewProcesses[registerView] || viewProcesses.book;
    const contextual = choices.includes(process)
      ? choices
      : Object.values(viewProcesses).find((list) => list.includes(process)) ||
        choices;
    $('operation-kind').replaceChildren();
    const selectedChoices = contextual.includes(process)
      ? contextual
      : typeof process === 'string' && D.processes[process]?.ui !== false
        ? [...contextual, process]
        : contextual;
    for (const key of selectedChoices)
      if (D.processes[key]?.ui !== false && D.processes[key])
        $('operation-kind').append(new Option(D.processes[key].label, key));
  }
  operationChoices();
  $('operation-kind').addEventListener('change', () => processFields());
  $('operation-load').addEventListener('click', () => {
    void loadOperation();
  });
  $('finance-new').addEventListener('click', () => {
    void newOperation('gasto');
  });
  for (const action of document.querySelectorAll('[data-operation]'))
    action.addEventListener('click', () => {
      void newOperation(action.dataset.operation);
    });
  for (const action of document.querySelectorAll('[data-open-book]'))
    action.addEventListener('click', () => {
      void connect();
    });
  $('finance-connect').addEventListener('click', () => {
    void connect();
  });
  $('finance-refresh').addEventListener('click', async () => {
    loading = true;
    enabled();
    try {
      await refresh();
    } catch (error) {
      status(errorText(error), 'error');
    } finally {
      loading = false;
      enabled();
      scheduleRecovery();
    }
  });
  $('finance-sync').addEventListener('click', () => {
    void sync();
  });
  $('finance-prices').addEventListener('click', () => {
    const products = (snapshot?.tables.tProductos || []).map((p) => p.ID);
    if (!products.length) {
      status('Añade un producto antes de consultar precios.');
      return;
    }
    showReview(
      [],
      'Actualizar precios',
      async (bookQueue) => {
        const batches = Math.ceil(products.length / 20);
        for (let i = 0; i < products.length; i += 20) {
          await bookQueue.enqueue(
            [],
            'Actualizar precios' +
              (batches > 1 ? ' · lote ' + (i / 20 + 1) + '/' + batches : ''),
            'refreshPrices',
            products.slice(i, i + 20),
          );
        }
      },
      'Consulta los productos por ISIN y nombre. Solo guarda valores nuevos verificados. Cada lote incluye hasta veinte productos. Si falla un fondo, conserva su precio anterior y muestra el error.',
    );
  });
  const localSettings = $('local-settings');
  localSettings.append(
    el(
      'p',
      'Ocultar datos solo cambia la pantalla: la copia local contiene datos sin cifrado. Cerrar Google detiene el canal; desconectar elimina el enlace guardado; borrar elimina solo copias resueltas.',
    ),
  );
  let hiddenData = false;
  localSettings.append(
    button('Ocultar / mostrar datos', () => {
      hiddenData = !hiddenData;
      document.body.classList.toggle('private-data-hidden', hiddenData);
      status(
        hiddenData
          ? 'Datos ocultos visualmente. La copia sigue guardada sin cifrado.'
          : 'Datos visibles.',
      );
    }),
  );
  localSettings.append(
    button('Cerrar ventana de Google', () => {
      client?.close();
      client = null;
      status(
        'Canal de Google cerrado. La copia y los pendientes se conservan.',
        snapshot ? 'offline' : 'unread',
      );
      enabled();
    }),
  );
  localSettings.append(
    button('Desconectar enlace', () => $('setup-clear').click()),
  );
  const readiness = el(
    'p',
    'Preparación del entorno: sin comprobar. Las colas de otros dispositivos requieren revisión independiente.',
  );
  localSettings.append(
    button('Comprobar preparación del entorno', async () => {
      try {
        const result = await globalThis.FinanceBook.check('diagnostics');
        const unresolved = (await saved()).queue.filter((item) =>
          ['pending', 'uncertain', 'review'].includes(item.status),
        ).length;
        readiness.textContent =
          (result.environment === 'production'
            ? 'Libro principal'
            : 'Copia de pruebas') +
          ' · API ' +
          result.apiVersion +
          ' · estructura ' +
          (result.backendReady === true ? 'verificada' : 'requiere revisión') +
          ' · cálculos ' +
          (result.calculationReady === true
            ? 'verificados'
            : 'requieren revisión') +
          ' · ' +
          unresolved +
          ' solicitudes locales sin resolver. Esto no confirma permisos, copias de seguridad ni colas de otros dispositivos; no autoriza el cambio de entorno.';
      } catch (error) {
        readiness.textContent = errorText(error);
      }
    }),
    readiness,
  );
  const storedCopies = el('div');
  storedCopies.id = 'stored-copies';
  localSettings.append(storedCopies);
  async function renderStoredCopies() {
    const copies = await store.list();
    storedCopies.replaceChildren(
      el(
        'p',
        'Copias de este navegador; las colas de otros dispositivos no se conocen.',
      ),
    );
    for (const [index, copy] of copies.entries()) {
      const unresolved = copy.queue.filter(
        (item) =>
          item.awaitingRead ||
          ['pending', 'uncertain', 'review'].includes(item.status),
      ).length;
      const row = el(
        'p',
        (copy.label || 'Copia privada') +
          ' · copia ' +
          (index + 1) +
          ' · ' +
          unresolved +
          ' sin resolver',
      );
      const erase = button('Borrar copia resuelta ' + (index + 1), () => {
        showReview(
          [],
          'Borrar copia local resuelta',
          async () => {
            await new FinanceSync.Queue(store, copy.key).clear();
            if (queue?.key === copy.key) {
              client?.close();
              client = null;
              snapshot = null;
            }
            await renderStoredCopies();
          },
          'El libro de Google se conserva. Las solicitudes pendientes, inciertas o en revisión bloquean el borrado.',
        );
      });
      erase.disabled = unresolved > 0;
      row.append(erase);
      storedCopies.append(row);
    }
  }
  localSettings.addEventListener('toggle', () => {
    if (localSettings.open)
      void renderStoredCopies().catch((error) => status(errorText(error)));
  });
  $('finance-clear').addEventListener('click', () => {
    showReview(
      [],
      'Borrar copia local',
      async (bookQueue, bookClient) => {
        if (bookQueue) await bookQueue.clear();
        bookClient?.close();
        if (review?.epoch !== configurationEpoch) return;
        client = null;
        snapshot = null;
        status(
          'Copia local borrada. Abre Google para leer de nuevo el libro.',
          'unread',
        );
      },
      'Se borra la copia de lectura y las confirmaciones de este navegador. El libro de Google se conserva. Los pendientes bloquean este borrado.',
    );
  });
  for (const id of [
    'finance-section',
    'finance-search',
    'finance-from',
    'finance-to',
  ])
    $(id).addEventListener('input', () => {
      limit = 50;
      renderRegister();
    });
  window.addEventListener('finances:navigate', (event) =>
    registerContext(event.detail.view),
  );
  registerContext('book');
  registerContext(
    registerViews[location.hash.slice(1)] ? location.hash.slice(1) : 'home',
  );
  window.addEventListener('finances:configuration', () => {
    void configure().catch((error) => status(errorText(error)));
  });
  window.addEventListener('storage', (event) => {
    if (event.key === DEPLOYMENT_STORAGE_KEY)
      void configure().catch((error) => status(errorText(error)));
  });
  window.addEventListener('offline', () =>
    status(
      'Sin conexión · copia local. Los pendientes se conservan en este navegador.',
      snapshot ? 'offline' : 'unread',
    ),
  );
  function scheduleRecovery() {
    if (!recoveryRequested || recoveryTimer || recoveryAttempts >= 3) return;
    recoveryTimer = setTimeout(
      () => {
        recoveryTimer = null;
        if (loading) return;
        recoveryRequested = false;
        if (liveSession() && navigator.onLine) {
          recoveryAttempts++;
          void sync();
        } else status('Abre Google para recuperar los pendientes conservados.');
      },
      500 * 2 ** recoveryAttempts,
    );
  }
  function requestRecovery() {
    recoveryRequested = true;
    recoveryAttempts = 0;
    scheduleRecovery();
  }
  window.addEventListener('online', requestRecovery);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') requestRecovery();
  });
  const changes =
    typeof BroadcastChannel === 'function'
      ? new BroadcastChannel('finances-queue-v1')
      : null;
  changes?.addEventListener('message', (event) => {
    if (
      queue &&
      event.data?.key === queue.key &&
      event.data?.bookKey === snapshot?.bookKey
    ) {
      const changedQueue = queue;
      void changedQueue
        .get()
        .then((data) => {
          if (queue !== changedQueue || data.bookKey !== snapshot?.bookKey)
            return;
          snapshot = data.snapshot;
          void render();
          if (localSettings.open) void renderStoredCopies();
        })
        .catch((error) => status(errorText(error)));
    }
  });
  store.changed = (key, data) =>
    changes?.postMessage({ key, bookKey: data.bookKey });
  void configure().catch((error) => status(errorText(error)));
})();
