function validIsin_(value) {
  if (typeof value !== 'string') return false;
  const isin = value.trim().toUpperCase();
  if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) return false;
  const digits = isin.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let sum = 0;
  for (let i = digits.length - 1, odd = false; i >= 0; i--, odd = !odd) {
    let n = Number(digits[i]);
    if (odd) n *= 2;
    sum += n > 9 ? n - 9 : n;
  }
  return sum % 10 === 0;
}
function normalizeIsin_(value) {
  if (!validIsin_(value))
    fail_(
      'INVALID_ISIN',
      'ISIN inválido: revisa sus doce caracteres y dígito de control.',
    );
  return value.trim().toUpperCase();
}
function fundBinding_(s, product) {
  const row = s.technical.funds
    .slice()
    .reverse()
    .find((r) => r[0] === product.ID);
  if (row)
    return {
      product: product.ID,
      isin: normalizeIsin_(row[1]),
      referenceName: row[2],
    };
  return validIsin_(product.ID)
    ? {
        product: product.ID,
        isin: normalizeIsin_(product.ID),
        referenceName: product.Producto,
      }
    : null;
}
function bindFund_(s, id, isin, name, now) {
  check_(
    !!s.tech.funds,
    'Ejecuta prepareApplication antes de vincular fondos.',
  );
  text_(name, 'Nombre de referencia');
  const product = s.tables.tProductos.find((p) => p.ID === id),
    normalized = normalizeIsin_(isin),
    current = fundBinding_(s, product);
  check_(
    !current || current.isin === normalized,
    'Este producto ya identifica otro ISIN. Crea un producto nuevo para conservar su historial.',
  );
  if (!current || current.referenceName !== name.trim())
    s.technical.funds.push([id, normalized, name.trim(), now]);
}
function priceText_(html) {
  const entities = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    Uacute: 'Ú',
    uacute: 'ú',
    Oacute: 'Ó',
    oacute: 'ó',
    Aacute: 'Á',
    aacute: 'á',
    Eacute: 'É',
    eacute: 'é',
    Iacute: 'Í',
    iacute: 'í',
    ntilde: 'ñ',
    Ntilde: 'Ñ',
    uuml: 'ü',
    Uuml: 'Ü',
    middot: '·',
    ndash: '–',
    mdash: '—',
  };
  return String(html)
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[A-Za-z]+);/gi, (all, e) => {
      if (e[0] === '#') {
        const n =
          e[1].toLowerCase() === 'x'
            ? parseInt(e.slice(2), 16)
            : Number(e.slice(1));
        return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ' ';
      }
      return Object.prototype.hasOwnProperty.call(entities, e)
        ? entities[e]
        : all;
    })
    .replace(/\s+/g, ' ')
    .trim();
}
function priceFailure_(code, message) {
  const e = new Error(message);
  e.priceCode = code;
  throw e;
}
function verifyFundName_(reference, actual) {
  text_(reference, 'Nombre de referencia');
  const normalize = (v) =>
    v
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ');
  // El ISIN selecciona la clase. El nombre confirma la identidad; no sirve para elegir otra clase.
  const r = normalize(reference),
    a = normalize(actual),
    currencies = ['eur', 'usd', 'gbp', 'chf', 'jpy', 'cad', 'aud'];
  const currency = currencies.find((c) =>
    new RegExp('\\b' + c + '\\b').test(r),
  );
  if (currency && !new RegExp('\\b' + currency + '\\b').test(a))
    priceFailure_(
      'NAME_MISMATCH',
      'La moneda indicada en el nombre no coincide con la clase de la fuente.',
    );
  if (
    /\b(acc|acumulacion|accumulation)\b/.test(r) &&
    !/\b(acc|acumulacion|accumulation|cap)\b/.test(a)
  )
    priceFailure_(
      'NAME_MISMATCH',
      'La referencia indica acumulación y la fuente no confirma esa clase.',
    );
  if (
    /\b(dist|distribucion|income|inc)\b/.test(r) &&
    !/\b(dist|distribucion|income|inc)\b/.test(a)
  )
    priceFailure_(
      'NAME_MISMATCH',
      'La referencia indica distribución y la fuente no confirma esa clase.',
    );
  const share =
    r.match(/\b(?:class|clase)\s+([a-z0-9]{1,3})\b/) ||
    r.match(/\b([a-z0-9]{1,3})\s+(?:acc|inc|dist|cap)\b/);
  if (share && !new RegExp('\\b' + share[1] + '\\b').test(a))
    priceFailure_(
      'NAME_MISMATCH',
      'La clase indicada en la referencia no coincide con la ficha.',
    );
  const stop = new Set([
    'fund',
    'funds',
    'fondo',
    'fondos',
    'fi',
    'sicav',
    'de',
    'del',
    'the',
    'a',
    'p',
    'acc',
    'acumulacion',
    'accumulation',
    'inc',
    'dist',
    'distribucion',
    'class',
    'clase',
    'index',
    ...currencies,
  ]);
  const tokens = [
      ...new Set(r.split(' ').filter((t) => t.length > 1 && !stop.has(t))),
    ],
    source = new Set(a.split(' '));
  if (
    !tokens.length ||
    tokens.filter((t) => source.has(t)).length < Math.min(2, tokens.length)
  )
    priceFailure_(
      'NAME_MISMATCH',
      'El nombre de referencia no confirma el fondo del ISIN. Revisa el nombre, sin cambiar el ISIN por aproximación.',
    );
}
function verifyClassCurrency_(reference, actual, currency) {
  const explicit = (name) =>
    String(name)
      .toUpperCase()
      .match(/\b(EUR|USD|GBP|CHF|JPY|CAD|AUD)\b/g) || [];
  const mentioned = explicit(reference).concat(explicit(actual));
  if (mentioned.some((c) => c !== currency))
    priceFailure_(
      'NAME_MISMATCH',
      'La moneda explícita de la clase contradice Divisa.',
    );
}
function parseFundPage_(html, isin, fetchedAt, today) {
  const h1 =
      html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i) ||
      html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i),
    page = priceText_(html);
  const identity = page.match(/\bISIN\s*:\s*([A-Z0-9]{12})\b/i);
  let heading = h1 && priceText_(h1[1]);
  const headingIsin = heading && heading.match(/\(([A-Z0-9]{12})\)/);
  if (
    (identity && identity[1] !== isin) ||
    (headingIsin && headingIsin[1] !== isin)
  )
    priceFailure_(
      'IDENTITY_MISMATCH',
      'La ficha recibida pertenece a otro ISIN.',
    );
  if (!headingIsin) {
    // La ficha móvil publica el nombre en h2 dentro del informe y el ISIN
    // en Otras características; h1/title solo dicen «Características».
    const report = html.match(
      /<div\b[^>]*class=["'][^"']*\binforme\b[^"']*["'][^>]*>\s*<h2\b[^>]*>([\s\S]*?)<\/h2>/i,
    );
    heading = report ? priceText_(report[1]) : null;
  }
  if (!identity || !heading)
    priceFailure_(
      /no se (?:ha encontrado|encuentra)|fondo no encontrado/i.test(page)
        ? 'FUND_NOT_FOUND'
        : 'SOURCE_FORMAT',
      'La respuesta no contiene una identidad de fondo verificable. Consulta el diagnóstico de la fuente; se conserva el precio anterior.',
    );
  const blocks = html.split(/<h4\b[^>]*>/i),
    raw = blocks.find((b) =>
      /^Última valoración\b/i.test(priceText_(b.split(/<\/h4>/i)[0])),
    );
  if (!raw)
    priceFailure_(
      'SOURCE_FORMAT',
      'La ficha ha cambiado: falta el bloque de última valoración.',
    );
  const valuation = priceText_(raw),
    value = valuation.match(/Valor liquidativo:\s*([\d.,]+)\s+([A-Z]{3})\b/),
    date = valuation.match(/\bFecha:\s*(\d{2})\/(\d{2})\/(\d{4})\b/),
    currency = page.match(/\bDivisa:\s*([A-Z]{3})\b/);
  if (!value || !date || !currency)
    priceFailure_(
      'SOURCE_FORMAT',
      'La ficha no permite verificar precio, fecha y moneda.',
    );
  if (value[2] !== 'EUR')
    priceFailure_(
      'UNSUPPORTED_CURRENCY',
      'La fuente no publica este valor liquidativo en EUR.',
    );
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+),\d{1,12}$/.test(value[1]))
    priceFailure_(
      'INVALID_PRICE',
      'Formato de valor liquidativo no reconocido.',
    );
  const price = Number(value[1].replace(/\./g, '').replace(',', '.')),
    effectiveDate = date[3] + '-' + date[2] + '-' + date[1];
  if (!Number.isFinite(price) || price <= 0 || price > 1e12)
    priceFailure_('INVALID_PRICE', 'Valor liquidativo fuera de rango.');
  let serial;
  try {
    serial = serialDate_(effectiveDate);
  } catch (error) {
    priceFailure_('INVALID_DATE', 'Fecha de valor liquidativo inexistente.');
  }
  const ageDays = serialDate_(today) - serial;
  if (ageDays < 0)
    priceFailure_(
      'FUTURE_DATE',
      'La fecha publicada es posterior al día actual de Madrid.',
    );
  return {
    isin,
    name: heading.split('(' + isin + ')')[0].trim(),
    price,
    date: effectiveDate,
    quoteCurrency: 'EUR',
    classCurrency: currency[1],
    conversion: currency[1] === 'EUR' ? 'none' : 'provider_eur',
    originalClassPrice: null,
    provider: PRICE_PROVIDER_,
    url: PRICE_BASE_ + isin,
    fetchedAt,
    ageDays,
    warning: ageDays > 4 ? 'PUBLICATION_DELAY' : null,
  };
}
function fetchFundQuote_(fund) {
  const checkedAt = new Date().toISOString();
  let isin,
    responseInfo = null;
  try {
    isin = normalizeIsin_(fund.isin);
    text_(fund.referenceName, 'Nombre de referencia');
    const key = 'nav-v3-' + isin;
    let cache = null,
      stored = null;
    try {
      cache = CacheService.getScriptCache();
      stored = cache.get(key);
    } catch (ignored) {}
    let quote = null;
    // La caché nunca sustituye las comprobaciones de identidad y fecha.
    try {
      quote = stored ? JSON.parse(stored) : null;
      if (
        quote &&
        (quote.isin !== isin ||
          !Number.isFinite(quote.price) ||
          quote.price <= 0 ||
          quote.price > 1e12 ||
          quote.quoteCurrency !== 'EUR' ||
          !/^[A-Z]{3}$/.test(quote.classCurrency || '') ||
          quote.provider !== PRICE_PROVIDER_ ||
          typeof quote.name !== 'string' ||
          !/^\d{4}-\d{2}-\d{2}$/.test(quote.date || '') ||
          ![
            PRICE_BASE_ + isin,
            'https://www.quefondos.com/m/es/fondos/ficha/index.html?isin=' +
              isin,
          ].includes(quote.url))
      )
        quote = null;
      if (quote) serialDate_(quote.date);
    } catch (ignored) {
      quote = null;
    }
    const cached = !!quote;
    if (!quote) {
      const urls = [
        PRICE_BASE_ + isin,
        'https://www.quefondos.com/m/es/fondos/ficha/index.html?isin=' + isin,
      ];
      const attempts = [];
      for (let index = 0; index < urls.length; index++) {
        let response;
        try {
          response = UrlFetchApp.fetch(urls[index], {
            method: 'get',
            followRedirects: false,
            muteHttpExceptions: true,
          });
        } catch (error) {
          responseInfo = { url: urls[index], error: 'NETWORK_ERROR' };
          attempts.push(Object.assign({}, responseInfo));
          responseInfo.attempts = attempts;
          if (index < urls.length - 1) continue;
          priceFailure_(
            'NETWORK_ERROR',
            'No se pudo acceder a las fichas oficiales. Se conserva el último precio válido.',
          );
        }
        const status = response.getResponseCode(),
          html = response.getContentText('UTF-8'),
          title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
        responseInfo = {
          httpStatus: status,
          length: html.length,
          title: title ? priceText_(title[1]).slice(0, 180) : null,
          containsRequestedIsin: html.indexOf(isin) >= 0,
          hasIdentityLabel: /\bISIN\s*:/i.test(priceText_(html)),
          fingerprint: hash_(html),
          url: urls[index],
          hasValuationBlock: /Última valoración/i.test(priceText_(html)),
          hasNavLabel: /Valor liquidativo\s*:/i.test(priceText_(html)),
          hasCurrencyLabel: /Divisa\s*:/i.test(priceText_(html)),
        };
        attempts.push(Object.assign({}, responseInfo));
        responseInfo.attempts = attempts;
        if (status !== 200) {
          // Las dos URLs son oficiales y conservan el ISIN solicitado. No se
          // siguen redirecciones arbitrarias ni se ocultan incoherencias de clase.
          if (index < urls.length - 1) continue;
          priceFailure_(
            status === 429 ? 'SOURCE_RATE_LIMITED' : 'SOURCE_HTTP_ERROR',
            'La fuente respondió HTTP ' +
              status +
              '. Se conserva el último precio válido.',
          );
        }
        if (html.length > 1500000)
          priceFailure_(
            'SOURCE_FORMAT',
            'La respuesta de la fuente supera el tamaño admitido.',
          );
        try {
          quote = parseFundPage_(
            html,
            isin,
            checkedAt,
            Utilities.formatDate(new Date(), 'Europe/Madrid', 'yyyy-MM-dd'),
          );
          quote.url = urls[index];
          verifyFundName_(fund.referenceName, quote.name);
          verifyClassCurrency_(
            fund.referenceName,
            quote.name,
            quote.classCurrency,
          );
          break;
        } catch (error) {
          // Solo una variante de formato permite consultar la ficha móvil oficial.
          // ISIN/clase/nombre/precio/fecha incoherentes se rechazan sin sustitución.
          if (error.priceCode !== 'SOURCE_FORMAT' || index === urls.length - 1)
            throw error;
        }
      }
      try {
        if (cache) cache.put(key, JSON.stringify(quote), 300);
      } catch (ignored) {}
    }
    verifyFundName_(fund.referenceName, quote.name);
    verifyClassCurrency_(fund.referenceName, quote.name, quote.classCurrency);
    // La antigüedad se vuelve a calcular incluso al cruzar medianoche con caché.
    quote.ageDays =
      serialDate_(
        Utilities.formatDate(new Date(), 'Europe/Madrid', 'yyyy-MM-dd'),
      ) - serialDate_(quote.date);
    if (quote.ageDays < 0)
      priceFailure_('FUTURE_DATE', 'Fecha de cotización futura.');
    quote.warning = quote.ageDays > 4 ? 'PUBLICATION_DELAY' : null;
    return Object.assign(
      {
        ok: true,
        referenceName: fund.referenceName,
        checkedAt,
        cached,
        responseInfo,
        historyAvailability: {
          status: 'EXPORT_IMPORT_SUPPORTED',
          message:
            'La consulta automática verifica la última valoración. Importa un CSV diario exportado de la gestora y revisa clase, moneda y fechas; no se rellenan huecos.',
        },
      },
      quote,
    );
  } catch (error) {
    return {
      ok: false,
      isin: isin || fund.isin,
      referenceName: fund.referenceName,
      provider: PRICE_PROVIDER_,
      url: isin ? PRICE_BASE_ + isin : null,
      checkedAt,
      responseInfo,
      error:
        error.priceCode ||
        (['INVALID_ISIN', 'INVALID_DATA'].indexOf(error.code) >= 0
          ? error.code
          : 'SOURCE_UNAVAILABLE'),
      message:
        error.priceCode || error.code
          ? error.message
          : 'No se pudo consultar la fuente. Se conserva el último precio válido.',
    };
  }
}
function fetchFundQuotesBatch_(funds) {
  const started = Date.now();
  return funds.map((fund) => {
    if (Date.now() - started > 120000)
      return {
        ok: false,
        isin: fund.isin,
        referenceName: fund.referenceName,
        error: 'TIME_BUDGET',
        message:
          'Se alcanzó el límite de tiempo del lote. El siguiente intento volverá a consultar este fondo.',
        checkedAt: new Date().toISOString(),
      };
    if (!fund.isin)
      return {
        ok: false,
        isin: null,
        referenceName: fund.referenceName,
        error: 'ISIN_REQUIRED',
        message: 'Vincula el ISIN y nombre de referencia de este producto.',
        checkedAt: new Date().toISOString(),
      };
    return fetchFundQuote_(fund);
  });
}
function quotePrices_(request, config) {
  if (
    Object.keys(request).some((k) => ['action', 'funds'].indexOf(k) < 0) ||
    !Array.isArray(request.funds) ||
    !request.funds.length ||
    request.funds.length > PRICE_LIMIT_
  )
    fail_(
      'INVALID_REQUEST',
      'Consulta de uno a veinte ISIN y nombres de referencia.',
    );
  request.funds.forEach((f) => {
    if (
      !object_(f) ||
      Object.keys(f).some((k) => ['isin', 'referenceName'].indexOf(k) < 0)
    )
      fail_('INVALID_REQUEST');
  });
  const results = fetchFundQuotesBatch_(request.funds);
  return {
    ok: true,
    apiVersion: API_VERSION_,
    buildVersion: BUILD_VERSION_,
    environment: config.environment,
    readOnly: true,
    complete: results.every((r) => r.ok),
    results,
    checkedAt: new Date().toISOString(),
  };
}
function priceSnapshot_(s) {
  const today = serialDate_(
    Utilities.formatDate(new Date(), 'Europe/Madrid', 'yyyy-MM-dd'),
  );
  return s.tables.tProductos.map((product) => {
    const binding = fundBinding_(s, product),
      latest = s.tables.tPrecios
        .filter((p) => p.Producto === product.ID)
        .sort((a, b) => b.Fecha - a.Fecha)[0];
    const attempt = s.technical.quotes
      .slice()
      .reverse()
      .find((r) => r[2] === product.ID);
    const matching =
      latest &&
      s.technical.quotes
        .slice()
        .reverse()
        .find(
          (r) =>
            r[2] === product.ID &&
            (!binding || r[3] === binding.isin) &&
            r[4] === isoDate_(latest.Fecha) &&
            r[5] === latest['VL EUR'] &&
            [
              'updated',
              'unchanged',
              'historical_new',
              'historical_duplicate',
            ].includes(r[10]),
        );
    let provenance = null;
    try {
      const detail = matching && JSON.parse(matching[11]);
      if (
        detail &&
        detail.ok &&
        detail.quoteCurrency === 'EUR' &&
        /^[A-Z]{3}$/.test(detail.classCurrency || '')
      )
        provenance = {
          classCurrency: detail.classCurrency,
          quoteCurrency: 'EUR',
          conversion:
            detail.conversion ||
            (detail.classCurrency === 'EUR' ? 'none' : 'owner_export_eur'),
          evidence: {
            verification: detail.verification || 'provider_quote',
            isin: matching[3],
            provider: matching[7],
            url: matching[8],
            checkedAt: matching[9],
            effectiveDate: matching[4],
          },
        };
    } catch (ignored) {}
    return {
      product: product.ID,
      name: product.Producto,
      isin: binding && binding.isin,
      referenceName: binding && binding.referenceName,
      lastValid: latest
        ? {
            date: isoDate_(latest.Fecha),
            price: latest['VL EUR'],
            source: latest.Fuente,
            classCurrency: provenance ? provenance.classCurrency : null,
            quoteCurrency: 'EUR',
            conversion: provenance ? provenance.conversion : null,
            evidence: provenance ? provenance.evidence : null,
            ageDays: today - latest.Fecha,
            freshness:
              today < latest.Fecha
                ? 'invalid'
                : today - latest.Fecha > 4
                  ? 'delayed'
                  : 'current',
          }
        : null,
      lastAttempt: attempt
        ? {
            status: attempt[10],
            checkedAt: attempt[9],
            detail: JSON.parse(attempt[11]),
          }
        : null,
      status: binding ? 'configured' : 'ISIN_REQUIRED',
    };
  });
}
function pricePlan_(state, selected, quotes, requestId, now) {
  const operations = [],
    results = [];
  selected.forEach((item, i) => {
    const quote = quotes[i],
      result = Object.assign(
        { product: item.product, status: 'failed' },
        quote,
      );
    if (quote.ok) {
      const date = serialDate_(quote.date),
        prices = state.tables.tPrecios.filter(
          (p) => p.Producto === item.product,
        ),
        latest = prices.reduce((max, p) => Math.max(max, p.Fecha), 0),
        same = prices.find((p) => p.Fecha === date);
      if (date < latest) result.status = 'older';
      else if (same && same['VL EUR'] === quote.price)
        result.status = 'unchanged';
      else if (same) {
        result.status = 'needs_review';
        result.error = 'PRICE_CONFLICT';
        result.message =
          'Ya existe otro precio para ese producto y fecha. Se conserva el guardado.';
      } else {
        result.status = 'updated';
        operations.push({
          process: 'precio',
          product: item.product,
          date: quote.date,
          price: quote.price,
          source: quote.provider + ' | ' + quote.isin + ' | ' + quote.url,
        });
      }
    }
    results.push(result);
  });
  const applied = applyOperations_(state, operations, requestId, now);
  results.forEach((r, i) =>
    applied.state.technical.quotes.push([
      requestId + '-' + (i + 1),
      requestId,
      r.product,
      r.isin || null,
      r.ok ? r.date : null,
      r.ok ? r.price : null,
      r.classCurrency || null,
      r.provider || null,
      r.url || null,
      r.checkedAt || now,
      r.status,
      JSON.stringify(r),
    ]),
  );
  return { state: applied.state, operations, results };
}
function replayPrices_(s, id, fingerprint) {
  const saved = s.technical.requests.find((r) => r[0] === id);
  if (!saved) return null;
  if (saved[1] !== fingerprint)
    fail_('REQUEST_CONFLICT', 'La solicitud ya existe con contenido distinto.');
  return Object.assign(JSON.parse(saved[3]), { replayed: true });
}
function refreshPrices_(config, request) {
  if (
    Object.keys(request).some(
      (k) =>
        [
          'action',
          'requestId',
          'expectedRevision',
          'products',
          'bookKey',
        ].indexOf(k) < 0,
    ) ||
    !uuid_(request.requestId) ||
    typeof request.expectedRevision !== 'string' ||
    (request.products !== undefined &&
      (!Array.isArray(request.products) ||
        !request.products.length ||
        request.products.length > PRICE_LIMIT_ ||
        request.products.some((p) => typeof p !== 'string')))
  )
    fail_('INVALID_REQUEST');
  const requestId = request.requestId.toLowerCase(),
    fingerprint = hash_({
      action: 'refreshPrices',
      products: request.products || null,
    });
  const prepared = locked_(() => {
    if (config.dailyPriceTest) assertDailyPriceBinding_(config);
    const state = readState_(config);
    checkRequestBook_(request, state);
    const replay = replayPrices_(state, requestId, fingerprint);
    if (replay) return { replay };
    if (
      !['requests', 'audit', 'observations', 'funds', 'quotes'].every(
        (k) => state.tech[k],
      )
    )
      fail_('NOT_INITIALIZED', 'Ejecuta prepareApplication desde el editor.');
    if (state.revision !== request.expectedRevision)
      fail_(
        'CONFLICT',
        'El libro cambió; vuelve a leer antes de actualizar precios.',
      );
    const ids = request.products
      ? request.products.map((p) =>
          resolveReference_(state, 'tProductos', p, {}, 'Producto'),
        )
      : state.tables.tProductos.map((p) => p.ID);
    if (ids.length > PRICE_LIMIT_ || new Set(ids).size !== ids.length)
      fail_(
        'INVALID_REQUEST',
        'Selecciona hasta veinte productos distintos por actualización.',
      );
    return {
      selected: ids.map((id) => {
        const p = state.tables.tProductos.find((p) => p.ID === id);
        return (
          fundBinding_(state, p) || {
            product: id,
            isin: null,
            referenceName: p.Producto,
          }
        );
      }),
    };
  });
  if (prepared.replay) return prepared.replay;
  // La red se consulta fuera del bloqueo. La revisión se verifica otra vez antes del lote.
  const quotes = fetchFundQuotesBatch_(prepared.selected);
  return locked_(() => {
    if (config.dailyPriceTest) assertDailyPriceBinding_(config);
    let before = readState_(config);
    checkRequestBook_(request, before);
    const replay = replayPrices_(before, requestId, fingerprint);
    if (replay) return replay;
    if (before.revision !== request.expectedRevision)
      fail_(
        'CONFLICT',
        'El libro cambió durante la consulta. No se han escrito precios.',
      );
    const now = new Date().toISOString();
    let plan = pricePlan_(before, prepared.selected, quotes, requestId, now);
    before = prepareCapacity_(config, before, plan.state);
    if (before.revision !== request.expectedRevision)
      fail_(
        'CONFLICT',
        'El libro cambió durante la preparación. No se han escrito precios.',
      );
    plan = pricePlan_(before, prepared.selected, quotes, requestId, now);
    const counts = {};
    plan.results.forEach(
      (r) => (counts[r.status] = (counts[r.status] || 0) + 1),
    );
    const response = {
      ok: true,
      action: 'refreshPrices',
      bookKey: before.bookKey,
      apiVersion: API_VERSION_,
      buildVersion: BUILD_VERSION_,
      environment: config.environment,
      requestId,
      revision: plan.state.revision,
      complete: plan.results.every((r) => r.ok && r.status !== 'needs_review'),
      results: plan.results,
      counts,
      replayed: false,
      checkedAt: now,
    };
    const requests = mutationRequests_(before, plan.state, requestId, now, {
      operations: plan.operations,
      fingerprint,
      response,
    });
    try {
      Sheets.Spreadsheets.batchUpdate({ requests }, config.id);
    } catch (error) {
      try {
        const replay = replayPrices_(
          readState_(config),
          requestId,
          fingerprint,
        );
        if (replay) return replay;
      } catch (ignored) {}
      fail_(
        'WRITE_UNCERTAIN',
        'Consulta o reintenta exactamente la misma solicitud de precios.',
      );
    }
    response.historyView = refreshDailyHistorySafely_(config);
    return response;
  });
}
// Historical exports are owner-reviewed data, never HTML or arbitrary remote requests.
function historyText_(value, label) {
  text_(value, label);
  check_(
    !/^[\s]*[=+@-]/.test(value) && !/[\u0000-\u001f<>]/.test(value),
    label + ': texto inseguro.',
  );
  return value.trim();
}
function historyRows_(state, request) {
  check_(
    Array.isArray(request.rows) &&
      request.rows.length > 0 &&
      request.rows.length <= PRICE_LIMIT_,
    'Importa hasta veinte fechas por lote.',
  );
  check_(
    request.sourceVerified === true,
    'Confirma la clase y la fuente del archivo exportado.',
  );
  const product = resolveReference_(
      state,
      'tProductos',
      request.product,
      {},
      'Producto',
    ),
    binding = fundBinding_(
      state,
      state.tables.tProductos.find((p) => p.ID === product),
    );
  check_(!!binding, 'Vincula el ISIN del producto antes de importar.');
  const today = serialDate_(
      Utilities.formatDate(new Date(), 'Europe/Madrid', 'yyyy-MM-dd'),
    ),
    seen = new Set();
  return request.rows.map((row) => {
    check_(
      object_(row) &&
        Object.keys(row).every((k) =>
          [
            'isin',
            'referenceName',
            'classCurrency',
            'quoteCurrency',
            'date',
            'price',
            'provider',
            'sourceUrl',
            'exportedAt',
          ].includes(k),
        ),
      'Fila histórica no reconocida.',
    );
    const isin = normalizeIsin_(row.isin);
    check_(isin === binding.isin, 'El archivo identifica otro ISIN.');
    historyText_(row.referenceName, 'Clase');
    verifyFundName_(binding.referenceName, row.referenceName);
    check_(
      /^[A-Z]{3}$/.test(row.classCurrency || '') && row.quoteCurrency === 'EUR',
      'El histórico debe acreditar NAV EUR y moneda de clase.',
    );
    verifyClassCurrency_(
      binding.referenceName,
      row.referenceName,
      row.classCurrency,
    );
    check_(
      /^\d{4}-\d{2}-\d{2}$/.test(row.date || ''),
      'Fecha ISO obligatoria.',
    );
    const date = serialDate_(row.date);
    check_(
      date < today,
      'Importa fechas históricas anteriores a hoy, sin interpolar.',
    );
    check_(!seen.has(row.date), 'Fecha duplicada dentro del lote.');
    seen.add(row.date);
    number_(row.price, 'NAV', false, 0, true);
    const provider = historyText_(row.provider, 'Procedencia');
    check_(
      row.sourceUrl === null ||
        (typeof row.sourceUrl === 'string' &&
          /^https:\/\/(?:www\.)?(?:fondosfidelity\.es|fidelity\.lu|fidelity\.pt|vanguard\.co\.uk|singularam\.es)\/[A-Za-z0-9/?=&%._~-]*$/.test(
            row.sourceUrl,
          ) &&
          row.sourceUrl.length <= 500),
      'La URL de procedencia debe pertenecer a una gestora permitida; para otro exportador usa procedencia documental sin URL.',
    );
    check_(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(
        row.exportedAt || '',
      ) &&
        Number.isFinite(Date.parse(row.exportedAt)) &&
        new Date(row.exportedAt).toISOString().slice(0, 10) ===
          row.exportedAt.slice(0, 10) &&
        Date.parse(row.exportedAt) <= Date.now() + 60000,
      'Fecha de exportación inválida.',
    );
    const existing = state.tables.tPrecios.find(
      (p) => p.Producto === product && p.Fecha === date,
    );
    return Object.assign({}, row, {
      ok: true,
      product,
      isin,
      provider,
      status: !existing
        ? 'new'
        : existing['VL EUR'] === row.price
          ? 'duplicate'
          : 'conflict',
      verification: 'owner_reviewed_export',
    });
  });
}
