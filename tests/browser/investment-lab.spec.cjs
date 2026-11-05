const { test, expect } = require('@playwright/test');
const path = require('node:path');

test('@responsive allocation, exposure and income are visible without writing to the book', async ({
  page,
}) => {
  await page.setContent('<main id="host"></main>');
  for (const file of [
    'analytics.js',
    'portfolio.js',
    'vendor/echarts.min.js',
    'chart-renderer.js',
    'charts.js',
    'investment-tools.js',
    'investment-lab.js',
  ])
    await page.addScriptTag({ path: path.join(__dirname, '../../web', file) });
  await page.evaluate(() => {
    window.fixture = {
      bookKey: 'fictional-book',
      settings: {
        start: '2026-01-01',
        asof: '2026-03-01',
        valuation: '2026-03-01',
      },
      summary: { missingPrices: [] },
      prices: [{ product: 'a', isin: 'IE00BYX5NX33' }],
      tables: {
        tProductos: [
          { ID: 'a', Producto: 'Fondo A', Valor: 60, 'Unidades base': 0 },
          { ID: 'b', Producto: 'Fondo B', Valor: 40, 'Unidades base': 0 },
        ],
        tOperaciones: [
          { Producto: 'a', Tipo: 'Cobro', Fecha: '2026-02-01', Importe: 2 },
        ],
        tPrecios: [],
      },
    };
    window.originalFixture = JSON.stringify(window.fixture);
    FinanceInvestmentLab.render(
      window.fixture,
      document.querySelector('#host'),
      '',
    );
  });
  await page.getByText('Reparto objetivo', { exact: true }).click();
  await page.getByLabel('Fondo A · objetivo %').fill('50');
  await page.getByLabel('Fondo B · objetivo %').fill('50');
  await page.getByLabel('Aportación a simular (€)').fill('20');
  await page.getByRole('button', { name: 'Simular aportación' }).click();
  await expect(
    page.getByText(
      'Simulación calculada; los objetivos aún no se han guardado.',
    ),
  ).toBeVisible();
  await expect(page.getByRole('cell', { name: '20,00 €' })).toBeVisible();
  await page.getByText('Exposición de la cartera', { exact: true }).click();
  await page.getByLabel('Fichas de exposición (JSON)').setInputFiles({
    name: 'fixture.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify([
        {
          isin: 'IE00BYX5NX33',
          date: '2026-01-01',
          source: 'Ficha ficticia',
          countries: [{ name: 'EE. UU.', percent: 50 }],
          sectors: [],
        },
      ]),
    ),
  });
  await expect(page.getByText('Fichas aplicadas: 1')).toBeVisible();
  await expect(
    page.getByRole('cell', { name: 'Ficha ficticia' }),
  ).toBeVisible();
  await page.getByText('Cobros de inversiones', { exact: true }).click();
  await expect(page.getByText(/Total registrado: 2,00/)).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.stringify(window.fixture) === window.originalFixture,
    ),
  ).toBe(true);
});

test('@responsive bank import requires explicit mapping and categories before producing a reviewed batch', async ({
  page,
}) => {
  await page.setContent(`<main>
    <input id="bank-file" type="file"><select id="bank-account"></select>
    <select id="bank-separator"><option value=";">;</option></select>
    <select id="bank-decimal"><option value=",">,</option></select>
    <select id="bank-date-format"><option value="dmy">dmy</option></select>
    <div id="bank-mapping"></div><div id="bank-preview-rows"></div><p id="bank-import-status"></p>
    <button id="bank-preview">Previsualizar</button><button id="bank-review">Revisar</button>
  </main>`);
  for (const file of ['domain.js', 'bank-import.js'])
    await page.addScriptTag({ path: path.join(__dirname, '../../web', file) });
  await page.evaluate(() => {
    window.snap = {
      bookKey: 'fixture',
      revision: 'r1',
      capabilities: { bankImports: true },
      tables: {
        tCuentas: [{ Cuenta: 'Banco' }],
        tCategorias: [{ Grupo: 'Gastos', Subcategoría: 'Café' }],
        tMovimientos: [],
      },
    };
    const form = FinanceBankImport.bind({
      snapshot: () => window.snap,
      review: (ops, revision) => {
        window.reviewed = { ops, revision };
      },
    });
    form.refresh(window.snap);
  });
  await page.locator('#bank-account').selectOption('Banco');
  await page.locator('#bank-file').setInputFiles({
    name: 'fixture.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'Fecha;Concepto;Importe;Referencia\n02/01/2026;Café;-2,50;ABC-1',
    ),
  });
  for (const [key, index] of [
    ['date', '0'],
    ['concept', '1'],
    ['amount', '2'],
    ['reference', '3'],
  ])
    await page.locator(`[data-bank-column="${key}"]`).selectOption(index);
  await page.getByRole('button', { name: 'Previsualizar' }).click();
  await expect(page.locator('#bank-import-status')).toContainText('1 filas');
  await page.getByRole('button', { name: 'Revisar', exact: true }).click();
  await expect(page.locator('#bank-import-status')).toContainText(
    'Elige una subcategoría',
  );
  await page.locator('#bank-preview-rows select').selectOption('Café');
  await page.getByRole('button', { name: 'Revisar', exact: true }).click();
  const result = await page.evaluate(() => window.reviewed);
  expect(result.revision).toBe('r1');
  expect(result.ops).toHaveLength(1);
  expect(result.ops[0]).toMatchObject({
    process: 'gasto',
    amount: 2.5,
    bankRef: 'ABC-1',
    account: 'Banco',
    category: 'Café',
  });
});

test('portfolio comparison uses the last common real valuation and reports its date', async ({
  page,
}) => {
  await page.setContent('<main id="host"></main>');
  for (const file of [
    'analytics.js',
    'portfolio.js',
    'vendor/echarts.min.js',
    'chart-renderer.js',
    'charts.js',
    'investment-tools.js',
    'investment-lab.js',
  ])
    await page.addScriptTag({ path: path.join(__dirname, '../../web', file) });
  await page.evaluate(() => {
    const snapshot = {
      bookKey: 'compare-fixture',
      settings: {
        start: '2026-01-01',
        asof: '2026-02-02',
        valuation: '2026-02-02',
      },
      summary: { missingPrices: [] },
      prices: [],
      tables: {
        tProductos: [
          {
            ID: 'a',
            Producto: 'Referencia',
            'Fecha base': '2026-01-01',
            'Unidades base': 0,
            'Coste base': 0,
            Valor: 120,
          },
        ],
        tOperaciones: [
          {
            ID: 'buy',
            Producto: 'a',
            Tipo: 'Compra',
            Fecha: '2026-01-01',
            Participaciones: 10,
            Precio: 10,
            Importe: 100,
          },
        ],
        tPrecios: [
          { Producto: 'a', Fecha: '2026-01-01', 'VL EUR': 10 },
          { Producto: 'a', Fecha: '2026-02-01', 'VL EUR': 12 },
        ],
      },
    };
    FinanceInvestmentLab.render(snapshot, document.querySelector('#host'), '');
  });
  await page.getByText('Comparar carteras', { exact: true }).click();
  await page.getByLabel('Fondo de referencia').selectOption('a');
  await page.getByRole('button', { name: 'Calcular comparación' }).click();
  await expect(
    page.getByText(/Al 2026-02-01: cartera real 120,00/),
  ).toBeVisible();
  await expect(page.getByText(/Último corte común/)).toBeVisible();
});
