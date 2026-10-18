/* global currentDeployment */
const { test, expect } = require('@playwright/test');

async function initialize(page, key) {
  await page.goto('/');
  await page.evaluate(async (key) => {
    window.raceQueue = new FinanceSync.Queue(
      new FinanceSync.BrowserStore(),
      key,
      { locks: null },
    );
    window.raceSnapshot = {
      ok: true,
      bookKey: 'fictional-book',
      revision: 'r1',
      environment: 'test',
    };
    await window.raceQueue.saveSnapshot(window.raceSnapshot);
  }, key);
}

test('two real pages atomically arbitrate discard and submit without Web Locks', async ({
  context,
  page,
}) => {
  const other = await context.newPage();
  await initialize(page, 'race');
  await initialize(other, 'race');
  const id = await page.evaluate(async () => {
    await window.raceQueue.enqueue([{ process: 'fixture' }], 'Fixture');
    return (await window.raceQueue.get()).queue[0].envelope.requestId;
  });
  await other.evaluate((id) => window.raceQueue.discard(id), id);
  expect(
    await page.evaluate(async () => {
      let sent = 0;
      await window.raceQueue.run({
        read: async () => window.raceSnapshot,
        submit: async () => {
          sent++;
          return { ok: true };
        },
      });
      return sent;
    }),
  ).toBe(0);
  const claimed = await page.evaluate(async () => {
    await window.raceQueue.enqueue([{ process: 'fixture' }], 'Second');
    const item = (await window.raceQueue.get()).queue[1];
    await window.raceQueue.claim(item.envelope.requestId);
    return item.envelope;
  });
  const state = await other.evaluate(async (envelope) => {
    let error;
    try {
      await window.raceQueue.discard(envelope.requestId);
    } catch (caught) {
      error = caught.message;
    }
    let sent = 0;
    const outcome = await window.raceQueue.run({
      read: async () => window.raceSnapshot,
      submit: async () => {
        sent++;
      },
    });
    return {
      error,
      sent,
      outcome,
      item: (await window.raceQueue.get()).queue[1],
    };
  }, claimed);
  expect(state.error).toBe('CANNOT_DISCARD_IN_FLIGHT');
  expect(state.sent).toBe(0);
  expect(state.outcome.status).toBe('busy');
  expect(state.item.envelope).toEqual(claimed);
});

test('offline queued and uncertain envelopes survive reopening; receipt survives post-confirm read failure', async ({
  context,
  page,
}) => {
  await initialize(page, 'reopen');
  const envelope = await page.evaluate(async () => {
    await window.raceQueue.enqueue([{ process: 'fixture' }], 'Offline');
    return (await window.raceQueue.get()).queue[0].envelope;
  });
  await context.setOffline(true);
  await page.close();
  await context.setOffline(false);
  const reopened = await context.newPage();
  await initialize(reopened, 'reopen');
  const result = await reopened.evaluate(async () => {
    let reads = 0;
    const outcome = await window.raceQueue.run({
      read: async () => {
        if (reads++) throw Error('READ_TIMEOUT');
        return window.raceSnapshot;
      },
      submit: async (envelope) => ({
        ok: true,
        requestId: envelope.requestId,
        results: envelope.operations.map((op) => ({ process: op.process })),
        revision: 'r2',
        receipt: 'fictional-receipt',
      }),
    });
    return { outcome, item: (await window.raceQueue.get()).queue[0] };
  });
  expect(result.outcome.status).toBe('confirmed');
  expect(result.outcome.reason).toBe('POST_CONFIRM_READ_FAILED');
  expect(result.item.status).toBe('confirmed');
  expect(result.item.envelope).toEqual(envelope);
  expect(result.item.result.receipt).toBe('fictional-receipt');
  await reopened.evaluate(async () => {
    await window.raceQueue.enqueue([{ process: 'fixture' }], 'Uncertain');
    await window.raceQueue.run({
      read: async () => window.raceSnapshot,
      submit: async () => {
        throw Error('RESPONSE_UNCERTAIN');
      },
    });
  });
  await reopened.reload();
  await initialize(reopened, 'reopen');
  expect(
    await reopened.evaluate(
      async () => (await window.raceQueue.get()).queue[1].status,
    ),
  ).toBe('uncertain');
});

test.describe('public service worker upgrade', () => {
  test.use({ serviceWorkers: 'allow' });
  test('activates a new public asset worker and preserves pending and uncertain envelopes', async ({
    page,
    context,
  }) => {
    const fs = require('node:fs');
    const path = require('node:path');
    const source = fs.readFileSync(
      path.join(__dirname, '../../web/sw.js'),
      'utf8',
    );
    await initialize(page, 'upgrade');
    const before = await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      await window.raceQueue.enqueue([{ process: 'fixture' }], 'Pending');
      await window.raceQueue.enqueue([{ process: 'fixture' }], 'Uncertain');
      const data = await window.raceQueue.get();
      await window.raceQueue.status(
        data.queue[1].envelope.requestId,
        'uncertain',
        { ok: false, error: 'RESPONSE_UNCERTAIN' },
      );
      return (await window.raceQueue.get()).queue;
    });
    await page.reload();
    await context.route('**/sw.js?upgrade-fixture=2', (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: source.replace(
          /const CACHE = [^;]+;/,
          'const CACHE = "finances-upgrade-fictional";',
        ),
      }),
    );
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.register(
        './sw.js?upgrade-fixture=2',
        { updateViaCache: 'none' },
      );
      await new Promise((resolve) => {
        if (registration.waiting) return resolve();
        const worker = registration.installing;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed') resolve();
        });
      });
    });
    await expect(page.locator('#update-app')).toBeVisible();
    const reloaded = page.waitForNavigation({ waitUntil: 'load' });
    await page.locator('#update-app').click();
    await reloaded;
    await expect
      .poll(() =>
        page.evaluate(
          () => navigator.serviceWorker.controller?.scriptURL || '',
        ),
      )
      .toContain('upgrade-fixture=2');
    const after = await page.evaluate(
      async () => (await new FinanceSync.BrowserStore().get('upgrade')).queue,
    );
    expect(after).toEqual(before);
    expect(after.map((item) => item.status)).toEqual(['pending', 'uncertain']);
  });
});

test('storage-blocked deployment remains usable for the session', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw Error('STORAGE_BLOCKED');
      },
    });
  });
  await page.goto('/');
  await require('./helpers/navigation.cjs').navigate(page, 'connection');
  await page.locator('#setup-toggle').click();
  const deployment =
    'https://script.google.com/macros/s/fictional-session/exec';
  await page.locator('#deployment-url').fill(deployment);
  await page.locator('#setup-save').click();
  expect(await page.evaluate(() => currentDeployment())).toBe(deployment);
  await expect(page.locator('#detail')).toContainText('esta sesión');
});

test('activity reaches the oldest uncertainty and broadcasts discard to the other window', async ({
  page,
  context,
}) => {
  const { runtime } = require('../helpers/runtime.cjs');
  const server = runtime();
  server.init();
  const snapshot = server.api({ action: 'read' });
  const deployment =
    'https://script.google.com/macros/s/fictional-activity/exec';
  await page.goto('/');
  await page.evaluate(
    async ({ snapshot, deployment }) => {
      localStorage.setItem('finances.appsScriptUrl', deployment);
      const key = await FinanceSync.namespace(deployment);
      const store = new FinanceSync.BrowserStore();
      await store.update(key, () => ({
        snapshot,
        bookKey: snapshot.bookKey,
        queue: Array.from({ length: 51 }, (_, index) => ({
          envelope: {
            action: 'transact',
            requestId: 'fictional-request-' + index,
            expectedRevision: snapshot.revision,
            operations: [],
          },
          label: index ? 'Pending ' + index : 'Oldest uncertainty',
          status: index ? 'pending' : 'uncertain',
          createdAt: '2026-01-01T00:00:00Z',
          bookKey: snapshot.bookKey,
          result: index ? null : { ok: false, error: 'RESPONSE_UNCERTAIN' },
        })),
      }));
    },
    { snapshot, deployment },
  );
  await page.reload();
  const other = await context.newPage();
  await other.goto('/');
  await require('./helpers/navigation.cjs').navigate(page, 'activity');
  await require('./helpers/navigation.cjs').navigate(other, 'activity');
  await page
    .getByRole('combobox', { name: 'Filtrar actividad' })
    .selectOption('uncertain');
  await expect(page.locator('#finance-queue')).toContainText(
    'Oldest uncertainty',
  );
  await expect(page.locator('#finance-queue')).toContainText(
    'consultar el recibo',
  );
  await page
    .getByRole('combobox', { name: 'Filtrar actividad' })
    .selectOption('pending');
  await page
    .locator('#finance-queue')
    .getByRole('button', { name: 'Descartar', exact: true })
    .first()
    .click();
  await page.locator('#review-confirm').click();
  await expect(other.locator('#pending-total')).toHaveText('50');
  await expect(other.locator('#finance-queue')).toContainText(
    'Descartada sin enviar',
  );
});

test('successful stored configuration follows other-window switches and disconnects', async ({
  page,
  context,
}) => {
  const navigate = require('./helpers/navigation.cjs').navigate;
  const first = 'https://script.google.com/macros/s/fictional-first/exec';
  const second = 'https://script.google.com/macros/s/fictional-second/exec';
  await page.goto('/');
  await navigate(page, 'connection');
  await page.locator('#setup-toggle').click();
  await page.locator('#deployment-url').fill(first);
  await page.locator('#setup-save').click();
  const other = await context.newPage();
  await other.goto('/');
  await navigate(other, 'connection');
  await other.locator('#setup-toggle').click();
  await other.locator('#deployment-url').fill(second);
  await other.locator('#setup-save').click();
  await expect
    .poll(() => page.evaluate(() => currentDeployment()))
    .toBe(second);
  await other.locator('#setup-toggle').click();
  await other.locator('#setup-clear').click();
  await expect.poll(() => page.evaluate(() => currentDeployment())).toBeNull();
  await expect(page.locator('#finance-state')).toContainText(
    'Configura el enlace',
  );
});
