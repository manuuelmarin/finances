// Canal real de la app/Bridge/Code.gs con Google y Sheets ficticios y aislados.
// No sustituye la aceptación en la implementación privada de Google.
const { test, expect } = require('@playwright/test');
const { navigate, diagnostic } = require('./helpers/navigation.cjs');
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
  let rawBridge = fs.readFileSync(
    path.join(root, 'apps-script/Bridge.html'),
    'utf8',
  );
  // La entrega privada anterior solo difiere en su identificador de build.
  if (options.googleBuild)
    rawBridge = rawBridge.replace(
      /const BRIDGE_VERSION = '[^']+';/,
      `const BRIDGE_VERSION = '${options.googleBuild}';`,
    );
  let template;
  r.ctx.HtmlService = {
    createTemplateFromFile() {
      template = {
        getRawContent: () => rawBridge,
        evaluate: () => ({
          setTitle: () => {
            const payload = JSON.parse(template.payloadJson);
            if (options.googleBuild) {
              payload.buildVersion = options.googleBuild;
              if (payload.snapshot)
                payload.snapshot.buildVersion = options.googleBuild;
            }
            return rawBridge
              .replace(
                '<?= payloadJson ?>',
                htmlEscape(JSON.stringify(payload)),
              )
              .replace('<?= appOrigin ?>', template.appOrigin);
          },
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
      if (options.holdAction === request.action) return;
      let response = r.ctx.financialApiJson(json);
      if (options.googleBuild) {
        const data = JSON.parse(response);
        data.buildVersion = options.googleBuild;
        response = JSON.stringify(data);
      }
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
  await expect(page.locator('#finance-kpis > article')).toHaveCount(3);
  await expect(page.locator('#finance-kpis')).toContainText(/1[.]?015,00/);
  await expect(page.locator('#finance-kpis')).toContainText('Patrimonio neto');
  await expect(page.locator('#finance-kpis')).toContainText(
    'Saldo libre del mes',
  );
  await expect(
    page.locator('#dashboard-charts .asset-breakdown'),
  ).toContainText('Efectivo');
  await expect(
    page.locator('#dashboard-charts .asset-breakdown'),
  ).toContainText(/1[.]?000,00/);
  await expect(page.locator('#finance-kpis')).toContainText('Inversiones');
  await expect(page.locator('#finance-kpis')).toContainText(/15,00/);
  return google;
}

test('Bridge real con dos iframes carga tres KPI, cuentas, gráficos y registra un gasto una sola vez', async ({
  page,
  context,
}) => {
  const { r, calls } = await channel(context);
  const google = await open(page);
  await expect(page.locator('[data-connection-label]').first()).toHaveText(
    'Datos cargados',
  );
  expect(calls.map((c) => c.action)).toEqual(['ping']); // La primera lectura no necesita otro RPC.
  await navigate(page, 'book');
  await page.locator('#view-book [data-operation=gasto]').click();
  await page.locator('#operation-date').fill('2026-01-02');
  await page.locator('.operation-additional summary').click();
  await page
    .locator('#operation-concept')
    .fill('Gasto ficticio con puente completo');
  await page.locator('#operation-account').selectOption('Cuenta A');
  await page.locator('#operation-category').selectOption('Café');
  await page.locator('#operation-amount').fill('1,23');
  await page.locator('#operation-review').click();
  expect(calls.filter((c) => c.action === 'transact')).toHaveLength(0);
  await page.locator('#review-confirm').click();
  await expect(page.locator('#finance-history')).toContainText(
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
  await navigate(page, 'home');
  await page.locator('#finance-refresh').click();
  await expect(page.locator('#finance-state')).toContainText(
    'Lectura confirmada',
  );
  expect(
    calls.filter((c) => c.action === 'read').length,
  ).toBeGreaterThanOrEqual(3);
});

test('respuesta inválida en lectura conserva los tres KPI anteriores y muestra revisión', async ({
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

test('conectar, comprobar y registrar reutilizan una sola ventana con Google 3.6.0', async ({
  page,
  context,
}) => {
  const { calls } = await channel(context, { googleBuild: '3.6.0' });
  let popups = 0;
  page.on('popup', () => popups++);
  await page.goto(origin + '/finances/');
  await navigate(page, 'connection');
  const first = page.waitForEvent('popup');
  await page.locator('#connect').click();
  const google = await first;
  await expect(page.locator('#status')).toHaveText('Conexión verificada');
  await expect(page.locator('#sheet-count')).toHaveText('10');
  await expect(page.locator('#finance-kpis > article')).toHaveCount(3);
  await diagnostic(page);
  await page.locator('#backend-check').click();
  await expect(page.locator('#backend-result')).toContainText(
    'Backend verificado',
  );
  await diagnostic(page);
  await page.locator('#acceptance-check').click();
  await expect(page.locator('#acceptance-result')).toContainText(
    'versión 3.6.0',
  );
  expect(google.isClosed()).toBe(false);
  await page.locator('#connect').click();
  await expect(page.locator('#status')).toHaveText('Conexión verificada');
  await navigate(page, 'home');
  await page.locator('#finance-connect').click();
  await expect(page.locator('#finance-state')).toContainText(
    'Lectura confirmada',
  );
  await page.locator('#finance-new').click();
  await page.locator('#operation-date').fill('2026-01-02');
  await page.locator('.operation-additional summary').click();
  await page
    .locator('#operation-concept')
    .fill('Gasto ficticio en el mismo canal');
  await page.locator('#operation-account').selectOption('Cuenta A');
  await page.locator('#operation-category').selectOption('Café');
  await page.locator('#operation-amount').fill('1,23');
  await page.locator('#operation-review').click();
  await page.locator('#review-confirm').click();
  await expect(page.locator('#finance-history')).toContainText(
    'Confirmada por Google',
  );
  expect(popups).toBe(1);
  expect(calls.filter((c) => c.action === 'ping')).toHaveLength(1);
  expect(calls.filter((c) => c.action === 'transact')).toHaveLength(1);
  expect(google.isClosed()).toBe(false);
});

test('un canal bloqueado se recupera al primer reintento tras reparar Google', async ({
  page,
  context,
}) => {
  const options = { badPing: true };
  const { calls } = await channel(context, options);
  const blocked = await open(page);
  await expect(page.locator('#finance-state')).toContainText('solo lectura');
  options.badPing = false;
  const replacement = page.waitForEvent('popup');
  await page.locator('#finance-connect').click();
  const google = await replacement;
  await expect(page.locator('#finance-state')).toContainText(
    'Lectura confirmada',
  );
  expect(blocked.isClosed()).toBe(true);
  expect(google.isClosed()).toBe(false);
  expect(calls.filter((c) => c.action === 'ping')).toHaveLength(2);
  expect(calls.filter((c) => c.action === 'transact')).toHaveLength(0);
});

test('una lectura local retrasada no repone datos del libro anterior tras cambiar el enlace', async ({
  page,
  context,
}) => {
  const { calls } = await channel(context);
  const google = await open(page);
  await page.evaluate(() => {
    const get = FinanceSync.Queue.prototype.get;
    let hold = true;
    FinanceSync.Queue.prototype.get = async function () {
      const data = await get.call(this);
      if (hold) {
        hold = false;
        window.heldRender = true;
        await new Promise((resolve) => (window.releaseRender = resolve));
      }
      return data;
    };
    window.checkResult = null;
    window.FinanceBook.check('connection').then(
      (result) => (window.checkResult = { ok: true, result }),
      (error) => (window.checkResult = { ok: false, error: error.message }),
    );
  });
  await page.waitForFunction(() => window.heldRender === true);
  await page.evaluate(() => {
    localStorage.setItem(
      'finances.appsScriptUrl',
      'https://script.google.com/macros/s/fixture-second-book/exec',
    );
    window.dispatchEvent(new Event('finances:configuration'));
  });
  await expect(page.locator('#finance-kpis')).toBeHidden();
  await expect(page.locator('#finance-kpis > article')).toHaveCount(0);
  await expect(page.locator('#dashboard-empty')).toBeVisible();
  await expect(page.locator('#dashboard-empty')).toContainText(
    'Libro sin cargar',
  );
  await expect(page.locator('#finance-kpis')).not.toContainText(/1[.]?015,00/);
  await page.evaluate(() => window.releaseRender());
  await page.waitForFunction(() => window.checkResult !== null);
  expect(await page.evaluate(() => window.checkResult)).toEqual({
    ok: false,
    error: 'CONFIGURATION_CHANGED',
  });
  await expect(page.locator('#finance-kpis')).not.toContainText(/1[.]?015,00/);
  expect(google.isClosed()).toBe(true);
  expect(calls.filter((c) => c.action === 'transact')).toHaveLength(0);
});

test('cerrar Google durante comprobar sistema muestra un aviso claro y abre una sola sustitución', async ({
  page,
  context,
}) => {
  const options = { holdAction: 'acceptance' };
  const { calls } = await channel(context, options);
  let popups = 0;
  page.on('popup', () => popups++);
  const google = await open(page);
  await navigate(page, 'connection');
  await diagnostic(page);
  await page.locator('#acceptance-check').click();
  await expect
    .poll(() => calls.some((c) => c.action === 'acceptance'))
    .toBe(true);
  await google.close();
  await expect(page.locator('#acceptance-result')).toContainText(
    'Se ha cerrado la ventana de Google',
  );
  await expect(page.locator('#acceptance-result')).not.toContainText(
    'GOOGLE_WINDOW_CLOSED',
  );
  const replacement = page.waitForEvent('popup');
  await diagnostic(page);
  await page.locator('#backend-check').click();
  const reopened = await replacement;
  await expect(page.locator('#backend-result')).toContainText(
    'Backend verificado',
  );
  expect(popups).toBe(2);
  expect(reopened.isClosed()).toBe(false);
  expect(calls.filter((c) => c.action === 'transact')).toHaveLength(0);
});

test('comprobación en curso bloquea duplicados y descarta el libro cambiado desde otra pestaña', async ({
  page,
  context,
}) => {
  const { calls } = await channel(context, { holdAction: 'acceptance' });
  let popups = 0;
  page.on('popup', () => popups++);
  const google = await open(page);
  await navigate(page, 'connection');
  await diagnostic(page);
  await page.locator('#acceptance-check').click();
  await expect
    .poll(() => calls.some((c) => c.action === 'acceptance'))
    .toBe(true);
  await diagnostic(page);
  await page.locator('#backend-check').click();
  await expect(page.locator('#backend-result')).toContainText(
    'Hay una lectura o un envío en curso',
  );
  expect(popups).toBe(1);
  const other = await context.newPage();
  await other.goto(origin + '/finances/');
  await other.evaluate(() =>
    localStorage.setItem(
      'finances.appsScriptUrl',
      'https://script.google.com/macros/s/fixture-second-book/exec',
    ),
  );
  await expect(page.locator('#acceptance-result')).toContainText(
    'La configuración cambió',
  );
  await expect(page.locator('#acceptance-result')).not.toContainText(
    'Comprobaciones técnicas correctas',
  );
  expect(google.isClosed()).toBe(true);
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
  await page.locator('.operation-additional summary').click();
  await page.locator('#operation-concept').fill('Ficticio respuesta perdida');
  await page.locator('#operation-account').selectOption('Cuenta A');
  await page.locator('#operation-category').selectOption('Café');
  await page.locator('#operation-amount').fill('1,23');
  await page.locator('#operation-review').click();
  await page.locator('#review-confirm').click();
  await expect(page.locator('#finance-queue')).toContainText(
    'Enviada · sin confirmar',
  );
  await navigate(page, 'activity');
  await page.locator('#finance-sync').click();
  await expect(page.locator('#finance-history')).toContainText(
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
  await page.locator('.operation-additional summary').click();
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
