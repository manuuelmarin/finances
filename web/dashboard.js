'use strict';

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
  const labelAccount = (v) => (v === 'EFECTIVO' ? 'Efectivo' : v);
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
    spendMonth = null,
    excluded = '',
    product = '',
    range = 'all';
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
  function cashChart(target, title) {
    const rows = FinanceAnalytics.cashTimeline(current, cashMonth).map((r) => ({
      ...r,
      ...Object.fromEntries(
        Object.entries(r.accounts).map(([k, v]) => ['account:' + k, v]),
      ),
    }));
    FinanceCharts.plot(target, {
      title,
      rows,
      fields: [
        { key: 'total', label: 'Efectivo total', tone: 'chart-mint' },
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
        cashMonth +
        ' · saldo al cierre de cada día, hasta la fecha del informe. Selecciona las cuentas en la leyenda.',
    });
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
    const assets = known(cash) && known(invested) ? cash + invested : null;
    const weight =
      known(assets) && assets > 0
        ? percentage.format((invested / assets) * 100) + ' % sobre activos'
        : 'Peso sin dato';
    stat(
      kpis,
      'Patrimonio neto',
      amount(net),
      'Informe ' + current.settings.asof,
      true,
    );
    stat(kpis, 'Inversiones', amount(invested), weight);
    const free = FinanceAnalytics.freeBudget(current, reportMonth);
    stat(
      kpis,
      'Saldo libre del mes',
      amount(free),
      reportMonth +
        (free === null
          ? ' · define un límite total en Presupuestos'
          : free < 0
            ? ' · por encima del presupuesto'
            : ' · presupuesto total menos gasto propio'),
    );
    const layout = el('article', undefined, 'asset-breakdown');
    const heading = el('div', undefined, 'section-heading');
    heading.append(
      el('h3', 'Composición del patrimonio'),
      el('span', 'Informe ' + current.settings.asof, 'heading-note'),
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
      if (!known(r.value)) continue;
      const line = el('div', undefined, 'asset-row');
      const value = el('strong', amount(r.value));
      value.append(
        el(
          'small',
          positive > 0 && r.value >= 0
            ? percentage.format((r.value / positive) * 100) + ' %'
            : 'Peso no comparable',
        ),
      );
      line.append(el('span', r.label), value);
      const bar = el('progress', undefined, r.class);
      bar.max = Math.max(1, positive);
      bar.value = Math.max(0, r.value);
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
        'Efectivo total ' + amount(cash) + ' · Deuda ' + amount(debt),
        'asset-footnote',
      ),
    );
    parent.append(layout);
    const a = FinanceAnalytics.spendingAnalysis(current, reportMonth);
    FinanceCharts.donut(parent, {
      title: 'Gastos del mes',
      rows: a.categories,
      description:
        reportMonth +
        ' · gasto propio por categoría. El total incluye todas las categorías.',
    });
    cashChart(parent, 'Evolución diaria del efectivo');
    $('cash-month').value = cashMonth;
    $('chart-cut').textContent =
      'Informe ' +
      current.settings.asof +
      ' · valoración de inversiones ' +
      current.settings.valuation +
      '. Las series analíticas usan registros completos; los filtros del resumen nativo se indican arriba.';
  }
  function renderSpending() {
    const target = $('spending-charts');
    FinanceCharts.clear(target);
    $('spending-summary').replaceChildren();
    if (!current) {
      target.append(
        el('p', 'Abre el libro para analizar tus gastos.', 'empty-state'),
      );
      return;
    }
    const all = FinanceAnalytics.spendingAnalysis(current, spendMonth);
    excluded = selectOptions(
      'spending-exclude',
      [
        ['', 'Todas las categorías'],
        ...all.categories.map((r) => [r.label, 'Sin ' + r.label]),
      ],
      excluded,
    );
    $('spending-month').value = spendMonth;
    const a = FinanceAnalytics.spendingAnalysis(current, spendMonth, {
      excludeCategory: excluded || null,
    });
    stat(
      $('spending-summary'),
      'Gasto propio',
      amount(a.total),
      spendMonth + (excluded ? ' · excluye ' + excluded : ''),
    );
    const daily = a.daily.filter((r) => known(r.value) && r.value > 0);
    stat(
      $('spending-summary'),
      'Días con gasto',
      String(daily.length),
      'Hasta ' + current.settings.asof,
    );
    stat(
      $('spending-summary'),
      'Gasto recurrente',
      amount(a.recurring.find((r) => r.label === 'Recurrente')?.value ?? 0),
      'Solo los registros clasificados como recurrentes',
    );
    $('spending-note').textContent = excluded
      ? 'Excluido ' +
        excluded +
        ': ' +
        amount(a.excluded) +
        '. Los porcentajes usan el total restante.'
      : 'Importe menos parte recuperable y devoluciones. No incluye inversiones, transferencias ni pagos de deuda.';
    FinanceCharts.donut(target, {
      title: excluded
        ? 'Distribución sin ' + excluded
        : 'Distribución del gasto',
      rows: a.categories,
      description: spendMonth + ' · importe y porcentaje seleccionables',
    });
    FinanceCharts.plot(target, {
      title: 'Gasto acumulado del mes',
      rows: a.daily,
      fields: [
        {
          key: 'cumulative',
          label: 'Acumulado',
          tone: 'chart-copper',
          shape: 'step',
        },
      ],
      description:
        'Cambios en los días con registros; devoluciones conservan su signo.',
    });
    FinanceCharts.plot(target, {
      title: 'Gasto por ciudad',
      rows: a.cities,
      fields: [
        {
          key: 'value',
          label: 'Gasto propio',
          shape: 'bar',
          tone: 'chart-blue',
        },
      ],
      description: 'Las ubicaciones sin indicar permanecen sin clasificar.',
    });
    FinanceCharts.donut(target, {
      title: 'Recurrencia del gasto',
      rows: a.recurring,
      description: 'Se utiliza la clasificación guardada en cada movimiento.',
    });
  }
  function renderInvestments() {
    const target = $('investment-charts');
    FinanceCharts.clear(target);
    $('investment-kpis').replaceChildren();
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
      'Valoración ' + current.settings.valuation,
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
    const productName = product
      ? (current.tables.tProductos || []).find((p) => p.ID === product)
          ?.Producto
      : 'Cartera';
    $('investment-coverage').textContent =
      (timeline.firstDate
        ? 'Histórico ' + timeline.firstDate + ' → ' + timeline.lastDate + '. '
        : '') +
      timeline.coverage.notices.join(' ') +
      (timeline.coverage.missingDays
        ? ' ' +
          timeline.coverage.missingDays +
          ' días sin valoración verificable.'
        : '') +
      (timeline.coverage.carriedDays
        ? ' ' + timeline.coverage.carriedDays + ' días utilizan un VL anterior.'
        : '');
    FinanceCharts.plot(target, {
      title: 'Valor de mercado y aportación neta',
      rows: timeline.rows,
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
        : 'Rentabilidad de la cartera',
      rows: timeline.rows,
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
              ? 'TWR desde ' + timeline.coverage.returnStartDate
              : 'Rentabilidad TWR',
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
          'TWR entre valoraciones reales con flujos al cierre. Si hay aportaciones o retiradas entre cortes sin valoración, no puede calcularse: registra los VL de esos cortes. El resultado sobre aportación neta aparece arriba como una métrica distinta.',
    });
    const positions = (current.tables.tProductos || [])
      .filter((p) => !product || p.ID === product)
      .map((p) => ({ label: p.Producto, value: p.Valor, group: p.Clase }));
    if (!product)
      FinanceCharts.donut(target, {
        title: 'Distribución de la cartera',
        rows: positions,
        description:
          'Peso sobre el valor de mercado conocido, al corte de valoración.',
      });
    $('prices-history-note').textContent =
      'Los precios se guardan por producto y fecha en el libro. La fuente actual ofrece la última valoración verificable; el histórico diario anterior requiere una fuente adicional. La actualización diaria opcional se configura en Ajustes.';
  }
  function renderAccounts() {
    const target = $('account-charts');
    FinanceCharts.clear(target);
    $('account-summary').replaceChildren();
    if (!current) return;
    stat(
      $('account-summary'),
      'Efectivo',
      amount(metric('Efectivo')),
      'Informe ' + current.settings.asof,
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
    cashChart(target, 'Saldos diarios por cuenta');
  }
  function renderSalary() {
    const target = $('salary-charts');
    FinanceCharts.clear(target);
    FinanceCharts.clear($('salary-saving-charts'));
    if (!current) return;
    const rows = FinanceAnalytics.salarySavings(current).map((r) => ({
      ...r,
      date: r.month + '-01',
      value: r.payroll,
    }));
    FinanceCharts.plot(target, {
      title: 'Nóminas registradas por mes',
      rows,
      fields: [
        { key: 'value', label: 'Neto', shape: 'bar', tone: 'chart-blue' },
      ],
    });
    FinanceCharts.plot($('salary-saving-charts'), {
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
      spendMonth = null;
      product = '';
      excluded = '';
      range = 'all';
    }
    current = snapshot;
    api = handlers;
    if (current) {
      month ||= current.settings.asof.slice(0, 7);
      cashMonth ||= month;
      spendMonth ||= month;
      $('budget-month').value = month;
    }
    renderSummary();
    renderSpending();
    renderInvestments();
    renderAccounts();
    renderSalary();
    renderBudgets();
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
        complete: 'Activada · última actualización completada',
        partial: 'Activada · hay precios pendientes; se reintentará',
        retry_limit: 'Activada · agotados los intentos del día',
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
        renderAccounts();
      },
    ],
    [
      'spending-month',
      (v) => {
        spendMonth = v;
        renderSpending();
      },
    ],
    [
      'spending-exclude',
      (v) => {
        excluded = v;
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
    FinanceCharts.clear($('goal-charts'));
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
      if (known(g.Meta) && known(g.Asignado)) {
        const remaining = Math.max(0, g.Meta - g.Asignado);
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
