const { test, expect } = require('@playwright/test');
const fs = require('node:fs'),
  path = require('node:path');
const deployment = 'https://script.google.com/macros/s/fixture-deployment/exec';

test('CSP bloquea código inyectado y conexiones a terceros manteniendo la app funcional', async ({
  page,
}) => {
  await page.goto('/');
  const results = await page.evaluate(async () => {
    const violations = [];
    document.addEventListener('securitypolicyviolation', (event) =>
      violations.push(event.violatedDirective),
    );
    const injected = document.createElement('script');
    injected.textContent = 'window.compromised = true;';
    document.body.append(injected);
    let blocked = false;
    try {
      await fetch('https://example.invalid/finance-test');
    } catch {
      blocked = true;
    }
    await new Promise((resolve) => setTimeout(resolve, 30));
    return { ran: window.compromised === true, blocked, violations };
  });
  expect(results.ran).toBe(false);
  expect(results.blocked).toBe(true);
  expect(results.violations).toContain('script-src-elem');
  expect(results.violations).toContain('connect-src');
  await nav(page, 'connection').click();
  await page.locator('#setup-toggle').click();
  await expect(page.locator('#setup-dialog')).toBeVisible();
});

test('la app incrustada no lee IndexedDB ni permite conectar o configurar Google', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localReads = 0;
    const original = indexedDB.open.bind(indexedDB);
    indexedDB.open = (...args) => {
      window.localReads++;
      return original(...args);
    };
    localStorage.setItem(
      'finances.appsScriptUrl',
      'https://script.google.com/macros/s/fixture-deployment/exec',
    );
  });
  await page.goto('/preview.html');
  for (const id of ['mobile-preview', 'desktop-preview']) {
    const frame = page.frameLocator('#' + id);
    await expect(frame.locator('#finance-state')).toContainText(
      'Abre Finanzas en su propia ventana',
    );
    for (const selector of ['#finance-connect', '#connect', '#setup-toggle'])
      await expect(frame.locator(selector)).toBeDisabled();
    expect(await frame.locator('body').evaluate(() => window.localReads)).toBe(
      0,
    );
  }
});

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
  {
    lost = false,
    bridgeFailure = false,
    missing = false,
    hostile = false,
    production = false,
    open = true,
  } = {},
) {
  const seed = JSON.parse(JSON.stringify(snapshot));
  seed.environment = production ? 'production' : 'test';
  seed.supportsBookBinding = true;
  seed.supportsBudgets = true;
  seed.budgets = [];
  seed.charts = {
    monthly: [
      { label: 'ene 2026', income: 500, expense: 2.5, cash: 1000 },
      { label: 'feb 2026', income: null, expense: null, cash: null },
    ],
    categories: [{ label: 'Comida', value: 2.5 }],
    cities: [{ label: 'Madrid', value: 2.5 }],
    investments: [{ label: '2026-01', capital: 10, value: 12.34 }],
    positions: [
      {
        label: 'Fondo ficticio',
        group: 'Renta variable',
        value: missing ? null : 12.34,
      },
    ],
    salary: [],
  };
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
    ({ deployment, seed, lost, bridgeFailure }) => {
      localStorage.setItem('finances.appsScriptUrl', deployment);
      if (!localStorage.getItem('fixture.server'))
        localStorage.setItem(
          'fixture.server',
          JSON.stringify({
            snapshot: seed,
            journal: {},
            calls: [],
            lost,
            bridgeFailure,
          }),
        );
    },
    { deployment, seed, lost, bridgeFailure },
  );
  const mock = `\nFinanceApiClient = class {constructor(url){this.url=url;this.session=null;}connect(){this.session={};return Promise.resolve({ok:true,apiVersion:'3.3.0'});}close(){this.session=null;}acceptance(){const s=JSON.parse(localStorage.getItem('fixture.server')).snapshot;return Promise.resolve({ok:true,readOnly:true,environment:s.environment,buildVersion:'3.4.0',technicalReady:true,checks:{backend:true,calculations:true,summary:true,bridge:true,sources:true,stable:true},results:[]});}read(){return Promise.resolve(JSON.parse(localStorage.getItem('fixture.server')).snapshot);}async submit(envelope){const s=JSON.parse(localStorage.getItem('fixture.server'));s.calls.push(envelope);if(!s.journal[envelope.requestId]){s.snapshot.revision='r'+(s.calls.length+1);for(const op of envelope.operations||[]){if(op.process==='presupuesto'){const b=s.snapshot.budgets.find(b=>b.month===op.month&&b.category===op.category);if(b)b.amount=op.amount;else s.snapshot.budgets.push({month:op.month,category:op.category,amount:op.amount});}if(op.process==='quitar_presupuesto')s.snapshot.budgets=s.snapshot.budgets.filter(b=>b.month!==op.month||b.category!==op.category);if(op.process==='gasto')s.snapshot.tables.tMovimientos.push({ID:'NEW-'+envelope.requestId,Fecha:op.date,Tipo:'Gasto',Concepto:op.concept,Origen:op.account,Subcategoría:op.category,Importe:op.amount,Recuperable:op.recoverable,Localización:op.location,Recurrente:op.recurring});}s.journal[envelope.requestId]={ok:true,revision:s.snapshot.revision,results:[],complete:envelope.action!=='refreshPrices'};if(envelope.action==='refreshPrices')s.journal[envelope.requestId].results=[{ok:false,referenceName:'Fondo ficticio',message:'Fuente sin identidad verificable'}];}const result=s.journal[envelope.requestId];const lost=s.lost;s.lost=false;localStorage.setItem('fixture.server',JSON.stringify(s));if(lost)throw Error('RESPONSE_UNCERTAIN');if(s.bridgeFailure){s.bridgeFailure=false;localStorage.setItem('fixture.server',JSON.stringify(s));return {ok:false,error:'RESPONSE_UNCERTAIN',message:'Respuesta de Google no confirmada'};}return result;}requestStatus(envelope){return Promise.resolve(JSON.parse(localStorage.getItem('fixture.server')).journal[envelope.requestId]||{ok:true,found:false});}};`;
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
  if (!open) return;
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
async function setupChannel(page, { delayed = false } = {}) {
  await setup(page, { open: false });
  await page.unroute('**/api.js');
  await page.route('**/api.js', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: fs.readFileSync(
        path.resolve(__dirname, '../../web/api.js'),
        'utf8',
      ),
    }),
  );
  await page.context().route(`${deployment}?*`, (route) =>
    route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html><meta charset="utf-8"><title>Google ficticio</title><script>
        const snapshot = ${JSON.stringify(snapshot)};
        const state = new URL(location.href).searchParams.get('state');
        window.fixtureCalls = [];
        let delay = ${delayed};
        addEventListener('message', event => {
          const m = event.data;
          if (event.source !== opener || event.origin !== 'http://127.0.0.1:4173' || m.state !== state) return;
          window.fixtureCalls.push(m.request);
          const reply = result => opener.postMessage({type:'finances.api.response.v1', state, callId:m.callId, result}, event.origin);
          if (m.request.action === 'read') {
            if (delay) { delay = false; window.replyRead = () => reply(snapshot); }
            else reply(snapshot);
          } else if (m.request.action === 'transact') {
            const op = m.request.operations[0];
            snapshot.tables.tMovimientos.push({ID:'FICTICIO',Fecha:op.date,Tipo:'Gasto',Concepto:op.concept,Origen:op.account,Subcategoría:op.category,Importe:op.amount,Recuperable:op.recoverable,Localización:op.location,Recurrente:op.recurring});
            snapshot.revision = 'r2';
            reply({ok:true,revision:'r2',results:[]});
          }
        });
        opener.postMessage({type:'finances.connection.v1',state,ok:true,apiVersion:'3.3.0',environment:'test',modelVersion:3,sheetCount:10,checkedAt:'2026-01-02T10:00:00Z'},'http://127.0.0.1:4173');
      </script>`,
    }),
  );
  await page.reload();
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
  await expect(page.locator('#finance-new')).toBeEnabled();
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

test('producción se identifica en ordenador/móvil y la comprobación del sistema no envía operaciones', async ({
  page,
}) => {
  await setup(page, { production: true });
  await expect(page.locator('#finance-state')).toContainText('libro principal');
  await expect(page.locator('#app-version')).toContainText('Libro principal');
  await nav(page, 'connection').click();
  await page.locator('#acceptance-check').click();
  await expect(page.locator('#acceptance-result')).toContainText(
    'Libro principal · versión 3.4.0',
  );
  await expect(page.locator('#acceptance-result')).toContainText(
    'Comprobaciones técnicas correctas',
  );
  await expect(page.locator('#acceptance-result')).toContainText(
    'No se han guardado precios ni operaciones',
  );
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('fixture.server')).calls,
    ),
  ).toEqual([]);
});

test('comprobación con fuentes fallidas exige revisión sin presentar el sistema como listo', async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(() => {
    FinanceApiClient.prototype.acceptance = async () => ({
      ok: true,
      environment: 'test',
      buildVersion: '3.4.0',
      technicalReady: false,
      checks: {
        backend: true,
        calculations: true,
        summary: true,
        bridge: true,
        sources: false,
        stable: true,
      },
      results: [
        {
          ok: false,
          referenceName: 'Fondo ficticio',
          error: 'SOURCE_FORMAT',
          message: 'Fuente sin campos verificables',
        },
      ],
    });
  });
  await nav(page, 'connection').click();
  await page.locator('#acceptance-check').click();
  await expect(page.locator('#acceptance-result')).toContainText(
    'Revisar: fuentes de precios',
  );
  await expect(page.locator('#acceptance-result')).toContainText(
    'Fondo ficticio: Fuente sin campos verificables',
  );
  await expect(page.locator('#acceptance-result')).not.toContainText(
    'Comprobaciones técnicas correctas',
  );
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('fixture.server')).calls,
    ),
  ).toEqual([]);
});

test('Nuevo movimiento abre Google y el formulario directamente sin comprobar estructura previamente', async ({
  page,
}) => {
  await setup(page, { open: false });
  await expect(page.locator('#finance-new')).toBeEnabled();
  await page.locator('#finance-new').click();
  await expect(page.locator('#operation-dialog')).toBeVisible();
  await expect(page.locator('#operation-account')).toContainText('Cuenta A');
  await expect(page.locator('#finance-state')).toContainText(
    'Lectura confirmada',
  );
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('fixture.server')).calls.length,
    ),
  ).toBe(0);
});
test('el alta abre el formulario y muestra un bloqueo de ventanas en la misma vista', async ({
  page,
}) => {
  await setupChannel(page);
  await page.evaluate(() => {
    window.fixtureOpen = window.open;
    window.open = () => null;
  });
  await nav(page, 'book').click();
  await page.locator('#view-book [data-operation=gasto]').click();
  await expect(page.locator('#operation-dialog')).toBeVisible();
  await expect(page.locator('#operation-connection')).toContainText('Permite');
  await expect(page.locator('#operation-load')).toBeEnabled();
  await expect(page.locator('#operation-review')).toBeDisabled();
  await page.locator('#operation-concept').fill('Borrador ficticio');
  await page.locator('#operation-amount').fill('2,50');
  await page.evaluate(() => {
    window.open = window.fixtureOpen;
  });
  await page.locator('#operation-load').click();
  await expect(page.locator('#operation-review')).toBeEnabled();
  await expect(page.locator('#operation-account')).toContainText('Cuenta A');
  await expect(page.locator('#operation-concept')).toHaveValue(
    'Borrador ficticio',
  );
  await expect(page.locator('#operation-amount')).toHaveValue('2,50');
  await page.locator('#operation-cancel').click();
  await expect(page.locator('#view-book [data-finance-state]')).toContainText(
    'Lectura confirmada',
  );
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('fixture.server')).calls,
    ),
  ).toEqual([]);
});
test('el cliente y postMessage con Google ficticio conservan el borrador y registran solo tras confirmar', async ({
  page,
}) => {
  await setupChannel(page, { delayed: true });
  await nav(page, 'book').click();
  const opening = page.waitForEvent('popup');
  await page.locator('#view-book [data-operation=gasto]').click();
  const popup = await opening;
  await popup.waitForFunction(() => typeof window.replyRead === 'function');
  await expect(page.locator('#operation-dialog')).toBeVisible();
  await page.locator('#operation-concept').fill('Alta por canal ficticio');
  await page.locator('#operation-amount').fill('4,50');
  await expect(page.locator('#operation-review')).toBeDisabled();
  await popup.evaluate(() => window.replyRead());
  await expect(page.locator('#operation-account')).toContainText('Cuenta A');
  await expect(page.locator('#operation-concept')).toHaveValue(
    'Alta por canal ficticio',
  );
  await expect(page.locator('#operation-amount')).toHaveValue('4,50');
  await page.locator('#operation-date').fill('2026-01-02');
  await page.locator('#operation-account').selectOption('Cuenta A');
  await page.locator('#operation-category').selectOption('Café');
  await page.locator('#operation-review').click();
  expect(
    await popup.evaluate(
      () => window.fixtureCalls.filter((r) => r.action === 'transact').length,
    ),
  ).toBe(0);
  await page.locator('#review-confirm').click();
  await expect(page.locator('#finance-register')).toContainText(
    'Alta por canal ficticio',
  );
  expect(
    await popup.evaluate(
      () => window.fixtureCalls.filter((r) => r.action === 'transact').length,
    ),
  ).toBe(1);
});
test('registro ofrece ingreso y transferencia sin volver al inicio y guardar un gasto actualiza el listado', async ({
  page,
}) => {
  await setup(page);
  await nav(page, 'book').click();
  await page.locator('#view-book [data-operation=ingreso]').click();
  await expect(page.locator('#operation-kind')).toHaveValue('ingreso');
  await page.locator('#operation-cancel').click();
  await page.locator('#view-book [data-operation=gasto]').click();
  await page.locator('#operation-date').fill('2026-01-02');
  await page.locator('#operation-concept').fill('Alta visible ficticia');
  await page.locator('#operation-account').selectOption('Cuenta A');
  await page.locator('#operation-category').selectOption('Café');
  await page.locator('#operation-amount').fill('4,50');
  await page.locator('#operation-form button[type=submit]').click();
  await page.locator('#review-confirm').click();
  await expect(page.locator('#finance-register')).toContainText(
    'Alta visible ficticia',
  );
});
test('panel muestra gráficos nativos accesibles y meses desconocidos sin convertirlos en cero', async ({
  page,
}) => {
  await setup(page);
  await expect(page.locator('#dashboard-charts .chart-card')).toHaveCount(9);
  await expect(page.locator('#dashboard-charts svg[role=img]')).toHaveCount(8);
  await page.locator('.chart-data summary').first().click();
  await expect(page.locator('.chart-table').first()).toContainText('Sin dato');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test('presupuesto se revisa, persiste al reabrir y se retira sin crear un movimiento', async ({
  page,
}) => {
  await setup(page);
  await nav(page, 'budgets').click();
  await page.locator('#budget-new').click();
  await page.locator('#budget-amount').fill('20');
  await page.locator('#budget-category').selectOption('Café');
  await page.locator('#budget-form button[type=submit]').click();
  await expect(page.locator('#review-fields')).toContainText('20');
  await page.locator('#review-confirm').click();
  await expect(page.locator('#budget-cards')).toContainText('20,00');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.reload();
  await nav(page, 'budgets').click();
  await expect(page.locator('#budget-cards')).toContainText('20,00');
  await page.locator('#view-budgets [data-open-book]').click();
  await expect(page.locator('#finance-state')).toContainText(
    'Lectura confirmada',
  );
  await page.getByRole('button', { name: 'Quitar límite' }).click();
  await page.locator('#review-confirm').click();
  await expect(page.locator('#budget-cards')).toContainText('no tiene límites');
  const s = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('fixture.server')),
  );
  expect(s.snapshot.tables.tMovimientos).toHaveLength(1);
  expect(s.calls.map((c) => c.operations[0].process)).toEqual([
    'presupuesto',
    'quitar_presupuesto',
  ]);
  await nav(page, 'home').click();
  await page.locator('#finance-clear').click();
  await page.locator('#review-confirm').click();
  await expect(page.locator('#budget-spent')).toHaveText('Sin dato');
  await expect(page.locator('#saving-goals')).toBeEmpty();
  await expect(page.locator('#dashboard-charts')).toBeEmpty();
});

test('fallo del puente no permite descartar ni recrear y consulta el recibo al reabrir', async ({
  page,
}) => {
  await setup(page, { bridgeFailure: true });
  await expense(page);
  await page.locator('#review-confirm').click();
  const queue = page.locator('#finance-queue');
  await expect(queue).toContainText('sin confirmar');
  await expect(queue.getByRole('button', { name: 'Descartar' })).toHaveCount(0);
  await expect(
    queue.getByRole('button', { name: 'Revisar', exact: true }),
  ).toHaveCount(0);
  const before = await page.evaluate(
    () => JSON.parse(localStorage.getItem('fixture.server')).calls,
  );
  await page.reload();
  await page.locator('#finance-connect').click();
  await page.locator('#finance-sync').click();
  await expect(queue).toContainText('Confirmada por Google');
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('fixture.server')).calls,
    ),
  ).toEqual(before);
});

test('cambiar de implementación durante la conexión cancela la lectura antigua sin mezclar libros', async ({
  page,
}) => {
  await setup(page, { open: false });
  await page.evaluate(() => {
    FinanceApiClient.prototype.connect = function () {
      this.session = {};
      return new Promise((resolve) => {
        window.finishHandshake = () =>
          resolve({ ok: true, apiVersion: '3.3.0' });
      });
    };
  });
  await page.locator('#finance-connect').click();
  await nav(page, 'connection').click();
  await page.locator('#setup-toggle').click();
  const next = 'https://script.google.com/macros/s/other-fixture/exec';
  await page.locator('#deployment-url').fill(next);
  await page.locator('#setup-save').click();
  await expect(page.locator('#finance-state')).toContainText(
    'Abre Google para cargar',
  );
  await page.evaluate(() => window.finishHandshake());
  await expect(page.locator('#finance-state')).toContainText(
    'La configuración cambió',
  );
  const saved = await page.evaluate(async (next) => {
    const store = new FinanceSync.BrowserStore();
    return store.get(await FinanceSync.namespace(next));
  }, next);
  expect(saved.snapshot).toBeNull();
  expect(saved.bookKey).toBeNull();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('fixture.server')).calls,
    ),
  ).toEqual([]);
});
