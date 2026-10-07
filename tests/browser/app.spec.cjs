const { test, expect } = require('@playwright/test');
const fs = require('node:fs'),
  path = require('node:path');
const deployment = 'https://script.google.com/macros/s/fixture-deployment/exec';

test('el instalador copia cada archivo en su botón y Bridge comienza por HTML', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/install.html');
  for (const [index, name] of [
    'Code.gs',
    'Bridge.html',
    'appsscript.json',
  ].entries()) {
    const button = page.locator('[data-copy="code-' + index + '"]');
    await expect(button).toHaveText('Copiar ' + name);
    const expected = await page.locator('#code-' + index).textContent();
    await button.click();
    await expect(page.locator('#copy-status')).toContainText(
      name + ' copiado.',
    );
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      expected,
    );
    if (name === 'Bridge.html')
      expect(expected.trim()).toMatch(/^<!doctype html>/i);
  }
});
const snapshot = {
  ok: true,
  apiVersion: '3.3.0',
  bookKey: 'fixture-book-hash',
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
async function setup(
  page,
  { lost = false, missing = false, hostile = false } = {},
) {
  const seed = JSON.parse(JSON.stringify(snapshot));
  if (missing) {
    seed.summary.missingPrices = ['Fondo ficticio'];
    seed.summary.complete = false;
    seed.summary.metrics
      .filter((m) => ['Inversiones', 'Patrimonio neto'].includes(m.label))
      .forEach((m) => (m.value = null));
  }
  if (hostile)
    seed.tables.tMovimientos[0].Concepto =
      '<img src=x onerror="window.compromised=true">';
  await page.addInitScript(
    ({ deployment, seed, lost }) => {
      localStorage.setItem('finances.appsScriptUrl', deployment);
      if (!localStorage.getItem('fixture.server'))
        localStorage.setItem(
          'fixture.server',
          JSON.stringify({ snapshot: seed, journal: {}, calls: [], lost }),
        );
    },
    { deployment, seed, lost },
  );
  const mock = `\nFinanceApiClient = class {constructor(url){this.url=url;this.session=null;}connect(){this.session={};return Promise.resolve({ok:true,apiVersion:'3.3.0'});}close(){this.session=null;}read(){return Promise.resolve(JSON.parse(localStorage.getItem('fixture.server')).snapshot);}async submit(envelope){const s=JSON.parse(localStorage.getItem('fixture.server'));s.calls.push(envelope);if(!s.journal[envelope.requestId]){s.snapshot.revision='r'+(s.calls.length+1);s.journal[envelope.requestId]={ok:true,revision:s.snapshot.revision,results:[],complete:envelope.action!=='refreshPrices'};if(envelope.action==='refreshPrices')s.journal[envelope.requestId].results=[{ok:false,referenceName:'Fondo ficticio',message:'Fuente sin identidad verificable'}];}const result=s.journal[envelope.requestId];const lost=s.lost;s.lost=false;localStorage.setItem('fixture.server',JSON.stringify(s));if(lost)throw Error('RESPONSE_UNCERTAIN');return result;}requestStatus(envelope){return Promise.resolve(JSON.parse(localStorage.getItem('fixture.server')).journal[envelope.requestId]||{ok:true,found:false});}};`;
  await page.route('**/api.js', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body:
        fs.readFileSync(path.resolve(__dirname, '../../web/api.js'), 'utf8') +
        mock,
    }),
  );
  // El service worker se comprueba aparte: estas pruebas interceptan un backend ficticio.
  await page.route('**/sw.js', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: 'self.addEventListener("install",()=>{});',
    }),
  );
  await page.goto('/');
  await expect(page.locator('#finance-connect')).toBeEnabled();
  await page.locator('#finance-connect').click();
  await expect(page.locator('#finance-state')).toContainText(
    'Lectura confirmada',
  );
}
async function expense(page) {
  await page.locator('#finance-new').click();
  await page.locator('#operation-date').fill('2026-01-02');
  await page.locator('#operation-concept').fill('Compra ficticia');
  await page.locator('#operation-account').selectOption('Cuenta A');
  await page.locator('#operation-category').selectOption('Café');
  await page.locator('#operation-amount').fill('12,34');
  await page.locator('#operation-form button[type=submit]').click();
}
function nav(page, name) {
  return page.locator('nav button[data-view="' + name + '"]:visible');
}
test('lectura nativa, filtros y móvil conservan nombres, desconocidos y el error de precios', async ({
  page,
}) => {
  await setup(page);
  await expect(page.locator('#finance-kpis')).toContainText(/1[.]?012,34/);
  await expect(page.locator('#finance-warning')).toContainText(
    'La última consulta de precios falló',
  );
  await nav(page, 'book').click();
  await page.locator('#finance-search').fill('no existe');
  await expect(page.locator('#finance-register')).toContainText(
    'No hay registros',
  );
  await page.locator('#finance-search').fill('Café');
  await expect(page.locator('#finance-register')).toContainText(
    'Café de prueba',
  );
  await expect(page.locator('#finance-register')).not.toContainText(
    'INTERNAL-MOVEMENT',
  );
  await page.locator('#finance-section').selectOption('observations');
  await page.locator('#finance-search').fill('');
  await expect(page.locator('#finance-register')).toContainText('Sin dato');
  await expect(page.locator('#finance-register-note')).toContainText(
    'corte equivalente',
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
});
test('revisión previa, cancelar sin enviar y confirmación guarda una sola solicitud', async ({
  page,
}) => {
  await setup(page);
  await expense(page);
  await expect(page.locator('#review-fields')).toContainText('12.34');
  await page.locator('#review-cancel').click();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('fixture.server')).calls.length,
    ),
  ).toBe(0);
  await page.locator('#operation-form button[type=submit]').click();
  await page.locator('#review-confirm').click();
  await expect(page.locator('#finance-queue')).toContainText(
    'Confirmada por Google',
  );
  const calls = await page.evaluate(
    () => JSON.parse(localStorage.getItem('fixture.server')).calls,
  );
  expect(calls).toHaveLength(1);
  expect(calls[0].operations[0].amount).toBe(12.34);
  expect(calls[0].operations[0].recurring).toBe(null);
});
test('respuesta perdida y reapertura conservan sobre y consultan antes de reintentar', async ({
  page,
}) => {
  await setup(page, { lost: true });
  await expense(page);
  await page.locator('#review-confirm').click();
  await expect(page.locator('#finance-queue')).toContainText('sin confirmar');
  const before = await page.evaluate(
    () => JSON.parse(localStorage.getItem('fixture.server')).calls,
  );
  await page.reload();
  await expect(page.locator('#finance-queue')).toContainText('sin confirmar');
  await page.locator('#finance-connect').click();
  await page.locator('#finance-sync').click();
  await expect(page.locator('#finance-queue')).toContainText(
    'Confirmada por Google',
  );
  const after = await page.evaluate(
    () => JSON.parse(localStorage.getItem('fixture.server')).calls,
  );
  expect(after).toEqual(before);
});
test('sin conexión guarda pendiente en IndexedDB y la app vuelve a abrir con su copia local', async ({
  page,
  context,
}) => {
  await setup(page);
  await page.reload();
  await expect(page.locator('#finance-state')).toContainText('Copia local');
  await context.setOffline(true);
  await expense(page);
  await page.locator('#review-confirm').click();
  await expect(page.locator('#finance-queue')).toContainText(
    'Pendiente de enviar',
  );
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('fixture.server')).calls.length,
    ),
  ).toBe(0);
  await context.setOffline(false);
  await page.reload();
  await expect(page.locator('#finance-queue')).toContainText(
    'Pendiente de enviar',
  );
});
test('la inversión sin precio no aparece como cero y el texto del libro no ejecuta HTML', async ({
  page,
}) => {
  await setup(page, { missing: true, hostile: true });
  await expect(page.locator('#finance-kpis')).toContainText('Sin dato');
  await expect(page.locator('#finance-warning')).toContainText(
    'Valoración incompleta',
  );
  await expect(page.locator('#finance-recent')).toContainText('<img src=x');
  expect(await page.evaluate(() => window.compromised)).toBeUndefined();
});
test('nómina desconocida y precio con precisión completa se revisan con nombres', async ({
  page,
}) => {
  await setup(page);
  await page.locator('#finance-new').click();
  await page.locator('#operation-kind').selectOption('nomina');
  await page.locator('#operation-concept').fill('Paga ficticia');
  await page.locator('#operation-account').selectOption('Cuenta A');
  await page.locator('#operation-category').selectOption('Nómina');
  await page.locator('#operation-amount').fill('1200,33');
  await page.locator('#operation-form button[type=submit]').click();
  await expect(page.locator('#review-fields')).toContainText('Sin dato');
  await page.locator('#review-cancel').click();
  await page.locator('#operation-kind').selectOption('precio');
  await page.locator('#operation-product').selectOption('INTERNAL-PRODUCT');
  await page.locator('#operation-price').fill('14,490500');
  await page.locator('#operation-source').fill('Fuente ficticia');
  await page.locator('#operation-form button[type=submit]').click();
  await expect(page.locator('#review-fields')).toContainText('Fondo ficticio');
  await expect(page.locator('#review-fields')).toContainText('14.4905');
  await expect(page.locator('#review-fields')).not.toContainText(
    'INTERNAL-PRODUCT',
  );
});
test('cambio de implementación conserva y separa pendientes; no se envían al otro enlace', async ({
  page,
}) => {
  await setup(page);
  await page.reload();
  await expense(page);
  await page.locator('#review-confirm').click();
  await expect(page.locator('#finance-queue')).toContainText(
    'Pendiente de enviar',
  );
  await nav(page, 'connection').click();
  await page.locator('#setup-toggle').click();
  await page
    .locator('#deployment-url')
    .fill('https://script.google.com/macros/s/other-fixture/exec');
  await page.locator('#setup-save').click();
  await nav(page, 'home').click();
  await expect(page.locator('#finance-new')).toBeDisabled();
  await expect(page.locator('#finance-queue')).not.toContainText(
    'Compra ficticia',
  );
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('fixture.server')).calls.length,
    ),
  ).toBe(0);
});
test('un envío de precios confirmado con fallos nunca se presenta como cotización actualizada', async ({
  page,
}) => {
  await setup(page);
  await nav(page, 'book').click();
  await page.locator('#finance-prices').click();
  await page.locator('#review-confirm').click();
  await nav(page, 'home').click();
  await expect(page.locator('#finance-queue')).toContainText(
    'Solicitud confirmada con precios pendientes',
  );
});
test.describe('PWA instalable', () => {
  test.use({ serviceWorkers: 'allow' });
  test('instalación cachea solo archivos públicos y permite abrir la app sin conexión', async ({
    page,
    context,
  }) => {
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect
      .poll(async () =>
        page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
      )
      .toBe(true);
    const urls = await page.evaluate(async () => {
      const result = [];
      for (const key of await caches.keys()) {
        const cache = await caches.open(key);
        result.push(...(await cache.keys()).map((r) => r.url));
      }
      return result;
    });
    expect(urls.some((url) => url.includes('script.google'))).toBe(false);
    expect(urls.some((url) => url.endsWith('/index.html'))).toBe(true);
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#home-title')).toBeVisible();
    await nav(page, 'tools').click();
    await expect(page.locator('#inflation-form')).toBeVisible();
  });
});
