const { test, expect } = require('@playwright/test');
const { setup } = require('./helpers/finalization-runtime.cjs');
const { navigate } = require('./helpers/navigation.cjs');

test('one system check reuses Google and performs the three read-only checks', async ({
  page,
}) => {
  const { server, calls } = await setup(page);
  const before = JSON.stringify(server.state().tables);
  const start = calls.length;
  await navigate(page, 'connection');
  await page.locator('#system-check').click();
  await expect(page.locator('#system-result [data-check-state]')).toHaveCount(
    3,
  );
  expect(calls.slice(start).map((call) => call.action)).toEqual([
    'read',
    'diagnostics',
    'acceptance',
  ]);
  expect(JSON.stringify(server.state().tables)).toBe(before);
  expect(await page.evaluate(() => window.fictionalGoogleOpens)).toBe(1);
});

test('interval and monthly limits survive confirmation without changing financial records', async ({
  page,
}) => {
  const { server } = await setup(page);
  const before = JSON.stringify(server.state().tables);
  await navigate(page, 'budgets');
  await page.locator('#budget-new').click();
  await page.locator('#budget-title-input').fill('Café durante enero');
  await page.locator('#budget-start').fill('2026-01-01');
  await page.locator('#budget-end').fill('2026-01-31');
  await page.locator('#budget-category').selectOption('Café');
  await page.locator('#budget-amount').fill('50');
  await page.locator('#budget-form button[type=submit]').click();
  await expect(page.locator('#review-dialog')).toBeVisible();
  await page.locator('#review-confirm').click();
  const card = page
    .locator('#budget-cards .budget-card')
    .filter({ hasText: 'Café durante enero' });
  await expect(card).toHaveCount(1);
  await card.getByRole('button', { name: 'Ver evolución del límite' }).click();
  await expect(page.locator('#budget-details')).toBeVisible();
  await expect(
    page.locator('#budget-detail-chart .chart-reference'),
  ).toHaveCount(1);
  const rect = await page
    .locator('#budget-detail-chart .chart-reference')
    .evaluate((n) => ({
      y: Number(n.getAttribute('y1')),
      height: n.ownerSVGElement.viewBox.baseVal.height,
    }));
  expect(rect.y).toBeGreaterThanOrEqual(0);
  expect(rect.y).toBeLessThan(rect.height);
  await card.getByRole('button', { name: 'Editar', exact: true }).click();
  await page.locator('#budget-amount').fill('60');
  await page.locator('#budget-form button[type=submit]').click();
  await page.locator('#review-confirm').click();
  await expect(card).toContainText('60,00');
  expect(server.api({ action: 'read' }).intervalBudgets).toHaveLength(1);
  await card.getByRole('button', { name: 'Quitar límite' }).click();
  await page.locator('#review-confirm').click();
  await expect(card).toHaveCount(0);
  await page.locator('#budget-new').click();
  await page.locator('#budget-mode').selectOption('month');
  await expect(page.locator('#budget-title-input')).toBeDisabled();
  await page.locator('#budget-edit-month').fill('2026-01');
  await page.locator('#budget-amount').fill('100');
  await page.locator('#budget-form button[type=submit]').click();
  await expect(page.locator('#review-dialog')).toBeVisible();
  await page.locator('#review-confirm').click();
  await expect(page.locator('#budget-cards')).toContainText('100,00');
  expect(server.api({ action: 'read' }).budgets).toHaveLength(1);
  expect(JSON.stringify(server.state().tables)).toBe(before);
});

test('@responsive configuration keeps appearance and nested activity accessible after reload', async ({
  page,
}) => {
  await page.goto('/#connection');
  await page.locator('#theme-preference').selectOption('warm');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'warm');
  await expect(page.locator('#theme-preference')).toHaveValue('warm');
  await page.goto('/#activity');
  await expect(page.locator('#view-connection')).toBeVisible();
  await page.locator('#activity-panel > summary').click();
  await expect(page.locator('#finance-sync')).toBeVisible();
});
