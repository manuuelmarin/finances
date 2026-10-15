'use strict';

/* global FinanceInsights, FinanceWealth */

const FinanceDashboard = (() => {
  const $ = (id) => document.getElementById(id);
  const money = new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  });
  const percentage = new Intl.NumberFormat('es-ES', {
    maximumFractionDigits: 2,
  });
  const known = FinanceAnalytics.finite;
  const amount = (v) => (known(v) ? money.format(v) : 'Sin dato');
  const displayDate = (value) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value || '')
      ? new Date(value + 'T00:00:00Z').toLocaleDateString('es-ES', {
          timeZone: 'UTC',
        })
      : 'Sin fecha';
  const labelAccount = (v) => (v === 'EFECTIVO' ? 'Efectivo físico' : v);
  const el = (tag, text, cls) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  };
  let current = null,
    api = null,
    month = null,
    cashMonth = null,
    accountMonth = null,
    spendMonth = null,
    selectedCategories = null,
    wealthRange = '1',
    product = '',
    range = 'all';
  let planEditing = null,
    selectedPlans = null;
  const metric = (name) =>
    current?.summary?.metrics?.find((r) => r.label === name)?.value ?? null;
  function stat(parent, label, value, note = '', primary = false) {
    const node = el('article', undefined, primary ? 'kpi kpi-primary' : 'kpi');
    node.append(
      el('span', label, 'kpi-label'),
      el('strong', value, 'kpi-value'),
    );
    if (note) node.append(el('small', note, 'kpi-note'));
    parent.append(node);
  }
  function selectOptions(id, items, selected) {
    const node = $(id);
    node.replaceChildren();
    for (const [value, label] of items) node.append(new Option(label, value));
    node.value = items.some(([v]) => v === selected)
      ? selected
      : items[0]?.[0] || '';
    return node.value;
  }
  function cashChart(target, title, selectedMonth = cashMonth) {
    const rows = FinanceAnalytics.months(current)
      .flatMap((m) => FinanceAnalytics.cashTimeline(current, m))
      .map((r) => ({
        ...r,
        ...Object.fromEntries(
          Object.entries(r.accounts).map(([k, v]) => ['account:' + k, v]),
        ),
      }));
    FinanceCharts.plot(target, {
      title,
      rows,
      dateRange: {
        from: selectedMonth + '-01',
        to: new Date(
          Date.UTC(
            Number(selectedMonth.slice(0, 4)),
            Number(selectedMonth.slice(5)),
            0,
          ),
        )
          .toISOString()
          .slice(0, 10),
      },
      fields: [
        { key: 'total', label: 'Saldo en cuentas', tone: 'chart-mint' },
        ...(current.tables.tCuentas || []).map((a, i) => ({
          key: 'account:' + a.Cuenta,
          label: labelAccount(a.Cuenta),
          tone: [
            'chart-blue',
            'chart-lilac',
            'chart-copper',
            'chart-gold',
            'chart-red',
          ][i % 5],
        })),
      ],
      description:
        selectedMonth +
        ' · ' +
        coverageNote(FinanceAnalytics.monthCoverage(current, selectedMonth)) +
        ' Saldo al cierre de cada día. Selecciona cuentas en la leyenda.',
    });
  }
  function spendingMovements(selectedMonth = spendMonth) {
    return FinanceInsights.spendingMovements(current, selectedMonth);
  }
  function renderWealthCard(parent) {
    const result = FinanceWealth.compare(current, Number(wealthRange));
    const card = el('article', undefined, 'kpi wealth-card');
    card.append(el('span', 'Variación del patrimonio', 'kpi-label'));
    const label = el('label', 'Periodo', 'field compact-field');
    const select = document.createElement('select');
    for (const [value, title] of [
      ['1', '1 mes'],
      ['3', '3 meses'],
      ['6', '6 meses'],
      ['12', '1 año'],
    ])
      select.append(new Option(title, value));
    select.value = wealthRange;
    select.addEventListener('change', () => {
      wealthRange = select.value;
      card.remove();
      renderWealthCard(parent);
    });
    label.append(select);
    card.append(label);
    const changed = known(result.change);
    card.append(
      el(
        'strong',
        known(result.pct) ? percentage.format(result.pct) + ' %' : 'Sin dato',
        'kpi-value',
      ),
    );
    if (changed) card.append(el('p', amount(result.change)));
    const dates =
      result.currentDate && result.previousDate
        ? `${new Date(`${result.previousDate}T00:00:00`).toLocaleDateString('es-ES')} → ${new Date(`${result.currentDate}T00:00:00`).toLocaleDateString('es-ES')}. `
        : '';
    card.append(
      el('p', dates + (result.reason || result.note || ''), 'kpi-note'),
    );
    parent.append(card);
  }
  function showSpendingTransactions(
    category = null,
    date = null,
    city = null,
    bin = null,
  ) {
    const target = $('spending-charts');
    target.querySelector('.transaction-selection')?.remove();
    const rows = spendingMovements().filter(
      (r) =>
        (!selectedCategories || selectedCategories.includes(r.category)) &&
        (!category || r.category === category) &&
        (!date || r.date === date) &&
        (!city || r.city === city) &&
        (!bin ||
          (r.type === 'Gasto' && r.amount >= bin.low && r.amount < bin.high)),
    );
    const section = el('section', undefined, 'transaction-selection');
    section.append(
      el(
        'h3',
        category || date || city || bin?.label || 'Movimientos seleccionados',
      ),
    );
    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = 'Filtrar movimientos';
    search.setAttribute('aria-label', 'Filtrar movimientos seleccionados');
    section.append(search);
    const table = el('table');
    const head = el('tr');
    const columns = [
      ['date', 'Fecha'],
      ['concept', 'Concepto'],
      ['category', 'Categoría'],
      ['amount', 'Importe propio'],
    ];
    let sortKey = 'date';
    let descending = true;
    for (const [key, title] of columns) {
      const th = el('th');
      const button = el('button', title, 'table-sort');
      button.type = 'button';
      button.addEventListener('click', () => {
        if (sortKey === key) descending = !descending;
        else {
          sortKey = key;
          descending = false;
        }
        drawRows();
      });
      th.append(button);
      head.append(th);
    }
    const thead = el('thead');
    thead.append(head);
    table.append(thead);
    const body = el('tbody');
    const drawRows = () => {
      const query = search.value.trim().toLocaleLowerCase('es-ES');
      const filtered = rows.filter((r) =>
        [r.date, r.concept, r.category, amount(r.amount)].some((value) =>
          String(value).toLocaleLowerCase('es-ES').includes(query),
        ),
      );
      filtered.sort((a, b) => {
        const left = a[sortKey];
        const right = b[sortKey];
        if (sortKey === 'amount' && (!known(left) || !known(right)))
          return known(left) ? -1 : known(right) ? 1 : 0;
        const comparison =
          sortKey === 'amount'
            ? left - right
            : String(left).localeCompare(String(right), 'es-ES');
        return descending ? -comparison : comparison;
      });
      body.replaceChildren();
      for (const r of filtered) {
        const tr = el('tr');
        for (const value of [
          new Date(`${r.date}T00:00:00`).toLocaleDateString('es-ES'),
          r.concept,
          r.category,
          amount(r.amount),
        ])
          tr.append(el('td', value));
        body.append(tr);
      }
    };
    search.addEventListener('input', drawRows);
    drawRows();
    table.append(body);
    section.append(table);
    if (!rows.length)
      section.append(el('p', 'No hay movimientos para esta selección.'));
    target.append(section);
  }
  function renderSummary() {
    const kpis = $('finance-kpis');
    kpis.replaceChildren();
    kpis.hidden = !current;
    const parent = $('dashboard-charts');
    FinanceCharts.clear(parent);
    $('dashboard-empty').hidden = Boolean(current);
    $('dashboard-grid').hidden = !current;
    if (!current) return;
    const reportMonth = current.settings.asof.slice(0, 7);
    const net = metric('Patrimonio neto'),
      cash = metric('Efectivo'),
      invested = metric('Inversiones'),
      debt = metric('Deuda');
    stat(
      kpis,
      'Patrimonio neto',
      amount(net),
      'Informe ' + displayDate(current.settings.asof),
      true,
    );
    stat(kpis, 'Liquidez', amount(cash), 'Saldo conjunto de tus cuentas');
    renderWealthCard(kpis);
    const free = FinanceAnalytics.freeBudget(current, reportMonth);
    const layout = el('article', undefined, 'asset-breakdown');
    const heading = el('div', undefined, 'section-heading');
    heading.append(
      el('h3', 'Composición del patrimonio'),
      el(
        'span',
        'Informe ' + displayDate(current.settings.asof),
        'heading-note',
      ),
    );
    layout.append(heading);
    const rows = [
      { label: 'Inversiones', value: invested, class: 'asset-investments' },
      ...(current.tables.tCuentas || []).map((a) => ({
        label: labelAccount(a.Cuenta),
        value: a['Saldo calculado'],
        class: 'asset-cash',
      })),
    ];
    const positive = rows.reduce(
      (sum, r) => sum + (known(r.value) && r.value > 0 ? r.value : 0),
      0,
    );
    // Native progress is CSP-safe: no inline style or guessed balances.
    for (const r of rows) {
      const line = el('div', undefined, 'asset-row');
      const value = el('strong', amount(r.value));
      value.append(
        el(
          'small',
          known(r.value) && positive > 0 && r.value >= 0
            ? percentage.format((r.value / positive) * 100) +
                ' %' +
                (rows.some((r) => !known(r.value))
                  ? ' del subtotal conocido'
                  : '')
            : 'Peso no comparable',
        ),
      );
      line.append(el('span', r.label), value);
      const bar = el('progress', undefined, r.class);
      bar.max = Math.max(1, positive);
      if (known(r.value)) bar.value = Math.max(0, r.value);
      bar.setAttribute(
        'aria-label',
        'Peso de ' + r.label + ' sobre activos positivos conocidos',
      );
      line.append(bar);
      layout.append(line);
    }
    layout.append(
      el(
        'p',
        'Liquidez · saldo en cuentas ' +
          amount(cash) +
          ' · Deuda ' +
          amount(debt),
        'asset-footnote',
      ),
    );
    parent.append(layout);
    if (rows.some((r) => !known(r.value)))
      layout.append(
        el(
          'p',
          'Composición parcial: se conservan los activos sin valoración; los porcentajes usan solo el subtotal positivo conocido.',
          'calculator-note',
        ),
      );
    const a = FinanceAnalytics.spendingAnalysis(current, reportMonth);
    FinanceCharts.donut(parent, {
      title: 'Gastos del mes',
      rows: a.categories,
      description:
        reportMonth +
        ' · gasto propio por categoría. El total incluye todas las categorías.',
    });
    cashChart(parent, 'Saldo diario en cuentas');
    const flowRows = FinanceInsights.monthlyFlows(current).map((r) => {
      const ownExpense = known(r.expense) ? Math.max(0, r.expense) : null;
      return {
        ...r,
        expense: ownExpense === null ? null : -ownExpense,
        ratio:
          known(r.income) && r.income > 0 && ownExpense !== null
            ? (ownExpense / r.income) * 100
            : null,
      };
    });
    FinanceCharts.plot(parent, {
      title: 'Ingresos y gastos por mes',
      barMode: 'diverging',
      rows: flowRows,
      fields: [
        { key: 'income', label: 'Ingresos', tone: 'chart-blue', shape: 'bar' },
        {
          key: 'expense',
          label: 'Gasto propio',
          tone: 'chart-red',
          shape: 'bar',
        },
        {
          key: 'ratio',
          label: 'Gasto / ingreso',
          tooltipOnly: true,
          unit: '%',
        },
      ],
      description:
        'Desde el primer mes completo. Excluye transferencias, inversiones y pagos de deuda; gasto neto con mínimo cero si las devoluciones superan los gastos.',
      showDataTable: false,
    });
    if (known(free)) {
      const preview = el('article', undefined, 'budget-card');
      preview.append(
        el('h3', 'Presupuesto del mes'),
        el('strong', amount(free) + ' de margen', 'kpi-value'),
      );
      const link = el('a', 'Ver planificación', 'inline-link');
      link.href = '#budgets';
      preview.append(link);
      parent.append(preview);
    }
    $('cash-month').value = cashMonth;
    $('chart-cut').textContent =
      'Informe ' +
      new Date(`${current.settings.asof}T00:00:00`).toLocaleDateString(
        'es-ES',
      ) +
      ' · valoración ' +
      new Date(`${current.settings.valuation}T00:00:00`).toLocaleDateString(
        'es-ES',
      ) +
      '.';
  }
  function renderSpending() {
    const target = $('spending-charts');
    FinanceCharts.clear(target);
    $('spending-summary').replaceChildren();
    $('spending-note').textContent = '';
    if (!current) {
      target.append(
        el('p', 'Abre el libro para analizar tus gastos.', 'empty-state'),
      );
      return;
    }
    const all = FinanceAnalytics.spendingAnalysis(current, spendMonth);
    selectedCategories ||= all.categories.map((r) => r.label);
    const categoryControl = $('spending-categories');
    categoryControl.replaceChildren();
    const categoryDetails = el('details');
    categoryDetails.append(
      el(
        'summary',
        selectedCategories.length === all.categories.length
          ? 'Todas las categorías'
          : `${selectedCategories.length} categorías incluidas`,
      ),
    );
    for (const category of all.categories) {
      const label = el('label', undefined, 'check-field');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = category.label;
      checkbox.checked = selectedCategories.includes(category.label);
      checkbox.addEventListener('change', () => {
        selectedCategories = [
          ...categoryDetails.querySelectorAll('input:checked'),
        ].map((input) => input.value);
        renderSpending();
        const next = $('spending-categories').querySelector('details');
        next.open = true;
        [...next.querySelectorAll('input')]
          .find((input) => input.value === category.label)
          ?.focus();
      });
      label.append(checkbox, document.createTextNode(category.label));
      categoryDetails.append(label);
    }
    categoryControl.append(categoryDetails);
    $('spending-month').value = spendMonth;
    const a = FinanceAnalytics.spendingAnalysis(current, spendMonth);
    const shownCategories = a.categories.filter((r) =>
      selectedCategories.includes(r.label),
    );
    const selectedMovements = spendingMovements(spendMonth).filter((m) =>
      selectedCategories.includes(m.category),
    );
    const knownMovements = selectedMovements.every((m) => known(m.amount));
    const shownTotal = knownMovements
      ? selectedMovements.reduce((sum, m) => sum + m.amount, 0)
      : null;
    const expenseMovements = selectedMovements.filter(
      (m) => m.type === 'Gasto' && m.amount > 0,
    );
    stat(
      $('spending-summary'),
      'Gasto propio',
      amount(a.coverage.observed ? shownTotal : null),
      spendMonth +
        (selectedCategories.length !== all.categories.length
          ? ` · ${selectedCategories.length} categorías incluidas`
          : ''),
    );
    const dailyValues = new Map();
    const cityValues = new Map();
    const recurringValues = new Map();
    const add = (values, key, value) => {
      const previous = values.has(key) ? values.get(key) : 0;
      values.set(
        key,
        known(previous) && known(value) ? previous + value : null,
      );
    };
    for (const movement of selectedMovements) {
      add(dailyValues, movement.date, movement.amount);
      add(cityValues, movement.city, movement.amount);
      const recurrenceLabel =
        movement.recurring === 'Sí' ? 'Recurrente' : 'No recurrente';
      add(recurringValues, recurrenceLabel, movement.amount);
    }
    let running = 0;
    const shownDaily = a.daily.map((r) => {
      const value = dailyValues.has(r.date) ? dailyValues.get(r.date) : 0;
      running = known(running) && known(value) ? running + value : null;
      return { ...r, value, cumulative: running };
    });
    const shownCities = [...cityValues]
      .map(([label, value]) => ({ label, value }))
      .sort((x, y) => (y.value ?? -Infinity) - (x.value ?? -Infinity));
    const shownRecurring = [...recurringValues].map(([label, value]) => ({
      label,
      value,
    }));
    stat(
      $('spending-summary'),
      'Ticket medio',
      expenseMovements.length && knownMovements && a.coverage.observed
        ? amount(
            expenseMovements.reduce((sum, m) => sum + m.amount, 0) /
              expenseMovements.length,
          )
        : 'Sin dato',
      'Por movimiento de gasto propio',
    );
    stat(
      $('spending-summary'),
      'Mayor gasto',
      amount(
        a.coverage.observed && knownMovements
          ? Math.max(0, ...expenseMovements.map((m) => m.amount))
          : null,
      ),
      'Movimiento individual de mayor importe propio',
    );
    $('spending-note').textContent =
      a.coverage.status === 'partial' ? 'Periodo parcial' : '';
    if (!a.coverage.observed) {
      target.append(el('p', coverageNote(a.coverage), 'empty-state'));
      return;
    }
    FinanceCharts.donut(target, {
      title: 'Distribución del gasto',
      rows: shownCategories,
      description:
        spendMonth +
        ' · gasto propio; selecciona una categoría para ver sus movimientos',
      onSelect: (row) => showSpendingTransactions(row.label),
      showDataTable: false,
    });
    FinanceCharts.plot(target, {
      title: 'Gasto por importe y frecuencia',
      rows: FinanceInsights.expenseHistogram(selectedMovements),
      fields: [
        {
          key: 'value',
          label: 'Movimientos',
          shape: 'bar',
          tone: 'chart-copper',
        },
      ],
      unit: 'count',
      description:
        'Gastos positivos por importe propio; devoluciones excluidas. Filtrado por mes y categorías seleccionadas. Los importes sin dato se omiten.',
      showDataTable: false,
      onSelect: (row) => showSpendingTransactions(null, null, null, row),
    });
    FinanceCharts.plot(target, {
      title: 'Gasto del mes',
      rows: shownDaily,
      fields: [
        {
          key: 'cumulative',
          label: 'Gasto propio',
          tone: 'chart-copper',
          shape: 'step',
        },
      ],
      description:
        'Cambios en los días con registros; devoluciones conservan su signo.',
      onSelect: (row) => showSpendingTransactions(null, row.date),
      showDataTable: false,
    });
    FinanceCharts.plot(target, {
      title: 'Gasto por ciudad',
      rows: shownCities,
      fields: [
        {
          key: 'value',
          label: 'Gasto propio',
          shape: 'bar',
          tone: 'chart-blue',
        },
      ],
      description: 'Las ubicaciones sin indicar permanecen sin clasificar.',
      onSelect: (row) => showSpendingTransactions(null, null, row.label),
      showDataTable: false,
    });
    FinanceCharts.donut(target, {
      title: 'Recurrencia del gasto',
      rows: shownRecurring,
      description: 'Se utiliza la clasificación guardada en cada movimiento.',
    });
    const monthChart = [...target.children].find(
      (node) => node.querySelector('h3')?.textContent === 'Gasto del mes',
    );
    if (monthChart) target.prepend(monthChart);
  }
  function renderInvestments() {
    const target = $('investment-charts');
    FinanceCharts.clear(target);
    $('investment-kpis').replaceChildren();
    $('investment-health').replaceChildren();
    $('prices-history-note').textContent = '';
    if (!current) {
      target.append(
        el('p', 'Abre el libro para consultar tu cartera.', 'empty-state'),
      );
      $('investment-coverage').textContent = '';
      return;
    }
    product = selectOptions(
      'investment-product',
      [
        ['', 'Cartera completa'],
        ...(current.tables.tProductos || []).map((p) => [p.ID, p.Producto]),
      ],
      product,
    );
    $('investment-range').value = range;
    const metrics = FinanceAnalytics.investmentMetrics(
      current,
      product || null,
    );
    stat(
      $('investment-kpis'),
      'Valor de mercado',
      amount(metrics.value),
      'Valoración ' + displayDate(current.settings.valuation),
    );
    stat(
      $('investment-kpis'),
      'Aportación neta',
      amount(metrics.capital),
      'Base + compras − ventas',
    );
    const relative = known(metrics.returnPct)
      ? metrics.returnPct
      : known(metrics.gain) && known(metrics.capital) && metrics.capital > 0
        ? (metrics.gain / metrics.capital) * 100
        : null;
    stat(
      $('investment-kpis'),
      'Resultado',
      amount(metrics.gain),
      relative === null
        ? 'Porcentaje sin dato'
        : percentage.format(relative) + ' % · resultado sobre aportación neta',
    );
    const timeline = FinanceAnalytics.investmentTimeline(current, {
      productId: product || null,
      range,
    });
    const chartRows =
      range === 'all'
        ? timeline.rows
        : FinanceAnalytics.investmentTimeline(current, {
            productId: product || null,
            range: 'all',
          }).rows;
    const chartRange = {
      from: timeline.coverage.selectedStartDate,
      to: timeline.coverage.selectedEndDate,
    };
    const productName = product
      ? (current.tables.tProductos || []).find((p) => p.ID === product)
          ?.Producto
      : 'Cartera';
    $('investment-coverage').textContent = timeline.firstDate
      ? 'Histórico: ' +
        new Date(timeline.firstDate + 'T00:00:00Z').toLocaleDateString(
          'es-ES',
          { timeZone: 'UTC' },
        ) +
        ' – ' +
        new Date(timeline.lastDate + 'T00:00:00Z').toLocaleDateString('es-ES', {
          timeZone: 'UTC',
        })
      : 'Sin histórico disponible';
    renderPriceCoverage(timeline.coverage);
    FinanceCharts.plot(target, {
      title: 'Valor de mercado y aportación neta',
      rows: chartRows,
      dateRange: chartRange,
      fields: [
        {
          key: 'capital',
          label: 'Aportación neta',
          shape: 'step',
          area: true,
          tone: 'chart-blue',
        },
        { key: 'value', label: 'Valor de mercado', tone: 'chart-red' },
      ],
      description:
        productName +
        ' · aportaciones en escalera y valor con último VL registrado. No se interpolan cotizaciones.',
    });
    FinanceCharts.plot(target, {
      title: product
        ? 'Variación del valor liquidativo'
        : 'Rentabilidad ajustada de la cartera',
      rows: chartRows,
      dateRange: chartRange,
      unit: '%',
      emptyMessage: product
        ? 'Sin cotizaciones reales en este periodo'
        : 'TWR no disponible con los cortes y flujos registrados',
      fields: [
        {
          key: 'returnPct',
          connectGaps: true,
          label: product
            ? 'Variación de VL'
            : timeline.coverage.returnStartDate
              ? 'TWR ajustado desde ' + timeline.coverage.returnStartDate
              : 'TWR ajustado',
          tone: 'chart-mint',
        },
      ],
      description: product
        ? 'Desde la primera cotización real observada; no incluye distribuciones.'
        : (timeline.coverage.returnStartDate
            ? 'Tramo medido desde ' +
              timeline.coverage.returnStartDate +
              (timeline.coverage.sinceInception
                ? '. '
                : '; el rendimiento anterior es desconocido. ')
            : '') +
          'TWR ajustado entre valoraciones reales con flujos al cierre: excluye diferencias de precisión vinculadas al traspaso; el detalle muestra cada ajuste sin efectivo. Si hay aportaciones o retiradas entre cortes sin valoración, no puede calcularse: registra los VL de esos cortes. El resultado sobre aportación neta aparece arriba como una métrica distinta.',
    });
    if (product)
      FinanceCharts.plot(target, {
        title: 'Rentabilidad total con distribuciones',
        rows: chartRows,
        dateRange: chartRange,
        unit: '%',
        fields: [
          {
            key: 'totalReturnPct',
            label: 'TWR total',
            tone: 'chart-gold',
            connectGaps: true,
          },
        ],
        description:
          'Incluye una sola vez los cobros netos de comisión y retención, además del cambio de valor de la misma clase. Flujos al cierre; un flujo sin valoración rompe la serie. La variación de VL se muestra por separado.',
      });
    const positions = (current.tables.tProductos || [])
      .filter((p) => !product || p.ID === product)
      .map((p) => ({
        label: p.Producto,
        value: FinanceAnalytics.investmentMetrics(current, p.ID).value,
        group: p.Clase,
      }));
    if (!product)
      FinanceCharts.donut(target, {
        title: 'Distribución de la cartera',
        rows: positions,
        description:
          'Peso sobre el valor de mercado conocido, al corte de valoración.',
      });
    $('prices-history-note').textContent =
      'Cotizaciones verificadas e histórico por producto. Actualización diaria en Configuración.';
  }
  function renderPriceCoverage(coverage) {
    const target = $('investment-health');
    target.replaceChildren();
    if (coverage.precisionAdjustments.length) {
      const card = el('article', undefined, 'budget-card');
      const details = el('details');
      details.append(el('summary', 'Diferencias de precisión por traspaso'));
      details.append(
        el(
          'p',
          'El TWR ajustado excluye la diferencia entre las dos valoraciones brutas del traspaso cuando las referencias y el corte real son verificables. No crea efectivo ni ingresos. El valor y resultado nativos conservan sus cifras nominales.',
        ),
      );
      const raw = new Intl.NumberFormat('es-ES', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 12,
      });
      for (const t of coverage.precisionAdjustments)
        details.append(
          el(
            'p',
            t.date +
              ' · ' +
              (t.concept || 'Traspaso') +
              ' · salida bruta ' +
              (known(t.rawOut) ? raw.format(t.rawOut) : 'sin dato') +
              ' EUR · entrada bruta ' +
              (known(t.rawIn) ? raw.format(t.rawIn) : 'sin dato') +
              ' EUR · diferencia ' +
              (known(t.valuationResidual)
                ? raw.format(t.valuationResidual)
                : 'sin dato') +
              ' EUR · ' +
              (t.verified
                ? 'referencias verificadas; ajuste solo con valoración real contemporánea'
                : 'evidencia insuficiente: rentabilidad desconocida'),
          ),
        );
      card.append(details);
      target.append(card);
    }
    for (const p of coverage.perProduct) {
      const evidence = current.prices?.find((q) => q.product === p.product);
      const card = el('article', undefined, 'budget-card');
      card.append(
        el('h3', p.name),
        el(
          'p',
          'Ventana seleccionada: ' +
            p.quoteCount +
            ' cotizaciones reales · ' +
            p.missingDays +
            ' días sin valoración · ' +
            p.carriedDays +
            ' días con VL anterior',
        ),
        el(
          'p',
          p.firstQuote
            ? 'Cotizaciones reales ' + p.firstQuote + ' → ' + p.lastQuote
            : 'Sin cotizaciones reales en la ventana',
        ),
      );
      const quote = evidence?.lastValid;
      const detail = quote?.evidence;
      card.append(
        el(
          'p',
          'ISIN ' +
            (evidence?.isin || 'sin confirmar') +
            ' · precio registrado en EUR. ' +
            (quote?.classCurrency
              ? 'Divisa de clase ' +
                quote.classCurrency +
                (quote.conversion === 'provider_eur'
                  ? ' · conversión EUR del proveedor'
                  : quote.conversion === 'owner_export_eur'
                    ? ' · EUR verificado en la exportación'
                    : quote.conversion === 'none'
                      ? ' · sin conversión'
                      : ' · conversión sin dato')
              : 'Divisa de clase y conversión sin evidencia vinculada al último precio.'),
        ),
      );
      if (quote?.source)
        card.append(
          el(
            'p',
            'Último precio guardado ' +
              quote.date +
              ' · fuente ' +
              quote.source,
          ),
        );
      if (detail?.verification)
        card.append(
          el(
            'p',
            'Verificación ' +
              ({
                provider_quote: 'cotización del proveedor',
                owner_reviewed_export: 'exportación revisada por el titular',
              }[detail.verification] || 'sin clasificación') +
              (detail.checkedAt ? ' · comprobado ' + detail.checkedAt : '') +
              (detail.effectiveDate
                ? ' · fecha efectiva ' + detail.effectiveDate
                : ''),
          ),
        );
      target.append(card);
    }
  }
  function renderAccounts() {
    const target = $('account-charts');
    FinanceCharts.clear(target);
    $('account-summary').replaceChildren();
    $('account-comparisons').replaceChildren();
    $('account-cut').textContent = '';
    if (!current) return;
    stat(
      $('account-summary'),
      'Saldo en cuentas',
      amount(metric('Efectivo')),
      'Informe ' + displayDate(current.settings.asof),
    );
    stat(
      $('account-summary'),
      'Deuda',
      amount(metric('Deuda')),
      'Obligaciones pendientes al corte',
    );
    FinanceCharts.donut(target, {
      title: 'Saldo por cuenta',
      rows: (current.tables.tCuentas || []).map((r) => ({
        label: labelAccount(r.Cuenta),
        value: r['Saldo calculado'],
      })),
      description:
        'Saldos calculados a partir de la apertura y los movimientos. Los saldos negativos se conservan en la tabla.',
    });
    $('account-month').value = accountMonth;
    const latestObserved = new Map();
    for (const o of current.observations || [])
      if (
        o.date.startsWith(accountMonth) &&
        o.scope === 'cierre_dia' &&
        ['coincide_al_corte', 'diferencia_al_corte'].includes(
          o.comparisonStatus,
        ) &&
        known(o.difference) &&
        (!latestObserved.has(o.account) ||
          o.date > latestObserved.get(o.account).date)
      )
        latestObserved.set(o.account, o);
    const observed = [...latestObserved.values()];
    const reconciledDifference = observed.reduce(
      (sum, o) => sum + o.difference,
      0,
    );
    stat(
      $('account-summary'),
      'Diferencia observada',
      observed.length ? amount(reconciledDifference) : 'Sin dato',
      `calculado − observado · ${observed.length} cuentas con último cierre comparable`,
    );
    $('account-cut').textContent = coverageNote(
      FinanceAnalytics.monthCoverage(current, accountMonth),
    );
    cashChart(target, 'Saldos diarios por cuenta', accountMonth);
    const comparisons = $('account-comparisons');
    comparisons.replaceChildren();
    for (const o of (current.observations || []).filter((o) =>
      o.date.startsWith(accountMonth),
    )) {
      const comparable =
        o.scope === 'cierre_dia' &&
        o.date >= current.settings.start &&
        o.date <= current.settings.asof &&
        ['coincide_al_corte', 'diferencia_al_corte'].includes(
          o.comparisonStatus,
        ) &&
        known(o.difference);
      const card = el('article', undefined, 'budget-card');
      card.append(
        el('h3', labelAccount(o.account)),
        el('p', o.date + ' · ' + amount(o.amount) + ' observado'),
        el(
          'p',
          comparable
            ? o.difference === 0
              ? 'Coincide al cierre de ese día'
              : 'Diferencia calculado − observado: ' + amount(o.difference)
            : 'Referencia sin corte comparable: una observación intradía no se compara con el cierre.',
        ),
      );
      comparisons.append(card);
    }
  }
  function renderSalary() {
    const target = $('salary-charts');
    FinanceCharts.clear(target);
    $('salary-cut').textContent = '';
    if (!current) return;
    $('salary-cut').textContent =
      'Registros hasta ' +
      new Date(current.settings.asof + 'T00:00:00Z').toLocaleDateString(
        'es-ES',
        { timeZone: 'UTC' },
      );
    const rows = FinanceAnalytics.salarySavings(current).map((r) => ({
      ...r,
      date: r.month + '-01',
      value: r.payroll,
      label:
        r.month +
        (r.coverage.status === 'partial' ? ' · parcial' : '') +
        (!r.registered ? ' · sin nómina registrada' : ''),
    }));
    FinanceCharts.plot(target, {
      title: 'Nóminas registradas por mes',
      rows,
      fields: [
        { key: 'value', label: 'Neto', shape: 'bar', tone: 'chart-blue' },
      ],
    });
    FinanceCharts.plot(target, {
      title: 'Ahorro mensual sobre nómina',
      rows,
      unit: '%',
      fields: [
        {
          key: 'rate',
          label: 'Ahorro / nómina',
          shape: 'bar',
          tone: 'chart-mint',
        },
      ],
      description:
        '100 × (nómina neta − gasto propio del mes) / nómina neta. No incluye compras de inversión ni transferencias. Sin nómina positiva, no se calcula.',
    });
  }
  function render(snapshot, handlers) {
    if (current?.bookKey !== snapshot?.bookKey) {
      month = null;
      cashMonth = null;
      accountMonth = null;
      selectedPlans = null;
      spendMonth = null;
      product = '';
      selectedCategories = null;
      range = 'all';
      planEditing = null;
      for (const id of ['goal-assign-dialog', 'plan-dialog', 'budget-dialog'])
        if ($(id).open) $(id).close();
    }
    current = snapshot;
    api = handlers;
    if (current) {
      month ||= current.settings.asof.slice(0, 7);
      cashMonth ||= month;
      accountMonth ||= current.settings.asof.slice(0, 7);
      spendMonth ||= month;
      $('budget-month').value = month;
    }
    renderSummary();
    renderSpending();
    renderInvestments();
    renderAccounts();
    renderSalary();
    renderBudgets();
    renderPlans();
    $('settings-environment').textContent = current
      ? current.environment === 'production'
        ? 'Libro principal'
        : 'Copia de pruebas'
      : 'Libro sin cargar';
    $('settings-api').textContent = current?.apiVersion || 'Sin lectura';
    $('settings-check').textContent = current?.checkedAt
      ? new Date(current.checkedAt).toLocaleString('es-ES')
      : 'Sin lectura';
    const daily = current?.dailyPrices,
      dailyLabels = {
        disabled: 'Desactivada',
        failed: 'Activada · último intento fallido; revisa Google',
        inspection_unavailable: 'No se ha podido comprobar el programador',
        trigger_missing: 'Falta reinstalar la rutina en Google',
        scheduled: 'Activada · pendiente de ejecución',
        execution_due: 'Activada · comprobación pendiente en esta franja',
        complete: 'Activada · última comprobación completada',
        partial: 'Activada · hay precios pendientes; se reintentará',
        retry_limit: 'Activada · agotados los intentos de hoy; continúa mañana',
        no_products: 'Activada · sin inversiones configuradas',
      };
    $('settings-daily-status').textContent = !current
      ? 'Libro sin cargar'
      : daily
        ? dailyLabels[daily.status] ||
          'Estado desconocido · vuelve a leer Google'
        : 'Requiere actualizar el código de Google';
    $('settings-daily-schedule').textContent = daily?.schedule
      ? `${daily.schedule.hours.join(', ')} h · ${daily.schedule.timezone}`
      : 'Sin comprobar';
    $('settings-daily-run').textContent = daily?.lastRun?.checkedAt
      ? `${new Date(daily.lastRun.checkedAt).toLocaleString('es-ES')} · ${daily.lastRun.complete ? 'Completada' : 'Sin completar'}`
      : 'Sin ejecución registrada';
  }
  for (const [id, update] of [
    [
      'cash-month',
      (v) => {
        cashMonth = v;
        renderSummary();
      },
    ],
    [
      'account-month',
      (v) => {
        accountMonth = v;
        renderAccounts();
      },
    ],
    [
      'spending-month',
      (v) => {
        spendMonth = v;
        selectedCategories = null;
        renderSpending();
      },
    ],
    [
      'investment-product',
      (v) => {
        product = v;
        renderInvestments();
      },
    ],
    [
      'investment-range',
      (v) => {
        range = v;
        renderInvestments();
      },
    ],
  ])
    $(id).addEventListener('change', (event) => {
      if (current) update(event.target.value);
    });
  function renderBudgets() {
    const parent = $('budget-cards');
    parent.replaceChildren();
    $('saving-goals').replaceChildren();
    $('goal-availability').replaceChildren();
    FinanceCharts.clear($('budget-analysis'));
    FinanceCharts.clear($('goal-charts'));
    FinanceCharts.clear($('budget-detail-chart'));
    $('budget-details').hidden = true;
    $('budget-spent').textContent = 'Sin dato';
    $('budget-new').disabled = !current?.supportsBudgets;
    $('goal-assign-new').disabled = !current;
    $('budget-note').textContent = !current
      ? 'Abre tu libro para configurar tus límites.'
      : !current.supportsBudgets
        ? 'Actualiza Google para habilitar los presupuestos.'
        : !current.supportsCustomBudgets
          ? 'Este backend admite límites mensuales. Ejecuta prepareApplication desde la entrega vigente para habilitar intervalos personalizados.'
          : '';
    if (!current) return;
    if (current.supportsCustomBudgets) $('budget-note').textContent = '';
    const legacy = (current.budgets || [])
      .filter((r) => r.month === month)
      .map((r) => ({
        ...r,
        title: r.category || 'Total',
        start: r.month + '-01',
        end: null,
        legacy: true,
      }));
    const intervals = current.intervalBudgets || [];
    const records = [...legacy, ...intervals];
    renderBudgetAnalysis(records);
    $('budget-spent').textContent =
      FinanceAnalytics.spending(current, month) === null
        ? 'Sin dato'
        : money.format(FinanceAnalytics.spending(current, month));
    if (!records.length)
      parent.append(
        el(
          'p',
          'No hay límites definidos para este mes. Añade uno mensual o con fechas propias.',
          'empty-state',
        ),
      );
    for (const record of records) {
      const b = record.legacy
        ? FinanceAnalytics.budget(current, record)
        : FinanceAnalytics.intervalBudget(current, record);
      const card = el(
        'article',
        undefined,
        'budget-card' + (b.exceeded ? ' budget-exceeded' : ''),
      );
      card.append(
        el(
          'span',
          record.legacy
            ? 'Mes natural · ' + record.month
            : record.end
              ? record.start + ' → ' + record.end
              : record.start + ' → en curso',
          'section-kicker',
        ),
        el('h3', b.spent === null ? 'Sin dato' : money.format(b.spent)),
      );
      card.append(
        el(
          'p',
          (record.title || record.category || 'Límite') +
            ' · de ' +
            money.format(b.amount) +
            ' · ' +
            (b.remaining === null
              ? 'Sin dato'
              : b.exceeded
                ? money.format(-b.remaining) + ' por encima'
                : money.format(b.remaining) + ' de margen al corte'),
        ),
      );
      if (!record.legacy && b.coverage.status !== 'full')
        card.append(
          el('p', intervalCoverageText(b.coverage), 'calculator-note'),
        );
      const progress = el('progress');
      progress.max = Math.max(1, b.amount);
      if (known(b.spent))
        progress.value = Math.max(0, Math.min(b.spent, b.amount));
      progress.setAttribute(
        'aria-label',
        'Gasto de ' + (record.category || 'total del mes'),
      );
      card.append(progress);
      const open = el('button', 'Ver evolución del límite', 'text-button');
      open.type = 'button';
      open.addEventListener('click', () =>
        renderBudgetAnalysis([record], true),
      );
      card.addEventListener('click', (event) => {
        if (!event.target.closest('button, a, input, summary')) open.click();
      });
      card.append(open);
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
              process: record.legacy
                ? 'quitar_presupuesto'
                : 'quitar_presupuesto_intervalo',
              ...(record.legacy
                ? { month: record.month, category: record.category }
                : { id: record.id }),
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
    goals.append(
      el(
        'p',
        'Los objetivos son metas de ahorro respaldadas por asignaciones de activos existentes; no son límites de gasto ni movimientos de dinero.',
        'calculator-note',
      ),
    );
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
      if (known(g.Meta) && known(g.Asignado)) {
        const progress = FinanceAnalytics.goalProgress(current, g);
        const remaining = progress.remaining;
        card.append(
          el(
            'p',
            progress.expired
              ? 'Plazo vencido · revisa la fecha o la meta'
              : known(progress.monthlyPace)
                ? amount(progress.monthlyPace) +
                  ' al mes para la fecha objetivo (ritmo orientativo, sin rendimiento)'
                : 'Sin ritmo mensual calculable',
          ),
        );
        card.append(
          el('p', amount(remaining) + ' pendientes', 'goal-remaining'),
        );
        if (g.Meta > 0)
          card.append(
            el(
              'strong',
              percentage.format((100 * g.Asignado) / g.Meta) + ' % de la meta',
              'goal-ratio',
            ),
          );
      }
      goals.append(card);
    }
    renderGoalAvailability();
    FinanceCharts.clear($('goal-charts'));
    if ((current.tables.tObjetivos || []).length)
      FinanceCharts.plot($('goal-charts'), {
        title: 'Asignación y meta por objetivo',
        rows: current.tables.tObjetivos.map((g) => ({
          label: g.Objetivo,
          assigned: g.Asignado,
          target: g.Meta,
        })),
        fields: [
          {
            key: 'assigned',
            label: 'Asignado',
            shape: 'bar',
            tone: 'chart-mint',
          },
          { key: 'target', label: 'Meta', shape: 'bar', tone: 'chart-blue' },
        ],
        description:
          'Asignación actual de activos; no es un histórico de aportaciones.',
      });
    if (!goals.children.length)
      goals.append(
        el(
          'p',
          'Sin objetivos. Crea una meta y asígnale activos existentes.',
          'empty-state',
        ),
      );
  }
  function coverageNote(coverage) {
    return (
      {
        full: '',
        partial: 'Periodo parcial',
        future: 'Periodo futuro · sin registros',
        prestart: 'Sin registros anteriores al inicio del seguimiento',
        unknown: 'Cobertura sin dato',
      }[coverage.status] || ''
    );
  }
  function intervalCoverageText(coverage) {
    return {
      partial:
        'Seguimiento parcial: solo hay datos desde ' +
        coverage.first +
        '; el gasto total del intervalo es desconocido.',
      prestart: 'El intervalo termina antes del seguimiento; gasto sin dato.',
      future: 'Intervalo futuro: aún no hay gasto observado.',
      ongoing: 'En curso hasta el corte del informe.',
      full: 'Intervalo completo observado.',
      unknown: 'Cobertura del intervalo sin dato.',
    }[coverage.status];
  }
  function renderGoalAvailability() {
    const target = $('goal-availability');
    target.replaceChildren();
    target.append(
      el(
        'p',
        'Las asignaciones son etiquetas de activos existentes: no mueven dinero. Un exceso se avisa y no se redistribuye automáticamente.',
        'calculator-note',
      ),
    );
    for (const o of FinanceAnalytics.goalAvailability(current)) {
      const card = el(
        'article',
        undefined,
        'budget-card' + (o.overallocated ? ' budget-exceeded' : ''),
      );
      card.append(
        el('h3', o.label || labelAccount(o.origin)),
        el('p', 'Disponible al corte ' + amount(o.available)),
        el('p', 'Asignado entre objetivos ' + amount(o.assigned)),
        el(
          'p',
          o.overallocated
            ? 'Sobreasignado ' + amount(-o.free)
            : 'Libre sin asignar ' + amount(o.free),
        ),
      );
      if (!known(o.available))
        card.append(
          el(
            'p',
            'Disponibilidad desconocida: no puede comprobarse el exceso.',
          ),
        );
      target.append(card);
    }
  }
  function renderBudgetAnalysis(records, details = false) {
    const target = $('budget-analysis');
    FinanceCharts.clear(target);
    if (!details || !current || !records.length) return;
    const record = records[0],
      legacy = record.legacy === true;
    const b = legacy
      ? FinanceAnalytics.budget(current, record)
      : FinanceAnalytics.intervalBudget(current, record);
    if (details) {
      $('budget-details').hidden = false;
      $('budget-detail-title').textContent =
        record.title || record.category || 'Límite mensual';
      $('budget-detail-summary').textContent =
        (record.start || record.month + '-01') +
        (record.end
          ? ' → ' + record.end
          : ' → ' + current.settings.asof + ' (en curso)') +
        ' · ' +
        (record.category || 'todas las categorías') +
        ' · límite ' +
        amount(record.amount) +
        ' · gasto propio ' +
        amount(b.spent) +
        ' · ' +
        (b.remaining === null
          ? 'margen sin dato'
          : b.exceeded
            ? 'superado por ' + amount(-b.remaining)
            : 'restan ' + amount(b.remaining)) +
        (legacy ? '' : ' · ' + intervalCoverageText(b.coverage));
    }
    const chartTarget = $('budget-detail-chart');
    FinanceCharts.clear(chartTarget);
    const evolutionRecord = legacy
      ? {
          ...record,
          start: record.month + '-01',
          end: new Date(
            Date.UTC(
              Number(record.month.slice(0, 4)),
              Number(record.month.slice(5)),
              0,
            ),
          )
            .toISOString()
            .slice(0, 10),
        }
      : record;
    const rows = FinanceAnalytics.budgetEvolution(current, evolutionRecord);
    FinanceCharts.plot(chartTarget, {
      title: details
        ? 'Gasto acumulado y límite'
        : 'Límites vigentes · gasto al corte',
      rows,
      fields: [
        {
          key: 'expense',
          label: 'Gasto propio',
          shape: 'step',
          tone: 'chart-copper',
        },
      ],
      reference: { value: record.amount, label: 'Límite' },
      showDataTable: true,
      description:
        b.spent === null
          ? 'Faltan registros para cubrir el periodo completo.'
          : 'Evolución del gasto propio frente al límite.',
    });
  }
  function editBudget(record = null) {
    if (!current?.supportsBudgets) return;
    const select = $('budget-category');
    select.replaceChildren(new Option('Total del mes', ''));
    for (const [value, label] of FinanceDomain.options(
      'categories',
      current,
      'gasto',
      { _allowArchived: Boolean(record), category: record?.category },
    ))
      select.append(new Option(label, value));
    const interval =
      Boolean(record && !record.legacy) ||
      (!record && current.supportsCustomBudgets);
    $('budget-mode').value = interval ? 'interval' : 'month';
    $('budget-mode').disabled = Boolean(record);
    $('budget-legacy-month-wrap').hidden = interval;
    $('budget-title-wrap').hidden = !interval;
    $('budget-start-wrap').hidden = !interval;
    $('budget-end-wrap').hidden = !interval;
    budgetFieldMode(interval);
    $('budget-edit-id').value = record && !record.legacy ? record.id : '';
    $('budget-title-input').value = record?.title || record?.category || '';
    $('budget-start').value = record?.start || month + '-01';
    $('budget-end').value = record?.end || '';
    $('budget-edit-month').value = record?.month || month;
    select.value = record?.category || '';
    $('budget-amount').value = record?.amount ?? '';
    $('budget-error').hidden = true;
    $('budget-dialog').showModal();
    $('budget-amount').focus();
  }
  $('budget-mode').addEventListener('change', () => {
    const interval = $('budget-mode').value === 'interval';
    $('budget-legacy-month-wrap').hidden = interval;
    $('budget-title-wrap').hidden = !interval;
    $('budget-start-wrap').hidden = !interval;
    $('budget-end-wrap').hidden = !interval;
    budgetFieldMode(interval);
    if (interval && !current?.supportsCustomBudgets) {
      $('budget-error').textContent =
        'Actualiza el backend con prepareApplication para crear límites por intervalo.';
      $('budget-error').hidden = false;
    } else $('budget-error').hidden = true;
  });
  function budgetFieldMode(interval) {
    for (const id of ['budget-title-input', 'budget-start', 'budget-end'])
      $(id).disabled = !interval;
    $('budget-title-input').required = interval;
    $('budget-start').required = interval;
    $('budget-edit-month').disabled = interval;
    $('budget-edit-month').required = !interval;
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
      const interval = $('budget-mode').value === 'interval';
      const record = interval
        ? {
            process: 'presupuesto_intervalo',
            id: $('budget-edit-id').value || undefined,
            title: $('budget-title-input').value.trim(),
            start: $('budget-start').value,
            end: $('budget-end').value || null,
            category: $('budget-category').value || null,
            amount,
          }
        : {
            process: 'presupuesto',
            month: $('budget-edit-month').value,
            category: $('budget-category').value || null,
            amount,
          };
      if (interval && !current?.supportsCustomBudgets)
        throw Error(
          'Actualiza el backend con prepareApplication para crear límites por intervalo.',
        );
      if (
        interval &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(record.start) ||
          (record.end &&
            (!/^\d{4}-\d{2}-\d{2}$/.test(record.end) ||
              record.end < record.start)))
      )
        throw Error('Elige un intervalo de fechas válido.');
      if (interval && !record.title)
        throw Error('Escribe un título para el límite.');
      if (!interval && !/^\d{4}-(0[1-9]|1[0-2])$/.test(record.month))
        throw Error('Elige un mes válido.');
      api.review(
        [record],
        interval
          ? 'Límite · ' +
              record.title +
              ' · ' +
              record.start +
              (record.end ? ' → ' + record.end : ' en curso')
          : 'Límite mensual · ' +
              record.month +
              ' · ' +
              (record.category || 'Total del mes'),
      );
    } catch (error) {
      $('budget-error').textContent = error.message;
      $('budget-error').hidden = false;
    }
  });
  function assignmentCurrent() {
    const row = current?.tables?.tAsignaciones?.find(
      (r) =>
        r.Objetivo === $('goal-assign-goal').value &&
        r.Origen === $('goal-assign-origin').value,
    );
    return row ? row.Importe : 0;
  }
  function assignmentNote() {
    $('goal-assign-current').textContent =
      'Asignación existente: ' +
      amount(assignmentCurrent()) +
      '. Establecer sustituye el total; añadir suma el importe al total actual antes de revisarlo.';
  }
  $('goal-assign-new').addEventListener('click', () => {
    if (!current) return;
    selectOptions(
      'goal-assign-goal',
      FinanceDomain.options('goals', current, 'asignacion'),
      '',
    );
    selectOptions(
      'goal-assign-origin',
      FinanceDomain.options('origins', current, 'asignacion'),
      '',
    );
    $('goal-assign-amount').value = '';
    $('goal-assign-mode').value = 'set';
    $('goal-assign-error').hidden = true;
    assignmentNote();
    $('goal-assign-dialog').showModal();
  });
  for (const id of ['goal-assign-goal', 'goal-assign-origin'])
    $(id).addEventListener('change', assignmentNote);
  $('goal-assign-cancel').addEventListener('click', () =>
    $('goal-assign-dialog').close(),
  );
  $('goal-assign-form').addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const value = FinanceDomain.decimal($('goal-assign-amount').value, true);
      const existing = assignmentCurrent();
      if ($('goal-assign-mode').value === 'add' && !known(existing))
        throw Error(
          'La asignación existente es desconocida: establece un total explícito.',
        );
      const total =
        $('goal-assign-mode').value === 'add'
          ? Math.round((existing + value) * 100) / 100
          : value;
      api.review(
        [
          {
            process: 'asignacion',
            goal: $('goal-assign-goal').value,
            origin: $('goal-assign-origin').value,
            amount: total,
          },
        ],
        ($('goal-assign-mode').value === 'add'
          ? 'Añadir ' + amount(value) + ' · total resultante '
          : 'Establecer total ') + amount(total),
      );
      $('goal-assign-dialog').close();
    } catch (error) {
      $('goal-assign-error').textContent = error.message;
      $('goal-assign-error').hidden = false;
    }
  });
  function planCategories(selected = '') {
    selectOptions(
      'plan-category',
      FinanceDomain.options(
        'categories',
        current,
        $('plan-kind').value === 'expense' ? 'gasto' : 'ingreso',
        { _allowArchived: Boolean(planEditing), category: selected },
      ),
      selected,
    );
  }
  function editPlan(record = null) {
    if (!current) return;
    planEditing = record;
    $('plan-kind').value = record?.kind || 'expense';
    $('plan-date').value = record?.date || current.settings.asof;
    $('plan-concept').value = record?.concept || '';
    $('plan-amount').value = record?.amount ?? '';
    selectOptions(
      'plan-account',
      FinanceDomain.options('accounts', current, 'obligacion', {
        _allowArchived: Boolean(record),
        account: record?.account,
      }).map(([value]) => [value, labelAccount(value)]),
      record?.account || '',
    );
    planCategories(record?.category);
    $('plan-error').hidden = true;
    $('plan-dialog').showModal();
  }
  $('plan-new').addEventListener('click', () => editPlan());
  $('plan-kind').addEventListener('change', () => planCategories());
  $('plan-cancel').addEventListener('click', () => $('plan-dialog').close());
  $('plan-form').addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const operation = {
        process: 'obligacion',
        date: $('plan-date').value,
        concept: $('plan-concept').value.trim(),
        account: $('plan-account').value,
        category: $('plan-category').value,
        amount: FinanceDomain.decimal($('plan-amount').value, true),
        kind: $('plan-kind').value,
      };
      if (planEditing) operation.id = planEditing.id;
      if (
        !operation.concept ||
        !operation.account ||
        !operation.category ||
        operation.amount <= 0
      )
        throw Error('Completa el plan con un importe positivo.');
      api.review([operation], 'Plan previsto · ' + operation.concept);
      $('plan-dialog').close();
    } catch (error) {
      $('plan-error').textContent = error.message;
      $('plan-error').hidden = false;
    }
  });
  function renderPlans() {
    const list = $('planned-list');
    list.replaceChildren();
    FinanceCharts.clear($('forecast-chart'));
    $('plan-new').disabled = current?.capabilities?.planned !== true;
    if (!current) {
      $('forecast-note').textContent =
        'Abre el libro para consultar tus planes.';
      return;
    }
    const plans = (current.planned || []).filter((p) => p.active);
    selectedPlans ||= plans.map((p) => p.id);
    for (const p of plans) {
      const card = el('article', undefined, 'budget-card');
      const label = el('label'),
        checkbox = el('input');
      checkbox.type = 'checkbox';
      checkbox.checked = selectedPlans.includes(p.id);
      checkbox.addEventListener('change', () => {
        selectedPlans = checkbox.checked
          ? [...selectedPlans, p.id]
          : selectedPlans.filter((id) => id !== p.id);
        renderPlans();
      });
      label.append(checkbox, document.createTextNode(' Incluir en previsión'));
      card.append(
        el('h3', p.concept),
        el(
          'p',
          p.date +
            ' · ' +
            (p.kind === 'income' ? 'Ingreso' : 'Pago') +
            ' ' +
            amount(p.amount) +
            ' · ' +
            labelAccount(p.account),
        ),
        label,
      );
      const actions = el('div', undefined, 'budget-actions');
      for (const [text, action] of [
        ['Editar', () => editPlan(p)],
        [
          'Quitar',
          () =>
            api.review(
              [{ process: 'quitar_obligacion', id: p.id }],
              'Quitar plan · ' + p.concept,
            ),
        ],
        [
          'Confirmar realizado',
          () =>
            api.review(
              [
                {
                  process: p.kind === 'income' ? 'ingreso' : 'gasto',
                  date: p.date,
                  concept: p.concept,
                  account: p.account,
                  category: p.category,
                  amount: p.amount,
                },
                { process: 'quitar_obligacion', id: p.id },
              ],
              'Registrar realización y cerrar plan · ' + p.concept,
            ),
        ],
      ]) {
        const button = el('button', text, 'text-button');
        button.type = 'button';
        button.addEventListener('click', action);
        actions.append(button);
      }
      card.append(actions);
      list.append(card);
    }
    const forecast = FinanceAnalytics.cashForecast(current, selectedPlans);
    $('forecast-note').textContent =
      'Saldo de partida: ' +
      forecast.asof +
      '. Proyección según fechas, cuentas e importes seleccionados; no es saldo disponible actual. ' +
      (forecast.complete
        ? 'Supuestos completos.'
        : 'Cobertura parcial: cifras desconocidas conservadas.') +
      ' ' +
      forecast.notices.join(' ');
    FinanceCharts.plot($('forecast-chart'), {
      title: 'Liquidez prevista',
      rows: forecast.rows,
      fields: [
        {
          key: 'projected',
          label: 'Proyectado',
          shape: 'step',
          tone: 'chart-lilac',
        },
      ],
      description:
        'Previsión basada en los planes seleccionados. No modifica los saldos del libro.',
    });
  }
  return { render };
})();
