'use strict';

// These panels only inspect the current snapshot. Preferences stay in this browser.
const FinanceInvestmentLab = (() => {
  const states = new Map();
  const el = (tag, text, cls) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  };
  const money = new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  });
  const num = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });
  const format = (value) =>
    Number.isFinite(value) ? money.format(value) : 'Sin dato';
  const pct = (value) =>
    Number.isFinite(value) ? num.format(value) + ' %' : 'Sin dato';
  const button = (label, callback) => {
    const node = el('button', label, 'button button-secondary');
    node.type = 'button';
    node.addEventListener('click', callback);
    return node;
  };
  function section(parent, title, note) {
    const details = el('details', undefined, 'section-details investment-lab');
    details.append(el('summary', title), el('p', note, 'calculator-note'));
    parent.append(details);
    return details;
  }
  function table(parent, headers, rows) {
    const wrap = el('div', undefined, 'investment-lab-table');
    const table = el('table');
    const head = el('thead'),
      tr = el('tr');
    headers.forEach((h) => {
      const th = el('th', h);
      th.scope = 'col';
      tr.append(th);
    });
    head.append(tr);
    const body = el('tbody');
    for (const values of rows) {
      const row = el('tr');
      values.forEach((v, i) => {
        const cell = el(i ? 'td' : 'th', String(v));
        if (!i) cell.scope = 'row';
        row.append(cell);
      });
      body.append(row);
    }
    table.append(head, body);
    wrap.append(table);
    parent.append(wrap);
  }
  function getState(bookKey) {
    if (!states.has(bookKey)) {
      let targets = {},
        exposure = [];
      try {
        targets = JSON.parse(
          localStorage.getItem('finances.allocation:' + bookKey) || '{}',
        );
      } catch {}
      try {
        exposure = JSON.parse(
          localStorage.getItem('finances.exposure:' + bookKey) || '[]',
        );
      } catch {}
      if (!targets || typeof targets !== 'object' || Array.isArray(targets))
        targets = {};
      if (!Array.isArray(exposure)) exposure = [];
      states.set(bookKey, { targets, exposure, reference: '' });
    }
    return states.get(bookKey);
  }
  function positions(snapshot) {
    return (snapshot.tables.tProductos || []).map((p) => ({
      id: p.ID,
      name: p.Producto,
      isin:
        (snapshot.prices || []).find((q) => q.product === p.ID)?.isin || null,
      value:
        snapshot.calculationState === 'needs_review'
          ? null
          : FinanceAnalytics.investmentMetrics(snapshot, p.ID).value,
    }));
  }
  function showAllocation(parent, snapshot, state, rows) {
    const panel = section(
      parent,
      'Reparto objetivo',
      'Define el porcentaje para cada producto y simula la próxima aportación. Los objetivos se guardan solo en este navegador; no se envían órdenes.',
    );
    if (!rows.length) {
      panel.append(el('p', 'No hay productos en la cartera.'));
      return;
    }
    const fields = el('div', undefined, 'investment-lab-fields');
    const inputs = new Map();
    for (const p of rows) {
      const label = el('label', p.name + ' · objetivo %', 'field');
      const input = el('input');
      input.type = 'number';
      input.min = '0';
      input.max = '100';
      input.step = '0.01';
      input.value = state.targets[p.id] ?? '';
      label.append(input);
      fields.append(label);
      inputs.set(p.id, input);
    }
    const amountLabel = el('label', 'Aportación a simular (€)', 'field');
    const amount = el('input');
    amount.type = 'number';
    amount.min = '0';
    amount.step = '0.01';
    amount.value = '0';
    amountLabel.append(amount);
    fields.append(amountLabel);
    panel.append(fields);
    const output = el('div');
    const status = el('p', '', 'calculator-note');
    status.setAttribute('role', 'status');
    function calculate(save) {
      output.replaceChildren();
      try {
        const weights = Object.fromEntries(
          [...inputs].map(([id, input]) => [
            id,
            input.value === '' ? null : Number(input.value),
          ]),
        );
        const result = FinanceInvestmentTools.allocation(
          rows,
          weights,
          Number(amount.value),
        );
        table(
          output,
          [
            'Producto',
            'Valor',
            'Actual',
            'Objetivo',
            'Desviación',
            'Aportación',
          ],
          result.rows.map((r) => [
            r.name,
            format(r.value),
            pct(r.current),
            pct(r.target),
            r.difference === null
              ? 'Sin dato'
              : num.format(r.difference) + ' p. p.',
            format(r.contribution),
          ]),
        );
        output.append(
          el(
            'p',
            'Efectivo sin asignar: ' + format(result.residual),
            'calculator-note',
          ),
        );
        if (save) {
          localStorage.setItem(
            'finances.allocation:' + snapshot.bookKey,
            JSON.stringify(weights),
          );
          state.targets = weights;
        }
        status.textContent = save
          ? 'Objetivos guardados en este navegador.'
          : 'Simulación calculada; los objetivos aún no se han guardado.';
      } catch (error) {
        status.textContent = error.message || 'No se pudo calcular.';
      }
    }
    panel.append(
      button('Simular aportación', () => calculate(false)),
      button('Guardar objetivos', () => calculate(true)),
      status,
      output,
    );
  }
  function showExposure(parent, snapshot, state, rows) {
    const panel = section(
      parent,
      'Exposición de la cartera',
      'Carga fichas revisadas por ISIN, con fecha y fuente. Los porcentajes deben referirse al valor total de cada producto. Puedes guardarlas en este navegador; no se envían a Google. El porcentaje desconocido no se reparte entre los datos conocidos.',
    );
    const example = [
      {
        isin: 'IE00BYX5NX33',
        date: '2026-01-31',
        source: 'Ejemplo: sustituye por la ficha real',
        countries: [{ name: 'Estados Unidos', percent: 50 }],
        sectors: [{ name: 'Tecnología', percent: 20 }],
        assetClasses: [{ name: 'Renta variable', percent: 100 }],
      },
    ];
    const link = el('a', 'Descargar plantilla JSON');
    link.href =
      'data:application/json;charset=utf-8,' +
      encodeURIComponent(JSON.stringify(example, null, 2));
    link.download = 'plantilla-exposicion.json';
    const inputLabel = el('label', 'Fichas de exposición (JSON)', 'field');
    const input = el('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    inputLabel.append(input);
    const status = el('p', '', 'calculator-note');
    status.setAttribute('role', 'status');
    const out = el('div');
    function draw() {
      FinanceCharts.clear(out);
      try {
        const data = FinanceInvestmentTools.exposure(
          rows,
          state.exposure,
          snapshot.settings.valuation || snapshot.settings.asof,
        );
        for (const [key, label] of [
          ['countries', 'Países'],
          ['sectors', 'Sectores'],
          ['assetClasses', 'Clases de activo'],
        ]) {
          const values = data[key];
          FinanceCharts.plot(out, {
            title: label + ' de la cartera',
            rows: [
              ...values.rows,
              ...(values.unknown > 0
                ? [{ label: 'Sin datos', value: values.unknown }]
                : []),
            ],
            fields: [
              {
                key: 'value',
                label: 'Peso de la cartera',
                shape: 'bar',
                tone: 'chart-blue',
              },
            ],
            unit: '%',
            horizontal: true,
            description:
              'Porcentaje del valor total; datos sin ficha o sin desglose permanecen como desconocidos.',
          });
        }
        table(
          out,
          ['Producto', 'ISIN', 'Fecha', 'Fuente'],
          data.sources.map((r) => [r.product, r.isin, r.date, r.source]),
        );
        status.textContent = data.sources.length
          ? 'Fichas aplicadas: ' + data.sources.length
          : 'Sin fichas aplicables al corte de valoración.';
      } catch (error) {
        status.textContent =
          error.message || 'No se pudo calcular la exposición.';
      }
    }
    input.addEventListener('change', async () => {
      try {
        const file = input.files[0];
        if (!file || file.size > 2000000)
          throw Error('Selecciona un archivo de hasta 2 MB.');
        const data = JSON.parse(await file.text());
        FinanceInvestmentTools.exposure(
          rows,
          data,
          snapshot.settings.valuation || snapshot.settings.asof,
        );
        state.exposure = data;
        draw();
      } catch (error) {
        status.textContent = error.message || 'Archivo JSON inválido.';
      }
    });
    const save = button('Guardar fichas en este dispositivo', () => {
      try {
        if (!state.exposure.length) throw Error('Carga primero las fichas.');
        localStorage.setItem(
          'finances.exposure:' + snapshot.bookKey,
          JSON.stringify(state.exposure),
        );
        status.textContent = 'Fichas guardadas en este navegador.';
      } catch (error) {
        status.textContent =
          error.message || 'No se pudieron guardar las fichas.';
      }
    });
    const remove = button('Quitar fichas de este dispositivo', () => {
      try {
        localStorage.removeItem('finances.exposure:' + snapshot.bookKey);
        state.exposure = [];
        input.value = '';
        FinanceCharts.clear(out);
        status.textContent = 'Fichas quitadas de este navegador.';
      } catch (error) {
        status.textContent =
          error.message || 'No se pudieron quitar las fichas.';
      }
    });
    panel.append(link, inputLabel, save, remove, status, out);
    if (state.exposure.length) draw();
  }
  function showDistributions(parent, snapshot, product) {
    const panel = section(
      parent,
      'Cobros de inversiones',
      'Dividendos y otras distribuciones registrados como cobros de inversión. Son importes netos cuando constan en el libro; los intereses de cuentas no se incluyen automáticamente.',
    );
    const data = FinanceInvestmentTools.distributions(
      snapshot,
      product || null,
    );
    panel.append(
      el(
        'p',
        'Total registrado: ' +
          format(data.total) +
          ' · Últimos 12 meses: ' +
          format(data.last12) +
          (data.unknown
            ? ' · Hay ' + data.unknown + ' cobros sin dato completo.'
            : ''),
        'calculator-note',
      ),
    );
    if (data.months.length)
      FinanceCharts.plot(panel, {
        title: 'Cobros por mes',
        rows: data.months,
        fields: [
          {
            key: 'value',
            label: 'Cobro neto',
            shape: 'bar',
            tone: 'chart-mint',
          },
        ],
      });
    if (data.products.length)
      table(
        panel,
        ['Producto', 'Cobros conocidos'],
        data.products.map((r) => [r.product, format(r.net)]),
      );
    if (data.years.length)
      table(
        panel,
        ['Año', 'Cobros conocidos'],
        data.years.map((r) => [r.year, format(r.net)]),
      );
    if (data.rows.length)
      table(
        panel,
        ['Fecha', 'Producto', 'Cobro neto'],
        data.rows.map((r) => [r.date || 'Sin fecha', r.product, format(r.net)]),
      );
  }
  function showAlternative(parent, snapshot, state) {
    const panel = section(
      parent,
      'Comparar carteras',
      'Simula las mismas entradas y salidas en un fondo o en una combinación de fondos registrados, usando precios reales del libro. Es una simulación, no una comparación de índices ni una orden.',
    );
    const products = snapshot.tables.tProductos || [];
    if (!products.length) {
      panel.append(el('p', 'No hay fondos registrados.'));
      return;
    }
    const label = el('label', 'Fondo de referencia', 'field');
    const select = el('select');
    select.append(new Option('Selecciona un fondo', ''));
    products.forEach((p) => select.append(new Option(p.Producto, p.ID)));
    select.append(new Option('Cartera combinada', '__mix__'));
    select.value =
      state.reference === '__mix__' ||
      products.some((p) => p.ID === state.reference)
        ? state.reference
        : '';
    const mix = el('div', undefined, 'investment-lab-fields');
    const mixWeights = new Map();
    for (const p of products) {
      const field = el('label', p.Producto + ' · peso %', 'field');
      const input = el('input');
      input.type = 'number';
      input.min = '0';
      input.max = '100';
      input.step = '0.01';
      input.value = '0';
      field.append(input);
      mix.append(field);
      mixWeights.set(p.ID, input);
    }
    mix.hidden = select.value !== '__mix__';
    select.addEventListener('change', () => {
      state.reference = select.value;
      mix.hidden = select.value !== '__mix__';
    });
    label.append(select);
    panel.append(label, mix);
    const status = el('p', '', 'calculator-note');
    status.setAttribute('role', 'status');
    const output = el('div');
    panel.append(
      button('Calcular comparación', () => {
        FinanceCharts.clear(output);
        try {
          if (!select.value) throw Error('Selecciona un fondo de referencia.');
          if (products.some((p) => p['Unidades base'] !== 0))
            throw Error(
              'La comparación requiere posiciones iniciales sin participaciones previas.',
            );
          const cutoff = snapshot.settings.valuation || snapshot.settings.asof;
          const quotes = (id) =>
            (snapshot.tables.tPrecios || [])
              .filter((p) => p.Producto === id)
              .map((p) => ({ date: p.Fecha, price: p['VL EUR'] }));
          const components =
            select.value === '__mix__'
              ? [...mixWeights]
                  .map(([id, input]) => ({
                    id,
                    weight: Number(input.value),
                    prices: quotes(id),
                  }))
                  .filter((row) => row.weight !== 0)
              : [
                  {
                    id: select.value,
                    weight: 100,
                    prices: quotes(select.value),
                  },
                ];
          const realRows = FinanceAnalytics.investmentTimeline(snapshot, {
            range: 'all',
          }).rows.filter(
            (r) => !r.carried && Number.isFinite(r.value) && r.date <= cutoff,
          );
          const commonCut = realRows
            .map((row) => row.date)
            .filter(
              (date) =>
                components.length &&
                components.every((component) =>
                  component.prices.some(
                    (quote) =>
                      quote.date === date &&
                      Number.isFinite(quote.price) &&
                      quote.price > 0,
                  ),
                ),
            )
            .sort()
            .at(-1);
          if (!commonCut)
            throw Error(
              'No hay una fecha de valoración real común para la cartera y la referencia.',
            );
          const flows = FinancePortfolio.cashFlows(snapshot).filter(
            (f) => !f.date || f.date <= commonCut,
          );
          const simulated = FinanceInvestmentTools.alternativeBasket(
            flows,
            components,
            commonCut,
          );
          const real = new Map(realRows.map((r) => [r.date, r.value]));
          const chart = simulated.map((r) => ({
            date: r.date,
            simulated: r.value,
            actual: real.get(r.date) ?? null,
          }));
          const end = chart.at(-1);
          if (!Number.isFinite(end?.actual))
            throw Error(
              'Falta la valoración real completa de la cartera en el corte final.',
            );
          status.textContent =
            'Al ' +
            commonCut +
            ': cartera real ' +
            format(end.actual) +
            ' · simulación ' +
            format(end.simulated) +
            (commonCut < cutoff
              ? '. Último corte común; se excluyen flujos posteriores.'
              : '.');
          FinanceCharts.plot(output, {
            title: 'Cartera real y simulada',
            rows: chart,
            fields: [
              { key: 'actual', label: 'Cartera real', tone: 'chart-mint' },
              {
                key: 'simulated',
                label: 'Cartera de referencia',
                tone: 'chart-blue',
              },
            ],
            description:
              'Mismos flujos externos y fechas. Las aportaciones se reparten según los pesos; las retiradas son proporcionales al valor de cada componente. No estima costes adicionales ni incluye repartos de la referencia ajenos a su precio. No inventa precios.',
          });
        } catch (error) {
          status.textContent =
            error.message || 'No se pudo calcular la comparación.';
        }
      }),
      status,
      output,
    );
  }
  function render(snapshot, target, product) {
    FinanceCharts.clear(target);
    if (!snapshot?.bookKey) return;
    const state = getState(snapshot.bookKey),
      rows = positions(snapshot);
    showAllocation(target, snapshot, state, rows);
    showExposure(target, snapshot, state, rows);
    showAlternative(target, snapshot, state);
    showDistributions(target, snapshot, product);
  }
  return { render };
})();
