'use strict';

(() => {
  const $ = (id) => document.getElementById(id);
  // La vista previa solo muestra la interfaz pública. Nunca carga datos locales.
  if (window.top !== window.self) {
    $('finance-state').textContent =
      'Abre Finanzas en su propia ventana para acceder a tu libro.';
    for (const button of document.querySelectorAll(
      '.finance-toolbar button, [data-operation], [data-open-book]',
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
    if (text !== undefined) e.textContent = text;
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
      UPDATE_REQUIRED:
        'Actualiza Code.gs, Bridge.html y appsscript.json desde el instalador 3.6.0 y publica Nueva versión de la implementación de pruebas. Guardar el editor no actualiza el enlace /exec.',
      POPUP_BLOCKED:
        'Permite abrir la ventana de Google y vuelve a pulsar Abrir mi libro.',
      NOT_CONNECTED: 'Abre Google para leer o enviar los pendientes.',
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
      readingQueue = queue;
    const result = await readingClient.read();
    if (client !== readingClient || queue !== readingQueue)
      throw Error('CONFIGURATION_CHANGED');
    if (!result.ok) throw Error(result.message || result.error);
    await readingQueue.saveSnapshot(result);
    if (client !== readingClient || queue !== readingQueue)
      throw Error('CONFIGURATION_CHANGED');
    snapshot = result;
    status(
      (readingClient.session?.rpcReady === false
        ? 'Datos leídos · solo lectura. Actualiza la implementación desde el instalador para habilitar las operaciones. '
        : 'Lectura confirmada · ') +
        new Date(result.checkedAt).toLocaleString('es-ES', {
          timeZone: 'Europe/Madrid',
        }) +
        ' · ' +
        (result.environment === 'production'
          ? 'libro principal'
          : 'copia de pruebas'),
      readingClient.session?.rpcReady === false ? 'readonly' : 'loaded',
    );
    await render();
  }
  async function connect() {
    if (loading) return false;
    // Abrir la ventana en el clic, antes de esperar IndexedDB.
    const next = savedDeployment(window.localStorage);
    if (!next) {
      location.hash = 'connection';
      $('setup-toggle').click();
      return false;
    }
    client?.close();
    const opening = new FinanceApiClient(next);
    openingClient = opening;
    opening.onProgress = ({ action }) => {
      if (client !== opening) return;
      status(
        ['transact', 'refreshPrices'].includes(action)
          ? 'Google ha recibido la solicitud. Esperando su confirmación…'
          : 'Google está leyendo el libro. Mantén abierta su ventana…',
      );
    };
    const handshake = opening.connect();
    loading = true;
    enabled();
    status(
      'Cargando el libro desde Google… Usa la cuenta propietaria y mantén abierta su ventana.',
      'loading',
    );
    try {
      await Promise.all([configure(), handshake]);
      if (
        savedDeployment(window.localStorage) !== next ||
        url !== next ||
        !queue
      )
        throw Error('CONFIGURATION_CHANGED');
      client = opening;
      await refresh();
      return true;
    } catch (error) {
      opening.close();
      client?.close();
      client = null;
      status(errorText(error), 'error');
      return false;
    } finally {
      if (openingClient === opening) openingClient = null;
      loading = false;
      enabled();
    }
  }
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
    return D.displayValue(key, value, snapshot);
  }
  function table(parent, rows, columns, name, actions = true) {
    parent.replaceChildren();
    if (!rows.length) {
      parent.append(
        el(
          'p',
          snapshot
            ? 'No hay registros para esta selección.'
            : 'Abre el libro para cargar sus registros.',
          'empty-state',
        ),
      );
      return;
    }
    const wrap = el('div', undefined, 'table-scroll');
    const t = el('table', undefined, 'finance-table');
    const caption = el('caption', `${rows.length} registros · datos de Sheets`);
    t.append(caption);
    const head = el('thead'),
      hr = el('tr');
    for (const [key, label] of columns) {
      const th = el('th', label || key);
      th.scope = 'col';
      hr.append(th);
    }
    if (actions) hr.append(el('th', 'Acciones'));
    head.append(hr);
    t.append(head);
    const body = el('tbody');
    for (const row of rows.slice(0, limit)) {
      const tr = el('tr');
      for (const [key, label] of columns) {
        const td = el('td', cell(key, row[key]));
        td.dataset.label = label || key;
        tr.append(td);
      }
      if (actions) {
        const td = el('td', undefined, 'row-actions');
        td.dataset.label = 'Acciones';
        td.append(
          button('Corregir', () => editRow(name, row)),
          button('Anular', () => cancelRow(name, row)),
        );
        tr.append(td);
      }
      body.append(tr);
    }
    t.append(body);
    wrap.append(t);
    parent.append(wrap);
    if (rows.length > limit)
      parent.append(
        button(`Mostrar más (${rows.length - limit})`, () => {
          limit += 50;
          renderRegister();
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
      ['Tipo'],
      ['Participaciones'],
      ['Precio'],
      ['Comisión'],
      ['Retención'],
      ['Importe'],
    ],
    tPrecios: [['Producto'], ['Fecha'], ['VL EUR'], ['Fuente']],
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
  function renderRegister() {
    const name = $('finance-section').value;
    const query = D.normalize($('finance-search').value),
      from = $('finance-from').value,
      to = $('finance-to').value;
    let rows =
      name === 'observations'
        ? snapshot?.observations || []
        : snapshot?.tables[name] || [];
    rows = rows.filter((row) => {
      const date = row.Fecha || row['Fecha cobro'] || row.date;
      return (
        (!from || (date && date >= from)) &&
        (!to || (date && date <= to)) &&
        (!query ||
          columns[name].some(([k]) =>
            D.normalize(D.displayValue(k, row[k], snapshot)).includes(query),
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
      const panel = el('div', undefined, 'price-panel');
      panel.append(el('h2', 'Estado de las fuentes'));
      for (const price of snapshot?.prices || []) {
        const p = el('p');
        p.append(
          el('strong', price.name + ' · '),
          document.createTextNode(
            price.lastValid
              ? `Último precio guardado: ${numbers.format(price.lastValid.price)} EUR · ${price.lastValid.date} · ${price.lastValid.source}. `
              : 'Sin precio guardado. ',
          ),
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
        ? 'El saldo observado conserva su fecha y alcance. Solo un cierre de día se compara con un corte equivalente; no se crean ajustes automáticos.'
        : 'Los filtros del listado no cambian las fechas del informe. Los pendientes aún no forman parte de estos registros.';
  }
  async function render() {
    const data = await saved();
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
    const kpis = $('finance-kpis');
    kpis.replaceChildren();
    const metrics =
      snapshot?.summary?.metrics ||
      [
        'Patrimonio neto',
        'Efectivo',
        'Inversiones',
        'Deuda',
        'Ingresos',
        'Gastos propios',
        'Ahorro',
        'Tasa de ahorro',
      ].map((label) => ({ label, value: null }));
    for (const m of metrics) {
      const card = el('article', undefined, 'kpi-card');
      card.append(
        el('span', m.label),
        el(
          'strong',
          m.value === null
            ? 'Sin dato'
            : m.label === 'Tasa de ahorro'
              ? new Intl.NumberFormat('es-ES', {
                  style: 'percent',
                  maximumFractionDigits: 1,
                }).format(m.value)
              : money.format(m.value),
        ),
      );
      kpis.append(card);
    }
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
    table(
      $('finance-recent'),
      (snapshot?.tables.tMovimientos || [])
        .slice()
        .sort((a, b) => b.Fecha.localeCompare(a.Fecha))
        .slice(0, 5),
      [['Fecha'], ['Concepto'], ['Importe']],
      'tMovimientos',
      false,
    );
    renderRegister();
    renderQueue(data.queue);
    FinanceDashboard.render(snapshot, { review: showReview });
  }
  function renderQueue(items) {
    const parent = $('finance-queue');
    parent.replaceChildren();
    const labels = {
      pending: 'Pendiente de enviar',
      uncertain: 'Enviada · sin confirmar',
      confirmed: 'Confirmada por Google',
      review: 'Requiere revisión',
      discarded: 'Descartada sin enviar',
    };
    const active = items
      .filter((q) => q.status !== 'discarded')
      .slice()
      .reverse();
    if (!active.length) {
      parent.append(el('p', 'No hay operaciones pendientes.', 'empty-state'));
      return;
    }
    for (const item of active.slice(0, 50)) {
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
      parent.append(card);
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
      for (const [id, name] of values) input.append(new Option(name, id));
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
    $('operation-title').textContent = 'Nueva operación';
    const process = $('operation-kind').value,
      spec = D.processes[process];
    const parent = $('operation-fields');
    parent.replaceChildren();
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Madrid',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    for (const f of spec.fields) {
      let initial = f.initial;
      if (f.type === 'date' && f.required)
        initial = snapshot?.settings[f.key] || today;
      if (Object.hasOwn(values, f.key)) initial = values[f.key];
      parent.append(fieldInput(f, initial));
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
      'Se registra en ' +
        (snapshot?.environment === 'production'
          ? 'el libro principal'
          : 'la copia de pruebas') +
        '. Revisa la fecha, los importes y las selecciones antes de confirmar.';
    $('operation-error').hidden = true;
  }
  async function newOperation(process) {
    try {
      if ($('operation-dialog').open) return;
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
            dl.append(el('dt', k), el('dd', D.displayValue(k, v, snapshot)));
          }
          continue;
        }
        const f = D.processes[op.process]?.fields.find((f) => f.key === key);
        dl.append(
          el('dt', f?.label || key),
          el('dd', D.displayValue(key, value, snapshot)),
        );
      }
    }
    $('review-title').textContent = label;
    $('review-note').textContent =
      note ||
      'Se guardará como pendiente en este navegador. Si Google está abierto, se intentará enviar. El estado confirmado aparece al recibir su respuesta.';
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
  for (const [key, spec] of Object.entries(D.processes))
    if (spec.ui !== false)
      $('operation-kind').append(new Option(spec.label, key));
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
