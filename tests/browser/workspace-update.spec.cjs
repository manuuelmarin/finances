const { test, expect } = require('@playwright/test');
const { setup, queueData } = require('./helpers/finalization-runtime.cjs');
const { navigate } = require('./helpers/navigation.cjs');
const analytics = require('../../web/analytics.js');

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

for (const withIsin of [false, true]) {
  test(`inline product purchase persists once ${withIsin ? 'with' : 'without'} ISIN`, async ({
    page,
  }) => {
    const { server } = await setup(page);
    const before = server.api({ action: 'read' });
    const balance = analytics
      .cashTimeline(before, before.settings.asof.slice(0, 7))
      .at(-1).accounts['Cuenta A'];
    await navigate(page, 'investments');
    await page.locator('#view-investments [data-operation=compra]').click();
    await expect(
      page.locator('#operation-price').locator('xpath=..'),
    ).toContainText('Precio');
    await expect(page.locator('#operation-location')).toHaveCount(0);
    await expect(page.locator('.operation-additional summary')).toContainText(
      'Opciones avanzadas',
    );
    await page.locator('#operation-product').selectOption('__new_product__');
    await expect(page.locator('.inline-new-product')).toContainText(
      'Se añadirá el producto',
    );
    await expect(page.locator('#operation-newProduct_date')).toHaveCount(0);
    await page.locator('#operation-date').fill(before.settings.asof);
    await page
      .locator('#operation-newProduct_name')
      .fill('Synthetic new investment');
    await page
      .locator('#operation-newProduct_account')
      .selectOption('Cuenta A');
    await page.locator('#operation-newProduct_class').selectOption('Otros');
    if (withIsin) {
      await page.locator('#operation-newProduct_isin').fill('ES0112611001');
      await page
        .locator('#operation-newProduct_referenceName')
        .fill('Synthetic new investment class A');
    }
    await page.locator('#operation-concept').fill('Synthetic first purchase');
    await page.locator('#operation-units').fill('2');
    await page.locator('#operation-price').fill('5');
    await page.locator('#operation-form button[type=submit]').click();
    await expect(page.locator('#review-dialog')).toBeVisible();
    await expect(page.locator('#review-fields')).toContainText(
      'Synthetic new investment',
    );
    await expect(page.locator('#review-fields')).toContainText('$newProduct');
    if (withIsin)
      await expect(page.locator('#review-fields')).toContainText(
        'ES0112611001',
      );
    await expect(page.locator('#review-note')).toContainText(
      'se descontará una sola vez',
    );
    await page.locator('#review-confirm').click();
    await expect
      .poll(async () => (await queueData(page)).queue[0]?.status)
      .toBe('confirmed');
    const envelope = (await queueData(page)).queue[0].envelope;
    expect(envelope.operations.map((operation) => operation.process)).toEqual(
      withIsin
        ? ['producto', 'vincular_isin', 'compra']
        : ['producto', 'compra'],
    );
    const after = server.api({ action: 'read' });
    const product = after.tables.tProductos.find(
      (row) => row.Producto === 'Synthetic new investment',
    );
    expect(
      after.tables.tOperaciones.find((row) => row.Producto === product.ID)
        .Participaciones,
    ).toBe(2);
    expect(product['Fecha base']).toBe(before.settings.asof);
    expect(after.tables.tProductos.length).toBe(
      before.tables.tProductos.length + 1,
    );
    expect(after.tables.tOperaciones.length).toBe(
      before.tables.tOperaciones.length + 1,
    );
    expect(after.tables.tMovimientos.length).toBe(
      before.tables.tMovimientos.length + 1,
    );
    const movement = after.tables.tMovimientos.find(
      (row) => !before.tables.tMovimientos.some((old) => old.ID === row.ID),
    );
    expect(movement.Importe).toBe(10);
    expect(movement.Origen).toBe('Cuenta A');
    expect(
      analytics.cashTimeline(after, after.settings.asof.slice(0, 7)).at(-1)
        .accounts['Cuenta A'],
    ).toBe(balance - 10);
    expect(server.api(envelope).ok).toBe(true);
    expect(server.api({ action: 'read' }).tables.tOperaciones).toHaveLength(
      after.tables.tOperaciones.length,
    );
    expect(server.api({ action: 'read' }).tables.tMovimientos).toHaveLength(
      after.tables.tMovimientos.length,
    );
  });
}

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
  await page
    .locator('#budget-cards')
    .getByRole('button', { name: 'Ver evolución del límite' })
    .click();
  await expect(page.locator('#budget-detail-summary')).toContainText(
    '31/1/2026',
  );
  await expect(page.locator('#budget-detail-summary')).not.toContainText(
    'en curso',
  );
  await expect(page.locator('#budget-detail-stats')).toContainText('100,00');
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
  await expect(page.locator('#finance-sync')).toBeHidden();
  await expect(page.locator('#finance-queue')).toBeVisible();
  await expect(page.locator('#finance-queue')).toContainText(
    'No hay operaciones pendientes.',
  );
});

test('visual privacy survives a snapshot refresh and restores real empty states when revealed', async ({
  page,
}) => {
  const { server } = await setup(page);
  await navigate(page, 'connection');
  await page.locator('#local-settings > summary').click();
  await page
    .getByRole('button', { name: 'Ocultar / mostrar datos', exact: true })
    .click();
  await navigate(page, 'accounts');
  await expect(page.locator('#account-comparisons')).toBeHidden();
  await page.evaluate(
    (snapshot) => FinanceDashboard.render(snapshot, { review() {} }),
    server.api({ action: 'read' }),
  );
  await expect(page.locator('#account-comparisons')).toBeHidden();
  await navigate(page, 'home');
  await expect(page.locator('#finance-kpis')).toBeHidden();
  await navigate(page, 'connection');
  await page
    .getByRole('button', { name: 'Ocultar / mostrar datos', exact: true })
    .click();
  await navigate(page, 'home');
  await expect(page.locator('#finance-kpis')).toBeVisible();
  await expect(page.locator('#dashboard-empty')).toBeHidden();
});
