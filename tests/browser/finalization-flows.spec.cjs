const { test, expect } = require('@playwright/test');
const { navigate } = require('./helpers/navigation.cjs');
const {
  setup,
  deployment,
  queueData,
  expense,
  openSettings,
  isin,
  referenceName,
} = require('./helpers/finalization-runtime.cjs');
const header =
  'isin,referenceName,classCurrency,quoteCurrency,date,price,provider,sourceUrl,exportedAt';
const historyCsv = (count = 21, price = 301.123456) =>
  header +
  '\n' +
  Array.from({ length: count }, (_, index) =>
    [
      isin,
      referenceName,
      'EUR',
      'EUR',
      '2026-09-' + String(index + 1).padStart(2, '0'),
      price,
      'Synthetic owner reviewed export',
      '',
      '2026-10-01T12:00:00Z',
    ].join(','),
  ).join('\n');
async function selectHistory(page, buffer = historyCsv()) {
  await navigate(page, 'investments');
  await page.locator('#history-import summary').click();
  await page.locator('#history-product').selectOption('PRODUCT-A');
  await page.locator('#history-file').setInputFiles({
    name: 'fictional-history.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(buffer),
  });
  await page.locator('#history-source-verified').check();
}
const imports = (calls) =>
  calls.filter((request) => request.action === 'importPriceHistory');
const submits = (calls) =>
  calls.filter((request) => request.action === 'transact');

test('historical chunks wait for preserved receipt and confirmed reread after a lost reply', async ({
  page,
}) => {
  const { server, calls, controls } = await setup(page, { history: true });
  const original = server.api({ action: 'read' });
  await selectHistory(page);
  await page.locator('#history-preview').click();
  await expect(page.locator('#history-output')).toContainText('Lote 1 de 2');
  expect(imports(calls)).toHaveLength(0);
  controls.loseNextSubmit = true;
  await page.locator('#history-confirm').click();
  await expect
    .poll(async () => (await queueData(page)).queue[0]?.status)
    .toBe('uncertain');
  await expect(page.locator('#finance-state')).toContainText(
    'Lote histórico en cola',
  );
  const originalEnvelope = (await queueData(page)).queue[0].envelope;
  expect(imports(calls)).toHaveLength(1);
  expect(imports(calls)[0].rows).toHaveLength(20);
  await page.locator('#history-preview').click();
  await expect(page.locator('#finance-state')).toContainText(
    'lote anterior sigue pendiente',
  );
  expect(imports(calls)).toHaveLength(1);
  await navigate(page, 'activity');
  await page.locator('#finance-sync').click();
  await expect
    .poll(async () => (await queueData(page)).queue[0]?.status)
    .toBe('confirmed');
  expect((await queueData(page)).queue[0].envelope).toEqual(originalEnvelope);
  expect(imports(calls)).toHaveLength(1);
  expect(
    calls.some(
      (request) =>
        request.action === 'requestStatus' &&
        request.requestId === originalEnvelope.requestId,
    ),
  ).toBe(true);
  await navigate(page, 'investments');
  await page.locator('#history-preview').click();
  await expect(page.locator('#history-output')).toContainText('Lote 2 de 2');
  await page.locator('#history-confirm').click();
  await expect
    .poll(async () => (await queueData(page)).queue.map((item) => item.status))
    .toEqual(['confirmed', 'confirmed']);
  expect(imports(calls).map((request) => request.rows.length)).toEqual([20, 1]);
  expect(imports(calls)[1].requestId).not.toBe(originalEnvelope.requestId);
  const after = server.api({ action: 'read' });
  expect(after.tables.tPrecios).toHaveLength(
    original.tables.tPrecios.length + 21,
  );
  for (const table of ['tMovimientos', 'tOperaciones'])
    expect(after.tables[table]).toEqual(original.tables[table]);
  expect(server.fetches).toHaveLength(0);
});

test('historical NAV conflict never enables confirmation or writes another price', async ({
  page,
}) => {
  const { server, calls } = await setup(page, { history: true });
  const snapshot = server.api({ action: 'read' });
  const csv = historyCsv(1, 999).replace('2026-09-01', '2026-01-01');
  await selectHistory(page, csv);
  await page.locator('#history-preview').click();
  await expect(page.locator('#history-confirm')).toBeDisabled();
  await expect(page.locator('#finance-state')).toContainText(
    'conflictos de NAV',
  );
  expect(imports(calls)).toHaveLength(0);
  expect(server.api({ action: 'read' }).tables.tPrecios).toEqual(
    snapshot.tables.tPrecios,
  );
});

test('template saving creates no movement, reuse reviews actual money, and archive preserves history', async ({
  page,
}) => {
  const { server, calls } = await setup(page);
  const movements = server.api({ action: 'read' }).tables.tMovimientos.length;
  await expense(page);
  await page.locator('.operation-templates summary').click();
  await page
    .getByRole('textbox', { name: 'Nombre de la plantilla' })
    .fill('Fictional coffee template');
  await page
    .getByRole('button', { name: 'Guardar como plantilla', exact: true })
    .click();
  await expect(page.locator('#review-note')).toContainText(
    'No se registra ningún movimiento',
  );
  await page.locator('#review-confirm').click();
  await expect
    .poll(() => server.api({ action: 'read' }).templates?.length)
    .toBe(1);
  expect(server.api({ action: 'read' }).tables.tMovimientos).toHaveLength(
    movements,
  );
  await page.locator('#finance-new').click();
  await page.locator('.operation-templates summary').click();
  await page
    .locator('.operation-templates')
    .getByRole('button', { name: 'Usar', exact: true })
    .click();
  await expect(page.locator('#operation-amount')).toHaveValue('7.25');
  await expect(page.locator('#operation-account')).toHaveValue('Cuenta A');
  expect(server.api({ action: 'read' }).tables.tMovimientos).toHaveLength(
    movements,
  );
  await page.locator('#operation-review').click();
  await page.locator('#review-confirm').click();
  await expect
    .poll(() => server.api({ action: 'read' }).tables.tMovimientos.length)
    .toBe(movements + 1);
  expect(
    submits(calls).map((request) => request.operations[0].process),
  ).toEqual(['plantilla', 'gasto']);
  await navigate(page, 'accounts');
  await page
    .locator('#finance-register tr')
    .filter({ has: page.getByRole('cell', { name: 'Cuenta A', exact: true }) })
    .getByRole('button', { name: 'Archivar', exact: true })
    .click();
  await page.locator('#review-confirm').click();
  await expect
    .poll(() => server.api({ action: 'read' }).archives.accounts)
    .toContain('Cuenta A');
  expect(server.api({ action: 'read' }).tables.tMovimientos).toHaveLength(
    movements + 1,
  );
  await page.locator('#finance-new').click();
  await expect(
    page.locator('#operation-account option[value="Cuenta A"]'),
  ).toHaveCount(0);
  await page.locator('#operation-cancel').click();
  await navigate(page, 'book');
  await expect(page.locator('#finance-register')).toContainText(
    'Fictional recurring coffee',
  );
  await expect(page.locator('#finance-register')).toContainText('Cuenta A');
  await page
    .locator('#finance-register tr')
    .filter({ hasText: 'Fictional recurring coffee' })
    .getByRole('button', { name: 'Corregir', exact: true })
    .click();
  await expect(page.locator('#operation-account')).toHaveValue('Cuenta A');
  await page.locator('#operation-cancel').click();
  expect(server.api({ action: 'read' }).tables.tMovimientos).toHaveLength(
    movements + 1,
  );
});

test('local copy controls distinguish hiding, closing, disconnecting and erasing resolved namespaces', async ({
  page,
}) => {
  const { calls } = await setup(page);
  const current = await queueData(page);
  await expect(page.locator('#finance-kpis')).toBeVisible();
  await page.evaluate(async (snapshot) => {
    const store = new FinanceSync.BrowserStore();
    const oldBook = 'b'.repeat(64);
    const item = (status, index) => ({
      envelope: {
        action: 'transact',
        requestId: 'fictional-old-' + index,
        expectedRevision: 'fictional-revision',
        operations: [],
      },
      label: 'Preserved old request',
      bookKey: oldBook,
      createdAt: '2026-01-01T00:00:00Z',
      status,
      result:
        status === 'uncertain'
          ? { ok: false, error: 'RESPONSE_UNCERTAIN' }
          : null,
    });
    await store.update('fictional-unresolved-namespace', () => ({
      label: 'Copia anterior sin resolver',
      bookKey: oldBook,
      snapshot: { ...snapshot, bookKey: oldBook },
      queue: ['pending', 'uncertain', 'review'].map(item),
    }));
    await store.update('fictional-resolved-namespace', () => ({
      label: 'Copia anterior resuelta',
      bookKey: oldBook,
      snapshot: { ...snapshot, bookKey: oldBook },
      queue: [item('confirmed', 4)],
    }));
  }, current.snapshot);
  await openSettings(page);
  await page
    .getByRole('button', {
      name: 'Comprobar preparación del entorno',
      exact: true,
    })
    .click();
  await expect(page.locator('#local-settings')).toContainText('API 3.3.0');
  await expect(page.locator('#local-settings')).toContainText(
    'colas de otros dispositivos',
  );
  expect(
    calls.filter((request) => request.action === 'diagnostics'),
  ).toHaveLength(1);
  const unresolved = page
    .locator('#stored-copies p')
    .filter({ hasText: 'Copia anterior sin resolver' });
  const resolved = page
    .locator('#stored-copies p')
    .filter({ hasText: 'Copia anterior resuelta' });
  await expect(unresolved).toContainText('3 sin resolver');
  await expect(unresolved.getByRole('button')).toBeDisabled();
  await expect(page.locator('#stored-copies')).not.toContainText(deployment);
  await expect(page.locator('#stored-copies')).not.toContainText(
    'b'.repeat(64),
  );
  await resolved.getByRole('button').click();
  await page.locator('#review-confirm').click();
  const old = await page.evaluate(async () => ({
    resolved: await new FinanceSync.BrowserStore().get(
      'fictional-resolved-namespace',
    ),
    unresolved: await new FinanceSync.BrowserStore().get(
      'fictional-unresolved-namespace',
    ),
  }));
  expect(old.resolved.snapshot).toBeNull();
  expect(old.resolved.queue).toHaveLength(0);
  expect(old.unresolved.queue.map((item) => item.status)).toEqual([
    'pending',
    'uncertain',
    'review',
  ]);
  await page.getByRole('button', { name: 'Ocultar / mostrar datos' }).click();
  await navigate(page, 'home');
  await expect(page.locator('#finance-kpis')).not.toBeVisible();
  expect((await queueData(page)).snapshot.bookKey).toBe(
    current.snapshot.bookKey,
  );
  await openSettings(page);
  await page
    .getByRole('button', { name: 'Cerrar ventana de Google', exact: true })
    .click();
  await expect(page.locator('#finance-state')).toContainText(
    'pendientes se conservan',
  );
  expect((await queueData(page)).snapshot).not.toBeNull();
  await page
    .getByRole('button', { name: 'Desconectar enlace', exact: true })
    .click();
  await expect(page.locator('#finance-state')).toContainText(
    'Configura el enlace',
  );
  expect(
    await page.evaluate(() => localStorage.getItem('finances.appsScriptUrl')),
  ).toBeNull();
  expect((await queueData(page)).snapshot).not.toBeNull();
  expect(submits(calls)).toHaveLength(0);
});

test('online recovery waits for the current read and reuses its one connected window', async ({
  page,
}) => {
  const { controls, calls } = await setup(page);
  const gate = controls.gateNextRead();
  await page.locator('#finance-refresh').click();
  await gate.entered;
  await page.evaluate(async (deployment) => {
    const queue = new FinanceSync.Queue(
      new FinanceSync.BrowserStore(),
      await FinanceSync.namespace(deployment),
    );
    await queue.enqueue(
      [
        {
          process: 'gasto',
          date: '2026-01-02',
          concept: 'Deferred fictional expense',
          account: 'Cuenta A',
          category: 'Café',
          amount: 1,
        },
      ],
      'Deferred fictional expense',
    );
    window.dispatchEvent(new Event('online'));
  }, deployment);
  expect(submits(calls)).toHaveLength(0);
  gate.release();
  await expect
    .poll(async () => (await queueData(page)).queue[0]?.status)
    .toBe('confirmed');
  expect(submits(calls)).toHaveLength(1);
  expect(await page.evaluate(() => window.fictionalGoogleOpens)).toBe(1);
});

test('automatic recovery stops after three failed submissions and preserves the original UUID', async ({
  page,
}) => {
  const { controls, calls } = await setup(page);
  controls.failSubmitBeforeApply = 10;
  await page.evaluate(async (deployment) => {
    const queue = new FinanceSync.Queue(
      new FinanceSync.BrowserStore(),
      await FinanceSync.namespace(deployment),
    );
    await queue.enqueue(
      [
        {
          process: 'gasto',
          date: '2026-01-02',
          concept: 'Bounded fictional expense',
          account: 'Cuenta A',
          category: 'Café',
          amount: 1,
        },
      ],
      'Bounded fictional expense',
    );
    window.dispatchEvent(new Event('online'));
  }, deployment);
  await expect.poll(() => submits(calls).length, { timeout: 10000 }).toBe(3);
  await page.waitForTimeout(2200);
  expect(submits(calls)).toHaveLength(3);
  expect(new Set(submits(calls).map((request) => request.requestId)).size).toBe(
    1,
  );
  const item = (await queueData(page)).queue[0];
  expect(item.status).toBe('uncertain');
  expect(item.envelope).toEqual(submits(calls)[0]);
  expect(await page.evaluate(() => window.fictionalGoogleOpens)).toBe(1);
});

test('reload during a held submission recovers the protected claim immediately through its one receipt', async ({
  page,
}) => {
  const { server, calls, controls } = await setup(page);
  const originalCount = server.api({ action: 'read' }).tables.tMovimientos
    .length;
  const reply = controls.gateNextSubmitReply();
  await expense(page, 'Fictional interrupted submission');
  await page.locator('#operation-review').click();
  await page.locator('#review-confirm').click();
  await reply.entered;
  const saved = (await queueData(page)).queue[0];
  expect(saved.status).toBe('uncertain');
  expect(saved.claim.protectedByLock).toBe(true);
  expect(saved.claim.until).toBeGreaterThan(Date.now());
  expect(submits(calls)).toHaveLength(1);
  expect(server.api({ action: 'read' }).tables.tMovimientos).toHaveLength(
    originalCount + 1,
  );
  await page.reload();
  reply.release();
  await expect(page.locator('#finance-state')).toContainText('Copia local');
  await page.locator('#finance-connect').click();
  await navigate(page, 'activity');
  await page.locator('#finance-sync').click();
  await expect
    .poll(async () => (await queueData(page)).queue[0]?.status, {
      timeout: 5000,
    })
    .toBe('confirmed');
  const recovered = (await queueData(page)).queue[0];
  expect(recovered.envelope).toEqual(saved.envelope);
  expect(recovered.claim).toBeUndefined();
  expect(submits(calls)).toHaveLength(1);
  expect(
    calls.some(
      (request) =>
        request.action === 'requestStatus' &&
        request.requestId === saved.envelope.requestId,
    ),
  ).toBe(true);
  expect(server.api({ action: 'read' }).tables.tMovimientos).toHaveLength(
    originalCount + 1,
  );
});
