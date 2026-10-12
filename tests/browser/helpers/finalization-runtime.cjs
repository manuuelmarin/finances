// Real DOM and IndexedDB; every private RPC terminates in fictional Sheets runtime.
const { expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { runtime } = require('../../helpers/runtime.cjs');
const { navigate } = require('./navigation.cjs');
const deployment =
  'https://script.google.com/macros/s/fictional-finalization/exec';
const isin = 'ES0112611001';
const referenceName = 'AZVALOR INTERNACIONAL, FI';

async function setup(page, options = {}) {
  const server = runtime(options.runtimeOptions || {});
  expect(server.init().ok).toBe(true);
  if (options.history) {
    expect(
      server.transact([
        { process: 'vincular_isin', product: 'Fondo A', isin, referenceName },
      ]).ok,
    ).toBe(true);
    expect(
      server.transact([
        { process: 'fechas', asof: '2026-10-06', valuation: '2026-10-06' },
      ]).ok,
    ).toBe(true);
    expect(server.init().ok).toBe(true);
  }
  await options.configure?.(server);
  const calls = [];
  let readGate = null,
    submitGate = null;
  const controls = {
    loseNextSubmit: options.loseNextSubmit || false,
    failSubmitBeforeApply: options.failSubmitBeforeApply || 0,
    gateNextSubmitReply() {
      let entered, release;
      const gate = {
        entered: new Promise((resolve) => {
          entered = resolve;
        }),
        release: () => release(),
      };
      submitGate = {
        entered,
        wait: new Promise((resolve) => {
          release = resolve;
        }),
      };
      return gate;
    },
    gateNextRead() {
      let entered, release;
      const gate = {
        entered: new Promise((resolve) => {
          entered = resolve;
        }),
        release: () => release(),
      };
      readGate = {
        entered,
        wait: new Promise((resolve) => {
          release = resolve;
        }),
      };
      return gate;
    },
  };
  await page.exposeFunction('fictionalFinanceRpc', async (body) => {
    calls.push(JSON.parse(JSON.stringify(body)));
    if (body.action === 'read' && readGate) {
      const gate = readGate;
      readGate = null;
      gate.entered();
      await gate.wait;
    }
    if (
      ['transact', 'importPriceHistory', 'refreshPrices'].includes(
        body.action,
      ) &&
      controls.failSubmitBeforeApply > 0
    ) {
      controls.failSubmitBeforeApply--;
      throw Error('RESPONSE_UNCERTAIN');
    }
    const result = server.api(body);
    if (
      ['transact', 'importPriceHistory', 'refreshPrices'].includes(
        body.action,
      ) &&
      submitGate
    ) {
      const gate = submitGate;
      submitGate = null;
      gate.entered();
      await gate.wait;
    }
    if (
      ['transact', 'importPriceHistory', 'refreshPrices'].includes(
        body.action,
      ) &&
      controls.loseNextSubmit
    ) {
      controls.loseNextSubmit = false;
      throw Error('RESPONSE_UNCERTAIN');
    }
    return body.action === 'read' && options.transformRead
      ? options.transformRead(result)
      : result;
  });
  await page.addInitScript((deployment) => {
    localStorage.setItem('finances.appsScriptUrl', deployment);
    window.fictionalGoogleOpens = 0;
  }, deployment);
  const mock = `
FinanceApiClient = class {
  constructor(url) { this.url = url; this.session = null; }
  async connect() { this.close(); window.fictionalGoogleOpens++; this.session = { rpcReady: true, bridgeVersion: '3.9.0', popup: { closed: false } }; return { ok: true, apiVersion: '3.3.0' }; }
  close() { if (this.session) this.session.popup.closed = true; this.session = null; }
  read() { return window.fictionalFinanceRpc({ action: 'read' }); }
  request(body) { return window.fictionalFinanceRpc(body); }
  submit(envelope) { return window.fictionalFinanceRpc(envelope); }
  diagnostics() { return this.request({ action: 'diagnostics' }); }
  acceptance() { return this.request({ action: 'acceptance' }); }
  requestStatus(envelope) { return this.request({ action: 'requestStatus', requestId: envelope.requestId, ...(envelope.bookKey ? { bookKey: envelope.bookKey } : {}) }); }
};`;
  await page.route('**/api.js', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body:
        fs.readFileSync(
          path.resolve(__dirname, '../../../web/api.js'),
          'utf8',
        ) + mock,
    }),
  );
  await page.goto('/');
  await expect(page.locator('#finance-connect')).toBeEnabled();
  await page.locator('#finance-connect').click();
  await expect(page.locator('#finance-state')).toContainText(
    'Lectura confirmada',
  );
  return { server, calls, controls };
}
async function queueData(page) {
  return page.evaluate(
    async (deployment) =>
      new FinanceSync.BrowserStore().get(
        await FinanceSync.namespace(deployment),
      ),
    deployment,
  );
}
async function expense(page, concept = 'Fictional recurring coffee') {
  await page.locator('#finance-new').click();
  await page.locator('#operation-date').fill('2026-01-02');
  await page.locator('#operation-account').selectOption('Cuenta A');
  await page.locator('#operation-category').selectOption('Café');
  await page.locator('#operation-amount').fill('7,25');
  await page.locator('.operation-additional summary').click();
  await page.locator('#operation-concept').fill(concept);
}
async function openSettings(page) {
  await navigate(page, 'connection');
  if (!(await page.locator('#local-settings').evaluate((node) => node.open)))
    await page.locator('#local-settings summary').click();
}
module.exports = {
  setup,
  deployment,
  queueData,
  expense,
  openSettings,
  isin,
  referenceName,
};
