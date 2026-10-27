const { chartState, chartSeries } = require('./helpers/charts.cjs');
const { test, expect } = require('@playwright/test');
const { navigate } = require('./helpers/navigation.cjs');
const { capture } = require('./helpers/capture.cjs');
async function screenshot(page, name) {
  const viewport = page.viewportSize().width < 600 ? 'mobile' : 'desktop';
  await capture(page, 'dashboard-' + name + '-' + viewport);
}

// Entirely fictitious, read-only fixture. No connection to a Google book.
const snapshot = {
  ok: true,
  apiVersion: '3.3.0',
  bookKey: 'd'.repeat(64),
  environment: 'test',
  revision: 'dashboard-fixture',
  checkedAt: '2026-03-15T12:00:00Z',
  backendReady: true,
  calculationState: 'ready',
  supportsBudgets: true,
  settings: {
    start: '2026-01-01',
    asof: '2026-03-15',
    valuation: '2026-03-15',
  },
  summary: {
    complete: true,
    missingPrices: [],
    filters: { Año: 2026, Periodo: 'Todo el año', Cuenta: 'Todas' },
    metrics: [
      { label: 'Patrimonio neto', value: 8160 },
      { label: 'Efectivo', value: 6500 },
      { label: 'Inversiones', value: 1660 },
      { label: 'Deuda', value: 0 },
    ],
  },
  budgets: [{ month: '2026-03', category: null, amount: 1800 }],
  tables: {
    tCuentas: [
      {
        Cuenta: 'Banco ficticio',
        'Saldo inicial': 4500,
        'Saldo calculado': 6000,
      },
      { Cuenta: 'EFECTIVO', 'Saldo inicial': 500, 'Saldo calculado': 500 },
    ],
    tCategorias: [
      {
        Grupo: 'Gastos',
        Subgrupo: 'Esenciales',
        Categoría: 'Vivienda',
        Subcategoría: 'Alquiler',
      },
      {
        Grupo: 'Gastos',
        Subgrupo: 'Esenciales',
        Categoría: 'Alimentación',
        Subcategoría: 'Compra',
      },
      {
        Grupo: 'Gastos',
        Subgrupo: 'Esenciales',
        Categoría: 'Transporte',
        Subcategoría: 'Metro',
      },
    ],
    tProductos: [
      {
        ID: 'FICTITIOUS-ALPHA',
        Producto: 'Fondo Alfa ficticio',
        Cuenta: 'Banco ficticio',
        Clase: 'Renta variable',
        'Fecha base': '2026-01-01',
        'Unidades base': 10,
        'Coste base': 1000,
        Participaciones: 11,
        Valor: 1210,
        'Aportado neto': 1100,
        Resultado: 110,
        Rentabilidad: 0.1,
      },
      {
        ID: 'FICTITIOUS-BETA',
        Producto: 'Fondo Beta ficticio',
        Cuenta: 'Banco ficticio',
        Clase: 'Renta fija',
        'Fecha base': '2026-01-01',
        'Unidades base': 5,
        'Coste base': 400,
        Participaciones: 5,
        Valor: 450,
        'Aportado neto': 400,
        Resultado: 50,
        Rentabilidad: 0.125,
      },
    ],
    tMovimientos: ['01', '02', '03'].flatMap((month) => [
      {
        ID: 'PAY-' + month,
        Fecha: '2026-' + month + '-01',
        Tipo: 'Ingreso',
        Concepto: 'Nómina ficticia',
        Destino: 'Banco ficticio',
        Importe: 2000,
      },
      {
        ID: 'RENT-' + month,
        Fecha: '2026-' + month + '-01',
        Tipo: 'Gasto',
        Origen: 'Banco ficticio',
        Importe: 1000,
        Recuperable: 0,
        Subcategoría: 'Alquiler',
        Localización: 'Ciudad ficticia',
        Recurrente: 'Sí',
      },
      {
        ID: 'FOOD-' + month,
        Fecha: '2026-' + month + '-05',
        Tipo: 'Gasto',
        Origen: 'Banco ficticio',
        Importe: 300,
        Recuperable: 0,
        Subcategoría: 'Compra',
        Localización: 'Ciudad ficticia',
        Recurrente: 'No',
      },
      {
        ID: 'METRO-' + month,
        Fecha: '2026-' + month + '-10',
        Tipo: 'Gasto',
        Origen: 'Banco ficticio',
        Importe: 200,
        Recuperable: 0,
        Subcategoría: 'Metro',
        Localización: 'Otra ciudad ficticia',
        Recurrente: 'No',
      },
    ]),
    tNominas: ['01', '02', '03'].map((month) => ({
      Movimiento: 'PAY-' + month,
      Neto: 2000,
      'Fecha cobro': '2026-' + month + '-01',
    })),
    tOperaciones: [
      {
        ID: 'BUY-ALPHA',
        Fecha: '2026-02-01',
        Producto: 'FICTITIOUS-ALPHA',
        Tipo: 'Compra',
        Participaciones: 1,
        Precio: 100,
        Importe: 100,
        Comisión: 0,
        Retención: 0,
      },
    ],
    tPrecios: Array.from({ length: 74 }, (_, i) => {
      const date = new Date(Date.UTC(2026, 0, 1 + i))
        .toISOString()
        .slice(0, 10);
      return [
        {
          Producto: 'FICTITIOUS-ALPHA',
          Fecha: date,
          'VL EUR': 100 + (i * 10) / 73,
          Fuente: 'Cotización ficticia',
        },
        {
          Producto: 'FICTITIOUS-BETA',
          Fecha: date,
          'VL EUR': 80 + (i * 10) / 73,
          Fuente: 'Cotización ficticia',
        },
      ];
    }).flat(),
    tDeudas: [],
    tVinculos: [],
    tObjetivos: [
      {
        ID: 'FICTITIOUS-GOAL',
        Objetivo: 'Meta ficticia',
        Meta: 2000,
        Asignado: 1000,
        Fecha: '2026-12-31',
      },
    ],
    tAsignaciones: [],
  },
  observations: [],
  prices: [],
};

async function setup(page, seedSnapshot = snapshot) {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/, (route) =>
    route.abort(),
  );
  await page.goto('/');
  await page.evaluate((seed) => {
    FinanceDashboard.render(seed, {
      review: () => {
        throw Error('Read-only fixture must not write');
      },
    });
  }, seedSnapshot);
}

test('@responsive continuous month/day ranges control summary expenses and details', async ({
  page,
}) => {
  const seed = structuredClone(snapshot);
  for (const movement of seed.tables.tMovimientos)
    movement.Concepto = 'Synthetic ' + movement.ID;
  await setup(page, seed);
  await page.locator('#cash-period-mode').selectOption('months');
  await page.locator('#cash-month-month').selectOption('01');
  await page.locator('#cash-month-to-month').selectOption('02');
  const expenses = page.locator('#dashboard-charts .chart-card').filter({
    has: page.getByRole('heading', {
      name: 'Gastos del periodo',
      exact: true,
    }),
  });
  await expenses
    .locator('.distribution-item')
    .filter({ hasText: 'Vivienda' })
    .click();
  const detail = expenses.locator('.transaction-selection');
  await expect(detail.locator('tbody tr')).toHaveCount(2);
  await expect(detail).not.toContainText('Synthetic RENT-03');
  await detail.locator('summary').click();
  await expect(detail.locator('table')).toBeHidden();
  await expenses
    .locator('.distribution-item')
    .filter({ hasText: 'Vivienda' })
    .click();
  await expect(detail.locator('table')).toBeVisible();
  await expenses
    .locator('.distribution-item')
    .filter({ hasText: 'Vivienda' })
    .click();
  await expect(detail.locator('table')).toBeHidden();
  await page.locator('#cash-period-mode').selectOption('dates');
  await page.locator('#cash-to').fill('2026-03-01');
  await page.locator('#cash-from').fill('2026-02-02');
  await expenses
    .locator('.distribution-item')
    .filter({ hasText: 'Vivienda' })
    .click();
  await expect(detail.locator('tbody tr')).toHaveCount(1);
  await expect(detail).toContainText('Synthetic RENT-03');
  await expect(detail).not.toContainText('Synthetic RENT-02');
  await page.locator('#cash-from').fill('2026-04-01');
  await expect(page.locator('#cash-range-error')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await screenshot(page, 'continuous-period');
});

test('@responsive ticket arrows, largest expense and multi-month expense filtering remain usable', async ({
  page,
}) => {
  const seed = structuredClone(snapshot);
  seed.tables.tMovimientos = [2, 2, 10, 30].map((amount, i) => ({
    ID: 'EXP-' + i,
    Fecha: '2026-03-0' + (i + 1),
    Tipo: 'Gasto',
    Concepto: i === 3 ? 'Gasto destacado' : 'Compra ' + i,
    Subcategoría: 'Compra',
    Origen: 'Banco ficticio',
    Importe: amount,
  }));
  await setup(page, seed);
  await navigate(page, 'book');
  const ticket = page.locator('#spending-summary .ticket-card');
  await expect(ticket.locator('.kpi-value')).toHaveText('11,00 €');
  await ticket.getByRole('button', { name: 'Estadístico siguiente' }).click();
  await expect(ticket).toContainText('Ticket mediano');
  await expect(ticket.locator('.kpi-value')).toHaveText('6,00 €');
  await ticket.getByRole('button', { name: 'Estadístico siguiente' }).click();
  await expect(ticket).toContainText('Ticket moda');
  await expect(ticket.locator('.kpi-value')).toHaveText('2,00 €');
  await ticket.getByRole('button', { name: 'Estadístico siguiente' }).click();
  await expect(ticket).toContainText('Ticket medio');
  const largest = page
    .locator('#spending-summary .kpi')
    .filter({ hasText: 'Mayor gasto' });
  await expect(largest).toContainText('Gasto destacado · 4/3/2026');
  await page.locator('#spending-month-month').selectOption('02');
  await page.locator('#spending-month-to-month').selectOption('03');
  await expect(ticket.locator('.kpi-value')).toHaveText('11,00 €');
  await page.locator('#spending-from').fill('2026-03-04');
  await page.locator('#spending-to').fill('2026-03-04');
  await expect(ticket.locator('.kpi-value')).toHaveText('30,00 €');
  await ticket.getByRole('button', { name: 'Estadístico anterior' }).click();
  await expect(ticket.locator('.kpi-value')).toHaveText('Sin moda');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await screenshot(page, 'ticket-statistics');
});

test('@responsive resumen concentra patrimonio, caja seleccionable y gráficos accesibles', async ({
  page,
}) => {
  await setup(page);
  await expect(page.locator('#finance-kpis')).toContainText('Patrimonio neto');
  await expect(page.locator('#finance-kpis > .kpi')).toHaveCount(3);
  await expect(page.locator('#finance-kpis')).toContainText('Liquidez');
  await expect(page.locator('#finance-kpis')).toContainText(
    'Variación del patrimonio',
  );
  await expect(page.locator('#finance-kpis')).not.toContainText(
    /Tasa de ahorro|Ingresos|Últimos movimientos/,
  );
  await expect(page.locator('#view-home')).not.toContainText(
    'Últimos movimientos',
  );
  await expect(page.locator('#cash-month')).toHaveValue('2026-03');
  await screenshot(page, 'home');
  const cash = page.locator('#dashboard-charts .chart-card').filter({
    has: page.getByRole('heading', {
      name: 'Saldo diario en cuentas',
      exact: true,
    }),
  });
  expect(
    (await chartSeries(cash)).filter((s) => s.type === 'line'),
  ).toHaveLength(3);
  await expect(cash.locator('.finance-chart circle')).toHaveCount(0);
  const accountToggle = cash.getByRole('button', {
    name: 'Banco ficticio',
    exact: true,
  });
  await accountToggle.click();
  await expect(accountToggle).toHaveAttribute('aria-pressed', 'false');
  expect(
    (await chartSeries(cash)).filter((s) => s.type === 'line'),
  ).toHaveLength(2);
  await accountToggle.click();
  const graph = cash.locator('.finance-chart');
  await graph.focus();
  await page.keyboard.press('Home');
  await expect(cash.locator('.chart-readout')).toContainText('01 mar 2026');
  await page.keyboard.press('ArrowRight');
  await expect(cash.locator('.chart-readout')).toContainText('02 mar 2026');
  await page.locator('#cash-month').fill('2026-02');
  await page.locator('#cash-month').dispatchEvent('change');
  await expect(page.locator('#cash-month')).toHaveValue('2026-02');
  await cash.locator('.chart-explanation summary').click();
  await expect(cash.locator('.chart-explanation p')).toContainText('1/2/2026');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
});

test('@responsive investment provenance stays collapsed and discovers a newly added product', async ({
  page,
}) => {
  const seed = structuredClone(snapshot);
  seed.tables.tProductos.push({
    ID: 'NEW-SYNTHETIC',
    Producto: 'Nuevo fondo ficticio',
    Cuenta: 'Banco ficticio',
    Clase: 'Renta variable',
    'Fecha base': '2026-03-15',
    'Unidades base': 1,
    'Coste base': 100,
    Valor: 100,
    'Aportado neto': 100,
    Resultado: 0,
  });
  seed.tables.tPrecios.push({
    Producto: 'NEW-SYNTHETIC',
    Fecha: '2026-03-15',
    'VL EUR': 100,
  });
  await setup(page, seed);
  await navigate(page, 'investments');
  await expect(page.locator('#view-investments')).not.toContainText(
    'Histórico:',
  );
  await expect(page.locator('#view-investments')).not.toContainText(
    'Registros confirmados en Sheets',
  );
  await expect(page.locator('#view-investments')).not.toContainText(
    'Ventana seleccionada:',
  );
  await expect(page.locator('#investment-health')).toBeHidden();
  await page.locator('.price-health-details > summary').click();
  await expect(page.locator('#investment-health')).toContainText(
    'Nuevo fondo ficticio',
  );
  await page.locator('#investment-product').selectOption('NEW-SYNTHETIC');
  await expect(page.locator('#investment-health .budget-card')).toHaveCount(1);
  await expect(page.locator('#investment-health')).toContainText(
    'Nuevo fondo ficticio',
  );
  await page.locator('#history-import > summary').click();
  await expect(page.locator('#history-file')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await screenshot(page, 'investment-provenance');
});

test('@responsive checklist filtra categorías; salario y cuentas mantienen sus gráficos', async ({
  page,
}) => {
  const seed = structuredClone(snapshot);
  // This cross-view check needs cash, salary and goals, not a priced portfolio.
  for (const name of ['tProductos', 'tOperaciones', 'tPrecios'])
    seed.tables[name] = [];
  await setup(page, seed);
  await test.step('Filtrar gastos y consultar sus movimientos', async () => {
    await navigate(page, 'book');
    await expect(page.locator('#spending-month')).toHaveValue('2026-03');
    await page.locator('#spending-categories summary').click();
    await page
      .locator('#spending-categories label')
      .filter({ hasText: 'Vivienda' })
      .locator('input')
      .uncheck();
    await expect(page.locator('#spending-categories details')).toHaveAttribute(
      'open',
      '',
    );
    await expect(
      page.locator('#spending-categories input[value="Vivienda"]'),
    ).toBeFocused();
    await expect(
      page.locator('#spending-summary .kpi').first().locator('.kpi-value'),
    ).toContainText('500,00');
    await expect(page.locator('#spending-categories summary')).toContainText(
      '2 categorías incluidas',
    );
    const distribution = page.locator('#spending-charts .chart-card').filter({
      has: page.getByRole('heading', {
        name: 'Distribución del gasto',
        exact: true,
      }),
    });
    await expect(
      distribution.locator('.distribution-legend'),
    ).not.toContainText('Vivienda');
    await expect(
      distribution.locator('button.distribution-item').filter({
        hasText: 'Alimentación',
      }),
    ).toContainText('60 %');
    await expect(
      distribution.locator('button.distribution-item').filter({
        hasText: 'Transporte',
      }),
    ).toContainText('40 %');
    const cityChart = page.locator('#spending-charts .chart-card').filter({
      has: page.getByRole('heading', { name: 'Gasto por ciudad', exact: true }),
    });
    await cityChart.locator('.finance-chart').focus();
    await page.keyboard.press('Home');
    const selection = page.locator('.transaction-selection');
    await expect(selection.locator('tbody tr')).toHaveCount(1);
    await expect(selection.locator('tbody')).toContainText('300,00');
    await expect(selection.locator('thead th')).toHaveCount(3);
    await expect(selection.locator('tbody')).not.toContainText('Vivienda');
    await distribution
      .locator('button.distribution-item')
      .filter({ hasText: 'Alimentación' })
      .click();
    await expect(distribution.locator('.chart-readout')).toContainText(
      '60 % del total mostrado',
    );
    expect(
      (await chartSeries(page.locator('#spending-charts'))).filter(
        (s) => s.step === 'end',
      ),
    ).toHaveLength(1);
  });
  await test.step('Conservar gráficos y disposición de salario', async () => {
    await navigate(page, 'salary');
    const salaryCharts = page.locator('#salary-charts .chart-card');
    await expect(page.locator('#salary-cut')).toBeEmpty();
    await expect(page.locator('#salary-charts')).not.toContainText('parcial');
    await expect(salaryCharts).toHaveCount(2);
    await expect(salaryCharts.nth(0)).toContainText(
      'Nóminas registradas por mes',
    );
    await expect(salaryCharts.nth(1)).toContainText(
      'Ahorro mensual sobre nómina',
    );
    await expect(salaryCharts.nth(1).locator('.chart-readout')).toContainText(
      '25 %',
    );
    const firstSalary = await salaryCharts.nth(0).boundingBox();
    const secondSalary = await salaryCharts.nth(1).boundingBox();
    if (page.viewportSize().width >= 1000) {
      expect(Math.abs(firstSalary.y - secondSalary.y)).toBeLessThan(2);
      expect(secondSalary.x).toBeGreaterThanOrEqual(
        firstSalary.x + firstSalary.width,
      );
    } else {
      expect(secondSalary.y).toBeGreaterThanOrEqual(
        firstSalary.y + firstSalary.height,
      );
    }
  });
  await test.step('Conservar conciliación por cuenta', async () => {
    await navigate(page, 'accounts');
    await expect(page.locator('#account-charts .chart-card')).toHaveCount(1);
    await expect(page.locator('#account-charts')).toContainText(
      'Diferencias por cuenta',
    );
    await expect(page.locator('#account-charts')).not.toContainText(
      'Saldos diarios por cuenta',
    );
  });
  await test.step('Conservar objetivos al cambiar de vista', async () => {
    await navigate(page, 'goals');
    await expect(page.locator('#goal-charts')).toContainText('Meta ficticia');
  });
});

test('spending projections preserve unknown amounts until their category is excluded', async ({
  page,
}) => {
  const seed = structuredClone(snapshot);
  seed.tables.tMovimientos.push({
    ID: 'UNKNOWN-EXPENSE',
    Fecha: '2026-03-05',
    Tipo: 'Gasto',
    Origen: 'Banco ficticio',
    Importe: null,
    Recuperable: 0,
    Subcategoría: 'Compra',
    Localización: 'Ciudad ficticia',
    Recurrente: 'No',
  });
  await setup(page, seed);
  await navigate(page, 'book');
  await expect(
    page.locator('#spending-summary .kpi').first().locator('.kpi-value'),
  ).toHaveText('Sin dato');
  const cumulative = page.locator('#spending-charts .chart-card').filter({
    has: page.getByRole('heading', { name: 'Gasto del mes', exact: true }),
  });
  await cumulative.locator('.finance-chart').focus();
  await page.keyboard.press('End');
  await expect(cumulative.locator('.chart-readout')).toContainText('Sin dato');
  const city = page.locator('#spending-charts .chart-card').filter({
    has: page.getByRole('heading', { name: 'Gasto por ciudad', exact: true }),
  });
  await city.locator('.finance-chart').focus();
  await page.keyboard.press('End');
  await expect(city.locator('.chart-readout')).toContainText('Sin dato');
  const selection = page.locator('.transaction-selection');
  const amountSort = selection.getByRole('button', {
    name: 'Importe',
    exact: true,
  });
  await amountSort.click();
  await expect(selection.locator('tbody tr').last()).toContainText('Sin dato');
  await amountSort.click();
  await expect(selection.locator('tbody tr').last()).toContainText('Sin dato');
  const recurrence = page.locator('#spending-charts .chart-card').filter({
    has: page.getByRole('heading', {
      name: 'Recurrencia del gasto',
      exact: true,
    }),
  });
  await expect(recurrence.locator('.distribution-legend')).toContainText(
    'Sin dato',
  );
  await page.locator('#spending-categories summary').click();
  await page
    .locator('#spending-categories input[value="Alimentación"]')
    .uncheck();
  await expect(
    page.locator('#spending-summary .kpi').first().locator('.kpi-value'),
  ).toContainText(/1\.?200,00/);
  await cumulative.locator('.finance-chart').focus();
  await page.keyboard.press('End');
  await expect(cumulative.locator('.chart-readout')).not.toContainText(
    'Sin dato',
  );
});

test('@responsive selección genérica de producto y periodo conserva escalera, valor e inspección', async ({
  page,
}) => {
  const seed = structuredClone(snapshot);
  // Keep each boundary and the final valuation; dense histories have separate coverage.
  const dates = new Set([
    '2026-01-01',
    '2026-01-31',
    '2026-02-01',
    '2026-02-14',
    '2026-02-15',
    '2026-03-01',
    '2026-03-15',
  ]);
  seed.tables.tPrecios = seed.tables.tPrecios.filter((row) =>
    dates.has(row.Fecha),
  );
  await setup(page, seed);
  await navigate(page, 'investments');
  await expect(page.locator('#investment-product option')).toHaveCount(3);
  await page.locator('#investment-product').selectOption('FICTITIOUS-ALPHA');
  await expect(page.locator('#investment-kpis')).toContainText(/1\.?210,00/);
  await expect(page.locator('#investment-kpis')).toContainText(/1\.?100,00/);
  const chart = page.locator('#investment-charts .chart-card').first();
  const rendered = await chartSeries(chart);
  expect(rendered.find((s) => s.id === 'capital').step).toBe('end');
  expect(rendered.find((s) => s.id === 'capital').areaStyle.origin).toBe(0);
  expect(rendered.find((s) => s.id === 'value').smooth).toBe(false);
  expect(rendered.find((s) => s.id === 'value').areaStyle).toBeUndefined();
  expect(
    rendered
      .find((s) => s.id === 'capital')
      .data.some((d) => d.value[1] === 1100),
  ).toBe(true);
  await expect(chart.locator('svg path')).not.toHaveCount(0);
  await expect(chart.locator('.finance-chart circle')).toHaveCount(0);
  await chart.locator('.chart-data > summary').click();
  const allRows = await chart.locator('tbody tr').count();
  await page.locator('#investment-range').selectOption('1m');
  await expect(
    chart.getByLabel('Desde Valor de mercado y aportación neta'),
  ).toHaveValue('2026-02-15');
  await expect(
    chart.getByLabel('Hasta Valor de mercado y aportación neta'),
  ).toHaveValue('2026-03-15');
  // The chart table follows the selected date window as well as the plot.
  expect(await chart.locator('tbody tr').count()).toBeLessThan(allRows);
  const oneMonthDates = await chart.locator('tbody tr th').allTextContents();
  expect(oneMonthDates.length).toBeGreaterThan(0);
  expect(
    oneMonthDates.every((date) => date >= '2026-02-15' && date <= '2026-03-15'),
  ).toBe(true);
  await page.locator('#investment-range').selectOption('ytd');
  await expect(chart.locator('tbody tr')).toHaveCount(allRows);
  await page.locator('#investment-range').selectOption('all');
  await expect(chart.locator('tbody tr')).toHaveCount(allRows);
  await page.locator('#investment-product').selectOption('FICTITIOUS-BETA');
  await expect(page.locator('#investment-kpis')).toContainText('450,00');
  await chart.locator('.chart-explanation summary').click();
  await expect(chart.locator('.chart-explanation p')).toContainText(
    'Fondo Beta ficticio',
  );
  await chart.locator('.chart-explanation summary').click();
  const valueToggle = chart.getByRole('button', {
    name: 'Valor de mercado',
    exact: true,
  });
  await valueToggle.click();
  await expect(valueToggle).toHaveAttribute('aria-pressed', 'false');
  expect(
    (await chartSeries(chart)).filter((s) => s.type === 'line'),
  ).toHaveLength(1);
  await chart.locator('.finance-chart').focus();
  await page.keyboard.press('Home');
  await expect(chart.locator('.chart-readout')).toContainText('01 ene 2026');
});

test('@responsive datos del gráfico permiten ordenar y filtrar con teclado sin alterar las series', async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(() => {
    const parent = document.getElementById('dashboard-charts');
    const rows = [
      { date: '2026-03-03', value: 2 },
      { date: '2026-03-01', value: 100 },
      { date: '2026-03-02', value: 15 },
      { date: '2026-03-04', value: null },
    ];
    window.chartTableFixture = rows;
    FinanceCharts.plot(parent, {
      title: 'Tabla ficticia',
      rows,
      fields: [{ key: 'value', label: 'Importe ficticio' }],
    });
  });
  const chart = page.locator('#dashboard-charts .chart-card').filter({
    has: page.getByRole('heading', { name: 'Tabla ficticia', exact: true }),
  });
  await chart.locator('.chart-data > summary').click();
  const table = chart.locator('table');
  const amountSort = table.getByRole('button', {
    name: 'Ordenar por Importe ficticio',
    exact: true,
  });
  await amountSort.focus();
  await page.keyboard.press('Enter');
  await expect(table.locator('thead th[aria-sort="ascending"]')).toContainText(
    'Importe ficticio',
  );
  expect(await table.locator('tbody tr td').allTextContents()).toEqual([
    '2,00 €',
    '15,00 €',
    '100,00 €',
    'Sin dato',
  ]);
  await page.keyboard.press('Enter');
  expect(await table.locator('tbody tr td').allTextContents()).toEqual([
    '100,00 €',
    '15,00 €',
    '2,00 €',
    'Sin dato',
  ]);
  await page.keyboard.press('Enter');
  await expect(table.locator('thead th[aria-sort="none"]')).toHaveCount(2);
  await table
    .getByRole('searchbox', { name: 'Filtrar Importe ficticio', exact: true })
    .fill('> 10');
  await expect(table.locator('tbody tr')).toHaveCount(2);
  await table
    .getByRole('searchbox', { name: 'Filtrar Fecha / categoría', exact: true })
    .fill('2026-03-02');
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table.locator('tbody')).toContainText('15,00');
  await table
    .getByRole('searchbox', { name: 'Filtrar Fecha / categoría', exact: true })
    .fill('');
  await table
    .getByRole('searchbox', { name: 'Filtrar Importe ficticio', exact: true })
    .fill('Sin dato');
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table.locator('tbody')).toContainText('Sin dato');
  await table
    .getByRole('searchbox', { name: 'Filtrar Importe ficticio', exact: true })
    .fill('> 200');
  await expect(table.locator('tbody')).toContainText(
    'No hay datos para estos filtros',
  );
  expect(
    (await chartSeries(chart)).filter((s) => s.type === 'line'),
  ).toHaveLength(1);
  expect(
    await page.evaluate(() => window.chartTableFixture.map((r) => r.value)),
  ).toEqual([2, 100, 15, null]);
  expect(
    await amountSort.evaluate((node) => node.getBoundingClientRect().height),
  ).toBeGreaterThanOrEqual(44);
});

test('TWR insuficiente explica los cortes que faltan y no muestra resultado sobre aportación como rentabilidad', async ({
  page,
}) => {
  const sparse = structuredClone(snapshot);
  sparse.tables.tPrecios = sparse.tables.tPrecios.filter((r) =>
    ['2026-01-01', '2026-03-15'].includes(r.Fecha),
  );
  await setup(page, sparse);
  await navigate(page, 'investments');
  await page.locator('#investment-measure').selectOption('twr');
  const performance = page.locator('#investment-charts .chart-card').nth(1);
  await performance.locator('.chart-explanation summary').click();
  await expect(performance.locator('.chart-explanation p')).toContainText(
    'TWR ajustado entre valoraciones reales',
  );
  await expect(performance.locator('.chart-explanation p')).toContainText(
    'no puede calcularse',
  );
  const rowValues = await performance.locator('tbody tr').allTextContents();
  expect(rowValues.at(-1)).toContain('Sin dato');
});

test('Ajustes muestra estado diario verificado, horario y resultado parcial sin asumir activación', async ({
  page,
}) => {
  await setup(page);
  await navigate(page, 'connection');
  await expect(page.locator('#settings-daily-status')).toHaveText(
    'Requiere actualizar el código de Google',
  );
  await expect(page.locator('#settings-daily-schedule')).toHaveText(
    'Sin comprobar',
  );
  const configured = structuredClone(snapshot);
  configured.dailyPrices = {
    enabled: true,
    status: 'partial',
    schedule: { hours: [9, 12, 18], timezone: 'Europe/Madrid' },
    lastRun: { checkedAt: '2026-03-15T12:00:00Z', complete: false },
  };
  await page.evaluate((seed) => FinanceDashboard.render(seed), configured);
  await expect(page.locator('#settings-daily-status')).toContainText(
    'hay precios pendientes',
  );
  await expect(page.locator('#settings-daily-schedule')).toHaveText(
    '9, 12, 18 h · Europe/Madrid',
  );
  await expect(page.locator('#settings-daily-run')).toContainText(
    'Sin completar',
  );
  configured.dailyPrices.status = 'execution_due';
  await page.evaluate((seed) => FinanceDashboard.render(seed), configured);
  await expect(page.locator('#settings-daily-status')).toContainText(
    'comprobación pendiente en esta franja',
  );
  configured.dailyPrices.status = 'retry_limit';
  await page.evaluate((seed) => FinanceDashboard.render(seed), configured);
  await expect(page.locator('#settings-daily-status')).toContainText(
    'continúa mañana',
  );
  configured.dailyPrices.status = 'disabled';
  configured.dailyPrices.enabled = false;
  await page.evaluate((seed) => FinanceDashboard.render(seed), configured);
  await expect(page.locator('#settings-daily-status')).toHaveText(
    'Desactivada',
  );
  configured.dailyPrices.status = 'inspection_unavailable';
  await page.evaluate((seed) => FinanceDashboard.render(seed), configured);
  await expect(page.locator('#settings-daily-status')).toHaveText(
    'No se ha podido comprobar el programador',
  );
});

test('TWR identifica la primera valoración real cuando falta el rendimiento anterior', async ({
  page,
}) => {
  const delayed = structuredClone(snapshot);
  delayed.tables.tPrecios = delayed.tables.tPrecios.filter(
    (r) => r.Fecha >= '2026-02-02',
  );
  await setup(page, delayed);
  await navigate(page, 'investments');
  await page.locator('#investment-measure').selectOption('twr');
  const performance = page.locator('#investment-charts .chart-card').nth(1);
  await expect(
    performance.getByRole('button', {
      name: 'TWR exacto desde 2026-02-02',
      exact: true,
    }),
  ).toBeVisible();
  await performance.locator('.chart-explanation summary').click();
  await expect(performance.locator('.chart-explanation p')).toContainText(
    'el rendimiento anterior es desconocido',
  );
  const last = await performance.locator('tbody tr').last().textContent();
  expect(last).not.toContain('Sin dato');
});

test('future budget is planned, account month is independent and unknown goal assets remain visible', async ({
  page,
}) => {
  const seed = structuredClone(snapshot);
  seed.tables.tCuentas[0]['Saldo calculado'] = null;
  seed.observations = [
    { account: 'Banco ficticio', date: '2026-02-01', amount: 1 },
  ];
  seed.tables.tObjetivos = [
    {
      ID: 'G',
      Objetivo: 'Meta ficticia',
      Meta: 1000,
      Asignado: 500,
      Fecha: '2026-02-01',
    },
  ];
  seed.tables.tAsignaciones = [
    { Objetivo: 'G', Origen: 'EFECTIVO', Importe: 600 },
  ];
  await setup(page, seed);
  await navigate(page, 'budgets');
  await page.locator('#budget-month').fill('2026-04');
  await expect(page.locator('#budget-spent')).toHaveText('Sin dato');
  await expect(page.locator('#budget-note')).toContainText(
    'Este backend admite límites mensuales',
  );
  await navigate(page, 'accounts');
  await page.locator('#account-reconciliation > summary').click();
  await page.locator('#account-month').fill('2026-02');
  await navigate(page, 'home');
  await page.locator('#cash-month').fill('2026-01');
  await navigate(page, 'accounts');
  await expect(page.locator('#account-month')).toHaveValue('2026-02');
  await navigate(page, 'goals');
  await expect(page.locator('#goal-availability')).toContainText(
    'Sobreasignado',
  );
  await expect(page.locator('#goal-availability')).toContainText(
    'Disponibilidad desconocida',
  );
  await expect(page.locator('#saving-goals')).toContainText('Plazo vencido');
});

test('planned realization reviews actual plus plan closing and projection selection does not write', async ({
  page,
}) => {
  const seed = structuredClone(snapshot);
  seed.supportsPlanning = true;
  seed.capabilities = { planned: true };
  seed.planned = [
    {
      id: 'P1',
      date: '2026-04-01',
      concept: 'Pago ficticio',
      account: 'Banco ficticio',
      category: 'Alquiler',
      amount: 50,
      kind: 'expense',
      active: true,
    },
  ];
  await setup(page, seed);
  await page.evaluate(
    (seed) =>
      FinanceDashboard.render(seed, {
        review: (operations) => {
          window.reviewedOperations = operations;
        },
      }),
    seed,
  );
  await navigate(page, 'accounts');
  await expect(page.locator('#forecast-note')).toContainText(
    'No es saldo disponible actual',
  );
  await page.locator('#planned-list input[type=checkbox]').uncheck();
  expect(await page.evaluate(() => window.reviewedOperations)).toBeUndefined();
  await page
    .getByRole('button', { name: 'Confirmar realizado', exact: true })
    .click();
  expect(await page.evaluate(() => window.reviewedOperations)).toEqual([
    {
      process: 'gasto',
      date: '2026-04-01',
      concept: 'Pago ficticio',
      account: 'Banco ficticio',
      category: 'Alquiler',
      amount: 50,
    },
    { process: 'quitar_obligacion', id: 'P1' },
  ]);
});

test('closing or changing a book clears analytics evidence and open book-specific forms', async ({
  page,
}) => {
  const seed = structuredClone(snapshot);
  seed.tables.tAsignaciones = [
    { Objetivo: 'G', Origen: 'EFECTIVO', Importe: 600 },
  ];
  await setup(page, seed);
  await navigate(page, 'goals');
  await page.locator('#goal-assign-new').click();
  await expect(page.locator('#goal-assign-dialog')).toBeVisible();
  await page.evaluate(() => FinanceDashboard.render(null));
  await expect(page.locator('#goal-assign-dialog')).not.toBeVisible();
  await expect(page.locator('#goal-availability')).toBeEmpty();
  await expect(page.locator('#budget-analysis')).toBeEmpty();
  await expect(page.locator('#account-comparisons')).toBeEmpty();
  await expect(page.locator('#account-cut')).toBeEmpty();
  await expect(page.locator('#salary-cut')).toBeEmpty();
  await expect(page.locator('#goal-assign-new')).toBeDisabled();
});

test('planning capability permits first plan before its metadata sheet exists and old backends stay disabled', async ({
  page,
}) => {
  const seed = structuredClone(snapshot);
  seed.supportsPlanning = false;
  seed.capabilities = { planned: true };
  seed.planned = [];
  await setup(page, seed);
  await page.evaluate(
    (seed) =>
      FinanceDashboard.render(seed, {
        review: (operations) => {
          window.reviewedOperations = operations;
        },
      }),
    seed,
  );
  await navigate(page, 'accounts');
  await expect(page.locator('#plan-new')).toBeEnabled();
  await page.locator('#plan-new').click();
  await page.locator('#plan-date').fill('2026-04-01');
  await page.locator('#plan-concept').fill('First fictitious planned payment');
  await page.locator('#plan-amount').fill('50');
  await page.locator('#plan-form button[type=submit]').click();
  expect(await page.evaluate(() => window.reviewedOperations)).toEqual([
    {
      process: 'obligacion',
      date: '2026-04-01',
      concept: 'First fictitious planned payment',
      account: 'Banco ficticio',
      category: 'Alquiler',
      amount: 50,
      kind: 'expense',
    },
  ]);
  delete seed.capabilities;
  await page.evaluate((seed) => FinanceDashboard.render(seed), seed);
  await expect(page.locator('#plan-new')).toBeDisabled();
});

test('future expense panels and missing-price portfolio composition never imply observed zero or known weight', async ({
  page,
}) => {
  const seed = structuredClone(snapshot);
  seed.summary.missingPrices = ['Fondo Alfa ficticio'];
  await setup(page, seed);
  await navigate(page, 'investments');
  const composition = page.locator('#investment-charts .chart-card').filter({
    has: page.getByRole('heading', {
      name: 'Distribución de la cartera',
      exact: true,
    }),
  });
  await expect(composition.locator('.distribution-legend')).toContainText(
    'Fondo Alfa ficticio',
  );
  await expect(composition.locator('.distribution-legend')).toContainText(
    'Sin dato',
  );
  await expect(composition).toContainText('subtotal positivo conocido');
  await navigate(page, 'book');
  await page.locator('#spending-month').fill('2026-04');
  await expect(page.locator('#spending-summary')).toContainText('Sin dato');
  await expect(page.locator('#spending-charts .chart-card')).toHaveCount(0);
  await expect(page.locator('#spending-charts')).toContainText(
    'Periodo futuro · sin registros',
  );
});

test('new planned payments and budget limits reuse archive-aware reference choices', async ({
  page,
}) => {
  const seed = structuredClone(snapshot);
  seed.capabilities = { planned: true };
  seed.archives = { accounts: ['Banco ficticio'], categories: ['Alquiler'] };
  await setup(page, seed);
  await navigate(page, 'accounts');
  await page.locator('#plan-new').click();
  await expect(
    page.locator('#plan-account option[value="Banco ficticio"]'),
  ).toHaveCount(0);
  await expect(
    page.locator('#plan-account option[value="EFECTIVO"]'),
  ).toHaveCount(1);
  await expect(
    page.locator('#plan-category option[value="Alquiler"]'),
  ).toHaveCount(0);
  await page.locator('#plan-cancel').click();
  await navigate(page, 'budgets');
  await page.locator('#budget-new').click();
  await expect(
    page.locator('#budget-category option[value="Alquiler"]'),
  ).toHaveCount(0);
  await expect(
    page.locator('#budget-category option[value="Compra"]'),
  ).toHaveCount(1);
});

test('@responsive exact spending dates filter histogram, recurrence and transaction detail across months', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await setup(page);
  await navigate(page, 'book');
  await page.locator('#spending-from').fill('2026-02-05');
  await page.locator('#spending-to').fill('2026-03-10');
  await page.locator('#spending-to').dispatchEvent('change');
  await page.locator('#spending-categories summary').click();
  await page.locator('#spending-categories input[value="Vivienda"]').uncheck();
  await expect(
    page.locator('#spending-summary .kpi-value').first(),
  ).toContainText(/1\.?000,00/);
  const recurring = page.locator('#spending-charts .chart-card').filter({
    has: page.getByRole('heading', {
      name: 'Recurrencia del gasto',
      exact: true,
    }),
  });
  await expect(recurring.locator('.chart-data')).toHaveCount(0);
  await recurring
    .locator('button.distribution-item')
    .filter({ hasText: 'No recurrente' })
    .click();
  await expect(page.locator('.transaction-selection tbody tr')).toHaveCount(4);
  await expect(page.locator('.transaction-selection')).not.toContainText(
    'Vivienda',
  );
  const histogram = page.locator('#spending-charts .chart-card').filter({
    has: page.getByRole('heading', {
      name: 'Gasto por importe y frecuencia',
      exact: true,
    }),
  });
  expect((await chartState(histogram)).xAxis[0].axisLabel.hideOverlap).toBe(
    true,
  );
  await expect(histogram.locator('svg text')).not.toHaveCount(0);
  await expect(histogram.locator('svg')).toContainText('Importe (€)');
  await histogram.locator('.chart-menu summary').click();
  const download = page.waitForEvent('download');
  await histogram
    .getByRole('button', { name: 'Descargar CSV', exact: true })
    .click();
  const csv = require('node:fs').readFileSync(
    await (await download).path(),
    'utf8',
  );
  const frequencies = csv
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => Number(line.split(';').at(-1)));
  expect(frequencies.reduce((sum, value) => sum + value, 0)).toBe(4);
  await page.locator('#spending-to').fill('2026-01-01');
  await page.locator('#spending-to').dispatchEvent('change');
  await expect(page.locator('#spending-range-error')).toBeVisible();
  await expect(
    page.locator('#spending-summary .kpi-value').first(),
  ).toContainText(/1\.?000,00/);
  await page.locator('#spending-month').fill('2026-01');
  await expect(page.locator('#spending-from')).toHaveValue('2026-01-01');
  await expect(page.locator('#spending-to')).toHaveValue('2026-01-31');
  await expect(page.locator('#spending-range-error')).toBeHidden();
  await expect(
    page.locator('#spending-summary .kpi-value').first(),
  ).toContainText(/1\.?500,00/);
  expect(errors).toEqual([]);
  await screenshot(page, 'spending-range');
});

test('@responsive goals expose real assignments, completed state and a clean empty state', async ({
  page,
}) => {
  const seed = structuredClone(snapshot);
  seed.tables.tObjetivos = [
    {
      ID: 'TRIP',
      Objetivo: 'Viaje ficticio',
      Meta: 1000,
      Asignado: 300,
      Fecha: '2026-04-15',
    },
    {
      ID: 'DONE',
      Objetivo: 'Meta completada',
      Meta: 100,
      Asignado: 100,
      Fecha: '2026-02-01',
    },
  ];
  seed.tables.tAsignaciones = [
    { Objetivo: 'TRIP', Origen: 'Banco ficticio', Importe: 300 },
    { Objetivo: 'DONE', Origen: 'EFECTIVO', Importe: 100 },
  ];
  await setup(page, seed);
  await navigate(page, 'goals');
  await expect(page.locator('#goal-summary')).toContainText('1 completado');
  await expect(page.locator('#goal-summary')).toContainText('400,00');
  await expect(page.locator('#goal-summary')).toContainText('700,00');
  const goal = page.locator('[data-goal-id="TRIP"]');
  await expect(goal).toContainText('15/4/2026');
  await expect(goal).toContainText('al mes para llegar a tiempo');
  await goal.locator('.chart-data > summary').click();
  await expect(goal.locator('tbody tr')).toHaveCount(1);
  await expect(goal.locator('tbody')).toContainText('Banco ficticio');
  await expect(goal.locator('tbody')).toContainText('300,00');
  await goal
    .getByRole('searchbox', { name: 'Filtrar Activo', exact: true })
    .fill('ninguno');
  await expect(goal.locator('tbody')).toContainText(
    'No hay datos para estos filtros',
  );
  await expect(page.locator('[data-goal-id="DONE"]')).toContainText(
    'Completado',
  );
  await expect(page.locator('[data-goal-id="DONE"]')).not.toContainText(
    'Plazo vencido',
  );
  await expect(page.locator('#goal-charts .chart-card')).toHaveCount(2);
  const goalsChart = await chartState(page.locator('#goal-charts'));
  expect(goalsChart.yAxis[0].type).toBe('category');
  expect(goalsChart.yAxis[0].axisLabel.overflow).toBe('truncate');
  await expect(page.locator('#goal-resources')).not.toHaveAttribute('open', '');
  await screenshot(page, 'goals-detail');
  seed.tables.tObjetivos = [];
  seed.tables.tAsignaciones = [];
  await page.evaluate((value) => FinanceDashboard.render(value), seed);
  await expect(page.locator('#saving-goals')).toContainText('Sin objetivos');
  await expect(page.locator('#goal-summary')).toBeEmpty();
  await expect(page.locator('#goal-resources')).toBeVisible();
  await expect(page.locator('#emergency-fund')).toContainText(
    'Fondo de emergencia',
  );
});

test('account reconciliation never hides opposite differences by netting them', async ({
  page,
}) => {
  const seed = structuredClone(snapshot);
  seed.observations = [
    {
      account: 'Banco ficticio',
      date: '2026-03-10',
      scope: 'cierre_dia',
      comparisonStatus: 'diferencia_al_corte',
      difference: 10,
      amount: 5990,
    },
    {
      account: 'EFECTIVO',
      date: '2026-03-11',
      scope: 'cierre_dia',
      comparisonStatus: 'diferencia_al_corte',
      difference: -10,
      amount: 510,
    },
    {
      account: 'Banco ficticio',
      date: '2026-03-30',
      scope: 'cierre_dia',
      comparisonStatus: 'diferencia_al_corte',
      difference: 999,
      amount: 1,
    },
  ];
  await setup(page, seed);
  await navigate(page, 'accounts');
  await expect(page.locator('#account-summary')).toContainText('2 de 2');
  await expect(page.locator('#account-summary .kpi-value').nth(1)).toHaveText(
    '2',
  );
  await expect(
    page.locator('#account-summary .kpi-value').nth(2),
  ).toContainText('20,00');
  expect(
    (await chartSeries(page.locator('#account-charts')))[0].data,
  ).toHaveLength(2);
  await expect(page.locator('#account-charts')).not.toContainText(
    'Saldo por cuenta',
  );
});

test('monthly flow hover and CSV preserve net refunds rather than clamping them to zero', async ({
  page,
}) => {
  const seed = structuredClone(snapshot);
  seed.tables.tMovimientos.push({
    ID: 'REFUND',
    Fecha: '2026-02-15',
    Tipo: 'Devolución gasto',
    Importe: 2000,
    Recuperable: 0,
    Subcategoría: 'Compra',
  });
  await setup(page, seed);
  await page.locator('#cash-month-month').selectOption('02');
  const flow = page.locator('#dashboard-charts .chart-card').filter({
    has: page.getByRole('heading', {
      name: 'Ingresos y gastos por mes',
      exact: true,
    }),
  });
  await flow.locator('.finance-chart').focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await expect(flow.locator('.chart-readout')).toContainText(
    'Gasto propio: -500,00',
  );
  await expect(flow.locator('.chart-readout')).toContainText('-25 %');
  await flow.locator('.chart-menu summary').click();
  const download = page.waitForEvent('download');
  await flow
    .getByRole('button', { name: 'Descargar CSV', exact: true })
    .click();
  const csv = require('node:fs').readFileSync(
    await (await download).path(),
    'utf8',
  );
  expect(csv).toContain('"2026-02-01";2000;-500;-25');
});

test('@responsive summary shows all four variation horizons and its category detail contains only current-month dates, concept and amount', async ({
  page,
}) => {
  const seed = structuredClone(snapshot);
  seed.tables.tMovimientos.forEach((row) => {
    row.Concepto = 'Synthetic ' + row.ID;
  });
  await setup(page, seed);
  const cells = page.locator('.wealth-card .comparison-cell');
  await expect(cells).toHaveCount(4);
  expect(await cells.locator('span').allTextContents()).toEqual([
    '1M',
    '3M',
    '6M',
    '1A',
  ]);
  const boxes = await cells.evaluateAll((nodes) =>
    nodes.map((node) => {
      const r = node.getBoundingClientRect();
      return { x: r.x, y: r.y };
    }),
  );
  expect(boxes[0].y).toBe(boxes[1].y);
  expect(boxes[2].y).toBe(boxes[3].y);
  expect(boxes[2].y).toBeGreaterThan(boxes[0].y);
  await expect(cells.last()).toHaveClass(/comparison-neutral/);
  const chart = page.locator('#dashboard-charts .chart-card').filter({
    has: page.getByRole('heading', { name: 'Gastos del mes', exact: true }),
  });
  await chart
    .locator('.distribution-item')
    .filter({ hasText: 'Vivienda' })
    .click();
  const detail = chart.locator('details.transaction-selection');
  await expect(detail).toHaveAttribute('open', '');
  await expect(detail.locator('thead th')).toHaveText([
    'Fecha',
    'Concepto',
    'Importe',
  ]);
  await expect(detail.locator('tbody tr')).toHaveCount(1);
  await expect(detail).toContainText('Synthetic RENT-03');
  await expect(detail).not.toContainText('Synthetic RENT-02');
  await expect(chart.locator('.chart-data')).toHaveCount(0);
  await detail.locator('summary').click();
  await expect(detail.locator('table')).toBeHidden();
  await page.locator('#cash-month-year').fill('2025');
  await page.locator('#cash-month-year').dispatchEvent('change');
  await page.locator('#cash-month-month').selectOption('11');
  await expect(page.locator('#cash-month')).toHaveValue('2025-11');
  await expect(page.locator('#cash-month-month')).toHaveValue('11');
  await expect(page.locator('#cash-month-month option:checked')).toHaveText(
    'Noviembre',
  );
  await screenshot(page, 'comparison-and-detail');
});

test('@responsive fixed-width spending histogram and city tones remain readable and export exact frequencies', async ({
  page,
}) => {
  const seed = structuredClone(snapshot);
  seed.tables.tMovimientos.push({
    ID: 'NO-CITY',
    Fecha: '2026-03-05',
    Tipo: 'Gasto',
    Concepto: 'Synthetic coffee',
    Origen: 'Banco ficticio',
    Importe: 10,
    Subcategoría: 'Compra',
  });
  await setup(page, seed);
  await navigate(page, 'book');
  const histogram = page.locator('#spending-charts .chart-card').filter({
    has: page.getByRole('heading', {
      name: 'Gasto por importe y frecuencia',
      exact: true,
    }),
  });
  await expect(
    histogram.getByLabel('Intervalo de gasto en euros').locator('option'),
  ).toHaveText(['5 €', '10 €', '20 €', '50 €', '100 €']);
  await histogram.getByLabel('Intervalo de gasto en euros').selectOption('20');
  expect((await chartState(histogram)).xAxis[0].axisLabel.rotate).toBe(60);
  await histogram.locator('.chart-menu summary').click();
  const download = page.waitForEvent('download');
  await histogram
    .getByRole('button', { name: 'Descargar CSV', exact: true })
    .click();
  const fs = require('node:fs');
  const text = fs.readFileSync(await (await download).path(), 'utf8');
  const rows = text.trim().split('\r\n').slice(1);
  expect(
    rows.reduce((sum, row) => sum + Number(row.split(';').at(-1)), 0),
  ).toBe(4);
  expect(
    rows.every((row) => {
      const endpoints = [...row.matchAll(/\d+,\d{2}/g)].map((m) =>
        Number(m[0].replace(',', '.')),
      );
      return (
        endpoints.length === 2 &&
        Math.abs(endpoints[1] - endpoints[0] - 20) < 1e-8
      );
    }),
  ).toBe(true);
  const city = page.locator('#spending-charts .chart-card').filter({
    has: page.getByRole('heading', { name: 'Gasto por ciudad', exact: true }),
  });
  const cityData = (await chartSeries(city))[0].data;
  expect(cityData).toHaveLength(3);
  expect(new Set(cityData.map((d) => d.itemStyle.color)).size).toBe(2);
  expect((await chartState(city)).yAxis[0].type).toBe('category');
  await screenshot(page, 'histogram-and-city');
});

test('@responsive @safari account rolling changes show a full expense and preserve its exact dated baseline after reload', async ({
  page,
}) => {
  const seed = structuredClone(snapshot);
  seed.settings = {
    start: '2026-09-30',
    asof: '2026-10-23',
    valuation: '2026-10-15',
  };
  seed.tables.tCuentas = [
    { Cuenta: 'EFECTIVO', 'Saldo inicial': 168, 'Saldo calculado': 153 },
  ];
  seed.tables.tMovimientos = [
    {
      ID: 'FICTIONAL-CASH-EXPENSE',
      Fecha: '2026-10-17',
      Tipo: 'Gasto',
      Origen: 'EFECTIVO',
      Importe: 15,
    },
  ];
  await setup(page, seed);
  for (let pass = 0; pass < 2; pass++) {
    await navigate(page, 'accounts');
    const cells = page.locator('[data-account="EFECTIVO"] .comparison-cell');
    await expect(cells).toHaveCount(8);
    await expect(cells.nth(0).locator('strong')).toHaveText('0,00 €');
    await expect(cells.nth(1).locator('strong')).toHaveText('0,00 €');
    await expect(cells.nth(2).locator('strong')).toHaveText('-15,00 €');
    await expect(cells.nth(2)).toHaveClass(/comparison-negative/);
    await expect(cells.nth(2)).toHaveAttribute(
      'title',
      'Saldo al 23/10/2026 − saldo al inicio del 16/10/2026: 168,00 €',
    );
    await expect(cells.nth(4).locator('strong')).toHaveText('—');
    if (!pass) {
      await page.reload();
      await page.evaluate((seed) => FinanceDashboard.render(seed), seed);
    }
  }
  await screenshot(page, 'account-rolling-expense');
});

test('@responsive @safari today and yesterday cards include the correct days and allow equal changes for today-only spending', async ({
  page,
}) => {
  const seed = structuredClone(snapshot);
  seed.settings = {
    start: '2026-01-01',
    asof: '2026-03-15',
    valuation: '2026-03-15',
  };
  for (const [yesterday, today, expected] of [
    [10, 0, ['0,00 €', '-10,00 €']],
    [10, 5, ['-5,00 €', '-15,00 €']],
    [0, 5, ['-5,00 €', '-5,00 €']],
  ]) {
    seed.tables.tCuentas = [
      {
        Cuenta: 'EFECTIVO',
        'Saldo inicial': 500,
        'Saldo calculado': 500 - yesterday - today,
      },
    ];
    seed.tables.tMovimientos = [
      { Fecha: '2026-03-14', Origen: 'EFECTIVO', Importe: yesterday },
      { Fecha: '2026-03-15', Origen: 'EFECTIVO', Importe: today },
    ];
    await setup(page, seed);
    await navigate(page, 'accounts');
    const cells = page.locator('.account-balance-card .comparison-cell');
    await expect(cells.nth(0).locator('strong')).toHaveText(expected[0]);
    await expect(cells.nth(1).locator('strong')).toHaveText(expected[1]);
    await expect(cells.nth(0)).toHaveAttribute(
      'title',
      /inicio del 15\/3\/2026/,
    );
    await expect(cells.nth(1)).toHaveAttribute(
      'title',
      /inicio del 14\/3\/2026/,
    );
  }
  const cells = page.locator('.account-balance-card .comparison-cell');
  const boxes = await cells.evaluateAll((nodes) =>
    nodes.map((n) => ({
      x: n.getBoundingClientRect().x,
      y: n.getBoundingClientRect().y,
    })),
  );
  for (let row = 0; row < 4; row++) {
    expect(boxes[row * 2].y).toBe(boxes[row * 2 + 1].y);
    expect(boxes[row * 2].x).toBeLessThan(boxes[row * 2 + 1].x);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await screenshot(page, 'account-opening-horizons');
});

test('@responsive account historical-change cards, separated resources and emergency fund preserve the same underlying assignments', async ({
  page,
}) => {
  const seed = structuredClone(snapshot);
  seed.tables.tAsignaciones = [
    { Objetivo: 'FICTITIOUS-GOAL', Origen: 'Banco ficticio', Importe: 300 },
    { Objetivo: 'FICTITIOUS-GOAL', Origen: 'FICTITIOUS-ALPHA', Importe: 250 },
  ];
  seed.tables.tObjetivos[0].Asignado = 550;
  await setup(page, seed);
  await navigate(page, 'accounts');
  await expect(page.locator('.account-balance-card')).toHaveCount(3);
  await expect(
    page.locator('.account-balance-card .comparison-cell'),
  ).toHaveCount(24);
  expect(
    await page
      .locator('.account-balance-card')
      .first()
      .locator('.comparison-cell span')
      .allTextContents(),
  ).toEqual(['Hoy', '1D', '7D', '15D', '1M', '3M', '6M', '1A']);
  await expect(page.locator('.account-balance-card').first()).not.toContainText(
    '%',
  );
  await expect(page.locator('#account-reconciliation')).toBeHidden();
  await expect(page.locator('#forecast-chart .chart-card')).toHaveCount(0);
  await screenshot(page, 'account-comparisons');
  await navigate(page, 'budgets');
  await page.locator('#goal-resources > summary').click();
  await expect(page.locator('[data-resource-kind=account]')).toContainText(
    'Banco ficticio',
  );
  await expect(page.locator('[data-resource-kind=account]')).not.toContainText(
    'Fondo Alfa ficticio',
  );
  await expect(page.locator('[data-resource-kind=product]')).toContainText(
    'Fondo Alfa ficticio',
  );
  await page.locator('#emergency-goal').selectOption('FICTITIOUS-GOAL');
  await expect(
    page.locator('#emergency-fund .kpi-value').first(),
  ).toContainText('300,00');
  await expect(page.locator('#emergency-fund .kpi-value').nth(2)).toContainText(
    /1\.?700,00/,
  );
  await expect(page.locator('#emergency-fund')).toContainText('250,00');
  await page
    .locator('#emergency-fund')
    .getByRole('button', { name: 'Gestionar reservas', exact: true })
    .click();
  await expect(page.locator('#goal-assign-goal')).toHaveValue(
    'FICTITIOUS-GOAL',
  );
  await page.locator('#goal-assign-cancel').click();
  await screenshot(page, 'emergency-resources');
  await setup(page, seed);
  await navigate(page, 'budgets');
  await expect(page.locator('#emergency-goal')).toHaveValue('FICTITIOUS-GOAL');
  const other = structuredClone(seed);
  other.bookKey = 'e'.repeat(64);
  await page.evaluate(
    (value) => FinanceDashboard.render(value, { review() {} }),
    other,
  );
  await expect(page.locator('#emergency-goal')).toHaveValue('');
  expect(await page.evaluate(() => window.reviewedOperations)).toBeUndefined();
});

test('@responsive @safari account order and investment total include all four funds and pocket contributions', async ({
  page,
}) => {
  const seed = structuredClone(snapshot);
  seed.tables.tCuentas = [
    'Trade Republic',
    'MyInvestor',
    'EFECTIVO',
    'Bankinter',
    'Unicaja',
  ].map((Cuenta) => ({ Cuenta, 'Saldo inicial': 100, 'Saldo calculado': 100 }));
  seed.tables.tMovimientos = [];
  seed.tables.tProductos = [1, 2, 3, 4].map((n) => ({
    ...snapshot.tables.tProductos[0],
    ID: 'F' + n,
    Producto: 'Fondo ficticio ' + n,
    'Unidades base': 10,
    'Coste base': 100,
    Participaciones: n === 1 ? 15 : 10,
    Valor: n === 1 ? 150 : 100,
    'Aportado neto': n === 1 ? 150 : 100,
    Resultado: 0,
    Rentabilidad: 0,
  }));
  seed.tables.tOperaciones = [
    {
      ID: 'BUY',
      Producto: 'F1',
      Fecha: '2026-03-15',
      Tipo: 'Compra',
      Participaciones: 5,
      Precio: 10,
      Importe: 50,
    },
  ];
  seed.tables.tPrecios = [1, 2, 3, 4].map((n) => ({
    Producto: 'F' + n,
    Fecha: '2026-01-01',
    'VL EUR': 10,
  }));
  await setup(page, seed);
  await navigate(page, 'accounts');
  await expect(page.locator('#account-comparisons h3')).toHaveText([
    'Total',
    'Unicaja',
    'Bankinter',
    'Efectivo físico',
    'MyInvestor',
    'Trade Republic',
  ]);
  await expect(
    page.locator('#account-comparisons .balance-total .account-balance'),
  ).toHaveText('500,00 €');
  await navigate(page, 'investments');
  const cards = page.locator('.investment-balance-card');
  await expect(cards).toHaveCount(5);
  await expect(cards.first().locator('h3')).toHaveText('Total');
  await expect(cards.first().locator('.account-balance')).toHaveText(
    '450,00 €',
  );
  await expect(
    cards.first().locator('.comparison-cell').first().locator('strong'),
  ).toHaveText('+50,00 €');
  await expect(
    page.locator('[data-product="F1"] .comparison-cell strong').first(),
  ).toHaveText('+50,00 €');
  await expect(
    page.locator('[data-product="F2"] .comparison-cell strong').first(),
  ).toHaveText('0,00 €');
  await expect(
    cards.first().locator('.comparison-cell').last().locator('strong'),
  ).toHaveText('—');
  await expect(page.locator('#investment-kpis')).toContainText('0,00');
  await page.locator('#investment-product').selectOption('F2');
  await expect(cards).toHaveCount(5);
  await expect(cards.first().locator('.account-balance')).toHaveText(
    '450,00 €',
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await screenshot(page, 'investment-comparisons');
  await page.evaluate(() => FinanceDashboard.render(null));
  await expect(page.locator('#investment-comparisons')).toBeEmpty();
});

test('@responsive @safari all 24 themes retain readable foregrounds and persist across reopening', async ({
  page,
}) => {
  // Appearance does not depend on a book; avoid computing every financial chart.
  await page.goto('/');
  await navigate(page, 'connection');
  const themes = await page
    .locator('#theme-preference option')
    .evaluateAll((options) =>
      options.map((o) => o.value).filter((v) => v !== 'system'),
    );
  expect(themes).toHaveLength(24);
  for (const theme of themes) {
    await page.locator('#theme-preference').selectOption(theme);
    const ratios = await page.evaluate(() => {
      const css = getComputedStyle(document.documentElement);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const c = canvas.getContext('2d', { willReadFrequently: true });
      const luminances = new Map();
      const luminance = (color) => {
        if (luminances.has(color)) return luminances.get(color);
        c.clearRect(0, 0, 1, 1);
        c.fillStyle = color;
        c.fillRect(0, 0, 1, 1);
        const rgb = [...c.getImageData(0, 0, 1, 1).data]
          .slice(0, 3)
          .map((x) => {
            x /= 255;
            return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
          });
        const value = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
        luminances.set(color, value);
        return value;
      };
      const contrast = (fg, bg) => {
        const resolve = (color) =>
          color.startsWith('--') ? css.getPropertyValue(color) : color;
        const a = luminance(resolve(fg)),
          b = luminance(resolve(bg));
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      };
      const cells = ['comparison-positive', 'comparison-negative'].map(
        (tone) => {
          const cell = document.createElement('div');
          cell.className = 'comparison-cell ' + tone;
          document.body.append(cell);
          const style = getComputedStyle(cell);
          const pair = {
            fg: tone,
            bg: 'tinted surface',
            value: contrast(style.color, style.backgroundColor),
          };
          cell.remove();
          return pair;
        },
      );
      return ['--bg', '--sidebar', '--surface', '--surface-raised']
        .flatMap((bg) =>
          ['--text', '--muted', '--subtle', '--series-mint', '--danger'].map(
            (fg) => ({ fg, bg, value: contrast(fg, bg) }),
          ),
        )
        .concat(cells, [
          {
            fg: '--accent-ink',
            bg: '--accent',
            value: contrast('--accent-ink', '--accent'),
          },
        ]);
    });
    for (const ratio of ratios)
      expect(
        ratio.value,
        `${theme}: ${ratio.fg} on ${ratio.bg}`,
      ).toBeGreaterThanOrEqual(4.5);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    expect(
      await page.evaluate(() => localStorage.getItem('finances.theme')),
    ).toBe(theme);
  }
  await page.reload();
  await expect(page.locator('#theme-preference')).toHaveValue(themes.at(-1));
  await expect(page.locator('.appearance-preview')).toBeVisible();
});

test('performance result crosses the year boundary while unavailable exact TWR stays explicitly unavailable', async ({
  page,
}) => {
  const seed = structuredClone(snapshot);
  seed.settings = {
    start: '2025-12-31',
    asof: '2026-01-05',
    valuation: '2026-01-05',
  };
  seed.tables.tProductos = [
    {
      ID: 'SYNTHETIC',
      Producto: 'Synthetic fund',
      'Fecha base': '2025-12-31',
      'Unidades base': 0,
      'Coste base': 0,
      Participaciones: 20,
      Valor: 240,
      'Aportado neto': 210,
      Resultado: 30,
    },
  ];
  seed.tables.tOperaciones = [
    {
      Producto: 'SYNTHETIC',
      Fecha: '2025-12-31',
      Tipo: 'Compra',
      Participaciones: 10,
      Precio: 10,
      Importe: 100,
    },
    {
      Producto: 'SYNTHETIC',
      Fecha: '2026-01-03',
      Tipo: 'Compra',
      Participaciones: 10,
      Precio: 11,
      Importe: 110,
    },
  ];
  seed.tables.tPrecios = [
    { Producto: 'SYNTHETIC', Fecha: '2025-12-31', 'VL EUR': 10 },
    { Producto: 'SYNTHETIC', Fecha: '2026-01-05', 'VL EUR': 12 },
  ];
  await setup(page, seed);
  await navigate(page, 'investments');
  const performance = page.locator('#investment-charts .chart-card').nth(1);
  await expect(page.locator('#investment-measure')).toHaveValue('adjusted');
  await expect(performance.locator('.chart-readout')).toContainText('20,83 %');
  await page.locator('#investment-measure').selectOption('result');
  await expect(performance).toContainText('Resultado sobre aportación neta');
  await expect(
    performance.getByLabel('Hasta Resultado sobre aportación neta'),
  ).toHaveValue('2026-01-05');
  await expect(performance.locator('.chart-readout')).toContainText('14,29 %');
  await performance.locator('.finance-chart').focus();
  await page.keyboard.press('Home');
  await expect(performance.locator('.chart-readout')).toContainText(
    '31 dic 2025',
  );
  await page.keyboard.press('End');
  await expect(performance.locator('.chart-readout')).toContainText(
    '05 ene 2026',
  );
  await page.locator('#investment-measure').selectOption('twr');
  await expect(performance.locator('.chart-readout')).toContainText('Sin dato');
  await page.locator('#investment-measure').selectOption('result');
  await expect(performance.locator('.chart-readout')).toContainText('14,29 %');
});

test('@responsive portfolio analytics stay visible together below existing charts and follow product/period filters', async ({
  page,
}) => {
  const seed = structuredClone(snapshot);
  seed.settings.valuation = seed.settings.asof = '2026-04-15';
  seed.tables.tPrecios = [];
  for (let i = 0; i < 15; i++) {
    const date = new Date(Date.parse('2026-01-02') + i * 7 * 86400000)
      .toISOString()
      .slice(0, 10);
    for (const [j, p] of seed.tables.tProductos.entries())
      seed.tables.tPrecios.push({
        Producto: p.ID,
        Fecha: date,
        'VL EUR': 100 + i * i * (j + 1),
      });
  }
  await setup(page, seed);
  await navigate(page, 'investments');
  const panel = page.locator('#portfolio-analysis-charts');
  await expect(panel.locator('.chart-card')).toHaveCount(7);
  for (const title of [
    'Rentabilidad por mes',
    'TIR anualizada',
    'Caídas desde máximos',
    'Tiempo bajo máximos',
    'Contribución al resultado',
    'Volatilidad anualizada',
    'Correlación entre fondos',
  ])
    await expect(
      panel.getByRole('heading', { name: title, exact: true }),
    ).toBeVisible();
  await expect(page.locator('#investment-measure option')).toHaveCount(3);
  await expect(panel.locator('.correlation-table tbody tr')).toHaveCount(2);
  await expect(panel).toContainText('muestra corta; provisional');
  const tir = panel.locator('.chart-card').filter({
    has: page.getByRole('heading', { name: 'TIR anualizada', exact: true }),
  });
  await tir
    .getByText('Flujos de la TIR al último corte', { exact: true })
    .click();
  await expect(tir.locator('.chart-table').last()).toContainText('1/2/2026');
  await page.locator('#investment-measure').selectOption('twr');
  await expect(page.locator('#investment-charts .chart-warning')).toContainText(
    'TWR incompleto',
  );
  await expect(page.locator('#investment-charts .chart-warning')).toContainText(
    '1/2/2026',
  );
  await expect(panel.locator('.chart-card')).toHaveCount(7);
  await page
    .locator('#investment-product')
    .selectOption(seed.tables.tProductos[1].ID);
  await expect(page.locator('#portfolio-analysis-note')).toContainText(
    seed.tables.tProductos[1].Producto,
  );
  await expect(panel).toContainText('Se necesitan dos fondos');
  await page.locator('#investment-range').selectOption('3m');
  await expect(panel).toContainText('Histórico insuficiente');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await screenshot(page, 'portfolio-analysis');
});

test('@responsive calendar average returns appear below profit with inspectable partial-period returns', async ({
  page,
}) => {
  const seed = structuredClone(snapshot);
  seed.tables.tProductos = [
    {
      ID: 'PARTIAL',
      Producto: 'Fondo parcial ficticio',
      'Fecha base': '2025-04-22',
      'Unidades base': 10,
      'Coste base': 100,
    },
  ];
  seed.tables.tOperaciones = [];
  seed.tables.tPrecios = [
    ['2025-04-22', 10],
    ['2025-04-30', 11],
    ['2025-05-31', 12.1],
    ['2025-12-31', 13.2],
    ['2026-01-31', 14.52],
    ['2026-02-14', 13.068],
  ].map(([Fecha, price]) => ({ Producto: 'PARTIAL', Fecha, 'VL EUR': price }));
  seed.settings.asof = seed.settings.valuation = '2026-02-14';
  await setup(page, seed);
  await navigate(page, 'investments');
  const averages = page.locator('#investment-average-returns');
  await expect(averages.locator('.kpi')).toHaveCount(2);
  await expect(
    averages.locator('.kpi').first().locator('.kpi-value'),
  ).toHaveText('5 %');
  await expect(
    averages.locator('.kpi').last().locator('.kpi-value'),
  ).toHaveText('15,5 %');
  await expect(averages).toContainText('incluye periodos parciales');
  await averages.locator('summary').click();
  await expect(
    averages.locator('table').last().locator('tbody tr'),
  ).toHaveCount(2);
  await expect(averages.locator('table').last()).toContainText('22/4/2025');
  await expect(averages.locator('table').last()).toContainText('-1 %');
  await page.locator('#investment-measure').selectOption('twr');
  await expect(
    averages.locator('.kpi').last().locator('.kpi-value'),
  ).toHaveText('15,5 %');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});

test('@responsive complete TWR replaces the redundant estimate and product return chart while retaining the simultaneous panels', async ({
  page,
}) => {
  await setup(page);
  await navigate(page, 'investments');
  await expect(page.locator('#investment-measure')).toHaveValue('twr');
  await expect(
    page.locator('#investment-measure option[value="adjusted"]'),
  ).toHaveCount(0);
  await expect(page.locator('#investment-average-returns')).toContainText(
    'Media mensual',
  );
  await expect(page.locator('#investment-average-returns')).not.toContainText(
    '(estimada)',
  );
  await page.locator('#investment-average-returns summary').click();
  await expect(page.locator('#investment-average-returns')).toContainText(
    'son medidas distintas',
  );
  await page
    .locator('#investment-product')
    .selectOption(snapshot.tables.tProductos[0].ID);
  await expect(
    page.getByRole('heading', {
      name: 'Rentabilidad total con distribuciones',
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(page.locator('#investment-charts .chart-card')).toHaveCount(2);
  await expect(
    page.locator('#portfolio-analysis-charts .chart-card'),
  ).toHaveCount(7);
  const bars = page.locator('#portfolio-analysis-charts .chart-card').first();
  await expect(
    bars.getByRole('heading', { name: 'Rentabilidad por mes', exact: true }),
  ).toBeVisible();
  await expect(bars.locator('svg path')).not.toHaveCount(0);
  await page.locator('#investment-measure').selectOption('result');
  await expect(
    page.locator('#portfolio-analysis-charts .chart-card'),
  ).toHaveCount(7);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await screenshot(page, 'complete-twr');
});

test('@responsive monthly return bars exclude deposits and use green for gains and red for losses', async ({
  page,
}) => {
  const seed = structuredClone(snapshot);
  seed.settings.start = '2025-01-01';
  seed.settings.asof = seed.settings.valuation = '2025-03-31';
  seed.tables.tProductos = [
    {
      ID: 'FLOW',
      Producto: 'Fondo de prueba',
      'Fecha base': '2025-01-01',
      'Unidades base': 10,
      'Coste base': 100,
    },
  ];
  seed.tables.tOperaciones = [
    {
      ID: 'DEPOSIT',
      Producto: 'FLOW',
      Fecha: '2025-01-15',
      Tipo: 'Compra',
      Participaciones: 10,
      Precio: 10,
      Importe: 100,
    },
  ];
  seed.tables.tPrecios = [
    ['2025-01-01', 10],
    ['2025-01-31', 10],
    ['2025-02-28', 11],
    ['2025-03-31', 10.89],
  ].map(([Fecha, price]) => ({ Producto: 'FLOW', Fecha, 'VL EUR': price }));
  await setup(page, seed);
  await navigate(page, 'investments');
  const chart = page.locator('#portfolio-analysis-charts .chart-card').filter({
    has: page.getByRole('heading', {
      name: 'Rentabilidad por mes',
      exact: true,
    }),
  });
  const monthlyBars = (await chartSeries(chart))[0].data;
  expect(monthlyBars.filter((d) => d.value >= 0)).toHaveLength(2);
  expect(monthlyBars.filter((d) => d.value < 0)).toHaveLength(1);
  const colors = await chart.evaluate(
    (node) => FinanceChartRenderer.palette(node).colors,
  );
  for (const [i, expected] of [0, 10, -1].entries()) {
    expect(monthlyBars[i].value).toBeCloseTo(expected, 12);
    expect(monthlyBars[i].itemStyle.color).toBe(
      colors[expected < 0 ? 'chart-red' : 'chart-mint'],
    );
  }
  await chart.getByText('Ver datos', { exact: true }).click();
  const rows = chart.locator('.chart-table tbody tr');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('2025-01');
  await expect(rows.nth(0)).toContainText('0 %');
  await expect(rows.nth(1)).toContainText('10 %');
  await expect(rows.nth(2)).toContainText('-1 %');
  await page.locator('#investment-measure').selectOption('twr');
  await expect(chart.locator('.chart-table tbody tr').first()).toContainText(
    '0 %',
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  expect(
    await chart
      .locator('svg text')
      .evaluateAll((nodes) =>
        nodes.some((n) => /^-0(?:[,.]0+)?$/.test(n.textContent.trim())),
      ),
  ).toBe(false);
});

test.describe('Cross-view responsive layout', () => {
  // Include browser/page fixture setup in the existing test-specific budget.
  test.beforeEach(({}, info) => info.setTimeout(90000));
  test('@responsive @safari shared chart and form controls fit every main view on phones and tablets', async ({
    page,
  }) => {
    await setup(page);
    for (const width of [320, 375, 414, 768, 1024]) {
      await page.setViewportSize({ width, height: 896 });
      for (const view of [
        'home',
        'book',
        'investments',
        'accounts',
        'salary',
        'budgets',
        'tools',
        'connection',
      ]) {
        await navigate(page, view);
        const layout = await page.evaluate(() => {
          const controls = [
            ...document.querySelectorAll(
              '.chart-date-field input, .field input, .field select',
            ),
          ].filter(
            (n) =>
              n.getClientRects().length && n.getBoundingClientRect().width > 3,
          );
          return {
            page: document.documentElement.scrollWidth,
            viewport: innerWidth,
            oversizedCharts: [...document.querySelectorAll('[data-renderer]')]
              .filter(
                (n) =>
                  n.getClientRects().length &&
                  n.getBoundingClientRect().width > 1,
              )
              .filter((n) => {
                const image = n.querySelector('svg');
                return (
                  image &&
                  image.getBoundingClientRect().width >
                    n.getBoundingClientRect().width + 1
                );
              })
              .map((n) => n.getAttribute('aria-label')),
            overflow: controls
              .filter((n) => {
                const a = n.getBoundingClientRect(),
                  b = n
                    .closest('.chart-date-field, .field')
                    .getBoundingClientRect();
                return a.left < b.left - 1 || a.right > b.right + 1;
              })
              .map((n) => n.id || n.getAttribute('aria-label')),
          };
        });
        expect(layout.page, view + ' at ' + width).toBeLessThanOrEqual(
          layout.viewport,
        );
        expect(layout.overflow, view + ' at ' + width).toEqual([]);
        expect(
          layout.oversizedCharts,
          view + ' vector bounds at ' + width,
        ).toEqual([]);
      }
    }
    await navigate(page, 'home');
    const dates = page.locator('.chart-date-controls:visible').first();
    await expect(dates).toBeVisible();
    const from = dates.locator('input[type=date]').first();
    const before = await from.inputValue();
    await dates.locator('input[type=range]').first().focus();
    await page.keyboard.press('ArrowRight');
    await expect(from).not.toHaveValue(before);
  });
});

test('@responsive @safari vector charts preserve pointer selection, nulls, full-screen controls and disposal', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await setup(page);
  await page.evaluate(() => {
    window.chartSelections = [];
    FinanceCharts.clear(document.getElementById('dashboard-charts'));
    FinanceCharts.plot(document.getElementById('dashboard-charts'), {
      title: 'Auditoría vectorial',
      rows: [
        { date: '2026-01-01', value: 301.123456 },
        { date: '2026-01-05', value: null },
        { date: '2026-02-01', value: 290 },
      ],
      fields: [{ key: 'value', label: 'Valor' }],
      onSelect: (row) => window.chartSelections.push(row),
    });
  });
  const chart = page.locator('#dashboard-charts .chart-card');
  const host = chart.locator('.finance-chart');
  await host.scrollIntoViewIfNeeded();
  const point = await host.evaluate((node) => {
    const engine = FinanceECharts.getInstanceByDom(node);
    const rect = node.getBoundingClientRect();
    return {
      x:
        rect.left +
        engine.convertToPixel(
          { xAxisIndex: 0 },
          Date.parse('2026-01-05T00:00:00Z'),
        ),
      y: rect.top + 100,
    };
  });
  await page.mouse.click(point.x, point.y);
  await expect(chart.locator('.chart-readout')).toContainText(
    'Valor: Sin dato',
  );
  expect(await page.evaluate(() => window.chartSelections)).toEqual([
    { date: '2026-01-05', value: null },
  ]);
  await chart.locator('.chart-menu summary').click();
  await chart
    .getByRole('button', { name: 'Ampliar gráfico', exact: true })
    .click();
  const dialog = page.getByRole('dialog', {
    name: 'Auditoría vectorial',
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Desde Auditoría vectorial').fill('2026-01-05');
  await dialog.getByLabel('Desde Auditoría vectorial').dispatchEvent('change');
  await dialog.locator('.finance-chart').focus();
  await page.keyboard.press('End');
  await expect(dialog.locator('.chart-readout')).toContainText('290,00');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(chart.locator('.chart-menu summary')).toBeFocused();
  await page.evaluate(() => {
    const host = document.querySelector('#dashboard-charts .finance-chart');
    window.disposedChartHost = host;
    FinanceCharts.clear(document.getElementById('dashboard-charts'));
  });
  expect(
    await page.evaluate(
      () =>
        FinanceECharts.getInstanceByDom(window.disposedChartHost) === undefined,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test('@responsive @safari compositions adapt to many groups and retain unknown values, signed data and live theme colors', async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(() => {
    const parent = document.getElementById('dashboard-charts');
    FinanceCharts.clear(parent);
    FinanceCharts.donut(parent, {
      title: 'Composición extensa',
      rows: [
        ...Array.from({ length: 6 }, (_, i) => ({
          label: 'Grupo ' + i,
          value: i + 1,
        })),
        { label: 'Desconocido', value: null },
        { label: 'Devolución', value: -2 },
      ],
    });
    window.distributionSelected = null;
    FinanceCharts.donut(parent, {
      title: 'Composición breve',
      rows: [
        { label: 'A', value: 40 },
        { label: 'B', value: 60 },
      ],
      onSelect: (row) => (window.distributionSelected = row),
    });
  });
  const large = page.locator('.chart-card').filter({
    has: page.getByRole('heading', {
      name: 'Composición extensa',
      exact: true,
    }),
  });
  expect((await chartState(large)).series[0].type).toBe('bar');
  expect((await chartSeries(large))[0].data.map((d) => d.value)).toEqual([
    1, 2, 3, 4, 5, 6,
  ]);
  expect(
    new Set((await chartSeries(large))[0].data.map((d) => d.itemStyle.color))
      .size,
  ).toBe(6);
  await expect(large).toContainText('Peso desconocido');
  await expect(large).toContainText('devoluciones netas negativas');
  await large.locator('.chart-data > summary').click();
  await expect(large.locator('tbody')).toContainText('-2,00');
  const small = page.locator('.chart-card').filter({
    has: page.getByRole('heading', {
      name: 'Composición breve',
      exact: true,
    }),
  });
  expect((await chartSeries(small))[0].type).toBe('pie');
  const pie = small.locator('.donut-chart');
  await pie.scrollIntoViewIfNeeded();
  const rect = await pie.boundingBox();
  await page.mouse.click(rect.x + rect.width / 2 + 70, rect.y + 125 - 70);
  expect(await page.evaluate(() => window.distributionSelected)).toEqual({
    label: 'A',
    value: 40,
  });
  const before = (await chartSeries(small))[0].data[0].itemStyle.color;
  await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
  await expect
    .poll(async () => (await chartSeries(small))[0].data[0].itemStyle.color)
    .not.toBe(before);
  await small
    .locator('button.distribution-item')
    .filter({ hasText: 'B' })
    .click();
  await expect(small.locator('.chart-readout')).toContainText('60 %');
});

test('@responsive @safari expanded city charts keep the selected movement detail inside the active dialog', async ({
  page,
}) => {
  await setup(page);
  await navigate(page, 'book');
  const city = page.locator('#spending-charts .chart-card').filter({
    has: page.getByRole('heading', { name: 'Gasto por ciudad', exact: true }),
  });
  await city.locator('.chart-menu summary').click();
  await city
    .getByRole('button', { name: 'Ampliar gráfico', exact: true })
    .click();
  const dialog = page.getByRole('dialog', {
    name: 'Gasto por ciudad',
    exact: true,
  });
  const host = dialog.locator('.finance-chart');
  await host.scrollIntoViewIfNeeded();
  const point = await host.evaluate((node) => {
    const engine = FinanceECharts.getInstanceByDom(node),
      rect = node.getBoundingClientRect();
    return {
      x: rect.left + 170,
      y: rect.top + engine.convertToPixel({ yAxisIndex: 0 }, 0),
    };
  });
  await page.mouse.click(point.x, point.y);
  const detail = dialog.locator('.transaction-selection');
  await expect(detail).toBeVisible();
  await expect(detail.locator('tbody tr')).not.toHaveCount(0);
  await expect(dialog.locator('.chart-readout')).toContainText(
    'Ciudad ficticia',
  );
  await page.keyboard.press('Escape');
  await expect(city.locator('.transaction-selection')).toBeVisible();
});

test('@responsive @safari fund contribution losses are red and gains green with exact values', async ({
  page,
}) => {
  const seed = structuredClone(snapshot);
  for (const price of seed.tables.tPrecios)
    price['VL EUR'] =
      price.Producto === 'FICTITIOUS-ALPHA'
        ? price.Fecha === '2026-01-01'
          ? 100
          : 50
        : price.Fecha === '2026-01-01'
          ? 80
          : 150;
  await setup(page, seed);
  await navigate(page, 'investments');
  const chart = page.locator('#portfolio-analysis-charts .chart-card').filter({
    has: page.getByRole('heading', {
      name: 'Contribución al resultado',
      exact: true,
    }),
  });
  const data = (await chartSeries(chart))[0].data;
  expect(data.some((d) => d.value < 0)).toBeTruthy();
  expect(data.some((d) => d.value > 0)).toBeTruthy();
  const colors = await chart.evaluate(
    (node) => FinanceChartRenderer.palette(node).colors,
  );
  for (const item of data)
    expect(item.itemStyle.color).toBe(
      colors[item.value < 0 ? 'chart-red' : 'chart-mint'],
    );
  await chart.locator('.chart-data > summary').click();
  for (const item of data)
    await expect(chart.locator('tbody')).toContainText(
      new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency: 'EUR',
      }).format(item.value),
    );
});
