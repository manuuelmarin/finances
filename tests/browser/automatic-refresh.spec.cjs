const { test, expect } = require('@playwright/test');
const {
  setup,
  expense,
  queueData,
} = require('./helpers/finalization-runtime.cjs');
const { navigate } = require('./helpers/navigation.cjs');

test.beforeEach(({ browserName }) => {
  // Cold WebKit startup plus form, readback, four views and reload can exceed
  // the default 30-second whole-test budget on CI. Keep every assertion intact.
  if (browserName === 'webkit') test.setTimeout(60000);
});

// Simulated Sheets formula results, not another production calculation engine.
// The test exercises form -> queue -> backend -> read -> every rendered view.
function calculatedSnapshot(snapshot) {
  const movements = snapshot.tables.tMovimientos.filter(
    (m) =>
      m.Fecha >= snapshot.settings.start && m.Fecha <= snapshot.settings.asof,
  );
  for (const account of snapshot.tables.tCuentas)
    account['Saldo calculado'] =
      account['Saldo inicial'] +
      movements.reduce(
        (sum, m) =>
          sum +
          (m.Destino === account.Cuenta ? m.Importe : 0) -
          (m.Origen === account.Cuenta ? m.Importe : 0),
        0,
      );
  const cash = snapshot.tables.tCuentas.reduce(
    (sum, a) => sum + a['Saldo calculado'],
    0,
  );
  const spent = movements
    .filter((m) => m.Tipo === 'Gasto')
    .reduce((sum, m) => sum + m.Importe - (m.Recuperable || 0), 0);
  snapshot.summary = {
    complete: true,
    missingPrices: [],
    missingMetrics: [],
    filters: { Año: 2026, Periodo: 'Todo el año', Cuenta: 'Todas' },
    metrics: Object.entries({
      'Patrimonio neto': cash + 15,
      Efectivo: cash,
      Inversiones: 15,
      Deuda: 0,
      Ingresos: 0,
      'Gastos propios': spent,
      Ahorro: -spent,
      'Tasa de ahorro': 0,
    }).map(([label, value]) => ({ label, value })),
  };
  return snapshot;
}

for (const failure of [
  'none',
  'read error',
  'old snapshot',
  'old calculations',
]) {
  test(`@responsive @safari expense automatically refreshes all views after ${failure}`, async ({
    page,
  }) => {
    let previous,
      interrupted = false;
    const { calls } = await setup(page, {
      configure(server) {
        expect(
          server.transact([
            {
              process: 'presupuesto',
              month: '2026-01',
              category: null,
              amount: 100,
            },
          ]).ok,
        ).toBe(true);
      },
      transformRead(result) {
        const fresh = calculatedSnapshot(result);
        if (!fresh.tables.tMovimientos.length)
          previous = structuredClone(fresh);
        else if (!interrupted && failure !== 'none') {
          interrupted = true;
          if (failure === 'read error') throw Error('READ_TIMEOUT');
          if (failure === 'old snapshot') return previous;
          fresh.tables.tCuentas[0]['Saldo calculado'] = 1000;
        }
        return fresh;
      },
    });
    await expense(page, 'Automatic fictional expense');
    await page.locator('#operation-date').fill('2026-01-03');
    await page.locator('#operation-form button[type=submit]').click();
    await page.locator('#review-confirm').click();
    // Recovery includes a scheduled reread and simulated Sheets work. Under
    // concurrent CI WebKit runs this can exceed the default 5-second assertion
    // budget; keep the final snapshot, request-count and amount checks intact.
    await expect(page.locator('#finance-state')).toContainText(
      'Datos actualizados en todas las pestañas',
      { timeout: 15000 },
    );
    const saved = await queueData(page);
    expect(saved.queue).toHaveLength(1);
    expect(saved.queue[0].status).toBe('confirmed');
    expect(saved.queue[0].awaitingRead).toBeUndefined();
    await expect(page.locator('#pending-total')).toHaveText('0');
    await expect(page.locator('#finance-queue .queue-item')).toHaveCount(0);
    await expect(page.locator('#finance-sync')).toBeHidden();
    await expect(page.locator('#confirmed-history')).not.toHaveAttribute(
      'open',
      '',
    );
    await expect(page.locator('#finance-history .queue-item')).toHaveCount(1);
    expect(calls.filter((c) => c.action === 'transact')).toHaveLength(1);
    expect(calls.filter((c) => c.action === 'read')).toHaveLength(
      failure === 'none' ? 3 : 4,
    );
    await navigate(page, 'home');
    await expect(page.locator('#finance-kpis')).toContainText('992,75');
    const summaryExpenses = page
      .locator('#dashboard-charts .chart-card')
      .filter({
        has: page.getByRole('heading', { name: 'Gastos del mes', exact: true }),
      });
    await expect(summaryExpenses).toContainText('7,25');
    await navigate(page, 'book');
    await expect(page.locator('#finance-register')).toContainText(
      'Automatic fictional expense',
    );
    await expect(page.locator('#spending-summary')).toContainText('7,25');
    await navigate(page, 'accounts');
    await expect(
      page.locator(
        '.account-balance-card[data-account="Cuenta A"] .account-balance',
      ),
    ).toHaveText('992,75 €');
    await expect(page.locator('#account-balance-date')).toContainText(
      '3/1/2026',
    );
    await navigate(page, 'budgets');
    await expect(page.locator('#budget-cards')).toContainText('92,75');
    await page.reload();
    await navigate(page, 'accounts');
    await expect(
      page.locator(
        '.account-balance-card[data-account="Cuenta A"] .account-balance',
      ),
    ).toHaveText('992,75 €');
    expect(calls.filter((c) => c.action === 'transact')).toHaveLength(1);
  });
}

test('@responsive bounded rereads preserve the confirmation across reload and never resend it', async ({
  page,
}) => {
  let fail = true,
    failedReads = 0;
  const { calls } = await setup(page, {
    transformRead(result) {
      if (result.tables.tMovimientos.length && fail) {
        failedReads++;
        throw Error('READ_TIMEOUT');
      }
      return calculatedSnapshot(result);
    },
  });
  await expense(page);
  await page.locator('#operation-form button[type=submit]').click();
  await page.locator('#review-confirm').click();
  await expect.poll(() => failedReads, { timeout: 15000 }).toBe(4);
  expect((await queueData(page)).queue[0].awaitingRead).toBe(true);
  await expect(page.locator('#pending-total')).toHaveText('1');
  await expect(page.locator('#finance-queue')).toContainText(
    'Guardada · actualizando pestañas',
  );
  await expect(page.locator('#finance-history .queue-item')).toHaveCount(0);
  await expect(page.locator('#finance-warning')).toContainText(
    'Falta actualizar',
  );
  expect(calls.filter((c) => c.action === 'transact')).toHaveLength(1);
  fail = false;
  await page.reload();
  await page.locator('#finance-connect').click();
  await expect(page.locator('#finance-state')).toContainText(
    'Lectura confirmada',
  );
  expect((await queueData(page)).queue[0].awaitingRead).toBeUndefined();
  await navigate(page, 'accounts');
  await expect(
    page.locator(
      '.account-balance-card[data-account="Cuenta A"] .account-balance',
    ),
  ).toHaveText('992,75 €');
  expect(calls.filter((c) => c.action === 'transact')).toHaveLength(1);
});

for (const pinned of [false, true]) {
  test(`@responsive @safari a new reporting month ${pinned ? 'preserves explicit filters' : 'updates default periods in every view'}`, async ({
    page,
  }) => {
    await setup(page, {
      transformRead: calculatedSnapshot,
      configure(server) {
        expect(
          server.transact([
            {
              process: 'saldo_observado',
              account: 'Cuenta A',
              date: '2026-01-01',
              amount: 1000,
              scope: 'cierre_dia',
            },
          ]).ok,
        ).toBe(true);
      },
    });
    if (pinned) {
      await page.locator('#cash-period-mode').selectOption('dates');
      await page.locator('#cash-from').fill('2026-01-01');
      await page.locator('#cash-to').fill('2026-01-02');
      await navigate(page, 'book');
      await page.locator('#spending-month-month').selectOption('01');
      await navigate(page, 'accounts');
      await page.locator('#account-reconciliation summary').first().click();
      await page.locator('#account-month-month').selectOption('01');
      await navigate(page, 'budgets');
      await page.locator('#budget-month-month').selectOption('01');
    }
    await navigate(page, 'home');
    await expense(page, 'Fictional next-month expense');
    await page.locator('#operation-date').fill('2026-02-03');
    await page.locator('#operation-form button[type=submit]').click();
    await page.locator('#review-confirm').click();
    await expect(page.locator('#finance-state')).toContainText(
      'Datos actualizados en todas las pestañas',
    );
    const month = pinned ? '2026-01' : '2026-02';
    await navigate(page, 'home');
    await expect(page.locator('#cash-month')).toHaveValue(month);
    if (pinned) {
      await expect(page.locator('#cash-from')).toHaveValue('2026-01-01');
      await expect(page.locator('#cash-to')).toHaveValue('2026-01-02');
    } else {
      const distribution = page
        .locator('#dashboard-charts .chart-card')
        .filter({
          has: page.getByRole('heading', {
            name: 'Gastos del mes',
            exact: true,
          }),
        });
      await expect(distribution).toContainText('7,25');
    }
    await navigate(page, 'book');
    await expect(page.locator('#spending-month')).toHaveValue(month);
    await navigate(page, 'accounts');
    await expect(page.locator('#account-month')).toHaveValue(month);
    await expect(
      page.locator(
        '.account-balance-card[data-account="Cuenta A"] .account-balance',
      ),
    ).toHaveText('992,75 €');
    await navigate(page, 'budgets');
    await expect(page.locator('#budget-month')).toHaveValue(month);
  });
}
