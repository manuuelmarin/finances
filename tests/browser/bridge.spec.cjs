// Canal real de la app/Bridge/Code.gs con Google y Sheets ficticios y aislados.
// No sustituye la aceptación en la implementación privada de Google.
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { runtime } = require('../helpers/runtime.cjs');
const root = path.resolve(__dirname, '../..');
const origin = 'https://manuuelmarin.github.io';
const deployment =
  'https://script.google.com/macros/s/fixture-full-bridge/exec';
const htmlEscape = (s) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

async function channel(context, options = {}) {
  const r = runtime();
  r.init();
  const calls = [];
  const nativeGet = r.ctx.Sheets.Spreadsheets.Values.batchGet;
  r.ctx.Sheets.Spreadsheets.Values.batchGet = (id, request) => {
    const result = nativeGet(id, request);
    request.ranges.forEach((range, i) => {
      if (range === "'Resumen financiero'!B2:U80")
        result.valueRanges[i].values = [
          ['Año', 2026, 'Periodo', 'Todo el año', 'Cuenta', 'Todas'],
          ['Patrimonio neto', 'Efectivo', 'Inversiones', 'Deuda'],
          [1015, 1000, 15, 0],
          ['Ingresos', 'Gastos propios', 'Ahorro', 'Tasa de ahorro'],
          [200, 50, 150, 0.75],
          [],
          ['Mes', 'Ingresos', 'Gastos', 'Ahorro', 'Efectivo'],
          ['ene 2026', 200, 50, 150, 1000],
        ];
    });
    return result;
  };
  const rawBridge = fs.readFileSync(
    path.join(root, 'apps-script/Bridge.html'),
    'utf8',
  );
  let template;
  r.ctx.HtmlService = {
    createTemplateFromFile() {
      template = {
        getRawContent: () => rawBridge,
        evaluate: () => ({
          setTitle: () =>
            rawBridge
              .replace('<?= payloadJson ?>', htmlEscape(template.payloadJson))
              .replace('<?= appOrigin ?>', template.appOrigin),
        }),
      };
      return template;
    },
  };
  const pages = new Map();
  await context.addInitScript(() => {
    if (location.hostname === 'manuuelmarin.github.io')
      localStorage.setItem(
        'finances.appsScriptUrl',
        'https://script.google.com/macros/s/fixture-full-bridge/exec',
      );
  });
  await context.route(origin + '/finances/**', async (route) => {
    const url = new URL(route.request().url());
    const name = url.pathname.slice('/finances/'.length) || 'index.html';
    if (!/^[a-zA-Z0-9._/-]+$/.test(name) || name.includes('..'))
      return route.abort();
    const file = path.join(root, 'web', name);
    if (!fs.existsSync(file)) return route.abort();
    await route.fulfill({ path: file });
  });
  await context.route(deployment + '?*', async (route) => {
    const url = new URL(route.request().url());
    const state = url.searchParams.get('state');
    const bridge = r.ctx.doGet({
      parameter: Object.fromEntries(url.searchParams),
    });
    pages.set(state, bridge);
    await route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><iframe sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox" src="https://outer-script.googleusercontent.com/frame?state=${state}"></iframe>`,
    });
  });
  await context.route(
    'https://outer-script.googleusercontent.com/frame?*',
    async (route) => {
      const state = new URL(route.request().url()).searchParams.get('state');
      await route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><iframe sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox" src="https://inner-script.googleusercontent.com/frame?state=${state}"></iframe>`,
      });
    },
  );
  await context.route(
    'https://inner-script.googleusercontent.com/frame?*',
    async (route) => {
      const state = new URL(route.request().url()).searchParams.get('state');
      const shim = `<script>
      function runner(success, failure) {
        return {
          withSuccessHandler(fn) { return runner(fn,failure); },
          withFailureHandler(fn) { return runner(success,fn); },
          financialApiJson(json) {
            fetch('/rpc',{method:'POST',body:json}).then(r=>r.json()).then(success).catch(failure);
          }
        };
      }
      window.google = {script:{run:runner()}};
    </script>`;
      await route.fulfill({
        contentType: 'text/html',
        body: pages.get(state).replace('<script>', shim + '<script>'),
      });
    },
  );
  await context.route(
    'https://inner-script.googleusercontent.com/rpc',
    async (route) => {
      const json = route.request().postData();
      const request = JSON.parse(json);
      calls.push(request);
      if (options.holdRead && request.action === 'read') return;
      let response = r.ctx.financialApiJson(json);
      if (options.badPing && request.action === 'ping')
        response = '{"ok":false}';
      if (options.badRead && request.action === 'read')
        response = '{"ok":true}';
      if (options.loseWrite && request.action === 'transact') response = '{';
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(response),
      });
    },
  );
  return { r, calls };
}

async function open(page) {
  await page.goto(origin + '/finances/');
  const popup = page.waitForEvent('popup');
  await page.locator('#finance-connect').click();
  const google = await popup;
  await expect(page.locator('#finance-kpis .kpi-card')).toHaveCount(8);
  await expect(page.locator('#finance-kpis')).toContainText(/1[.]?015,00/);
  return google;
}

test('Bridge real con dos iframes carga ocho cifras, cuentas, gráficos y registra un gasto una sola vez', async ({
  page,
  context,
}) => {
  const { r, calls } = await channel(context);
  const google = await open(page);
  await expect(page.locator('[data-connection-label]').first()).toHaveText(
    'Datos cargados',
  );
  expect(calls.map((c) => c.action)).toEqual(['ping']); // La primera lectura no necesita otro RPC.
  await page.locator('nav [data-view=book]:visible').first().click();
  await page.locator('#view-book [data-operation=gasto]').click();
  await page.locator('#operation-date').fill('2026-01-02');
  await page
    .locator('#operation-concept')
    .fill('Gasto ficticio con puente completo');
  await page.locator('#operation-account').selectOption('Cuenta A');
  await page.locator('#operation-category').selectOption('Café');
  await page.locator('#operation-amount').fill('1,23');
  await page.locator('#operation-review').click();
  expect(calls.filter((c) => c.action === 'transact')).toHaveLength(0);
  await page.locator('#review-confirm').click();
  await expect(page.locator('#finance-queue')).toContainText(
    'Confirmada por Google',
  );
  await expect(page.locator('#finance-register')).toContainText(
    'Gasto ficticio con puente completo',
  );
  expect(calls.filter((c) => c.action === 'transact')).toHaveLength(1);
  expect(r.state().tables.tMovimientos).toHaveLength(1);
  const bridge = google
    .frames()
    .find((f) =>
      f.url().startsWith('https://inner-script.googleusercontent.com'),
    );
  await bridge.locator('#return-to-app').click();
  expect(google.url()).toContain('script.google.com');
  await page.locator('nav [data-view=home]:visible').first().click();
  await page.locator('#finance-refresh').click();
  await expect(page.locator('#finance-state')).toContainText(
    'Lectura confirmada',
  );
  expect(
    calls.filter((c) => c.action === 'read').length,
  ).toBeGreaterThanOrEqual(3);
});

test('respuesta inválida en lectura conserva las ocho cifras anteriores y muestra revisión', async ({
  page,
  context,
}) => {
  await channel(context, { badRead: true });
  await open(page);
  await page.locator('#finance-refresh').click();
  await expect(page.locator('#finance-state')).toContainText(
    'La respuesta no identifica el libro',
  );
  await expect(page.locator('[data-connection-label]').first()).toHaveText(
    'Revisar lectura',
  );
  await expect(page.locator('#finance-kpis')).toContainText(/1[.]?015,00/);
});

test('canal de operaciones inválido mantiene lectura nativa pero bloquea confirmar movimientos', async ({
  page,
  context,
}) => {
  const { calls } = await channel(context, { badPing: true });
  await open(page);
  await expect(page.locator('#finance-state')).toContainText('solo lectura');
  await expect(page.locator('[data-connection-label]').first()).toHaveText(
    'Datos · solo lectura',
  );
  await page.locator('#finance-new').click();
  await expect(page.locator('#operation-review')).toBeDisabled();
  await expect(page.locator('#operation-connection')).toBeVisible();
  expect(calls.filter((c) => c.action === 'transact')).toHaveLength(0);
});

test('cerrar Google durante lectura produce aviso de cierre y conserva snapshot', async ({
  page,
  context,
}) => {
  const { calls } = await channel(context, { holdRead: true });
  const google = await open(page);
  await page.locator('#finance-refresh').click();
  await expect
    .poll(() => calls.filter((c) => c.action === 'read').length)
    .toBe(1);
  await google.close();
  await expect(page.locator('#finance-state')).toContainText(
    'Se ha cerrado la ventana de Google',
  );
  await expect(page.locator('#finance-kpis')).toContainText(/1[.]?015,00/);
});

test('respuesta de escritura malformada conserva UUID incierto y recupera recibo sin duplicar', async ({
  page,
  context,
}) => {
  const { r, calls } = await channel(context, { loseWrite: true });
  await open(page);
  await page.locator('#finance-new').click();
  await page.locator('#operation-date').fill('2026-01-02');
  await page.locator('#operation-concept').fill('Ficticio respuesta perdida');
  await page.locator('#operation-account').selectOption('Cuenta A');
  await page.locator('#operation-category').selectOption('Café');
  await page.locator('#operation-amount').fill('1,23');
  await page.locator('#operation-review').click();
  await page.locator('#review-confirm').click();
  await expect(page.locator('#finance-queue')).toContainText(
    'Enviada · sin confirmar',
  );
  await page.locator('#finance-sync').click();
  await expect(page.locator('#finance-queue')).toContainText(
    'Confirmada por Google',
  );
  expect(calls.filter((c) => c.action === 'transact')).toHaveLength(1);
  expect(calls.filter((c) => c.action === 'requestStatus')).toHaveLength(1);
  expect(r.state().tables.tMovimientos).toHaveLength(1);
});

test('cambiar la conexión desde otra pestaña invalida la revisión y no registra en el otro libro', async ({
  page,
  context,
}) => {
  const { r, calls } = await channel(context);
  await open(page);
  await page.locator('#finance-new').click();
  await page.locator('#operation-date').fill('2026-01-02');
  await page
    .locator('#operation-concept')
    .fill('Borrador ficticio del primer libro');
  await page.locator('#operation-account').selectOption('Cuenta A');
  await page.locator('#operation-category').selectOption('Café');
  await page.locator('#operation-amount').fill('1,23');
  await page.locator('#operation-review').click();
  const next = 'https://script.google.com/macros/s/fixture-second-book/exec';
  const before = r.api({ action: 'read' });
  before.bookKey = 'b'.repeat(64);
  await page.evaluate(
    async ({ next, before }) => {
      const store = new FinanceSync.BrowserStore();
      const key = await FinanceSync.namespace(next);
      const queue = new FinanceSync.Queue(store, key);
      await queue.saveSnapshot(before);
    },
    { next, before },
  );
  const other = await context.newPage();
  await other.goto(origin + '/finances/');
  await other.evaluate(
    (next) => localStorage.setItem('finances.appsScriptUrl', next),
    next,
  );
  await expect(page.locator('#review-dialog')).not.toBeVisible();
  await expect(page.locator('#operation-dialog')).not.toBeVisible();
  const pending = await page.evaluate(
    async (urls) => {
      const store = new FinanceSync.BrowserStore();
      return Promise.all(
        urls.map(async (url) => {
          const q = new FinanceSync.Queue(
            store,
            await FinanceSync.namespace(url),
          );
          return (await q.get()).queue.length;
        }),
      );
    },
    [deployment, next],
  );
  expect(pending).toEqual([0, 0]);
  expect(calls.filter((c) => c.action === 'transact')).toHaveLength(0);
});
