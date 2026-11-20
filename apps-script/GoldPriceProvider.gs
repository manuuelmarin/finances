// This mapping is deliberately limited to one verified ISIN. It must never infer
// a security or exchange listing from a product name.
function parseGoldIssuerPage_(html, today) {
  const heading = html.match(
      /<h1\b[^>]*class=["'][^"']*\bproduct-title\b[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i,
    ),
    navBlock = html.match(
      /<li\b[^>]*data-col=["']fundHeader\.fundNav\.navAmount["'][^>]*>([\s\S]*?)<\/li>/i,
    );
  function productData(name) {
    const block = html.match(
      new RegExp(
        '<div\\b[^>]*class=["\'][^"\']*\\bcol-' +
          name +
          '\\b[^"\']*["\'][^>]*>([\\s\\S]{0,1000}?)<div\\b[^>]*class=["\']data["\'][^>]*>([\\s\\S]*?)<\\/div>',
        'i',
      ),
    );
    return block ? priceText_(block[2]) : null;
  }
  const isin = productData('isin'),
    currency = productData('baseCurrencyCode');
  if (isin && isin !== GOLD_ETC_ISIN_)
    priceFailure_(
      'IDENTITY_MISMATCH',
      'La ficha del emisor pertenece a otro ISIN.',
    );
  if (!heading || !navBlock || !isin || !currency)
    priceFailure_(
      'SOURCE_FORMAT',
      'La ficha del emisor no permite verificar identidad, valor y moneda.',
    );
  const name = priceText_(heading[1]),
    nav = priceText_(navBlock[1]),
    amount = nav.match(
      /\bValor liquidativo a\s+(\d{1,2})\s+([a-záéíóú]+)\.?\s+(\d{4})\s+([A-Z]{3})\s+([\d.,]+)/i,
    ),
    months = {
      ene: '01',
      feb: '02',
      mar: '03',
      abr: '04',
      may: '05',
      jun: '06',
      jul: '07',
      ago: '08',
      sep: '09',
      sept: '09',
      oct: '10',
      nov: '11',
      dic: '12',
    };
  if (!amount || !months[amount[2].toLowerCase()])
    priceFailure_(
      'SOURCE_FORMAT',
      'No se ha podido verificar la fecha y el valor del ETC.',
    );
  if (amount[4] !== 'USD' || currency !== 'USD')
    priceFailure_(
      'UNSUPPORTED_CURRENCY',
      'La moneda publicada por el emisor ha cambiado.',
    );
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+),\d{1,12}$/.test(amount[5]))
    priceFailure_(
      'INVALID_PRICE',
      'El valor del ETC tiene un formato no reconocido.',
    );
  const price = Number(amount[5].replace(/\./g, '').replace(',', '.')),
    date =
      amount[3] +
      '-' +
      months[amount[2].toLowerCase()] +
      '-' +
      amount[1].padStart(2, '0');
  if (!Number.isFinite(price) || price <= 0 || price > 1e12)
    priceFailure_('INVALID_PRICE', 'El valor del ETC está fuera de rango.');
  let serial;
  try {
    serial = serialDate_(date);
  } catch (ignored) {
    priceFailure_('INVALID_DATE', 'La fecha del valor del ETC no es válida.');
  }
  if (serial > serialDate_(today))
    priceFailure_('FUTURE_DATE', 'La fecha del valor del ETC es futura.');
  return { isin, name, price, date };
}

function parseGoldExchangeRate_(xml, valuationDate) {
  if (
    !/<gesmes:Envelope\b/i.test(xml) ||
    !/http:\/\/www\.ecb\.int\/vocabulary\/2002-08-01\/eurofxref/.test(xml) ||
    !/<gesmes:name>\s*European Central Bank\s*<\/gesmes:name>/i.test(xml)
  )
    priceFailure_(
      'FX_SOURCE_FORMAT',
      'La respuesta del BCE no es reconocible.',
    );
  const valuation = serialDate_(valuationDate),
    candidates = [];
  for (const day of xml.matchAll(
    /<Cube\s+time=["'](\d{4}-\d{2}-\d{2})["']\s*>([\s\S]*?)<\/Cube>/g,
  )) {
    const rate = day[2].match(
      /<Cube\s+currency=["']USD["']\s+rate=["'](\d+(?:\.\d+)?)["']\s*\/>/,
    );
    if (!rate) continue;
    let serial;
    try {
      serial = serialDate_(day[1]);
    } catch (ignored) {
      priceFailure_(
        'FX_SOURCE_FORMAT',
        'El BCE publicó una fecha de cambio inválida.',
      );
    }
    const value = Number(rate[1]);
    if (!Number.isFinite(value) || value <= 0 || value > 1e6)
      priceFailure_(
        'FX_SOURCE_FORMAT',
        'El tipo de cambio del BCE no es válido.',
      );
    if (serial <= valuation && valuation - serial <= 7)
      candidates.push({ date: day[1], rate: value, serial });
  }
  candidates.sort((a, b) => b.serial - a.serial);
  if (
    !candidates.length ||
    (candidates[1] && candidates[0].date === candidates[1].date)
  )
    priceFailure_(
      'FX_UNAVAILABLE',
      'No hay un cambio EUR/USD del BCE próximo y anterior a la valoración. Se conserva el precio anterior.',
    );
  return { date: candidates[0].date, rate: candidates[0].rate };
}

function fetchGoldEtcQuote_(fund, checkedAt) {
  let responseInfo = null;
  try {
    const options = {
        method: 'get',
        followRedirects: false,
        muteHttpExceptions: true,
      },
      urls = [GOLD_ETC_URL_, ECB_RATES_URL_];
    let responses;
    try {
      if (typeof UrlFetchApp.fetchAll === 'function')
        responses = UrlFetchApp.fetchAll(
          urls.map((url) => Object.assign({ url }, options)),
        );
      if (!responses || responses.length !== urls.length)
        responses = urls.map((url) => UrlFetchApp.fetch(url, options));
    } catch (ignored) {
      try {
        responses = urls.map((url) => UrlFetchApp.fetch(url, options));
      } catch (networkError) {
        priceFailure_(
          'NETWORK_ERROR',
          'No se pudo acceder al emisor o al BCE. Se conserva el precio anterior.',
        );
      }
    }
    const bodies = responses.map((response) =>
      response.getContentText('UTF-8'),
    );
    responseInfo = responses.map((response, index) => ({
      url: urls[index],
      httpStatus: response.getResponseCode(),
      length: bodies[index].length,
    }));
    if (responseInfo.some((info) => info.httpStatus !== 200))
      priceFailure_(
        'SOURCE_HTTP_ERROR',
        'El emisor o el BCE no devolvió una respuesta válida. Se conserva el precio anterior.',
      );
    if (bodies[0].length > 1500000 || bodies[1].length > 500000)
      priceFailure_(
        'SOURCE_FORMAT',
        'La respuesta de una fuente supera el tamaño admitido.',
      );
    const today = Utilities.formatDate(
        new Date(),
        'Europe/Madrid',
        'yyyy-MM-dd',
      ),
      nav = parseGoldIssuerPage_(bodies[0], today),
      fx = parseGoldExchangeRate_(bodies[1], nav.date);
    verifyFundName_(fund.referenceName, nav.name);
    verifyClassCurrency_(fund.referenceName, nav.name, 'USD');
    const price = Math.round((nav.price / fx.rate) * 1000000) / 1000000,
      ageDays = serialDate_(today) - serialDate_(nav.date);
    if (!Number.isFinite(price) || price <= 0 || price > 1e12)
      priceFailure_(
        'INVALID_PRICE',
        'El valor convertido del ETC está fuera de rango.',
      );
    return {
      ok: true,
      isin: GOLD_ETC_ISIN_,
      referenceName: fund.referenceName,
      name: nav.name,
      price,
      date: nav.date,
      quoteCurrency: 'EUR',
      classCurrency: 'USD',
      conversion: 'ecb_reference',
      originalClassPrice: nav.price,
      priceKind: 'issuer_nav',
      fx: {
        provider: 'BCE',
        url: ECB_RATES_URL_,
        date: fx.date,
        currency: 'USD',
        rate: fx.rate,
      },
      provider: GOLD_ETC_PROVIDER_,
      url: GOLD_ETC_URL_,
      checkedAt,
      fetchedAt: checkedAt,
      cached: false,
      ageDays,
      warning: ageDays > 4 ? 'PUBLICATION_DELAY' : null,
      responseInfo,
      historyAvailability: {
        status: 'LAST_QUOTE_ONLY',
        message:
          'Se consulta el último valor liquidativo del emisor, que puede diferir de la cotización de mercado.',
      },
    };
  } catch (error) {
    return {
      ok: false,
      isin: GOLD_ETC_ISIN_,
      referenceName: fund.referenceName,
      provider: GOLD_ETC_PROVIDER_,
      url: GOLD_ETC_URL_,
      checkedAt,
      responseInfo,
      error: error.priceCode || 'SOURCE_UNAVAILABLE',
      message: error.priceCode
        ? error.message
        : 'No se pudo verificar el ETC y el cambio de divisa. Se conserva el precio anterior.',
    };
  }
}
