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
    cashEndMonth = null,
    cashMode = 'month',
    cashFrom = null,
    cashTo = null,
    accountMonth = null,
    spendMonth = null,
    spendFrom = null,
    spendTo = null,
    selectedCategories = null,
    histogramWidth = 10,
    ticketMeasure = 0,
    investmentMeasure = 'adjusted',
    product = '',
    range = 'all';
  const emergencySelection = new Map();
  const selectedPeriods = new Set();
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
    return node;
  }
  function ticketCard(parent, statistics, available) {
    const node = stat(parent, '', '');
    node.classList.add('ticket-card');
    const heading = node.querySelector('.kpi-label');
    const label = el('span');
    const draw = () => {
      label.textContent = ['Ticket medio', 'Ticket mediano', 'Ticket moda'][
        ticketMeasure
      ];
      node.querySelector('.kpi-value').textContent = !available
        ? 'Sin dato'
        : ticketMeasure === 0
          ? amount(statistics.mean)
          : ticketMeasure === 1
            ? amount(statistics.median)
            : !statistics.modes.length
              ? 'Sin moda'
              : statistics.modes.map(amount).join(' · ');
    };
    const controls = el('span', undefined, 'ticket-controls');
    for (const [direction, text, accessible] of [
      [-1, '‹', 'Estadístico anterior'],
      [1, '›', 'Estadístico siguiente'],
    ]) {
      const button = el('button', text, 'ticket-arrow');
      button.type = 'button';
      button.setAttribute('aria-label', accessible);
      button.addEventListener('click', () => {
        ticketMeasure = (ticketMeasure + direction + 3) % 3;
        draw();
      });
      controls.append(button);
    }
    heading.replaceChildren(label, controls);
    node.querySelector('.kpi-value').setAttribute('aria-live', 'polite');
    draw();
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
    const period =
      typeof selectedMonth === 'string'
        ? monthPeriod(selectedMonth)
        : selectedMonth;
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
      dateRange: period,
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
        displayDate(period.from) +
        ' – ' +
        displayDate(period.to) +
        '. Saldo al cierre de cada día observado. Selecciona cuentas en la leyenda.',
    });
  }
  function monthPeriod(value) {
    return {
      from: value + '-01',
      to: new Date(
        Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5)), 0),
      )
        .toISOString()
        .slice(0, 10),
    };
  }
  function summaryPeriod() {
    if (cashMode === 'dates') return { from: cashFrom, to: cashTo };
    return {
      from: monthPeriod(cashMonth).from,
      to: monthPeriod(cashMode === 'months' ? cashEndMonth : cashMonth).to,
    };
  }
  function renderSummaryPeriod() {
    $('cash-period-mode').value = cashMode;
    $('cash-month').value = cashMonth;
    $('cash-month-to').value = cashEndMonth;
    $('cash-from').value = cashFrom;
    $('cash-to').value = cashTo;
    $('cash-month-start-wrap').hidden = cashMode === 'dates';
    $('cash-month-end-wrap').hidden = cashMode !== 'months';
    $('cash-from-wrap').hidden = cashMode !== 'dates';
    $('cash-to-wrap').hidden = cashMode !== 'dates';
  }
  function spendingMovements() {
    return FinanceInsights.spendingMovements(current, {
      from: spendFrom,
      to: spendTo,
    });
  }
  function comparisonCell(label, value, unit, explanation = '') {
    const node = el(
      'div',
      undefined,
      'comparison-cell ' +
        (!known(value) || Math.abs(value) < 0.005
          ? 'comparison-neutral'
          : value > 0
            ? 'comparison-positive'
            : 'comparison-negative'),
    );
    node.title = explanation;
    node.append(
      el('span', label),
      el(
        'strong',
        known(value)
          ? (value > 0 ? '+' : '') +
              (unit === '%' ? percentage.format(value) + ' %' : amount(value))
          : '—',
      ),
    );
    if (!known(value))
      node.setAttribute(
        'aria-label',
        label + ': ' + (explanation || 'Histórico insuficiente'),
      );
    return node;
  }
  function renderWealthCard(parent) {
    const card = el('article', undefined, 'kpi wealth-card');
    card.append(el('span', 'Variación del patrimonio', 'kpi-label'));
    const grid = el('div', undefined, 'comparison-grid');
    for (const result of FinanceWealth.comparisons(current))
      grid.append(
        comparisonCell(
          result.months === 12 ? '1A' : result.months + 'M',
          result.pct,
          '%',
          result.reason ||
            `${displayDate(result.previousDate)} – ${displayDate(result.currentDate)} · ${amount(result.change)}`,
        ),
      );
    card.append(grid);
    parent.append(card);
  }
  function showSpendingTransactions(
    category = null,
    date = null,
    city = null,
    bin = null,
    recurring = null,
    chart = null,
    summary = false,
  ) {
    const target =
      chart ||
      document.querySelector('.chart-dialog[open] .chart-card') ||
      $('spending-charts');
    const selectionKey = JSON.stringify([category, date, city, bin, recurring]);
    const existing = target.querySelector('.transaction-selection');
    if (existing?.dataset.selection === selectionKey) {
      existing.open = !existing.open;
      return;
    }
    existing?.remove();
    const rows = (
      summary
        ? FinanceInsights.spendingMovements(current, summaryPeriod())
        : spendingMovements()
    ).filter(
      (r) =>
        (summary ||
          !selectedCategories ||
          selectedCategories.includes(r.category)) &&
        (!category || r.category === category) &&
        (!date || r.date === date) &&
        (!city || r.city === city) &&
        (!recurring || r.recurring === recurring) &&
        (!bin ||
          (r.type === 'Gasto' && r.amount >= bin.low && r.amount < bin.high)),
    );
    const section = el('details', undefined, 'transaction-selection');
    section.dataset.selection = selectionKey;
    section.open = true;
    section.append(
      el(
        'summary',
        category ||
          (date && displayDate(date)) ||
          city ||
          bin?.label ||
          (recurring &&
            (recurring === 'Sí'
              ? 'Gastos recurrentes'
              : 'Gastos no recurrentes')) ||
          'Movimientos seleccionados',
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
      ['amount', 'Importe'],
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
          r.concept || '—',
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
    const selectedPeriod = summaryPeriod();
    renderSummaryPeriod();
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
    const a = FinanceAnalytics.spendingAnalysis(
      current,
      reportMonth,
      selectedPeriod,
    );
    let summaryDistribution;
    summaryDistribution = FinanceCharts.donut(parent, {
      title: cashMode === 'month' ? 'Gastos del mes' : 'Gastos del periodo',
      showDataTable: false,
      onSelect: (row) =>
        showSpendingTransactions(
          row.label,
          null,
          null,
          null,
          null,
          summaryDistribution,
          true,
        ),
      rows: a.categories,
      description:
        displayDate(selectedPeriod.from) +
        ' – ' +
        displayDate(selectedPeriod.to) +
        ' · gasto propio por categoría. El total incluye todas las categorías.',
    });
    cashChart(parent, 'Saldo diario en cuentas', selectedPeriod);
    const flowRows = FinanceInsights.monthlyFlows(current, selectedPeriod).map(
      (r) => {
        const ownExpense = r.expense;
        return {
          ...r,
          expensePlot: ownExpense === null ? null : -ownExpense,
          ratio:
            known(r.income) && r.income > 0 && ownExpense !== null
              ? (ownExpense / r.income) * 100
              : null,
        };
      },
    );
    FinanceCharts.plot(parent, {
      title: 'Ingresos y gastos por mes',
      barMode: 'diverging',
      rows: flowRows,
      fields: [
        { key: 'income', label: 'Ingresos', tone: 'chart-blue', shape: 'bar' },
        {
          key: 'expensePlot',
          label: 'Gastos',
          tone: 'chart-red',
          shape: 'bar',
          inspection: false,
          export: false,
        },
        {
          key: 'expense',
          label: 'Gasto propio',
          tooltipOnly: true,
        },
        {
          key: 'ratio',
          label: 'Gasto / ingreso',
          tooltipOnly: true,
          unit: '%',
        },
      ],
      description:
        'Excluye inversiones, transferencias y pagos de deuda. Si las devoluciones superan los gastos, el saldo neto de gasto aparece sobre cero.',
      showDataTable: false,
    });
    if (known(free) && cashMode === 'month' && cashMonth === reportMonth) {
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
    $('spending-categories').replaceChildren();
    $('spending-note').textContent = '';
    $('spending-range-error').hidden = true;
    for (const id of [
      'spending-from',
      'spending-to',
      'spending-month',
      'spending-month-to',
    ]) {
      $(id).disabled = !current;
      $(id).setAttribute('aria-invalid', 'false');
    }
    if (!current) {
      $('spending-from').value = '';
      $('spending-to').value = '';
      target.append(
        el('p', 'Abre el libro para analizar tus gastos.', 'empty-state'),
      );
      return;
    }
    const fallback = monthPeriod(spendMonth);
    spendFrom ??= fallback.from;
    spendTo ??= fallback.to;
    $('spending-from').value = spendFrom;
    $('spending-to').value = spendTo;
    $('spending-month-to').value = spendTo.slice(0, 7);
    const period = { from: spendFrom, to: spendTo };
    const all = FinanceAnalytics.spendingAnalysis(current, spendMonth, period);
    const categoryNames = [
      ...new Set([
        ...all.categories.map((r) => r.label),
        ...(selectedCategories || []),
      ]),
    ].sort((a, b) => a.localeCompare(b, 'es-ES'));
    const included = selectedCategories ?? categoryNames;
    const categoryControl = $('spending-categories');
    categoryControl.replaceChildren();
    const categoryDetails = el('details');
    categoryDetails.append(
      el(
        'summary',
        selectedCategories === null
          ? 'Todas las categorías'
          : `${included.length} categorías incluidas`,
      ),
    );
    for (const category of categoryNames) {
      const label = el('label', undefined, 'check-field');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = category;
      checkbox.checked = included.includes(category);
      checkbox.addEventListener('change', () => {
        selectedCategories = [
          ...categoryDetails.querySelectorAll('input:checked'),
        ].map((input) => input.value);
        if (selectedCategories.length === categoryNames.length)
          selectedCategories = null;
        renderSpending();
        const next = $('spending-categories').querySelector('details');
        next.open = true;
        [...next.querySelectorAll('input')]
          .find((input) => input.value === category)
          ?.focus();
      });
      label.append(checkbox, document.createTextNode(category));
      categoryDetails.append(label);
    }
    categoryControl.append(categoryDetails);
    $('spending-month').value = spendMonth;
    const a =
      selectedCategories === null
        ? all
        : FinanceAnalytics.spendingAnalysis(current, spendMonth, {
            ...period,
            includeCategories: selectedCategories,
          });
    const shownCategories = a.categories;
    const selectedMovements = spendingMovements().filter(
      (m) =>
        selectedCategories === null || selectedCategories.includes(m.category),
    );
    const knownMovements = selectedMovements.every((m) => known(m.amount));
    const shownTotal = a.total;
    const statistics = FinanceInsights.expenseStatistics(selectedMovements);
    stat(
      $('spending-summary'),
      a.coverage.first && a.coverage.first > spendFrom
        ? 'Gasto observado'
        : 'Gasto propio',
      amount(a.coverage.observed ? shownTotal : null),
      displayDate(spendFrom) +
        ' – ' +
        displayDate(spendTo) +
        (selectedCategories !== null
          ? ` · ${included.length} categorías incluidas`
          : ''),
    );
    ticketCard(
      $('spending-summary'),
      statistics,
      knownMovements && a.coverage.observed,
    );
    stat(
      $('spending-summary'),
      'Mayor gasto',
      amount(
        a.coverage.observed && knownMovements
          ? (statistics.largest?.amount ?? null)
          : null,
      ),
      statistics.largest && knownMovements
        ? statistics.largest.concept +
            ' · ' +
            displayDate(statistics.largest.date)
        : '',
    );
    $('spending-note').textContent =
      a.coverage.observed &&
      (a.coverage.first !== spendFrom || a.coverage.last !== spendTo)
        ? 'Datos del ' +
          displayDate(a.coverage.first) +
          ' al ' +
          displayDate(a.coverage.last)
        : '';
    if (!a.coverage.observed) {
      target.append(el('p', coverageNote(a.coverage), 'empty-state'));
      return;
    }
    let distribution;
    distribution = FinanceCharts.donut(target, {
      title: 'Distribución del gasto',
      rows: shownCategories,
      description:
        'Selecciona una categoría para consultar sus movimientos en el periodo elegido.',
      onSelect: (row) =>
        showSpendingTransactions(
          row.label,
          null,
          null,
          null,
          null,
          distribution,
        ),
      showDataTable: false,
    });
    const histogramRows = FinanceInsights.expenseHistogram(
      selectedMovements,
      histogramWidth,
    );
    const sparseIntervals = histogramRows.some(
      (row, index) => index > 0 && row.low > histogramRows[index - 1].high,
    );
    const histogram = FinanceCharts.plot(target, {
      title: 'Gasto por importe y frecuencia',
      rows: histogramRows,
      xTickRotation: -60,
      xKey: 'x',
      fields: [
        {
          key: 'value',
          label: 'Movimientos',
          shape: 'bar',
          tone: 'chart-copper',
        },
      ],
      unit: 'count',
      xAxisTitle: 'Importe (€)',
      description:
        'Frecuencia de gastos positivos en el periodo y categorías elegidos. Las devoluciones y los importes desconocidos no cuentan como gastos positivos.' +
        (sparseIntervals
          ? ' Se omiten intervalos vacíos para mantener legible este rango; la distancia horizontal conserva los importes reales.'
          : ''),
      showDataTable: false,
      onSelect: (row) => showSpendingTransactions(null, null, null, row),
    });
    const intervalLabel = el('label', 'Intervalo', 'field histogram-interval');
    const interval = el('select');
    interval.setAttribute('aria-label', 'Intervalo de gasto en euros');
    for (const width of [5, 10, 20, 50, 100])
      interval.append(new Option(width + ' €', String(width)));
    interval.value = String(histogramWidth);
    interval.addEventListener('change', () => {
      histogramWidth = Number(interval.value);
      renderSpending();
      $('spending-charts')
        .querySelector('[aria-label="Intervalo de gasto en euros"]')
        ?.focus();
    });
    intervalLabel.append(interval);
    histogram.querySelector('.chart-heading').after(intervalLabel);
    FinanceCharts.plot(target, {
      title:
        spendFrom.slice(0, 7) === spendTo.slice(0, 7)
          ? 'Gasto del mes'
          : 'Gasto del periodo',
      rows: a.daily,
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
      horizontal: true,
      rows: a.cities.map((row) => ({
        ...row,
        tone: row.label === 'Sin ciudad' ? 'chart-unclassified' : 'chart-city',
      })),
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
      rows: a.recurring,
      description: 'Se utiliza la clasificación guardada en cada movimiento.',
      showDataTable: false,
      onSelect: (row) =>
        showSpendingTransactions(
          null,
          null,
          null,
          null,
          row.label === 'Recurrente' ? 'Sí' : 'No',
        ),
    });
    const monthChart = [...target.children].find((node) =>
      /^Gasto del (mes|periodo)$/.test(
        node.querySelector('h3')?.textContent || '',
      ),
    );
    if (monthChart) target.prepend(monthChart);
  }
  function renderInvestments() {
    const target = $('investment-charts');
    FinanceCharts.clear(target);
    FinanceCharts.clear($('portfolio-analysis-charts'));
    $('portfolio-analysis-note').textContent = '';
    $('investment-kpis').replaceChildren();
    $('investment-average-returns').replaceChildren();
    $('investment-health').replaceChildren();
    $('investment-comparisons').replaceChildren();
    $('investment-balance-date').textContent = '';
    $('prices-history-note').textContent = '';
    if (!current) {
      target.append(
        el('p', 'Abre el libro para consultar tu cartera.', 'empty-state'),
      );
      $('investment-coverage').textContent = '';
      return;
    }
    renderBalanceComparisons(
      $('investment-comparisons'),
      FinanceWealth.investmentComparisons(current),
      'investment',
    );
    $('investment-balance-date').textContent =
      'Valoración al ' +
      displayDate(current.settings.valuation || current.settings.asof);
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
    const relative =
      known(metrics.gain) && known(metrics.capital) && metrics.capital > 0
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
    const fullTimeline =
      range === 'all'
        ? timeline
        : FinanceAnalytics.investmentTimeline(current, {
            productId: product || null,
            range: 'all',
          });
    const chartRows = fullTimeline.rows;
    const series = FinancePortfolio.returnSeries(fullTimeline);
    renderAverageReturns(series.rows, series.estimated);
    const chartRange = {
      from: timeline.coverage.selectedStartDate,
      to: timeline.coverage.selectedEndDate,
    };
    const productName = product
      ? (current.tables.tProductos || []).find((p) => p.ID === product)
          ?.Producto
      : 'Cartera';
    $('investment-coverage').textContent = '';
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
    if (!series.estimated && investmentMeasure === 'adjusted')
      investmentMeasure = 'twr';
    investmentMeasure = selectOptions(
      'investment-measure',
      [
        ...(series.estimated
          ? [['adjusted', 'Rentabilidad ajustada (estimada)']]
          : []),
        ['result', 'Resultado / aportación neta'],
        ['twr', 'TWR exacto'],
        ...(product ? [['nav', 'Variación del valor liquidativo']] : []),
      ],
      investmentMeasure,
    );
    const resultMeasure = investmentMeasure === 'result';
    const navMeasure = investmentMeasure === 'nav';
    const adjustedMeasure = investmentMeasure === 'adjusted';
    const performance = FinanceCharts.plot(target, {
      title: resultMeasure
        ? 'Resultado sobre aportación neta'
        : navMeasure
          ? 'Variación del valor liquidativo'
          : 'Rentabilidad ajustada de la cartera',
      rows: adjustedMeasure
        ? chartRows.filter((r) => known(r.adjustedReturnPct))
        : chartRows,
      dateRange: chartRange,
      unit: '%',
      emptyMessage: resultMeasure
        ? 'Resultado no disponible con los importes registrados'
        : adjustedMeasure
          ? 'Rentabilidad estimada no disponible con las valoraciones y flujos registrados'
          : navMeasure
            ? 'Sin cotizaciones reales en este periodo'
            : 'TWR no disponible con los cortes y flujos registrados',
      fields: [
        {
          key: adjustedMeasure
            ? 'adjustedReturnPct'
            : resultMeasure
              ? 'resultOnCapitalPct'
              : navMeasure
                ? 'returnPct'
                : 'totalReturnPct',
          connectGaps: true,
          label: adjustedMeasure
            ? 'Rentabilidad ajustada (estimada)'
            : resultMeasure
              ? 'Resultado / aportación neta'
              : navMeasure
                ? 'Variación de VL'
                : timeline.coverage.returnStartDate
                  ? 'TWR exacto desde ' + timeline.coverage.returnStartDate
                  : 'TWR exacto',
          tone: 'chart-mint',
        },
      ],
      description: adjustedMeasure
        ? 'Estimación con Dietz modificado entre valoraciones reales: pondera aportaciones y retiradas por los días invertidos, con flujos al cierre. Incluye cobros netos una sola vez. No inventa VL ni cambia fechas. El TWR exacto se consulta por separado; la estimación depende de las fechas registradas y puede diferir del broker.'
        : resultMeasure
          ? '100 × (valor de mercado − aportación neta + cobros netos) / aportación neta. Usa el último VL guardado de cada fondo; no es TWR ni rentabilidad anualizada. Sin capital neto positivo, no se calcula. Cambia la medida para consultar el TWR o la variación del VL.'
          : navMeasure
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
    if (!resultMeasure && !navMeasure && !adjustedMeasure) {
      const diagnostic = FinancePortfolio.exactDiagnostics(
        current,
        fullTimeline,
        product || null,
      );
      if (!diagnostic.complete)
        performance
          .querySelector('.chart-heading')
          .after(
            el(
              'p',
              'TWR incompleto' +
                (diagnostic.last
                  ? ': solo hasta ' + displayDate(diagnostic.last)
                  : '') +
                '. Faltan valoraciones en fechas con operaciones' +
                (diagnostic.missing.length
                  ? ': ' + diagnostic.missing.map(displayDate).join(', ')
                  : '') +
                '.',
              'chart-warning',
            ),
          );
    }
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
    $('prices-history-note').textContent = '';
    renderPortfolioAnalysis(
      { ...fullTimeline, rows: series.rows },
      chartRange,
      series.estimated,
    );
  }
  function renderPortfolioAnalysis(timeline, bounds, estimated) {
    const target = $('portfolio-analysis-charts');
    const analysis = FinancePortfolio.analyze(current, timeline, {
      productId: product || null,
      ...bounds,
    });
    const scope = product
      ? (current.tables.tProductos || []).find((p) => p.ID === product)
          ?.Producto
      : 'Cartera';
    $('portfolio-analysis-note').textContent = analysis.opening
      ? scope +
        ' · ' +
        displayDate(analysis.opening) +
        ' – ' +
        displayDate(analysis.ending)
      : 'Sin valoraciones completas en el periodo.';
    const monthly = FinancePortfolio.averageReturns(
      timeline.rows.filter((r) => r.date >= bounds.from && r.date <= bounds.to),
    );
    FinanceCharts.plot(target, {
      title: 'Rentabilidad por mes',
      rows: monthly.periods.map((p) => ({
        label: p.period,
        value: p.value,
        tone: p.value < 0 ? 'chart-red' : 'chart-mint',
      })),
      unit: '%',
      xAxisTitle: 'Mes',
      xTickRotation: -45,
      fields: [
        {
          key: 'value',
          label: estimated ? 'Rentabilidad mensual (estimada)' : 'TWR mensual',
          shape: 'bar',
          tone: 'chart-mint',
        },
      ],
      description:
        'Cada barra muestra la rentabilidad del mes: (índice final / índice inicial − 1) × 100. ' +
        (estimated
          ? 'Usa la estimación Dietz porque el TWR completo no está disponible. '
          : 'Usa el TWR entre valoraciones reales, con flujos al cierre. ') +
        'Ingresar dinero sin variación de precios no genera rentabilidad. Verde para ganancias y rojo para pérdidas. El primer y último mes pueden ser parciales; se omiten periodos sin datos.',
      emptyMessage:
        'Sin dos valoraciones que permitan medir una rentabilidad mensual en este periodo.',
    });
    const tir = FinanceCharts.plot(target, {
      title: 'TIR anualizada',
      rows: analysis.xirrRows,
      unit: '%',
      fields: [{ key: 'value', label: 'TIR anualizada', tone: 'chart-blue' }],
      description:
        'Rentabilidad personal: pondera cuánto dinero aportaste y cuándo. XIRR con fechas reales y año de 365 días. Compras negativas, ventas y cobros netos positivos, más el valor final. Los traspasos internos no son aportaciones a la cartera. En periodos posteriores al inicio usa el valor de mercado inicial, no el coste de compra. No anualiza menos de 30 días. Con varios cambios de signo no elige una raíz arbitraria.',
      emptyMessage:
        'TIR no disponible: requiere al menos 30 días y flujos con una solución única.',
    });
    const last = analysis.xirrRows.at(-1);
    tir
      .querySelector('.chart-heading')
      .after(
        el(
          'p',
          known(last?.value)
            ? percentage.format(last.value) +
                ' % anual · a ' +
                displayDate(last.date)
            : last?.status === 'nonconventional'
              ? 'Sin TIR única acreditada: hay varios cambios de signo en los flujos.'
              : 'Sin TIR calculable al último corte.',
          'chart-description',
        ),
      );
    const flowDetails = el('details', undefined, 'chart-data');
    flowDetails.append(el('summary', 'Flujos de la TIR al último corte'));
    const flowWrap = el('div', undefined, 'table-responsive');
    const flowTable = el('table', undefined, 'chart-table');
    const flowHead = el('tr');
    flowHead.append(el('th', 'Fecha'), el('th', 'Importe'));
    flowTable.append(flowHead);
    const ending = timeline.rows.find((r) => r.date === analysis.ending);
    for (const f of [
      ...analysis.flows,
      ...(ending ? [{ date: ending.date, amount: ending.value }] : []),
    ]) {
      const tr = el('tr');
      tr.append(
        el('td', displayDate(f.date)),
        el('td', known(f.amount) ? amount(f.amount) : 'Sin dato'),
      );
      flowTable.append(tr);
    }
    flowWrap.append(flowTable);
    flowDetails.append(flowWrap);
    tir.append(flowDetails);
    const dd = FinanceCharts.plot(target, {
      title: 'Caídas desde máximos',
      rows: analysis.drawdowns.rows,
      unit: '%',
      fields: [
        { key: 'drawdown', label: 'Caída', tone: 'chart-red', area: true },
      ],
      description:
        'Caída del índice de rentabilidad ' +
        (estimated ? 'estimada con Dietz' : 'TWR') +
        ' frente a su máximo previo dentro del periodo seleccionado. Las aportaciones no crean máximos artificiales. Se calcula solo en valoraciones completas; puede omitir caídas entre cotizaciones.',
    });
    const max = analysis.drawdowns.max;
    if (max)
      dd.querySelector('.chart-heading').after(
        el(
          'p',
          'Máxima: ' +
            percentage.format(max.value) +
            ' %' +
            (max.value < 0
              ? ' · ' +
                displayDate(max.peak) +
                ' → ' +
                displayDate(max.trough) +
                (analysis.drawdowns.recovery
                  ? ' · recuperada el ' +
                    displayDate(analysis.drawdowns.recovery)
                  : ' · sin recuperar al corte')
              : ''),
          'chart-description',
        ),
      );
    FinanceCharts.plot(target, {
      title: 'Tiempo bajo máximos',
      rows: analysis.drawdowns.rows,
      unit: 'Días',
      fields: [
        {
          key: 'underwaterDays',
          unit: 'count',
          label: 'Días desde el máximo',
          tone: 'chart-lilac',
        },
      ],
      description:
        'Días naturales desde el último máximo de rentabilidad ' +
        (estimated ? 'estimada con Dietz' : 'TWR') +
        '. Vuelve a cero cuando lo recupera. Se reinicia al comienzo del periodo seleccionado.',
    });
    FinanceCharts.plot(target, {
      title: 'Contribución al resultado',
      horizontal: true,
      rows: analysis.contributions.map((row) => ({
        ...row,
        tone: row.value < 0 ? 'chart-red' : 'chart-mint',
      })),
      fields: [
        {
          key: 'value',
          label: 'Resultado por fondo',
          shape: 'bar',
          tone: 'chart-mint',
        },
      ],
      description:
        'Euros de resultado de cada fondo en el periodo: valor final − valor inicial − compras + ventas + cobros netos. Desde el origen el valor inicial es cero; en otro periodo se usa el valor de mercado de apertura. Los traspasos son flujos de cada fondo y se cancelan en la cartera. No es la cantidad aportada ni una atribución porcentual del TWR.',
    });
    const risk = analysis.risk;
    const sample =
      risk.count >= 12
        ? risk.count +
          ' rendimientos semanales · ' +
          displayDate(risk.from) +
          ' – ' +
          displayDate(risk.to) +
          (risk.short ? ' · muestra corta; provisional' : '')
        : 'Histórico insuficiente: se necesitan 12 rendimientos semanales comparables.';
    const vol = FinanceCharts.plot(target, {
      title: 'Volatilidad anualizada',
      horizontal: true,
      rows: risk.volatility,
      unit: '%',
      fields: [
        {
          key: 'value',
          label: 'Volatilidad',
          shape: 'bar',
          tone: 'chart-gold',
        },
      ],
      emptyMessage: 'Sin una muestra suficiente de cotizaciones comunes.',
      description:
        'Desviación típica muestral de rendimientos semanales × √52. Último VL real común de cada semana completa, en EUR; se omiten semanas sin datos y no se conectan huecos. Misma muestra para todos los fondos incluidos. Los VL no incluyen distribuciones en efectivo. La cartera utiliza su índice ' +
        (estimated ? 'estimado con Dietz' : 'TWR') +
        '. De 12 a 51 observaciones es provisional; no predice pérdidas futuras.',
    });
    vol
      .querySelector('.chart-heading')
      .after(
        el(
          'p',
          sample +
            (risk.excluded.length
              ? ' · Sin muestra: ' + risk.excluded.join(', ')
              : ''),
          'chart-description',
        ),
      );
    const matrix = el('article', undefined, 'chart-card correlation-card');
    matrix.append(
      el('h3', 'Correlación entre fondos'),
      el('p', sample, 'chart-description'),
    );
    matrix.append(
      el(
        'p',
        'VL en EUR · −1: opuestos · 0: sin relación lineal · +1: juntos.',
        'chart-description',
      ),
    );
    if (risk.products.length < 2 || risk.count < 12)
      matrix.append(
        el(
          'p',
          'Se necesitan dos fondos con histórico común suficiente.',
          'empty-state',
        ),
      );
    else {
      const wrap = el('div', undefined, 'table-responsive');
      const table = el('table', undefined, 'chart-table correlation-table');
      table.append(
        el(
          'caption',
          'Correlación de Pearson sobre la misma muestra semanal de VL. No incluye distribuciones en efectivo.',
        ),
      );
      const head = el('tr');
      head.append(el('th', 'Fondo'));
      for (const p of risk.products) {
        const th = el('th', p.Producto);
        th.scope = 'col';
        head.append(th);
      }
      const thead = el('thead');
      thead.append(head);
      table.append(thead);
      const tbody = el('tbody');
      for (const p of risk.products) {
        const tr = el('tr');
        const th = el('th', p.Producto);
        th.scope = 'row';
        tr.append(th);
        for (const q of risk.products) {
          const pair = risk.correlations.find(
            (r) =>
              (r.a === p.ID && r.b === q.ID) || (r.b === p.ID && r.a === q.ID),
          );
          const value =
            p.ID === q.ID
              ? FinancePortfolio.correlation(
                  risk.observations.map(
                    (o) => o.values[risk.products.indexOf(p)],
                  ),
                  risk.observations.map(
                    (o) => o.values[risk.products.indexOf(p)],
                  ),
                )
              : pair?.value;
          tr.append(
            el(
              'td',
              known(value) ? percentage.format(value) : 'Sin dato',
              known(value)
                ? value > 0.6
                  ? 'correlation-high'
                  : value < -0.6
                    ? 'correlation-low'
                    : 'correlation-neutral'
                : '',
            ),
          );
        }
        tbody.append(tr);
      }
      table.append(tbody);
      wrap.append(table);
      matrix.append(wrap);
    }
    target.append(matrix);
  }
  function renderAverageReturns(rows, estimated) {
    const target = $('investment-average-returns');
    const cards = el('div', undefined, 'kpi-grid');
    const data = [
      ['month', 'Media mensual' + (estimated ? ' (estimada)' : ''), 'meses'],
      ['year', 'Media anual' + (estimated ? ' (estimada)' : ''), 'años'],
    ].map(([frequency, title, unit]) => {
      const result = FinancePortfolio.averageReturns(rows, frequency);
      stat(
        cards,
        title,
        known(result.value)
          ? percentage.format(result.value) + ' %'
          : 'Sin dato',
        result.periods.length +
          ' ' +
          unit +
          ' con registros · incluye periodos parciales',
      );
      return { title, ...result };
    });
    target.append(cards);
    const details = el('details', undefined, 'section-details');
    details.append(el('summary', 'Cómo se calcula y desglose'));
    details.append(
      el(
        'p',
        'Media aritmética de las rentabilidades de cada mes o año con registros, incluidos el primero y el último aunque estén incompletos. El TWR acumulado encadena los periodos; esta media los suma y divide entre su número, por lo que son medidas distintas. Conserva las pérdidas con signo negativo. Usa todo el histórico del producto o cartera seleccionados, hasta su última valoración real. Se basa en ' +
          (estimated ? 'la estimación Dietz' : 'el TWR') +
          ': cada periodo es (índice final / índice inicial − 1) × 100. La media anual no anualiza años parciales ni multiplica por doce la mensual. Los periodos sin observaciones se omiten; no se rellenan con ceros.',
      ),
    );
    for (const result of data) {
      const wrap = el('div', undefined, 'table-responsive');
      const table = el('table', undefined, 'chart-table');
      table.append(el('caption', result.title));
      const head = el('thead');
      const heading = el('tr');
      for (const label of ['Periodo', 'Desde', 'Hasta', 'Rentabilidad'])
        heading.append(el('th', label));
      head.append(heading);
      table.append(head);
      const body = el('tbody');
      for (const p of result.periods) {
        const tr = el('tr');
        for (const value of [
          p.period,
          displayDate(p.from),
          displayDate(p.to),
          percentage.format(p.value) + ' %',
        ])
          tr.append(el('td', value));
        body.append(tr);
      }
      table.append(body);
      wrap.append(table);
      details.append(wrap);
    }
    target.append(details);
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
      const quote = evidence?.lastValid;
      const card = el('article', undefined, 'budget-card');
      card.append(
        el('h3', p.name),
        el(
          'p',
          p.lastQuote
            ? displayDate(p.lastQuote) + ' · ' + p.quoteCount + ' cotizaciones'
            : 'Sin cotizaciones en el periodo',
        ),
      );
      const details = el('details');
      details.append(el('summary', 'Ver procedencia'));
      details.append(
        el('p', 'ISIN ' + (evidence?.isin || p.product) + ' · EUR'),
      );
      if (quote?.source) details.append(el('p', quote.source));
      if (quote?.evidence?.checkedAt)
        details.append(el('p', 'Comprobado: ' + quote.evidence.checkedAt));
      if (!quote)
        details.append(el('p', 'Sin evidencia vinculada al último precio.'));
      card.append(details);
      target.append(card);
    }
  }

  function renderBalanceComparisons(target, rows, kind) {
    for (const row of rows) {
      const card = el(
        'article',
        undefined,
        'budget-card ' + kind + '-balance-card',
      );
      card.dataset[kind === 'account' ? 'account' : 'product'] =
        row.account || row.product;
      if (row.total) card.classList.add('balance-total');
      card.append(
        el(
          'h3',
          row.total
            ? 'Total'
            : kind === 'account'
              ? labelAccount(row.account)
              : row.name,
        ),
        el('strong', amount(row.current), 'account-balance'),
      );
      const grid = el('div', undefined, 'comparison-grid');
      for (const window of row.windows)
        grid.append(
          comparisonCell(
            window.label,
            window.change,
            'EUR',
            window.reason ||
              (kind === 'account' ? 'Saldo al ' : 'Valor al ') +
                displayDate(window.to) +
                ' − ' +
                (kind === 'account' ? 'saldo' : 'valor') +
                ' al inicio del ' +
                displayDate(window.from) +
                ': ' +
                amount(window.previous) +
                (window.priceDate
                  ? ' · VL del ' + displayDate(window.priceDate)
                  : ''),
          ),
        );
      card.append(grid);
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
    $('account-month').value = accountMonth;
    renderBalanceComparisons(
      $('account-comparisons'),
      FinanceWealth.accountComparisons(current),
      'account',
    );
    $('account-balance-date').textContent =
      'Saldos al ' + displayDate(current.settings.asof);
    const latestObserved = new Map();
    for (const o of current.observations || [])
      if (
        o.date.startsWith(accountMonth) &&
        o.date >= current.settings.start &&
        o.date <= current.settings.asof &&
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
      (sum, o) => sum + Math.abs(o.difference),
      0,
    );
    stat(
      $('account-summary'),
      'Cuentas contrastadas',
      `${observed.length} de ${(current.tables.tCuentas || []).length}`,
      'Último cierre comparable de cada cuenta',
    );
    stat(
      $('account-summary'),
      'Diferencias por revisar',
      String(observed.filter((o) => o.difference !== 0).length),
      'Cuentas con un descuadre registrado',
    );
    stat(
      $('account-summary'),
      'Descuadre total',
      observed.length ? amount(reconciledDifference) : 'Sin dato',
      'Suma absoluta, sin compensar diferencias entre cuentas',
    );
    $('account-reconciliation').hidden = !(current.observations || []).length;
    $('account-cut').textContent = coverageNote(
      FinanceAnalytics.monthCoverage(current, accountMonth),
    );
    FinanceCharts.plot(target, {
      title: 'Diferencias por cuenta',
      horizontal: true,
      rows: observed.map((observation) => ({
        label: labelAccount(observation.account),
        value: observation.difference,
      })),
      fields: [
        {
          key: 'value',
          label: 'Calculado menos observado',
          shape: 'bar',
          tone: 'chart-red',
        },
      ],
      emptyMessage: 'Registra un cierre bancario para contrastar los saldos.',
      description:
        'Último cierre comparable de cada cuenta en el mes elegido. Una diferencia positiva indica que el libro registra más dinero que el banco.',
    });
  }
  function renderSalary() {
    const target = $('salary-charts');
    FinanceCharts.clear(target);
    $('salary-cut').textContent = '';
    if (!current) return;
    const rows = FinanceAnalytics.salarySavings(current).map((r) => ({
      ...r,
      date: r.month + '-01',
      value: r.payroll,
      label: r.month + (!r.registered ? ' · sin nómina registrada' : ''),
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
      selectedPeriods.clear();
      month = null;
      cashMonth = null;
      cashEndMonth = null;
      cashFrom = null;
      cashTo = null;
      cashMode = 'month';
      ticketMeasure = 0;
      accountMonth = null;
      selectedPlans = null;
      spendMonth = null;
      spendFrom = null;
      spendTo = null;
      product = '';
      selectedCategories = null;
      range = 'all';
      investmentMeasure = 'adjusted';
      planEditing = null;
      for (const id of ['goal-assign-dialog', 'plan-dialog', 'budget-dialog'])
        if ($(id).open) $(id).close();
    }
    if (
      current?.settings.asof.slice(0, 7) !== snapshot?.settings.asof.slice(0, 7)
    ) {
      if (!selectedPeriods.has('summary')) {
        cashMonth = cashEndMonth = cashFrom = cashTo = null;
      }
      if (!selectedPeriods.has('spending')) {
        spendMonth = spendFrom = spendTo = null;
      }
      if (!selectedPeriods.has('accounts')) accountMonth = null;
      if (!selectedPeriods.has('budgets')) month = null;
    }
    current = snapshot;
    api = handlers;
    if (current) {
      const reportMonth = current.settings.asof.slice(0, 7);
      month ||= reportMonth;
      cashMonth ||= reportMonth;
      cashEndMonth ||= cashMonth;
      cashFrom ||= monthPeriod(cashMonth).from;
      cashTo ||= monthPeriod(cashMonth).to;
      accountMonth ||= reportMonth;
      spendMonth ||= reportMonth;
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
        if (cashEndMonth < v) cashEndMonth = v;
        $('cash-range-error').hidden = true;
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
        spendFrom = null;
        spendTo = null;
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
      'investment-measure',
      (v) => {
        investmentMeasure = v;
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
      if (!current) return;
      if (
        id.endsWith('-month') &&
        !/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value)
      )
        return;
      const section = {
        'cash-month': 'summary',
        'account-month': 'accounts',
        'spending-month': 'spending',
      }[id];
      if (section) selectedPeriods.add(section);
      update(event.target.value);
    });
  for (const id of ['spending-from', 'spending-to'])
    $(id).addEventListener('change', () => {
      const from = $('spending-from').value;
      const to = $('spending-to').value;
      const invalid = !from || !to || from > to;
      const error = $('spending-range-error');
      error.hidden = !invalid;
      error.textContent = invalid
        ? 'Indica dos fechas con el inicio anterior o igual al final.'
        : '';
      for (const key of ['spending-from', 'spending-to'])
        $(key).setAttribute('aria-invalid', String(invalid));
      if (invalid) return;
      selectedPeriods.add('spending');
      spendFrom = from;
      spendTo = to;
      spendMonth = from.slice(0, 7);
      renderSpending();
    });
  $('spending-month-to').addEventListener('change', (event) => {
    if (!current || !/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value)) return;
    const from = monthPeriod(spendMonth).from;
    const to = monthPeriod(event.target.value).to;
    if (from > to) {
      $('spending-range-error').textContent =
        'El mes final debe ser igual o posterior al inicial.';
      $('spending-range-error').hidden = false;
      return;
    }
    spendFrom = from;
    spendTo = to;
    selectedPeriods.add('spending');
    renderSpending();
  });
  $('cash-period-mode').addEventListener('change', (event) => {
    if (!current) return;
    selectedPeriods.add('summary');
    const previousPeriod = summaryPeriod();
    cashMode = event.target.value;
    cashFrom = previousPeriod.from;
    cashTo = previousPeriod.to;
    $('cash-range-error').hidden = true;
    renderSummary();
  });
  $('cash-month-to').addEventListener('change', (event) => {
    if (!current || !/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value)) return;
    if (event.target.value < cashMonth) {
      $('cash-range-error').textContent =
        'El mes final debe ser igual o posterior al inicial.';
      $('cash-range-error').hidden = false;
      return;
    }
    cashEndMonth = event.target.value;
    selectedPeriods.add('summary');
    $('cash-range-error').hidden = true;
    renderSummary();
  });
  for (const id of ['cash-from', 'cash-to'])
    $(id).addEventListener('change', () => {
      if (!current) return;
      const from = $('cash-from').value;
      const to = $('cash-to').value;
      const invalid = !from || !to || from > to;
      $('cash-range-error').hidden = !invalid;
      $('cash-range-error').textContent = invalid
        ? 'Indica un inicio anterior o igual al final.'
        : '';
      if (invalid) return;
      selectedPeriods.add('summary');
      cashFrom = from;
      cashTo = to;
      renderSummary();
    });
  function renderBudgets() {
    const parent = $('budget-cards');
    parent.replaceChildren();
    $('saving-goals').replaceChildren();
    $('goal-summary').replaceChildren();
    $('goal-resources').hidden = true;
    $('goal-availability').replaceChildren();
    $('emergency-fund').replaceChildren();
    FinanceCharts.clear($('budget-analysis'));
    FinanceCharts.clear($('goal-charts'));
    FinanceCharts.clear($('budget-detail-chart'));
    $('budget-details').hidden = true;
    $('budget-detail-stats').replaceChildren();
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
        end: monthPeriod(r.month).to,
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
        el('p', 'Aún no has creado límites de gasto.', 'empty-state'),
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
              ? displayDate(record.start) + ' – ' + displayDate(record.end)
              : 'Desde ' + displayDate(record.start) + ' · sin fecha final',
          'section-kicker',
        ),
        el('h3', record.title || record.category || 'Límite de gasto'),
      );
      card.append(
        el(
          'p',
          amount(b.spent) +
            ' de ' +
            amount(b.amount) +
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
        'Gasto de ' + (record.category || 'todo el periodo'),
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
          'Quitar límite · ' +
            (record.title || record.category || 'Total del periodo'),
        ),
      );
      actions.append(edit, remove);
      card.append(actions);
      parent.append(card);
    }
    renderGoals();
  }
  function renderGoals() {
    const parent = $('saving-goals');
    const goals = current.tables.tObjetivos || [];
    $('goal-summary').replaceChildren();
    $('goal-resources').hidden = false;
    renderGoalAvailability();
    renderEmergencyFund();
    if (!goals.length) {
      parent.append(
        el(
          'p',
          'Sin objetivos. Crea una meta y reserva parte de tus activos para ella.',
          'empty-state',
        ),
      );
      return;
    }
    const sum = (values) =>
      values.every(known)
        ? values.reduce((total, value) => total + value, 0)
        : null;
    const states = goals.map((goal) =>
      FinanceAnalytics.goalProgress(current, goal),
    );
    const completed = states.filter((state) => state.remaining === 0).length;
    stat(
      $('goal-summary'),
      'Objetivos',
      String(goals.length),
      completed + (completed === 1 ? ' completado' : ' completados'),
    );
    stat(
      $('goal-summary'),
      'Reservado',
      amount(sum(goals.map((goal) => goal.Asignado))),
    );
    stat(
      $('goal-summary'),
      'Pendiente de reservar',
      amount(sum(states.map((state) => state.remaining))),
    );
    const origins = new Map(
      FinanceAnalytics.goalAvailability(current).map((origin) => [
        origin.origin,
        origin.label || labelAccount(origin.origin),
      ]),
    );
    for (const [index, goal] of goals.entries()) {
      const state = states[index];
      const card = el('article', undefined, 'budget-card goal-card');
      card.dataset.goalId = goal.ID;
      const completed = state.remaining === 0;
      card.append(
        el(
          'span',
          completed
            ? 'Completado'
            : state.expired
              ? 'Plazo vencido'
              : 'En curso',
          'section-kicker',
        ),
        el('h3', goal.Objetivo),
      );
      const amounts = el('div', undefined, 'goal-amounts');
      amounts.append(
        el('strong', amount(goal.Asignado)),
        el('span', 'de ' + amount(goal.Meta)),
      );
      card.append(amounts);
      if (known(goal.Meta) && goal.Meta > 0 && known(goal.Asignado)) {
        const progress = el('progress');
        progress.max = goal.Meta;
        progress.value = Math.max(0, Math.min(goal.Asignado, goal.Meta));
        progress.setAttribute(
          'aria-label',
          'Ahorro asignado a ' + goal.Objetivo,
        );
        card.append(
          progress,
          el(
            'strong',
            percentage.format((100 * goal.Asignado) / goal.Meta) +
              ' % de la meta',
            'goal-ratio',
          ),
        );
      }
      card.append(
        el(
          'p',
          known(state.remaining)
            ? amount(state.remaining) + ' pendientes'
            : 'Importe pendiente sin dato',
          'goal-remaining',
        ),
        el(
          'p',
          goal.Fecha
            ? 'Fecha objetivo: ' + displayDate(goal.Fecha)
            : 'Sin fecha objetivo',
          'calculator-note',
        ),
      );
      if (!completed && known(state.monthlyPace))
        card.append(
          el(
            'p',
            amount(state.monthlyPace) + ' al mes para llegar a tiempo',
            'goal-pace',
          ),
        );
      else if (state.expired)
        card.append(el('p', 'Revisa la fecha o la meta.', 'calculator-note'));
      const assignments = (current.tables.tAsignaciones || []).filter(
        (assignment) => assignment.Objetivo === goal.ID,
      );
      FinanceCharts.table(card, {
        title: 'Asignaciones de ' + goal.Objetivo,
        rows: assignments.map((assignment) => ({
          label: origins.get(assignment.Origen) || assignment.Origen,
          value: assignment.Importe,
        })),
        fields: [{ key: 'value', label: 'Reservado EUR' }],
        firstColumn: 'Activo',
        toggleLabel: 'Ver asignaciones',
      });
      parent.append(card);
    }
    FinanceCharts.plot($('goal-charts'), {
      title: 'Asignación y meta por objetivo',
      horizontal: true,
      rows: goals.map((goal) => ({
        label: goal.Objetivo,
        assigned: goal.Asignado,
        target: goal.Meta,
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
        'Reservas actuales frente a cada meta; no es un histórico de aportaciones.',
    });
    FinanceCharts.donut($('goal-charts'), {
      title: 'Reservas por activo',
      rows: FinanceAnalytics.goalAvailability(current)
        .filter((origin) => !known(origin.assigned) || origin.assigned !== 0)
        .map((origin) => ({
          label: origins.get(origin.origin),
          value: origin.assigned,
        })),
      description:
        'Reparto de las cantidades reservadas. Una reserva etiqueta activos y no mueve dinero.',
    });
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
    const origins = FinanceAnalytics.goalAvailability(current);
    const excess = origins.filter((origin) => origin.overallocated).length;
    const unknown = origins.filter(
      (origin) => !known(origin.available) && origin.assigned !== 0,
    ).length;
    $('goal-resources-summary').textContent = excess
      ? `Activos reservados · ${excess} con exceso de asignación`
      : unknown
        ? 'Activos reservados · hay disponibilidad sin dato'
        : 'Activos reservados y disponibles';
    $('goal-resources').open = excess > 0 || unknown > 0;
    for (const [kind, title] of [
      ['account', 'Cuentas'],
      ['product', 'Inversiones'],
      ['unknown', 'Activos sin identificar'],
    ]) {
      const resources = origins.filter((origin) => origin.kind === kind);
      if (!resources.length) continue;
      const section = el('section', undefined, 'resource-group');
      section.dataset.resourceKind = kind;
      section.append(el('h3', title));
      const grid = el('div', undefined, 'budget-grid');
      for (const o of resources) {
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
        grid.append(card);
      }
      section.append(grid);
      target.append(section);
    }
  }
  function renderEmergencyFund() {
    const target = $('emergency-fund');
    target.replaceChildren();
    if (!current) return;
    const heading = el('div', undefined, 'section-heading');
    heading.append(el('h3', 'Fondo de emergencia'));
    const info = el('details', undefined, 'chart-explanation');
    const toggle = el('summary', 'i');
    toggle.setAttribute(
      'aria-label',
      'Información sobre el fondo de emergencia',
    );
    info.append(
      toggle,
      el(
        'p',
        'Vincula uno de tus objetivos. Aquí se cuentan sus reservas en cuentas; las inversiones se muestran aparte. La elección se recuerda en este dispositivo para este libro. No mueve dinero ni duplica asignaciones.',
      ),
    );
    heading.append(info);
    target.append(heading);
    const label = el('label', 'Objetivo asociado', 'field');
    const select = el('select');
    select.id = 'emergency-goal';
    select.append(new Option('Seleccionar objetivo', ''));
    for (const goal of current.tables.tObjetivos || [])
      select.append(new Option(goal.Objetivo, goal.ID));
    const key = 'finances.emergencyGoal:' + current.bookKey;
    let saved = emergencySelection.get(current.bookKey);
    if (saved === undefined) {
      try {
        saved = localStorage.getItem(key) || '';
      } catch {
        saved = '';
      }
    }
    if ((current.tables.tObjetivos || []).some((goal) => goal.ID === saved))
      select.value = saved;
    select.addEventListener('change', () => {
      emergencySelection.set(current.bookKey, select.value);
      try {
        if (select.value) localStorage.setItem(key, select.value);
        else localStorage.removeItem(key);
      } catch {}
      renderEmergencyFund();
      $('emergency-goal').focus();
    });
    label.append(select);
    target.append(label);
    const goal = (current.tables.tObjetivos || []).find(
      (goal) => goal.ID === select.value,
    );
    if (!goal) {
      target.append(
        el(
          'p',
          'Elige un objetivo o crea uno para tu reserva de emergencia.',
          'calculator-note',
        ),
      );
      const create = el(
        'button',
        'Crear objetivo de emergencia',
        'button button-secondary',
      );
      create.type = 'button';
      create.addEventListener('click', () =>
        document
          .querySelector('.goal-actions [data-operation="objetivo"]')
          .click(),
      );
      target.append(create);
      return;
    }
    const origins = FinanceAnalytics.goalAvailability(current);
    const accounts = new Set(
      origins
        .filter((origin) => origin.kind === 'account')
        .map((origin) => origin.origin),
    );
    const assignments = (current.tables.tAsignaciones || []).filter(
      (assignment) => assignment.Objetivo === goal.ID,
    );
    const sum = (rows) =>
      rows.every((row) => known(row.Importe))
        ? rows.reduce((value, row) => value + row.Importe, 0)
        : null;
    const reserve = sum(
      assignments.filter((assignment) => accounts.has(assignment.Origen)),
    );
    const other = assignments.filter(
      (assignment) => !accounts.has(assignment.Origen),
    );
    const stats = el('div', undefined, 'emergency-stats');
    stat(stats, 'Reserva en cuentas', amount(reserve));
    stat(stats, 'Meta', amount(goal.Meta));
    stat(
      stats,
      'Pendiente en cuentas',
      known(goal.Meta) && known(reserve)
        ? amount(Math.max(0, goal.Meta - reserve))
        : 'Sin dato',
    );
    target.append(stats);
    if (known(goal.Meta) && goal.Meta > 0 && known(reserve)) {
      const progress = el('progress');
      progress.max = goal.Meta;
      progress.value = Math.max(0, Math.min(goal.Meta, reserve));
      progress.setAttribute('aria-label', 'Reserva de emergencia en cuentas');
      target.append(progress);
    }
    const liquidityUnknown = origins.some(
      (origin) =>
        accounts.has(origin.origin) &&
        assignments.some(
          (a) => a.Origen === origin.origin && a.Importe !== 0,
        ) &&
        !known(origin.available),
    );
    const excess = origins.some(
      (origin) =>
        origin.overallocated &&
        assignments.some((a) => a.Origen === origin.origin && a.Importe > 0),
    );
    if (other.length)
      target.append(
        el(
          'p',
          amount(sum(other)) +
            ' asignados a otros activos, fuera de la reserva en cuentas.',
          'calculator-note',
        ),
      );
    if (excess || liquidityUnknown)
      target.append(
        el(
          'p',
          excess
            ? 'Hay reservas superiores al saldo disponible. Revisa las asignaciones.'
            : 'Falta un saldo para verificar la disponibilidad de esta reserva.',
          'status error',
        ),
      );
    const assign = el(
      'button',
      'Gestionar reservas',
      'button button-secondary',
    );
    assign.type = 'button';
    assign.addEventListener('click', () => {
      $('goal-assign-new').click();
      $('goal-assign-goal').value = goal.ID;
      $('goal-assign-goal').dispatchEvent(new Event('change'));
    });
    target.append(assign);
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
        displayDate(record.start || record.month + '-01') +
        (record.end
          ? ' – ' + displayDate(record.end)
          : ' – ' + displayDate(current.settings.asof) + ' (en curso)') +
        ' · ' +
        (record.category || 'todas las subcategorías');
      const stats = $('budget-detail-stats');
      stats.replaceChildren();
      for (const [label, value] of [
        ['Límite', record.amount],
        ['Gasto propio', b.spent],
        [
          b.exceeded ? 'Exceso' : 'Margen',
          b.remaining === null ? null : Math.abs(b.remaining),
        ],
      ]) {
        const item = el('div');
        item.append(el('dt', label), el('dd', amount(value)));
        stats.append(item);
      }
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
    select.replaceChildren(new Option('Todas las subcategorías', ''));
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
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      selectedPeriods.add('budgets');
      renderBudgets();
    }
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
    $('planned-panel').open = plans.length > 0;
    $('forecast-note').textContent =
      forecast.rows.length > 1
        ? 'Previsión desde el ' +
          displayDate(forecast.asof) +
          '. No es saldo disponible actual.' +
          (!forecast.complete
            ? ' Revisa los planes con datos incompletos.'
            : '')
        : plans.length
          ? 'Selecciona un plan futuro para ver su efecto en el saldo.'
          : 'Sin pagos ni ingresos previstos.';
    if (forecast.notices.length) {
      const warnings = el('details', undefined, 'forecast-warnings');
      warnings.append(
        el('summary', 'Revisar ' + forecast.notices.length + ' planes'),
      );
      for (const notice of forecast.notices) warnings.append(el('p', notice));
      $('forecast-chart').append(warnings);
    }
    if (forecast.rows.length < 2) return;
    FinanceCharts.plot($('forecast-chart'), {
      title: 'Saldo tras los planes seleccionados',
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
