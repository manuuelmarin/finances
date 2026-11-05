const { test, expect } = require('@playwright/test');
const { setup, expense } = require('./helpers/finalization-runtime.cjs');
const { navigate } = require('./helpers/navigation.cjs');

test('@responsive queue updates keep the current chart until new data is confirmed', async ({
  page,
}) => {
  const { controls } = await setup(page);
  await expect(page.locator('#investment-charts .chart-card')).toHaveCount(0);
  await page.evaluate(() => {
    window.originalChart = document.querySelector(
      '#dashboard-charts .chart-card',
    );
  });
  const gate = controls.gateNextSubmitReply();
  await expense(page);
  await page.locator('#operation-form button[type=submit]').click();
  await page.locator('#review-confirm').click();
  await gate.entered;
  await expect(page.locator('#finance-queue')).toContainText('sin confirmar');
  expect(
    await page.evaluate(
      () =>
        window.originalChart ===
        document.querySelector('#dashboard-charts .chart-card'),
    ),
  ).toBe(true);
  gate.release();
  await expect(page.locator('#finance-state')).toContainText(
    'Datos actualizados en todas las pestañas',
    { timeout: 15000 },
  );
  expect(
    await page.evaluate(
      () =>
        window.originalChart ===
        document.querySelector('#dashboard-charts .chart-card'),
    ),
  ).toBe(false);
  await navigate(page, 'investments');
  await expect(
    page.locator('#investment-charts .chart-card').first(),
  ).toBeVisible();
  await navigate(page, 'connection');
  await page.locator('#performance-panel summary').click();
  await expect(page.locator('#performance-results')).toContainText(
    'Envío y confirmación',
  );
  await expect(page.locator('#performance-results')).toContainText(
    'Lectura tras confirmar',
  );
  await expect(page.locator('#performance-results')).not.toContainText('7,25');
  await expect(page.locator('#performance-results')).not.toContainText(
    'Cuenta A',
  );
});

test('a fresh read redraws changed calculations even when the book revision is unchanged', async ({
  page,
}) => {
  let cash = 1000;
  const { calls } = await setup(page, {
    transformRead(result) {
      const metric = result.summary.metrics.find(
        (row) => row.label === 'Efectivo',
      );
      metric.value = cash;
      return result;
    },
  });
  await expect(page.locator('#finance-kpis')).toContainText('1000,00');
  cash = 777;
  await page.locator('#finance-refresh').click();
  await expect
    .poll(() => calls.filter((call) => call.action === 'read').length)
    .toBe(2);
  await expect(page.locator('#finance-kpis')).toContainText('777');
});

test('returning immediately does not reread, while an older snapshot is refreshed', async ({
  page,
}) => {
  const { calls } = await setup(page);
  const reads = () => calls.filter((call) => call.action === 'read').length;
  const initial = reads();
  await page.evaluate(() =>
    document.dispatchEvent(new Event('visibilitychange')),
  );
  await page.waitForTimeout(900);
  expect(reads()).toBe(initial);
  await page.evaluate(() => {
    const original = Date.now.bind(Date);
    Date.now = () => original() + 31000;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(reads, { timeout: 10000 }).toBe(initial + 1);
});
