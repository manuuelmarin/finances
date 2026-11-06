'use strict';

// Local, bounded timings only: never record requests, book identifiers or data.
(function (root) {
  const labels = {
    connect: 'Conexión con Google',
    read: 'Lectura del libro',
    before: 'Lectura de sincronización',
    send: 'Envío y confirmación',
    prices: 'Consulta y confirmación de precios',
    receipt: 'Consulta del recibo',
    after: 'Lectura tras confirmar',
    home: 'Dibujar resumen',
    book: 'Dibujar movimientos',
    investments: 'Dibujar inversiones',
    accounts: 'Dibujar cuentas',
    salary: 'Dibujar salario',
    budgets: 'Dibujar planificación',
  };
  const entries = [];
  const clock = () => root.performance?.now() ?? Date.now();
  let update = () => {};
  function finish(kind, start, ok) {
    if (!Object.hasOwn(labels, kind)) return;
    const duration = clock() - start;
    if (!Number.isFinite(duration) || duration < 0) return;
    entries.push({ kind, duration: Math.round(duration), ok });
    if (entries.length > 40) entries.shift();
    update();
  }
  function measure(kind, task) {
    const start = clock();
    try {
      const result = task();
      if (result && typeof result.then === 'function')
        return result.then(
          (value) => {
            finish(kind, start, !(value && value.ok === false));
            return value;
          },
          (error) => {
            finish(kind, start, false);
            throw error;
          },
        );
      finish(kind, start, !(result && result.ok === false));
      return result;
    } catch (error) {
      finish(kind, start, false);
      throw error;
    }
  }
  function clear() {
    entries.length = 0;
    update();
  }
  if (typeof document !== 'undefined') {
    const panel = document.getElementById('performance-panel');
    const list = document.getElementById('performance-results');
    const reset = document.getElementById('performance-clear');
    update = () => {
      if (!panel?.open || !list) return;
      list.replaceChildren();
      if (!entries.length) {
        const item = document.createElement('li');
        item.textContent = 'Aún no hay mediciones en esta sesión.';
        list.append(item);
        return;
      }
      for (const entry of entries.slice(-15).reverse()) {
        const item = document.createElement('li');
        item.textContent =
          labels[entry.kind] +
          ': ' +
          (entry.duration / 1000).toLocaleString('es-ES', {
            maximumFractionDigits: 2,
          }) +
          ' s' +
          (entry.ok ? '' : ' · no completada');
        list.append(item);
      }
    };
    panel?.addEventListener('toggle', update);
    reset?.addEventListener('click', clear);
  }
  root.FinancePerformance = {
    measure,
    clear,
    entries: () => entries.map((entry) => ({ ...entry })),
  };
  if (typeof module !== 'undefined' && module.exports)
    module.exports = root.FinancePerformance;
})(globalThis);
