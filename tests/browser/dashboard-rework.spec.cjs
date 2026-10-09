const { test, expect } = require('@playwright/test');
const { navigate } = require('./helpers/navigation.cjs');
async function screenshot(page, name) {
  const viewport = page.viewportSize().width < 600 ? 'mobile' : 'desktop';
  await page.screenshot({
    path: test.info().outputPath('dashboard-' + name + '-' + viewport + '.png'),
    fullPage: true,
  });
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

async function setup(page) {
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
  }, snapshot);
}

test('resumen concentra patrimonio, caja seleccionable y gráficos accesibles', async ({
  page,
}) => {
  await setup(page);
  await expect(page.locator('#finance-kpis')).toContainText('Patrimonio neto');
  await expect(page.locator('#finance-kpis')).toContainText(
    'Saldo libre del mes',
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
      name: 'Evolución diaria del efectivo',
      exact: true,
    }),
  });
  await expect(cash.locator('path.chart-line')).toHaveCount(3);
  await expect(cash.locator('.finance-chart circle')).toHaveCount(0);
  const accountToggle = cash.getByRole('button', {
    name: 'Banco ficticio',
    exact: true,
  });
  await accountToggle.click();
  await expect(accountToggle).toHaveAttribute('aria-pressed', 'false');
  await expect(cash.locator('path.chart-line')).toHaveCount(2);
  await accountToggle.click();
  const navigator = cash.locator('.chart-navigator');
  await navigator.focus();
  await page.keyboard.press('Home');
  await expect(cash.locator('.chart-readout')).toContainText('2026-03-01');
  await page.keyboard.press('ArrowRight');
  await expect(cash.locator('.chart-readout')).toContainText('2026-03-02');
  await page.locator('#cash-month').fill('2026-02');
  await page.locator('#cash-month').dispatchEvent('change');
  await expect(page.locator('#cash-month')).toHaveValue('2026-02');
  await expect(cash.locator(':scope > .chart-description')).toContainText(
    '2026-02',
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
});

test('gasto excluye Vivienda y recalcula el denominador; nómina y cuentas tienen gráficas propias', async ({
  page,
}) => {
  await setup(page);
  await navigate(page, 'book');
  await expect(page.locator('#spending-month')).toHaveValue('2026-03');
  await page.locator('#spending-exclude').selectOption('Vivienda');
  await expect(
    page.locator('#spending-summary .kpi').first().locator('.kpi-value'),
  ).toContainText('500,00');
  await expect(page.locator('#spending-note')).toContainText(
    'Los porcentajes usan el total restante',
  );
  const distribution = page.locator('#spending-charts .chart-card').first();
  await expect(distribution.locator('.distribution-legend')).not.toContainText(
    'Vivienda',
  );
  await expect(
    distribution.getByRole('button', { name: /Alimentación/ }),
  ).toContainText('60 %');
  await expect(
    distribution.getByRole('button', { name: /Transporte/ }),
  ).toContainText('40 %');
  await distribution.getByRole('button', { name: /Alimentación/ }).click();
  await expect(distribution.locator('.chart-readout')).toContainText(
    '60 % del total mostrado',
  );
  await expect(page.locator('#spending-charts path.chart-step')).toHaveCount(1);
  await screenshot(page, 'spending');
  await navigate(page, 'salary');
  await expect(page.locator('#salary-saving-charts')).toContainText(
    'Ahorro mensual sobre nómina',
  );
  await expect(
    page.locator('#salary-saving-charts .chart-readout'),
  ).toContainText('25 %');
  await screenshot(page, 'salary');
  await navigate(page, 'accounts');
  await expect(page.locator('#account-charts .chart-card')).toHaveCount(2);
  await expect(page.locator('#account-charts')).toContainText('Efectivo');
  await screenshot(page, 'accounts');
  await navigate(page, 'goals');
  await expect(page.locator('#goal-charts')).toContainText('Meta ficticia');
  await screenshot(page, 'goals');
});

test('selección genérica de producto y periodo conserva escalera, valor e inspección', async ({
  page,
}) => {
  await setup(page);
  await navigate(page, 'investments');
  await expect(page.locator('#investment-product option')).toHaveCount(3);
  await page.locator('#investment-product').selectOption('FICTITIOUS-ALPHA');
  await expect(page.locator('#investment-kpis')).toContainText(/1\.?210,00/);
  await expect(page.locator('#investment-kpis')).toContainText(/1\.?100,00/);
  const chart = page.locator('#investment-charts .chart-card').first();
  await expect(chart.locator('path.chart-step')).toHaveCount(1);
  await expect(chart.locator('.finance-chart circle')).toHaveCount(0);
  const allRows = await chart.locator('tbody tr').count();
  await page.locator('#investment-range').selectOption('1m');
  const monthRows = await chart.locator('tbody tr').count();
  expect(monthRows).toBeLessThan(allRows);
  expect(monthRows).toBeGreaterThan(1);
  await page.locator('#investment-range').selectOption('ytd');
  await expect(chart.locator('tbody tr')).toHaveCount(allRows);
  await page.locator('#investment-range').selectOption('all');
  await expect(chart.locator('tbody tr')).toHaveCount(allRows);
  await page.locator('#investment-product').selectOption('FICTITIOUS-BETA');
  await expect(page.locator('#investment-kpis')).toContainText('450,00');
  await expect(chart.locator(':scope > .chart-description')).toContainText(
    'Fondo Beta ficticio',
  );
  const valueToggle = chart.getByRole('button', {
    name: 'Valor de mercado',
    exact: true,
  });
  await valueToggle.click();
  await expect(valueToggle).toHaveAttribute('aria-pressed', 'false');
  await expect(chart.locator('path.chart-line')).toHaveCount(1);
  await chart.locator('.chart-navigator').focus();
  await page.keyboard.press('Home');
  await expect(chart.locator('.chart-readout')).toContainText('2026-01-01');
  await screenshot(page, 'investments');
});

test('tres nuevas calculadoras funcionan localmente y mantienen las existentes', async ({
  page,
}) => {
  await setup(page);
  await navigate(page, 'tools');
  for (const id of [
    'inflation-form',
    'mortgage-form',
    'goal-time-form',
    'goal-saving-form',
    'liquidity-form',
  ])
    await expect(page.locator('#' + id)).toBeVisible();
  for (const [field, value] of Object.entries({
    capital: '1000',
    monthly: '100',
    target: '2250',
    annualReturn: '0',
  }))
    await page.locator('#goal-time-' + field).fill(value);
  await page.locator('#goal-time-form button[type=submit]').click();
  await expect(page.locator('#goal-time-result')).toContainText('13 meses');
  await page.locator('#goal-time-monthly').fill('0');
  await expect(page.locator('#goal-time-result')).toBeHidden();
  await page.locator('#goal-time-form button[type=submit]').click();
  await expect(page.locator('#goal-time-result')).toContainText(
    'La meta no se alcanza',
  );
  for (const [field, value] of Object.entries({
    capital: '1000',
    target: '10000',
    years: '5',
    annualReturn: '0',
  }))
    await page.locator('#goal-saving-' + field).fill(value);
  await page.locator('#goal-saving-form button[type=submit]').click();
  await expect(page.locator('#goal-saving-result')).toContainText('150,00');
  for (const [field, value] of Object.entries({
    essentialMonthly: '1200',
    liquidCapital: '3000',
    targetMonths: '6',
  }))
    await page.locator('#liquidity-' + field).fill(value);
  await page.locator('#liquidity-form button[type=submit]').click();
  await expect(page.locator('#liquidity-result')).toContainText('2,5 meses');
  await expect(page.locator('#liquidity-result')).toContainText(/4\.?200,00/);
  await expect(page.locator('#goal-time-note')).toContainText('no garantiza');
  await screenshot(page, 'tools');
});

test('datos del gráfico permiten ordenar y filtrar con teclado sin alterar las series', async ({
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
  await chart.locator('summary').click();
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
  await expect(chart.locator('path.chart-line')).toHaveCount(1);
  expect(
    await page.evaluate(() => window.chartTableFixture.map((r) => r.value)),
  ).toEqual([2, 100, 15, null]);
  expect(
    await amountSort.evaluate((node) => node.getBoundingClientRect().height),
  ).toBeGreaterThanOrEqual(44);
});
