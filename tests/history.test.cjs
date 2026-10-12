const { test } = require('node:test'),
  assert = require('node:assert/strict');
const { csv } = require('../web/history.js');
const header =
  'isin,referenceName,classCurrency,quoteCurrency,date,price,provider,sourceUrl,exportedAt';
const row =
  'ES0112611001,"Synthetic, class EUR",EUR,EUR,2026-09-15,"301,123456",Synthetic export,,2026-10-01T12:00:00Z';
test('history CSV preserves quoted decimal comma and names and handles semicolon exports', () => {
  const result = csv(header + '\r\n' + row);
  assert.equal(result[0].price, 301.123456);
  assert.equal(result[0].referenceName, 'Synthetic, class EUR');
  assert.equal(result[0].sourceUrl, null);
  assert.equal(
    csv(
      header.replaceAll(',', ';') +
        '\n' +
        row
          .replace('"Synthetic, class EUR"', 'Synthetic EUR')
          .replace('"301,123456"', '301.123456')
          .replaceAll(',', ';'),
    )[0].price,
    301.123456,
  );
});
test('history CSV rejects formulas, impossible dates, ambiguous grouping, duplicate dates and broken quotes', () => {
  for (const invalid of [
    row.replace('Synthetic export', '=WEBSERVICE(secret)'),
    row.replace('2026-09-15', '2026-02-30'),
    row.replace('301,123456', '1.301,123456'),
    row + '\n' + row,
    row.replace('"Synthetic, class EUR"', '"unclosed'),
  ])
    assert.throws(() => csv(header + '\n' + invalid));
});

test('historical UI gates next chunk on receipt and read, and resets offsets on book switch', async () => {
  const elements = Object.fromEntries(
    [
      'history-preview',
      'history-confirm',
      'history-file',
      'history-product',
      'history-source-verified',
      'history-output',
    ].map((id) => [
      id,
      {
        listeners: {},
        options: [],
        dataset: {},
        value: '',
        files: [],
        addEventListener(type, fn) {
          this.listeners[type] = fn;
        },
        append(option) {
          this.options.push(option);
          if (!this.value) this.value = option.value;
        },
        replaceChildren() {
          this.options = [];
          this.value = '';
        },
      },
    ]),
  );
  const oldDocument = global.document;
  global.document = {
    getElementById: (id) => elements[id],
    createElement: () => ({}),
  };
  try {
    let snap = {
        bookKey: 'book-one',
        revision: 'r1',
        prices: [{ product: 'P', name: 'Synthetic class' }],
        tables: { tPrecios: [] },
      },
      receipt = { status: 'pending' },
      previews = [];
    const file = {
      name: 'history.csv',
      size: 1000,
      lastModified: 1,
      text: async () =>
        header +
        '\n' +
        Array.from({ length: 21 }, (_, i) =>
          row.replace(
            '2026-09-15',
            '2026-09-' + String(i + 1).padStart(2, '0'),
          ),
        ).join('\n'),
    };
    elements['history-file'].files = [file];
    elements['history-source-verified'].checked = true;
    const controller = global.FinanceHistory.bind({
      getSnapshot: () => snap,
      preview: async (payload) => {
        previews.push(payload);
        return { ok: true, canImport: true, rows: payload.rows };
      },
      enqueue: async () => ({ requestId: 'receipt-one' }),
      receipt: async () => receipt,
      status: () => {},
    });
    await elements['history-preview'].listeners.click();
    assert.equal(previews.at(-1).rows.length, 20);
    await elements['history-confirm'].listeners.click();
    await elements['history-preview'].listeners.click();
    assert.equal(previews.length, 1);
    receipt = { status: 'review' };
    await elements['history-preview'].listeners.click();
    assert.equal(previews.length, 1);
    receipt = { status: 'discarded' };
    await elements['history-preview'].listeners.click();
    assert.equal(previews.length, 2);
    assert.equal(previews.at(-1).rows[0].date, '2026-09-01');
    receipt = { status: 'pending' };
    await elements['history-confirm'].listeners.click();
    receipt = { status: 'confirmed' };
    await elements['history-preview'].listeners.click();
    assert.equal(previews.length, 2);
    snap = {
      ...snap,
      revision: 'r2',
      tables: {
        tPrecios: previews[0].rows.map((r) => ({
          Producto: 'P',
          Fecha: r.date,
          'VL EUR': r.price,
        })),
      },
    };
    await elements['history-preview'].listeners.click();
    assert.equal(previews.at(-1).rows.length, 1);
    snap = {
      ...snap,
      bookKey: 'book-two',
      revision: 'different',
      tables: { tPrecios: [] },
    };
    await elements['history-preview'].listeners.click();
    assert.equal(previews.at(-1).rows.length, 20);
    assert.equal(previews.at(-1).bookKey, 'book-two');
    assert.equal(elements['history-product'].options.length, 1);
    controller.refresh(null);
    assert.equal(elements['history-output'].textContent, '');
    assert.equal(elements['history-confirm'].disabled, true);
    assert.equal(elements['history-source-verified'].checked, false);
    assert.equal(elements['history-product'].options.length, 0);
  } finally {
    global.document = oldDocument;
  }
});
