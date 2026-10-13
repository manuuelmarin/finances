const { test, expect } = require('@playwright/test');
const { navigate } = require('./helpers/navigation.cjs');
const { setup, queueData } = require('./helpers/finalization-runtime.cjs');

test('first planned payment creates metadata only and lost realization recovers one actual movement', async ({
  page,
}) => {
  const { server, calls, controls } = await setup(page);
  const before = server.api({ action: 'read' });
  expect(before.planned).toEqual([]);
  expect(before.capabilities.planned).toBe(true);
  await navigate(page, 'accounts');
  await expect(page.locator('#plan-new')).toBeEnabled();
  await page.locator('#plan-new').click();
  await page.locator('#plan-date').fill('2026-02-01');
  await page.locator('#plan-concept').fill('Synthetic planned payment');
  await page.locator('#plan-account').selectOption('Cuenta A');
  await page.locator('#plan-category').selectOption('Café');
  await page.locator('#plan-amount').fill('12,50');
  await page.locator('#plan-form button[type=submit]').click();
  expect(server.api({ action: 'read' }).planned).toEqual([]);
  await expect(page.locator('#review-dialog')).toContainText(
    'Synthetic planned payment',
  );
  await page.locator('#review-confirm').click();
  await expect
    .poll(async () => (await queueData(page)).queue[0]?.status)
    .toBe('confirmed');
  const planned = server.api({ action: 'read' });
  expect(planned.planned).toHaveLength(1);
  expect(planned.tables.tMovimientos).toEqual(before.tables.tMovimientos);
  expect(planned.tables.tOperaciones).toEqual(before.tables.tOperaciones);
  const planId = planned.planned[0].id;
  await expect(page.locator('#planned-list')).toContainText(
    'Synthetic planned payment',
  );
  controls.loseNextSubmit = true;
  await page
    .locator('#planned-list')
    .getByRole('button', { name: 'Confirmar realizado', exact: true })
    .click();
  const actual = calls.filter((request) => request.action === 'transact');
  expect(actual).toHaveLength(1);
  await page.locator('#review-confirm').click();
  await expect
    .poll(async () => (await queueData(page)).queue[1]?.status)
    .toBe('uncertain');
  const envelope = (await queueData(page)).queue[1].envelope;
  expect(envelope.operations).toEqual([
    {
      process: 'gasto',
      date: '2026-02-01',
      concept: 'Synthetic planned payment',
      account: 'Cuenta A',
      category: 'Café',
      amount: 12.5,
    },
    { process: 'quitar_obligacion', id: planId },
  ]);
  expect(server.api({ action: 'read' }).planned).toEqual([]);
  expect(server.api({ action: 'read' }).tables.tMovimientos).toHaveLength(
    before.tables.tMovimientos.length + 1,
  );
  await navigate(page, 'activity');
  await page.locator('#finance-sync').click();
  await expect
    .poll(async () => (await queueData(page)).queue[1]?.status)
    .toBe('confirmed');
  expect((await queueData(page)).queue[1].envelope).toEqual(envelope);
  expect(calls.filter((request) => request.action === 'transact')).toHaveLength(
    2,
  );
  expect(
    calls.some(
      (request) =>
        request.action === 'requestStatus' &&
        request.requestId === envelope.requestId,
    ),
  ).toBe(true);
  expect(
    server
      .api({ action: 'read' })
      .tables.tMovimientos.filter(
        (row) => row.Concepto === 'Synthetic planned payment',
      ),
  ).toHaveLength(1);
  await navigate(page, 'accounts');
  await expect(page.locator('#planned-list')).not.toContainText(
    'Synthetic planned payment',
  );
});

function prepareFunds(server) {
  expect(
    server.transact([
      {
        process: 'vincular_isin',
        product: 'PRODUCT-A',
        isin: 'IE00B4L5Y983',
        referenceName: 'Synthetic source fund',
      },
      {
        process: 'producto',
        name: 'Synthetic destination fund',
        account: 'Cuenta B',
        class: 'Renta variable',
        date: '2025-01-01',
        units: 0,
        cost: 0,
        isin: 'IE00B3XXRP09',
        referenceName: 'Synthetic destination fund',
      },
    ]).ok,
  ).toBe(true);
  // The Sheets emulator stores formulas without evaluating them. Install the
  // supported native formula inputs; true native calculation has its own audit.
  const state = server.state(),
    range = state.layout.tProductos.range;
  const requests = [];
  for (let row = range.startRowIndex + 1; row < range.endRowIndex; row++)
    for (const formula of server.ctx.fundProductFormulas_(state, row + 1))
      requests.push({
        updateCells: {
          start: {
            sheetId: range.sheetId,
            rowIndex: row,
            columnIndex: formula.column,
          },
          rows: [
            {
              values: [
                {
                  userEnteredValue: {
                    formulaValue: server.ctx.nativeFormula_(
                      state,
                      formula.original,
                    ),
                  },
                },
              ],
            },
          ],
          fields: 'userEnteredValue',
        },
      });
  server.ctx.Sheets.Spreadsheets.batchUpdate({ requests }, 'fixture-book');
}

test('@responsive reviewed fund transfer persists paired cashless legs and one receipt without touching cash or quotes', async ({
  page,
}) => {
  const { server, calls } = await setup(page, { configure: prepareFunds });
  const before = server.api({ action: 'read' });
  const destination = before.tables.tProductos.find(
    (p) => p.ID !== 'PRODUCT-A',
  ).ID;
  await navigate(page, 'investments');
  await page.getByRole('tab', { name: 'Operaciones', exact: true }).click();
  await page.locator('#view-investments [data-operation="compra"]').click();
  await page.locator('#operation-kind').selectOption('traspaso_fondo');
  for (const [field, value] of Object.entries({
    date: '2026-01-02',
    concept: 'Synthetic reviewed fund transfer',
    outUnits: '2',
    outPrice: '3',
    inUnits: '3',
    inPrice: '2',
  }))
    await page.locator('#operation-' + field).fill(value);
  await page.locator('#operation-fromProduct').selectOption('PRODUCT-A');
  await page.locator('#operation-toProduct').selectOption(destination);
  await page.locator('#operation-review').click();
  expect(calls.filter((request) => request.action === 'transact')).toHaveLength(
    0,
  );
  expect(server.api({ action: 'read' }).fundTransfers).toEqual([]);
  await expect(page.locator('#review-dialog')).toContainText(
    'Synthetic reviewed fund transfer',
  );
  await page.locator('#review-confirm').click();
  await expect
    .poll(async () => (await queueData(page)).queue[0]?.status)
    .toBe('confirmed');
  const after = server.api({ action: 'read' });
  expect(after.fundTransfers).toHaveLength(1);
  const transfer = after.fundTransfers[0];
  expect(transfer.amount).toBe(6);
  expect(transfer.costBasis).toBe(4);
  expect(after.tables.tMovimientos).toEqual(before.tables.tMovimientos);
  expect(after.tables.tPrecios).toEqual(before.tables.tPrecios);
  const legs = after.tables.tOperaciones.filter((row) =>
    [transfer.outTradeID, transfer.inTradeID].includes(row.ID),
  );
  expect(legs.map((row) => row.Tipo).sort()).toEqual(['Compra', 'Venta']);
  expect(legs.every((row) => row.Movimiento === null)).toBe(true);
  expect(legs.find((row) => row.Tipo === 'Venta').Participaciones).toBe(2);
  expect(legs.find((row) => row.Tipo === 'Compra').Participaciones).toBe(3);
  expect(calls.filter((request) => request.action === 'transact')).toHaveLength(
    1,
  );
  await expect(page.locator('#finance-register')).toContainText(
    'Synthetic reviewed fund transfer',
  );
});
