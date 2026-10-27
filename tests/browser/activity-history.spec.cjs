const { test, expect } = require('@playwright/test');
const { runtime } = require('../helpers/runtime.cjs');
const { navigate } = require('./helpers/navigation.cjs');
const { capture } = require('./helpers/capture.cjs');

test('@responsive @safari existing resolved requests move to collapsed history while uncertain and unread confirmations stay active', async ({
  page,
}) => {
  const server = runtime();
  server.init();
  const snapshot = server.api({ action: 'read' });
  const deployment =
    'https://script.google.com/macros/s/fictional-history/exec';
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/, (route) =>
    route.abort(),
  );
  await page.goto('/');
  await page.evaluate(
    async ({ snapshot, deployment }) => {
      localStorage.setItem('finances.appsScriptUrl', deployment);
      const key = await FinanceSync.namespace(deployment);
      await new FinanceSync.BrowserStore().update(key, () => ({
        snapshot,
        bookKey: snapshot.bookKey,
        queue: [
          'discarded',
          'confirmed',
          'uncertain',
          'pending',
          'review',
          'confirmed',
        ].map((status, index) => ({
          status,
          label: 'Fictional ' + index,
          createdAt: '2026-01-01T00:00:00Z',
          envelope: {
            action: 'transact',
            requestId: 'history-' + index,
            expectedRevision: 'old',
            operations: [],
          },
          result: { revision: snapshot.revision, results: [] },
          ...(index === 5 ? { awaitingRead: true } : {}),
        })),
      }));
    },
    { snapshot, deployment },
  );
  await page.reload();
  await navigate(page, 'activity');
  await expect(page.locator('#pending-total')).toHaveText('4');
  await expect(page.locator('#history-total')).toHaveText('2');
  await expect(page.locator('#finance-queue .queue-item')).toHaveCount(4);
  await expect(page.locator('#finance-queue')).not.toContainText('Fictional 0');
  await expect(page.locator('#finance-queue')).not.toContainText('Fictional 1');
  await expect(page.locator('#finance-queue')).toContainText('Fictional 5');
  await expect(page.locator('#confirmed-history')).not.toHaveAttribute(
    'open',
    '',
  );
  await expect(page.locator('#finance-history')).toBeHidden();
  await page.locator('#confirmed-history summary').click();
  await page
    .getByRole('combobox', { name: 'Filtrar historial' })
    .selectOption('discarded');
  await expect(page.locator('#finance-history .queue-item')).toHaveCount(1);
  await expect(page.locator('#finance-history')).toContainText('Fictional 0');
  // Completing readback archives the confirmation, without touching any UUID.
  const persisted = await page.evaluate(async (deployment) => {
    const queue = new FinanceSync.Queue(
      new FinanceSync.BrowserStore(),
      await FinanceSync.namespace(deployment),
    );
    await queue.saveSnapshot((await queue.get()).snapshot);
    return (await queue.get()).queue;
  }, deployment);
  expect(persisted.map((item) => item.envelope.requestId)).toEqual(
    Array.from({ length: 6 }, (_, index) => 'history-' + index),
  );
  expect(persisted[5].awaitingRead).toBeUndefined();
  await page.reload();
  await navigate(page, 'activity');
  await expect(page.locator('#pending-total')).toHaveText('3');
  await expect(page.locator('#history-total')).toHaveText('3');
  await expect(page.locator('#finance-queue')).not.toContainText('Fictional 5');
  await expect(page.locator('#confirmed-history')).not.toHaveAttribute(
    'open',
    '',
  );
  await capture(page, 'activity-history');
});
