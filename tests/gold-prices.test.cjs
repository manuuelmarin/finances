const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { runtime, serial } = require('./helpers/runtime.cjs');
const { fixedClock } = require('./helpers/clock.cjs');

const GOLD = 'IE00B4ND3602';
const NAME = 'iShares Physical Gold ETC';
const ISSUER =
  'https://www.blackrock.com/es/particulares/productos/258441/ishares-physical-gold-etc';
const ECB = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml';

// Synthetic excerpts reproduce only the relevant public fields, not issuer pages.
function issuer({
  isin = GOLD,
  name = NAME,
  currency = 'USD',
  date = '02 oct 2026',
  price = '73,25',
} = {}) {
  return `<h1 class="product-title"><span>${name}</span></h1>
    <li class="navAmount" data-col="fundHeader.fundNav.navAmount"><span>Valor liquidativo a ${date}</span><span>${currency} ${price}</span></li>
    <div class="product-data-item col-baseCurrencyCode"><div class="caption">Divisa base</div><div class="data">${currency}</div></div>
    <div class="product-data-item col-isin"><div class="caption">ISIN</div><div class="data">${isin}</div></div>`;
}
function rates(days = [['2026-10-02', '1.1']]) {
  return `<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref"><gesmes:Sender><gesmes:name>European Central Bank</gesmes:name></gesmes:Sender><Cube>${days.map(([date, rate]) => `<Cube time="${date}"><Cube currency="USD" rate="${rate}"/></Cube>`).join('')}</Cube></gesmes:Envelope>`;
}
function setup({ html = issuer(), xml = rates(), fetch } = {}) {
  const r = runtime({
    fetch:
      fetch ||
      ((url) => ({ body: url === ISSUER ? html : url === ECB ? xml : '' })),
  });
  r.ctx.Date = fixedClock(Date.parse('2026-10-06T12:00:00Z'));
  return r;
}
function quote(r, referenceName = NAME, isin = GOLD) {
  return r.api({ action: 'quotePrices', funds: [{ isin, referenceName }] })
    .results[0];
}
function request(r) {
  return {
    action: 'refreshPrices',
    requestId: crypto.randomUUID(),
    expectedRevision: r.state().revision,
    products: ['Fondo A'],
  };
}

test('el ETC se identifica por ISIN y convierte el valor del emisor con el cambio BCE del mismo día', () => {
  const r = setup(),
    result = quote(r);
  assert.equal(result.ok, true);
  assert.equal(result.price, 66.590909);
  assert.equal(result.originalClassPrice, 73.25);
  assert.equal(result.date, '2026-10-02');
  assert.equal(result.classCurrency, 'USD');
  assert.equal(result.quoteCurrency, 'EUR');
  assert.equal(result.priceKind, 'issuer_nav');
  assert.equal(result.conversion, 'ecb_reference');
  assert.equal(result.fx.date, '2026-10-02');
  assert.equal(result.fx.rate, 1.1);
  assert.equal(result.provider, 'iShares / BCE');
  assert.deepEqual(
    r.fetches.map((f) => f.url),
    [ISSUER, ECB],
  );
  assert.equal(
    r.fetches.every((f) => f.params.followRedirects === false),
    true,
  );
  assert.equal(r.writes.length, 0);
});

test('el cambio es el más reciente anterior o igual al VL y rechaza tipos futuros o demasiado antiguos', () => {
  const previous = setup({
    xml: rates([
      ['2026-10-05', '2'],
      ['2026-10-01', '1.2'],
      ['2026-09-30', '1.3'],
    ]),
  });
  assert.equal(quote(previous).fx.date, '2026-10-01');
  assert.equal(quote(previous).price, 61.041667);
  for (const xml of [
    rates([['2026-10-05', '1.1']]),
    rates([['2026-09-24', '1.1']]),
    rates([['2026-10-02', '0']]),
    rates([
      ['2026-10-02', '1.1'],
      ['2026-10-02', '1.2'],
    ]),
    '<html>unavailable</html>',
  ]) {
    const r = setup({ xml });
    assert.equal(quote(r).ok, false);
    assert.equal(r.writes.length, 0);
  }
});

test('rechaza identidad, moneda, valor y fecha que no se puedan verificar', () => {
  for (const [html, error] of [
    [issuer({ isin: 'IE00BYX5NK04' }), 'IDENTITY_MISMATCH'],
    [issuer({ currency: 'EUR' }), 'UNSUPPORTED_CURRENCY'],
    [issuer({ price: '0,00' }), 'INVALID_PRICE'],
    [issuer({ price: '7.325' }), 'INVALID_PRICE'],
    [issuer({ date: '30 feb 2026' }), 'INVALID_DATE'],
    [issuer({ date: '07 oct 2026' }), 'FUTURE_DATE'],
    [
      issuer().replace('fundHeader.fundNav.navAmount', 'other'),
      'SOURCE_FORMAT',
    ],
  ]) {
    const r = setup({ html });
    const result = quote(r);
    assert.equal(result.error, error);
    assert.equal(result.price, undefined);
    assert.equal(r.writes.length, 0);
  }
  assert.equal(quote(setup(), 'Otro producto EUR').error, 'NAME_MISMATCH');
});

test('el refresco requiere vinculación explícita y conserva participaciones, historial y procedencia', () => {
  const r = setup();
  assert.equal(r.init().ok, true);
  const missing = r.api(request(r));
  assert.equal(missing.results[0].error, 'ISIN_REQUIRED');
  assert.equal(r.fetches.length, 0);
  assert.equal(
    r.transact([
      {
        process: 'vincular_isin',
        product: 'Fondo A',
        isin: GOLD,
        referenceName: NAME,
      },
    ]).ok,
    true,
  );
  const before = r.state(),
    envelope = request(r),
    first = r.api(envelope);
  assert.equal(first.results[0].status, 'updated');
  assert.equal(r.state().tables.tPrecios.at(-1)['VL EUR'], 66.590909);
  assert.equal(r.state().tables.tPrecios.at(-1).Fecha, serial('2026-10-02'));
  for (const name of ['tProductos', 'tMovimientos', 'tOperaciones'])
    assert.equal(
      JSON.stringify(r.state().tables[name]),
      JSON.stringify(before.tables[name]),
    );
  const last = r
    .api({ action: 'read' })
    .prices.find((p) => p.name === 'Fondo A').lastValid;
  assert.equal(last.priceKind, 'issuer_nav');
  assert.equal(last.fx.date, '2026-10-02');
  assert.equal(last.evidence.isin, GOLD);
  const count = r.fetches.length;
  assert.equal(r.api(envelope).replayed, true);
  assert.equal(r.fetches.length, count);
  assert.equal(r.api(request(r)).results[0].status, 'unchanged');
});

test('fallos del emisor o del BCE conservan el último precio y no exponen errores privados', () => {
  const r = setup();
  assert.equal(r.init().ok, true);
  assert.equal(
    r.transact([
      {
        process: 'vincular_isin',
        product: 'Fondo A',
        isin: GOLD,
        referenceName: NAME,
      },
    ]).ok,
    true,
  );
  assert.equal(r.api(request(r)).results[0].status, 'updated');
  const before = JSON.stringify(r.state().tables.tPrecios);
  r.options.fetch = (url) =>
    url === ECB ? { status: 503, body: '' } : { body: issuer() };
  const failure = r.api(request(r));
  assert.equal(failure.complete, false);
  assert.equal(failure.results[0].error, 'SOURCE_HTTP_ERROR');
  assert.equal(JSON.stringify(r.state().tables.tPrecios), before);
  r.options.fetch = () => {
    throw Error('private network details');
  };
  const network = r.api(request(r));
  assert.equal(network.results[0].error, 'NETWORK_ERROR');
  assert.equal(
    JSON.stringify(network).includes('private network details'),
    false,
  );
  assert.equal(JSON.stringify(r.state().tables.tPrecios), before);
});

test('un valor del ETC corregido para la misma fecha exige revisión y no sustituye el anterior', () => {
  const r = setup();
  assert.equal(r.init().ok, true);
  assert.equal(
    r.transact([
      {
        process: 'vincular_isin',
        product: 'Fondo A',
        isin: GOLD,
        referenceName: NAME,
      },
    ]).ok,
    true,
  );
  assert.equal(r.api(request(r)).results[0].status, 'updated');
  const before = JSON.stringify(r.state().tables.tPrecios);
  r.options.fetch = (url) => ({
    body: url === ISSUER ? issuer({ price: '73,50' }) : rates(),
  });
  const result = r.api(request(r));
  assert.equal(result.complete, false);
  assert.equal(result.results[0].status, 'needs_review');
  assert.equal(result.results[0].error, 'PRICE_CONFLICT');
  assert.equal(JSON.stringify(r.state().tables.tPrecios), before);
});

test('un lote mixto consulta el ETC solo al emisor y mantiene las validaciones de cada fondo', () => {
  const second = 'ES0112611001';
  const r = setup({
    fetch: (url) => {
      if (url === ISSUER) return { body: issuer() };
      if (url === ECB) return { body: rates() };
      return {
        body: `<h1>AZVALOR INTERNACIONAL, FI (${second})</h1><p>ISIN: ${second}</p><p>Divisa: EUR</p><h4>Última valoración</h4><p>Valor liquidativo: 345,197060 EUR Fecha: 02/10/2026</p>`,
      };
    },
  });
  const first = quote(r);
  assert.equal(first.ok, true);
  r.fetches.length = 0;
  const result = r.api({
    action: 'quotePrices',
    funds: [
      { isin: GOLD, referenceName: NAME },
      { isin: second, referenceName: 'AZVALOR INTERNACIONAL, FI' },
    ],
  });
  assert.equal(result.complete, true);
  assert.equal(result.results[0].provider, 'iShares / BCE');
  assert.equal(result.results[1].provider, 'VDOS / Quefondos');
  assert.equal(r.fetches.length, 3);
  assert.equal(
    r.fetches.some(
      (entry) =>
        entry.url.includes('quefondos.com') && entry.url.includes(GOLD),
    ),
    false,
  );
});
