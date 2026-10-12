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
    accountMonth = null,
    spendMonth = null,
    excluded = '',
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
    const rows = FinanceAnalytics.cashTimeline(current, selectedMonth).map(
      (r) => ({
        ...r,
        ...Object.fromEntries(
          Object.entries(r.accounts).map(([k, v]) => ['account:' + k, v]),
        ),
      }),
    );
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
        selectedMonth +
        ' · ' +
        coverageNote(FinanceAnalytics.monthCoverage(current, selectedMonth)) +
        ' Saldo al cierre de cada día. Selecciona las cuentas en la leyenda.',
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
        'Efectivo total ' + amount(cash) + ' · Deuda ' + amount(debt),
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
    $('spending-note').textContent = '';
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
      a.coverage.observed ? String(daily.length) : 'Sin dato',
      'Hasta ' + current.settings.asof,
    );
    stat(
      $('spending-summary'),
      'Gasto recurrente',
      amount(
        a.coverage.observed
          ? (a.recurring.find((r) => r.label === 'Recurrente')?.value ?? 0)
          : null,
      ),
      'Solo los registros clasificados como recurrentes',
    );
    $('spending-note').textContent =
      coverageNote(a.coverage) +
      ' ' +
      (excluded
        ? 'Excluido ' +
          excluded +
          ': ' +
          amount(a.excluded) +
          '. Los porcentajes usan el total restante.'
        : 'Importe menos parte recuperable y devoluciones. No incluye inversiones, transferencias ni pagos de deuda.');
    if (!a.coverage.observed) {
      target.append(el('p', coverageNote(a.coverage), 'empty-state'));
      return;
    }
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
      (timeline.coverage.selectedStartDate
        ? 'Ventana seleccionada ' +
          timeline.coverage.selectedStartDate +
          ' → ' +
          timeline.coverage.selectedEndDate +
          '. '
        : 'Sin observaciones en la ventana seleccionada. ') +
      timeline.coverage.notices.join(' ') +
      (timeline.coverage.missingDays
        ? ' ' +
          timeline.coverage.missingDays +
          ' días sin valoración verificable.'
        : '') +
      (timeline.coverage.carriedDays
        ? ' ' + timeline.coverage.carriedDays + ' días utilizan un VL anterior.'
        : '');
    renderPriceCoverage(timeline.coverage);
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
        : 'Rentabilidad ajustada de la cartera',
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
        rows: timeline.rows,
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
      'Los precios se guardan por producto y fecha en el libro. La fuente actual ofrece la última valoración verificable; el histórico diario anterior requiere una fuente adicional. La actualización diaria opcional se configura en Ajustes.';
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
    $('account-month').value = accountMonth;
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
    FinanceCharts.clear($('salary-saving-charts'));
    $('salary-cut').textContent = '';
    if (!current) return;
    $('salary-cut').textContent =
      'Lectura ' +
      current.settings.start +
      ' → ' +
      current.settings.asof +
      '. Los meses parciales son provisionales; sin nómina registrada el neto y la tasa permanecen sin dato.';
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
      accountMonth = null;
      selectedPlans = null;
      spendMonth = null;
      product = '';
      excluded = '';
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
    $('goal-availability').replaceChildren();
    FinanceCharts.clear($('budget-analysis'));
    FinanceCharts.clear($('goal-charts'));
    $('budget-spent').textContent = 'Sin dato';
    $('budget-new').disabled = !current?.supportsBudgets;
    $('goal-assign-new').disabled = !current;
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
    $('budget-note').textContent =
      coverageNote(FinanceAnalytics.monthCoverage(current, month)) +
      ' ' +
      $('budget-note').textContent;
    const records = (current.budgets || []).filter((r) => r.month === month);
    renderBudgetAnalysis(records);
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
                : money.format(b.remaining) + ' de margen al corte'),
        ),
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
    return {
      full: 'Mes completo observado.',
      partial:
        'Mes parcial: observado ' +
        coverage.first +
        ' → ' +
        coverage.last +
        '; cifras provisionales.',
      future: 'Mes futuro planificado: gasto y margen observado sin dato.',
      prestart: 'Mes anterior al inicio del seguimiento: sin observaciones.',
      unknown: 'Cobertura sin dato.',
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
  function renderBudgetAnalysis(records) {
    const target = $('budget-analysis');
    FinanceCharts.clear(target);
    const table = el('table', undefined, 'data-table');
    const head = el('thead'),
      tr = el('tr');
    for (const label of [
      'Alcance',
      'Límite',
      'Gasto',
      'Margen',
      'Uso',
      'Cobertura',
    ])
      tr.append(el('th', label));
    head.append(tr);
    table.append(head);
    const body = el('tbody');
    for (const record of records) {
      const b = FinanceAnalytics.budget(current, record),
        row = el('tr');
      for (const value of [
        b.category || 'Total',
        amount(b.amount),
        amount(b.spent),
        amount(b.remaining),
        known(b.ratio) ? percentage.format(b.ratio * 100) + ' %' : 'Sin dato',
        coverageNote(b.coverage),
      ])
        row.append(el('td', value));
      body.append(row);
    }
    table.append(body);
    target.append(table);
    FinanceCharts.plot(target, {
      title: 'Histórico mensual comparable',
      rows: FinanceAnalytics.budgetHistory(current).map((r) => ({
        ...r,
        label: r.month + (r.coverage.status === 'partial' ? ' · parcial' : ''),
      })),
      fields: [
        {
          key: 'expense',
          label: 'Gasto propio',
          shape: 'bar',
          tone: 'chart-copper',
        },
        { key: 'limit', label: 'Límite total', tone: 'chart-blue' },
      ],
      description:
        'Mismo criterio de gasto propio; meses parciales señalados y límites sin definir conservados como sin dato. No se suman límites por categoría al total.',
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
      'Base: efectivo calculado al ' +
      forecast.asof +
      '. Proyección según fechas, cuentas e importes seleccionados; no es saldo disponible actual. ' +
      (forecast.complete
        ? 'Supuestos completos.'
        : 'Cobertura parcial: cifras desconocidas conservadas.') +
      ' ' +
      forecast.notices.join(' ');
    FinanceCharts.plot($('forecast-chart'), {
      title: 'Efectivo proyectado según planes',
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
        'Desde el efectivo actual conocido; sin salario supuesto, rentabilidad ni gastos inventados. Cada punto corresponde a un plan fechado.',
    });
  }
  let resize;
  window.addEventListener('resize', () => {
    clearTimeout(resize);
    resize = setTimeout(() => {
      if (current) render(current, api);
    }, 150);
  });
  return { render };
})();
