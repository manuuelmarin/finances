'use strict';

const FinanceDashboard = (() => {
  const $ = (id) => document.getElementById(id);
  const money = new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  });
  const el = (tag, text, cls) => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (cls) element.className = cls;
    return element;
  };
  const svg = (tag, attributes = {}, text) => {
    const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attributes))
      element.setAttribute(key, value);
    if (text !== undefined) element.textContent = text;
    return element;
  };
  let current = null;
  let api = null;
  let month = null;
  const palettes = [
    'chart-mint',
    'chart-copper',
    'chart-blue',
    'chart-lilac',
    'chart-gold',
  ];
  function series(parent, title, rows, fields, line = false) {
    const card = el('article', undefined, 'chart-card');
    const heading = el('div', undefined, 'chart-heading');
    heading.append(el('h3', title), el('span', 'EUR', 'chart-unit'));
    card.append(heading);
    const legend = el('div', undefined, 'chart-legend');
    fields.forEach(([key, label], i) =>
      legend.append(el('span', label, palettes[i])),
    );
    card.append(legend);
    const known = rows
      .flatMap((r) => fields.map(([key]) => r[key]))
      .filter(FinanceAnalytics.finite);
    if (!known.length || known.every((v) => v === 0)) {
      card.append(
        el(
          'p',
          known.length
            ? 'Sin importe en este periodo.'
            : 'Sin datos de cálculo disponibles.',
          'chart-empty',
        ),
      );
    } else {
      const width = window.innerWidth <= 600 ? 360 : 560;
      const left = 56,
        right = width - 16,
        plotWidth = right - left;
      const chart = svg('svg', {
        viewBox: `0 0 ${width} 250`,
        role: 'img',
        'aria-label': title,
        class: 'finance-chart',
      });
      const min = Math.min(0, ...known),
        max = Math.max(0, ...known),
        span = max - min || 1;
      const y = (v) => 207 - ((v - min) / span) * 175;
      const x = (i) =>
        left + ((i + 0.5) * plotWidth) / Math.max(rows.length, 1);
      for (let i = 0; i <= 3; i++) {
        const value = min + (span * i) / 3;
        chart.append(
          svg('line', {
            x1: left,
            x2: right,
            y1: y(value),
            y2: y(value),
            class: 'chart-gridline',
          }),
          svg(
            'text',
            {
              x: left - 6,
              y: y(value) + 4,
              'text-anchor': 'end',
              class: 'chart-axis',
            },
            new Intl.NumberFormat('es-ES', {
              notation: 'compact',
              maximumFractionDigits: 1,
            }).format(value),
          ),
        );
      }
      fields.forEach(([key], color) => {
        let previous = null;
        rows.forEach((row, i) => {
          const value = row[key];
          if (!FinanceAnalytics.finite(value)) {
            previous = null;
            return;
          }
          if (line) {
            if (previous)
              chart.append(
                svg('line', {
                  x1: previous.x,
                  y1: previous.y,
                  x2: x(i),
                  y2: y(value),
                  class: 'chart-line ' + palettes[color],
                }),
              );
            const dot = svg('circle', {
              cx: x(i),
              cy: y(value),
              r: 4,
              class: palettes[color],
            });
            dot.append(
              svg('title', {}, row.label + ' · ' + money.format(value)),
            );
            chart.append(dot);
            previous = { x: x(i), y: y(value) };
          } else {
            const width = Math.max(
              2,
              Math.min(32, (plotWidth * 0.8) / rows.length / fields.length),
            );
            const bar = svg('rect', {
              x: x(i) + (color - fields.length / 2) * width,
              y: Math.min(y(value), y(0)),
              width: width - 1,
              height: Math.max(1, Math.abs(y(value) - y(0))),
              rx: 3,
              class: palettes[color],
            });
            bar.append(
              svg('title', {}, row.label + ' · ' + money.format(value)),
            );
            chart.append(bar);
          }
        });
      });
      const ticks = width <= 360 ? 3 : 6;
      const tickCount = Math.min(ticks, rows.length);
      const tickIndices = new Set(
        Array.from({ length: tickCount }, (_, i) =>
          Math.round((i * (rows.length - 1)) / Math.max(1, tickCount - 1)),
        ),
      );
      rows.forEach((row, i) => {
        if (tickIndices.has(i))
          chart.append(
            svg(
              'text',
              { x: x(i), y: 234, 'text-anchor': 'middle', class: 'chart-axis' },
              row.label.slice(0, width <= 360 ? 10 : 12),
            ),
          );
      });
      card.append(chart);
    }
    const details = el('details', undefined, 'chart-data');
    details.append(el('summary', 'Ver datos'));
    const table = el('table', undefined, 'chart-table');
    table.append(el('caption', title + ' · EUR'));
    const head = el('tr');
    head.append(el('th', 'Periodo / categoría'));
    fields.forEach(([, label]) => head.append(el('th', label)));
    table.append(head);
    for (const row of rows) {
      const tr = el('tr');
      tr.append(el('th', row.label));
      fields.forEach(([key]) =>
        tr.append(
          el(
            'td',
            FinanceAnalytics.finite(row[key])
              ? money.format(row[key])
              : 'Sin dato',
          ),
        ),
      );
      table.append(tr);
    }
    details.append(table);
    card.append(details);
    parent.append(card);
  }
  function distribution(parent, title, rows) {
    const card = el('article', undefined, 'chart-card');
    card.append(el('h3', title));
    const valid = rows.filter(
      (r) => FinanceAnalytics.finite(r.value) && r.value > 0,
    );
    const total = valid.reduce((sum, r) => sum + r.value, 0);
    if (rows.some((r) => r.value === null))
      card.append(
        el(
          'p',
          'Distribución parcial: hay valores desconocidos.',
          'field-message',
        ),
      );
    if (rows.some((r) => r.value < 0))
      card.append(
        el(
          'p',
          'El reparto muestra importes positivos. Los negativos se conservan en el gráfico de categorías.',
          'calculator-note',
        ),
      );
    if (!total) card.append(el('p', 'Sin importes positivos.', 'chart-empty'));
    else {
      const chart = svg('svg', {
        viewBox: '0 0 260 210',
        class: 'donut-chart',
        role: 'img',
        'aria-label': title,
      });
      let start = -Math.PI / 2;
      valid.forEach((row, i) => {
        const angle = (row.value / total) * Math.PI * 2;
        const end = start + Math.min(angle, Math.PI * 2 - 0.00001);
        const path = svg('path', {
          d: `M130 105 L${130 + 76 * Math.cos(start)} ${105 + 76 * Math.sin(start)} A76 76 0 ${angle > Math.PI ? 1 : 0} 1 ${130 + 76 * Math.cos(end)} ${105 + 76 * Math.sin(end)} Z`,
          class: palettes[i % palettes.length],
        });
        path.append(
          svg('title', {}, row.label + ' · ' + money.format(row.value)),
        );
        chart.append(path);
        start += angle;
      });
      chart.append(
        svg('circle', { cx: 130, cy: 105, r: 53, class: 'donut-hole' }),
        svg(
          'text',
          { x: 130, y: 103, 'text-anchor': 'middle', class: 'donut-total' },
          money.format(total),
        ),
        svg(
          'text',
          { x: 130, y: 123, 'text-anchor': 'middle', class: 'chart-axis' },
          'valor conocido',
        ),
      );
      card.append(chart);
    }
    const list = el('ul', undefined, 'allocation-list');
    rows.forEach((row, i) => {
      const item = el('li');
      item.append(
        el('span', row.label, palettes[i % palettes.length]),
        el('strong', row.value === null ? 'Sin dato' : money.format(row.value)),
      );
      list.append(item);
    });
    card.append(list);
    parent.append(card);
  }
  function render(snapshot, handlers) {
    if (current?.bookKey !== snapshot?.bookKey) month = null;
    current = snapshot;
    api = handlers;
    const container = $('dashboard-charts');
    const spending = $('spending-charts'),
      investments = $('investment-charts'),
      salary = $('salary-charts');
    for (const target of [container, spending, investments, salary])
      target.replaceChildren();
    $('dashboard-empty').hidden = Boolean(snapshot);
    $('dashboard-grid').hidden = !snapshot;
    if (snapshot) {
      const c = snapshot.charts;
      $('chart-cut').textContent =
        'Cortes de Sheets: informe ' +
        snapshot.settings.asof +
        ' · inversiones ' +
        snapshot.settings.valuation +
        '. Los gráficos respetan sus filtros.';
      if (!c)
        container.append(
          el(
            'p',
            'Para mostrar los gráficos nativos, actualiza los tres archivos de Google a la entrega 3.5.0. Puedes seguir registrando movimientos.',
            'empty-state',
          ),
        );
      else {
        series(container, 'Ingresos y gastos por mes', c.monthly, [
          ['income', 'Ingresos'],
          ['expense', 'Gastos propios'],
        ]);
        series(
          container,
          'Evolución del efectivo',
          c.monthly,
          [['cash', 'Efectivo']],
          true,
        );
        series(container, 'Gasto por categoría', c.categories, [
          ['value', 'Gasto propio'],
        ]);
        distribution(spending, 'Distribución del gasto', c.categories);
        series(spending, 'Gasto por ciudad', c.cities, [
          ['value', 'Gasto propio'],
        ]);
        series(
          investments,
          'Valor de mercado y capital invertido',
          c.investments,
          [
            ['capital', 'Capital invertido'],
            ['value', 'Valor de mercado'],
          ],
          true,
        );
        distribution(investments, 'Peso de las posiciones', c.positions);
        distribution(
          investments,
          'Clases de activo',
          FinanceAnalytics.groups(c.positions),
        );
        series(salary, 'Nóminas registradas', c.salary, [['value', 'Neto']]);
      }
      if (!month) month = snapshot.settings.asof.slice(0, 7);
      $('budget-month').value = month;
    }
    renderBudgets();
  }
  function renderBudgets() {
    const parent = $('budget-cards');
    parent.replaceChildren();
    $('saving-goals').replaceChildren();
    $('budget-spent').textContent = 'Sin dato';
    $('budget-new').disabled = !current?.supportsBudgets;
    $('budget-note').textContent = !current
      ? 'Abre tu libro para configurar tus límites.'
      : !current.supportsBudgets
        ? 'Los presupuestos requieren actualizar Google a 3.5.0.'
        : 'Gasto propio: importe menos parte recuperable y devoluciones. Lectura hasta ' +
          current.settings.asof +
          ', desde ' +
          current.settings.start +
          '. No incluye transferencias, inversiones ni pagos de deuda.';
    if (!current) return;
    const records = (current.budgets || []).filter((r) => r.month === month);
    $('budget-spent').textContent =
      FinanceAnalytics.spending(current, month) === null
        ? 'Sin dato'
        : money.format(FinanceAnalytics.spending(current, month));
    if (!records.length)
      parent.append(
        el(
          'p',
          'Este mes no tiene límites definidos. Añade uno total o por subcategoría.',
          'empty-state',
        ),
      );
    for (const record of records) {
      const b = FinanceAnalytics.budget(current, record);
      const card = el(
        'article',
        undefined,
        'budget-card' + (b.exceeded ? ' budget-exceeded' : ''),
      );
      card.append(
        el('span', record.category || 'Total del mes', 'section-kicker'),
        el('h3', b.spent === null ? 'Sin dato' : money.format(b.spent)),
      );
      card.append(
        el(
          'p',
          'de ' +
            money.format(b.amount) +
            ' · ' +
            (b.remaining === null
              ? 'Sin dato'
              : b.exceeded
                ? money.format(-b.remaining) + ' por encima'
                : money.format(b.remaining) + ' disponibles'),
        ),
      );
      const progress = el('progress');
      progress.max = Math.max(1, b.amount);
      progress.value = Math.max(0, Math.min(b.spent ?? 0, b.amount));
      progress.setAttribute(
        'aria-label',
        'Gasto de ' + (record.category || 'total del mes'),
      );
      card.append(progress);
      const actions = el('div', undefined, 'budget-actions');
      const edit = el('button', 'Editar', 'text-button');
      edit.type = 'button';
      edit.addEventListener('click', () => editBudget(record));
      const remove = el('button', 'Quitar límite', 'text-button');
      remove.type = 'button';
      remove.addEventListener('click', () =>
        api.review(
          [
            {
              process: 'quitar_presupuesto',
              month: record.month,
              category: record.category,
            },
          ],
          'Quitar límite · ' + (record.category || 'Total del mes'),
        ),
      );
      actions.append(edit, remove);
      card.append(actions);
      parent.append(card);
    }
    const goals = $('saving-goals');
    goals.replaceChildren();
    for (const g of current.tables.tObjetivos || []) {
      const card = el('article', undefined, 'budget-card');
      card.append(
        el('span', 'Objetivo de ahorro', 'section-kicker'),
        el('h3', g.Objetivo),
        el(
          'p',
          'Meta ' + money.format(g.Meta) + (g.Fecha ? ' · ' + g.Fecha : ''),
        ),
      );
      if (FinanceAnalytics.finite(g.Asignado)) {
        card.append(el('p', money.format(g.Asignado) + ' asignados'));
        if (FinanceAnalytics.finite(g.Meta) && g.Meta > 0) {
          const progress = el('progress');
          progress.max = g.Meta;
          progress.value = Math.max(0, Math.min(g.Asignado, g.Meta));
          progress.setAttribute(
            'aria-label',
            'Ahorro asignado a ' + g.Objetivo,
          );
          card.append(progress);
        }
      }
      goals.append(card);
    }
    if (!goals.children.length)
      goals.append(
        el(
          'p',
          'Sin objetivos. Crea una meta y asígnale activos existentes.',
          'empty-state',
        ),
      );
  }
  function editBudget(record = null) {
    if (!current?.supportsBudgets) return;
    const select = $('budget-category');
    select.replaceChildren(new Option('Total del mes', ''));
    for (const c of current.tables.tCategorias.filter(
      (c) => c.Grupo === 'Gastos',
    ))
      select.append(new Option(c.Subcategoría, c.Subcategoría));
    $('budget-edit-month').value = record?.month || month;
    select.value = record?.category || '';
    $('budget-amount').value = record?.amount ?? '';
    $('budget-error').hidden = true;
    $('budget-dialog').showModal();
    $('budget-amount').focus();
  }
  $('budget-month').addEventListener('change', (event) => {
    month = event.target.value;
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) renderBudgets();
  });
  $('budget-new').addEventListener('click', () => editBudget());
  $('budget-cancel').addEventListener('click', () =>
    $('budget-dialog').close(),
  );
  $('budget-form').addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const amount = FinanceDomain.decimal($('budget-amount').value, true);
      const record = {
        process: 'presupuesto',
        month: $('budget-edit-month').value,
        category: $('budget-category').value || null,
        amount,
      };
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(record.month))
        throw Error('Elige un mes válido.');
      api.review(
        [record],
        'Límite mensual · ' +
          record.month +
          ' · ' +
          (record.category || 'Total del mes'),
      );
    } catch (error) {
      $('budget-error').textContent = error.message;
      $('budget-error').hidden = false;
    }
  });
  let resize;
  window.addEventListener('resize', () => {
    clearTimeout(resize);
    resize = setTimeout(() => {
      if (current) render(current, api);
    }, 150);
  });
  return { render };
})();
