const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { navigate } = require('./helpers/navigation.cjs');
const snapshot = {
  ok: true,
  apiVersion: '3.3.0',
  bookKey: 'a'.repeat(64),
  environment: 'test',
  revision: 'r1',
  checkedAt: '2026-01-02T12:00:00Z',
  backendReady: true,
  calculationState: 'ready',
  settings: {
    start: '2026-01-01',
    asof: '2026-01-02',
    valuation: '2026-01-01',
  },
  summary: {
    complete: true,
    missingPrices: [],
    filters: { Año: 2026, Periodo: 'Todo el año', Cuenta: 'Todas' },
    metrics: [
      { label: 'Patrimonio neto', value: 1012.34 },
      { label: 'Efectivo', value: 1000 },
      { label: 'Inversiones', value: 12.34 },
      { label: 'Deuda', value: 0 },
    ],
  },
  tables: {
    tCuentas: [
      {
        Cuenta: 'Cuenta A',
        'Saldo inicial': 1000,
        'Saldo calculado': 1000,
        'Saldo real': null,
        'Fecha saldo': null,
      },
      { Cuenta: 'Cuenta B', 'Saldo inicial': 0, 'Saldo calculado': 0 },
    ],
    tCategorias: [
      {
        Grupo: 'Gastos',
        Subgrupo: 'Hogar',
        Categoría: 'Comida',
        Subcategoría: 'Café',
      },
      {
        Grupo: 'Ingresos',
        Subgrupo: 'Trabajo',
        Categoría: 'Sueldo',
        Subcategoría: 'Nómina',
      },
    ],
    tProductos: [
      {
        ID: 'INTERNAL-PRODUCT',
        Producto: 'Fondo ficticio',
        Cuenta: 'Cuenta A',
        Clase: 'Renta variable',
        Participaciones: 2,
        Valor: 12.34,
      },
    ],
    tMovimientos: [
      {
        ID: 'INTERNAL-MOVEMENT',
        Fecha: '2026-01-02',
        Tipo: 'Gasto',
        Concepto: 'Café de prueba',
        Origen: 'Cuenta A',
        Destino: null,
        Importe: 2.5,
        Recuperable: 0,
        Subcategoría: 'Café',
        Localización: null,
        Recurrente: null,
      },
    ],
    tOperaciones: [],
    tPrecios: [
      {
        Producto: 'INTERNAL-PRODUCT',
        Fecha: '2026-01-01',
        'VL EUR': 6.17,
        Fuente: 'Dato ficticio',
      },
    ],
    tDeudas: [],
    tVinculos: [],
    tNominas: [],
    tObjetivos: [],
    tAsignaciones: [],
  },
  observations: [
    {
      account: 'Cuenta A',
      amount: 995,
      date: '2026-01-02',
      time: null,
      scope: 'desconocido',
      source: 'Referencia ficticia',
      comparisonStatus: 'referencia_sin_corte_comparable',
      difference: null,
    },
  ],
  prices: [
    {
      product: 'INTERNAL-PRODUCT',
      name: 'Fondo ficticio',
      isin: null,
      lastValid: { date: '2026-01-01', price: 6.17, source: 'Dato ficticio' },
      lastAttempt: {
        checkedAt: '2026-01-02T12:00:00Z',
        status: 'failed',
        detail: {
          ok: false,
          error: 'SOURCE_FORMAT',
          message: 'Fuente sin identidad verificable',
        },
      },
    },
  ],
};

async function setupRecords(page) {
  const seed = structuredClone(snapshot);
  seed.tables.tCuentas.push({ Cuenta: 'EFECTIVO', 'Saldo calculado': 25 });
  seed.tables.tMovimientos.push({
    ID: 'SECOND',
    Fecha: '2026-01-01',
    Tipo: 'Gasto',
    Concepto: 'Metro',
    Origen: 'EFECTIVO',
    Importe: 10,
    Recuperable: 3,
    Localización: 'Madrid',
    Recurrente: true,
    Subcategoría: 'Café',
  });
  seed.prices[0].isin = 'ES0123456789';
  seed.prices[0].lastValid.source =
    'https://www.quefondos.com/es/fondos/ficha/index.html?isin=ES0123456789';
  seed.tables.tPrecios[0].Fuente = seed.prices[0].lastValid.source;
  await page.addInitScript((seed) => {
    localStorage.setItem(
      'finances.appsScriptUrl',
      'https://script.google.com/macros/s/fixture-deployment/exec',
    );
    window.recordsFixture = seed;
  }, seed);
  await page.route('**/api.js', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body:
        fs.readFileSync(path.resolve(__dirname, '../../web/api.js'), 'utf8') +
        `
FinanceApiClient = class {
  constructor(url) { this.url = url; this.session = null; }
  connect() { this.session = { rpcReady: true }; return Promise.resolve({ ok: true, apiVersion: '3.3.0' }); }
  close() { this.session = null; }
  read() { return Promise.resolve(window.recordsFixture); }
};`,
    }),
  );
  await page.goto('/');
  await page.locator('#finance-connect').click();
  await expect(page.locator('#finance-state')).toContainText(
    'Lectura confirmada',
  );
  await navigate(page, 'book');
}

test('cada columna permite ordenar con teclado y filtrar texto, fecha y número', async ({
  page,
}) => {
  await setupRecords(page);
  const register = page.locator('#finance-register');
  for (const field of ['Concepto', 'Localización', 'Recuperable', 'Recurrente'])
    await expect(
      register.locator('th').filter({ hasText: field }),
    ).toBeVisible();
  const sort = register.getByRole('button', {
    name: 'Ordenar por Importe',
    exact: true,
  });
  await sort.focus();
  await page.keyboard.press('Enter');
  await expect(register.locator('th[aria-sort="ascending"]')).toHaveText(
    'Importe',
  );
  await expect(register.locator('tbody > tr').first()).toContainText(
    'Café de prueba',
  );
  await page.keyboard.press('Enter');
  await expect(register.locator('th[aria-sort="descending"]')).toHaveText(
    'Importe',
  );
  await expect(register.locator('tbody > tr').first()).toContainText('Metro');
  await register
    .getByRole('searchbox', { name: 'Filtrar Concepto', exact: true })
    .fill('metro');
  await register
    .getByRole('searchbox', { name: 'Filtrar Concepto', exact: true })
    .press('Tab');
  await expect(register).not.toContainText('Café de prueba');
  await expect(register).toContainText('Efectivo');
  await expect(register).not.toContainText('EFECTIVO');
  await register
    .getByLabel('Filtrar Importe desde', { exact: true })
    .fill('11');
  await register
    .getByLabel('Filtrar Importe desde', { exact: true })
    .press('Tab');
  await expect(register).toContainText('No hay registros para esta selección');
  await register.getByLabel('Filtrar Importe desde', { exact: true }).fill('');
  await register
    .getByLabel('Filtrar Importe desde', { exact: true })
    .press('Tab');
  await register
    .getByLabel('Filtrar Fecha desde', { exact: true })
    .fill('2026-01-02');
  await register
    .getByLabel('Filtrar Fecha desde', { exact: true })
    .press('Tab');
  await expect(register).toContainText('No hay registros para esta selección');
});

test('caja conserva esenciales y presenta el concepto generado en revisión', async ({
  page,
}) => {
  await setupRecords(page);
  await page.locator('#view-book [data-operation=gasto]').click();
  expect(
    await page
      .locator('#operation-kind option')
      .evaluateAll((nodes) => nodes.map((n) => n.value)),
  ).toEqual([
    'gasto',
    'ingreso',
    'traspaso',
    'devolucion_gasto',
    'cobro_compartido',
  ]);
  for (const id of ['date', 'account', 'category', 'amount'])
    await expect(page.locator('#operation-' + id)).toBeVisible();
  await expect(page.locator('#operation-concept')).toBeHidden();
  for (const id of ['date', 'account', 'category', 'amount']) {
    const size = await page.locator('#operation-' + id).boundingBox();
    expect(size.height).toBeGreaterThanOrEqual(44);
  }
  const additional = page.locator('.operation-additional');
  const summary = additional.locator('summary');
  expect((await summary.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await summary.click();
  await expect(additional).toContainText(
    'Si dejas el concepto vacío se guardará «Gasto»',
  );
  await expect(page.locator('#operation-concept')).toBeVisible();
  await summary.click();
  await expect(page.locator('#operation-concept')).not.toHaveAttribute(
    'required',
  );
  await page.locator('#operation-account').selectOption('EFECTIVO');
  await expect(page.locator('#operation-account option:checked')).toHaveText(
    'Efectivo',
  );
  await page.locator('#operation-category').selectOption('Café');
  await page.locator('#operation-amount').fill('4,25');
  await page.locator('#operation-form button[type=submit]').click();
  await expect(page.locator('#review-fields')).toContainText('Gasto');
  await expect(page.locator('#review-fields')).toContainText('Efectivo');
});

test('inversiones obtiene ISIN del catálogo y limita los enlaces de fuentes', async ({
  page,
}) => {
  await setupRecords(page);
  await navigate(page, 'investments');
  await expect(page.locator('#finance-register')).toContainText('ES0123456789');
  await page.locator('#register-tab-tPrecios').click();
  const links = page.locator('#finance-register a');
  await expect(links).toHaveCount(2);
  await expect(links.first()).toHaveText('Fuente');
  await expect(links.first()).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(page.locator('#finance-register')).not.toContainText('https://');
  await page.evaluate(() => {
    window.recordsFixture.tables.tPrecios[0].Fuente =
      'https://www.quefondos.com.evil.example/fund';
  });
  await page.locator('#finance-refresh').click();
  await expect(page.locator('#finance-register .finance-table a')).toHaveCount(
    0,
  );
  await expect(page.locator('#finance-register .finance-table')).toContainText(
    'Fuente sin enlace verificado',
  );
});

test('móvil conserva filtros y orden en la tabla sin desbordar la página', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setupRecords(page);
  const register = page.locator('#finance-register');
  const sort = register.getByRole('button', {
    name: 'Ordenar por Concepto',
    exact: true,
  });
  const filter = register.getByRole('searchbox', {
    name: 'Filtrar Concepto',
    exact: true,
  });
  await expect(sort).toBeVisible();
  await expect(filter).toBeVisible();
  expect((await sort.boundingBox()).height).toBeGreaterThanOrEqual(44);
  expect((await sort.boundingBox()).width).toBeGreaterThanOrEqual(44);
  expect((await filter.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await sort.focus();
  await page.keyboard.press('Enter');
  await expect(register.locator('th[aria-sort="ascending"]')).toHaveText(
    'Concepto',
  );
  await filter.fill('metro');
  await filter.press('Tab');
  await expect(register).toContainText('Metro');
  await expect(register).not.toContainText('Café de prueba');
  const dimensions = await register
    .locator('.table-scroll')
    .evaluate((node) => ({
      tableOverflowsContainer: node.scrollWidth > node.clientWidth,
      pageWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      overflow: getComputedStyle(node).overflowX,
    }));
  expect(dimensions.tableOverflowsContainer).toBe(true);
  expect(['auto', 'scroll']).toContain(dimensions.overflow);
  expect(dimensions.pageWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
});
