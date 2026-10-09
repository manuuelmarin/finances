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
    configurationEpoch = 0,
    limit = 50;
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
        'Actualiza Code.gs, Bridge.html y appsscript.json desde el instalador 3.6.0 y publica Nueva versión de la implementación de pruebas. Guardar el editor no actualiza el enlace /exec.',
      POPUP_BLOCKED:
        'Permite abrir la ventana de Google y vuelve a pulsar Abrir mi libro.',
      NOT_CONNECTED: 'Abre Google para leer o enviar los pendientes.',
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
        'Google no ha devuelto el formato vigente. Actualiza los tres archivos desde el instalador y publica Nueva versión.',
      RESPONSE_UNCERTAIN:
        'Envío sin confirmar. La solicitud se conserva para consultar el recibo antes de reintentar.',
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
    $('finance-new').disabled = loading;
    $('finance-prices').disabled = !snapshot || loading;
    const channelBlocked = client?.session?.rpcReady === false;
    $('operation-connection').hidden = Boolean(snapshot) && !channelBlocked;
    $('operation-load').disabled = loading;
    $('operation-review').disabled = !snapshot || loading || channelBlocked;
    for (const target of document.querySelectorAll(
      '[data-operation], [data-open-book]',
    ))
      target.disabled = loading;
    for (const id of ['finance-refresh', 'finance-sync'])
      $(id).disabled = !client?.session || loading;
  }
  async function saved() {
    return queue ? queue.get() : { queue: [], snapshot: null };
  }
  async function configure() {
    const next = savedDeployment(window.localStorage);
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
      const configuredQueue = new FinanceSync.Queue(store, key);
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
    await readingQueue.saveSnapshot(result);
    if (
      epoch !== configurationEpoch ||
      client !== readingClient ||
      queue !== readingQueue
    )
      throw Error('CONFIGURATION_CHANGED');
    snapshot = result;
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
      client.url === savedDeployment(window.localStorage) &&
      client.url === url,
    );
  }
  async function connect(propagate = false) {
    if (loading) {
      if (propagate) throw Error('BOOK_BUSY');
      return false;
    }
    // Abrir la ventana en el clic, antes de esperar IndexedDB.
    const next = savedDeployment(window.localStorage);
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
        savedDeployment(window.localStorage) !== next ||
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
      }
    },
  };
  async function sync() {
    if (!client?.session) {
      status('Abre Google para enviar los pendientes.');
      return;
    }
    loading = true;
    enabled();
    status('Consultando y enviando pendientes…');
    try {
      await queue.run(client, () => {
        void render();
      });
      snapshot = (await saved()).snapshot;
      status(
        'Sincronización terminada. Revisa el estado de cada operación.',
        snapshot ? 'loaded' : 'unread',
      );
    } catch (error) {
      status(errorText(error), 'error');
    } finally {
      loading = false;
      await render();
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
      /Importe|Saldo|Valor|Resultado|Rentabilidad|Participaciones|Precio|Comisión|Retención|Recuperable|Meta|Asignado|Pendiente|Avance|Neto|Bruto|Cotización|IRPF|deducciones|VL EUR|amount|difference/.test(
        key,
      );
    const dateColumn = (key) => /Fecha|^date$/.test(key);
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
                (numericColumn(key) ? Number(filter.min) : filter.min)) &&
            (!filter.max ||
              value <= (numericColumn(key) ? Number(filter.max) : filter.max))
          );
        }
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
            (part === 'min' ? ' desde' : part === 'max' ? ' hasta' : ''),
        );
        input.placeholder =
          part === 'min' ? 'Desde' : part === 'max' ? 'Hasta' : 'Filtrar';
        input.addEventListener('change', () => {
          state.filters[key] = { ...state.filters[key], [part]: input.value };
          limit = 50;
          table(parent, rows, columns, name, actions);
        });
        filterCell.append(input);
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
        else td.textContent = cell(key, row[key]);
        td.dataset.label = label || key;
        if (typeof row[key] === 'number') td.className = 'numeric';
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
    wrap.append(t);
    parent.append(wrap);
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
      ['Participaciones'],
      ['Precio'],
      ['Comisión'],
      ['Retención'],
      ['Importe'],
    ],
    tPrecios: [['Producto'], ['ISIN'], ['Fecha'], ['VL EUR'], ['Fuente']],
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
    rows = rows.filter((row) => {
      const date = row.Fecha || row['Fecha cobro'] || row.date;
      return (
        (!from || (date && date >= from)) &&
        (!to || (date && date <= to)) &&
        (!query ||
          columns[name].some(([k]) =>
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
    table(parent, rows, columns[name], name, name !== 'observations');
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
        : 'Registros confirmados en Sheets. Los filtros solo afectan a este listado.';
  }
  async function render() {
    const epoch = configurationEpoch,
      renderingQueue = queue;
    const data = await saved();
    if (epoch !== configurationEpoch || renderingQueue !== queue) return;
    snapshot = data.snapshot;
    enabled();
    for (const label of document.querySelectorAll('[data-finance-environment]'))
      label.textContent = snapshot
        ? snapshot.environment === 'production'
          ? 'Libro principal'
          : 'Copia de pruebas'
        : 'Sin libro abierto';
    $('finance-cut').textContent = snapshot
      ? `Inicio ${snapshot.settings.start} · informe ${snapshot.settings.asof} · valoración ${snapshot.settings.valuation}. Resumen: ${Object.entries(
          snapshot.summary?.filters || {},
        )
          .map(([k, v]) => k + ' ' + v)
          .join(' · ')}.`
      : '';
    const warnings = [];
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
    const active = items
      .filter((q) => !['discarded', 'confirmed'].includes(q.status))
      .slice()
      .reverse();
    const confirmed = items
      .filter((q) => q.status === 'confirmed')
      .slice()
      .reverse();
    $('pending-total').textContent = String(active.length);
    $('history-total').textContent = String(confirmed.length);
    for (const badge of document.querySelectorAll('[data-pending-count]')) {
      badge.textContent = String(active.length);
      badge.hidden = !active.length;
    }
    if (!active.length) {
      parent.append(el('p', 'No hay operaciones pendientes.', 'empty-state'));
    }
    if (!confirmed.length)
      history.append(
        el(
          'p',
          'Sin solicitudes confirmadas en este navegador.',
          'empty-state',
        ),
      );
    for (const item of [...active.slice(0, 50), ...confirmed.slice(0, 50)]) {
      const card = el('article', undefined, 'queue-item');
      card.dataset.state = item.status;
      card.append(
        el('strong', item.label),
        el('span', labels[item.status]),
        el(
          'small',
          new Date(item.createdAt).toLocaleString('es-ES', {
            timeZone: 'Europe/Madrid',
          }),
        ),
      );
      if (item.result?.message) card.append(el('p', item.result.message));
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
      (item.status === 'confirmed' ? history : parent).append(card);
    }
  }
  function fieldInput(f, value) {
    const label = el('label', f.label, 'field');
    let input;
    if (['select', 'boolean', 'nullableBoolean'].includes(f.type)) {
      input = el('select');
      input.append(new Option(f.required ? 'Selecciona…' : 'Sin dato', ''));
      const values =
        f.type === 'select'
          ? D.options(
              f.source,
              snapshot,
              $('operation-kind').value,
              Object.fromEntries(new FormData($('operation-form'))),
            )
          : [
              ['true', 'Sí'],
              ['false', 'No'],
            ];
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
    const additional = el('details', undefined, 'operation-additional');
    additional.open = additionalOpen;
    additional.append(el('summary', 'Opciones adicionales'));
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
      if (
        simple &&
        !['date', 'account', 'from', 'to', 'category', 'amount'].includes(f.key)
      )
        additional.append(field);
      else parent.append(field);
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
    if (process === 'renombrar')
      $('operation-kind').form.elements.kind.addEventListener('change', () => {
        const current =
          $('operation-fields').querySelector('[name=from]').parentElement;
        current.replaceWith(fieldInput(spec.fields[1]));
      });
    $('operation-note').textContent =
      {
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
      ? 'Este movimiento pertenece a una inversión. Para cambiar fecha, participaciones o efectivo, corrige la operación de inversión.'
      : 'Solo se modificarán las entradas que cambies. Google verifica las relaciones; las columnas calculadas se conservan.';
    $('operation-error').hidden = true;
    $('operation-dialog').showModal();
  }
  function cancelRow(tableName, row) {
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
      'Google verifica los vínculos. Al anular un movimiento también se anulan su nómina, vínculos y operaciones de inversión; al anular una operación se recalcula su caja agrupada. Una referencia todavía utilizada impide la anulación.',
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
            dl.append(el('dt', k), el('dd', displayValue(k, v, snapshot)));
          }
          continue;
        }
        const f = D.processes[op.process]?.fields.find((f) => f.key === key);
        dl.append(
          el('dt', f?.label || key),
          el('dd', displayValue(key, value, snapshot)),
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
      let op, label;
      if (editing) {
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
          ['gasto', 'ingreso', 'traspaso'].includes(process) &&
          !String(values.concept || '').trim()
        )
          values.concept = D.processes[process].label;
        op = D.operation(process, values);
        label =
          D.processes[process].label +
          (op.concept ? ' · ' + op.concept : op.name ? ' · ' + op.name : '');
      }
      showReview([op], label);
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
        current.url !== savedDeployment(window.localStorage) ||
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
    investments: [
      'compra',
      'venta',
      'rendimiento',
      'producto',
      'precio',
      'vincular_isin',
    ],
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
    for (const key of contextual)
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
  window.addEventListener('online', () => {
    if (client?.session && !loading) void sync();
    else
      status(
        'Conexión recuperada. Abre Google para sincronizar los pendientes.',
      );
  });
  void configure().catch((error) => status(errorText(error)));
})();
