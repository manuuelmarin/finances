'use strict';

// Proyecciones de solo lectura para gráficos. Nunca sustituyen las métricas
// canónicas de Sheets, modifican tablas ni generan precios.
const FinanceAnalytics = (() => {
  const finite = (v) => typeof v === 'number' && Number.isFinite(v);
  const cents = (v) => Math.round(v * 100);
  function spending(snapshot, month, category = null) {
    let total = 0;
    for (const row of snapshot?.tables?.tMovimientos || []) {
      if (
        row.Fecha < snapshot.settings.start ||
        row.Fecha > snapshot.settings.asof ||
        !row.Fecha.startsWith(month)
      )
        continue;
      if (category !== null && row.Subcategoría !== category) continue;
      if (!['Gasto', 'Devolución gasto'].includes(row.Tipo)) continue;
      if (
        !finite(row.Importe) ||
        (row.Recuperable != null && !finite(row.Recuperable))
      )
        return null;
      const amount = cents(row.Importe) - cents(row.Recuperable || 0);
      total += row.Tipo === 'Gasto' ? amount : -amount;
      if (!Number.isSafeInteger(total)) return null;
    }
    return total / 100;
  }
  function budget(snapshot, record) {
    const spent = spending(snapshot, record.month, record.category);
    return {
      ...record,
      spent,
      remaining:
        spent === null ? null : (cents(record.amount) - cents(spent)) / 100,
      ratio:
        spent === null || record.amount === 0 ? null : spent / record.amount,
      exceeded: spent !== null && spent > record.amount,
    };
  }
  function groups(positions) {
    const result = new Map();
    for (const row of positions || []) {
      const current = result.has(row.group) ? result.get(row.group) : 0;
      result.set(
        row.group,
        current === null || row.value === null ? null : current + row.value,
      );
    }
    return [...result].map(([label, value]) => ({ label, value }));
  }
  const sumKnown = (values) =>
    values.every(finite) ? values.reduce((a, b) => a + b, 0) : null;
  const validDate = (date) =>
    typeof date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(date + 'T00:00:00Z')) &&
    new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) === date;
  const dayAfter = (date) =>
    new Date(Date.parse(date + 'T00:00:00Z') + 86400000)
      .toISOString()
      .slice(0, 10);
  function days(first, last) {
    const result = [];
    if (!validDate(first) || !validDate(last)) return result;
    for (let date = first; date <= last; date = dayAfter(date))
      result.push(date);
    return result;
  }
  function monthBounds(snapshot, month) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month || '')) return [];
    const end = new Date(
      Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0),
    )
      .toISOString()
      .slice(0, 10);
    return [
      snapshot.settings.start > month + '-01'
        ? snapshot.settings.start
        : month + '-01',
      snapshot.settings.asof < end ? snapshot.settings.asof : end,
    ];
  }
  function cashTimeline(snapshot, month) {
    if (!snapshot?.settings) return [];
    const accounts = snapshot.tables?.tCuentas || [];
    const balances = Object.fromEntries(
      accounts.map((a) => [
        a.Cuenta,
        finite(a['Saldo inicial']) ? a['Saldo inicial'] : null,
      ]),
    );
    const [first, last] = monthBounds(snapshot, month);
    const movements = (snapshot.tables?.tMovimientos || [])
      .filter((m) => m.Fecha >= snapshot.settings.start && m.Fecha <= last)
      .sort((a, b) => a.Fecha.localeCompare(b.Fecha));
    let index = 0;
    return days(first, last).map((date) => {
      while (index < movements.length && movements[index].Fecha <= date) {
        const m = movements[index++];
        for (const [account, sign] of [
          [m.Origen, -1],
          [m.Destino, 1],
        ]) {
          if (!Object.hasOwn(balances, account)) continue;
          balances[account] =
            finite(balances[account]) && finite(m.Importe)
              ? (cents(balances[account]) + sign * cents(m.Importe)) / 100
              : null;
        }
      }
      return {
        date,
        label: date.slice(8),
        total: sumKnown(Object.values(balances)),
        accounts: { ...balances },
      };
    });
  }
  function freeBudget(snapshot, month) {
    const records = (snapshot?.budgets || []).filter(
      (r) => r.month === month && !r.category,
    );
    if (records.length !== 1 || !finite(records[0].amount)) return null;
    const spent = spending(snapshot, month);
    return spent === null
      ? null
      : (cents(records[0].amount) - cents(spent)) / 100;
  }
  function salarySavings(snapshot) {
    const payroll = new Map();
    for (const n of snapshot?.tables?.tNominas || []) {
      const m = (snapshot.tables.tMovimientos || []).find(
        (r) => r.ID === n.Movimiento,
      );
      const date = m?.Fecha || n['Fecha cobro'];
      if (
        !date ||
        date < snapshot.settings.start ||
        date > snapshot.settings.asof
      )
        continue;
      const month = date.slice(0, 7),
        value = finite(n.Neto) ? n.Neto : m?.Importe;
      payroll.set(
        month,
        sumKnown([payroll.has(month) ? payroll.get(month) : 0, value]),
      );
    }
    return [...payroll]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, payroll]) => {
        const expense = spending(snapshot, month);
        return {
          label: month,
          month,
          payroll,
          expense,
          rate:
            finite(payroll) && payroll > 0 && finite(expense)
              ? (100 * (payroll - expense)) / payroll
              : null,
        };
      });
  }
  function spendingAnalysis(snapshot, month, { excludeCategory = null } = {}) {
    const categories = new Map(),
      grouped = new Map(),
      cities = new Map(),
      recurring = new Map(),
      daily = new Map();
    const classify = new Map(
      (snapshot?.tables?.tCategorias || []).map((r) => [r.Subcategoría, r]),
    );
    let excluded = 0;
    const add = (map, key, value) =>
      map.set(key, sumKnown([map.has(key) ? map.get(key) : 0, value]));
    for (const m of snapshot?.tables?.tMovimientos || []) {
      if (
        !m.Fecha.startsWith(month) ||
        m.Fecha < snapshot.settings.start ||
        m.Fecha > snapshot.settings.asof ||
        !['Gasto', 'Devolución gasto'].includes(m.Tipo)
      )
        continue;
      const cat = classify.get(m.Subcategoría),
        label = cat?.Categoría || m.Subcategoría || 'Sin categoría';
      const value =
        finite(m.Importe) && (m.Recuperable == null || finite(m.Recuperable))
          ? ((cents(m.Importe) - cents(m.Recuperable || 0)) / 100) *
            (m.Tipo === 'Gasto' ? 1 : -1)
          : null;
      if (
        excludeCategory &&
        (label === excludeCategory || m.Subcategoría === excludeCategory)
      ) {
        excluded = sumKnown([excluded, value]);
        continue;
      }
      add(categories, label, value);
      add(grouped, cat?.Subgrupo || cat?.Grupo || 'Sin grupo', value);
      add(cities, m.Localización || 'Sin ciudad', value);
      add(
        recurring,
        m.Recurrente === 'Sí'
          ? 'Recurrente'
          : m.Recurrente === 'No'
            ? 'No recurrente'
            : 'Sin clasificación',
        value,
      );
      add(daily, m.Fecha, value);
    }
    const pairs = (map) =>
      [...map]
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
    let cumulative = 0;
    const [first, last] = snapshot?.settings
      ? monthBounds(snapshot, month)
      : [];
    const daysRows = days(first, last).map((date) => {
      const value = daily.has(date) ? daily.get(date) : 0;
      cumulative = sumKnown([cumulative, value]);
      return { date, label: date.slice(8), value, cumulative };
    });
    return {
      categories: pairs(categories),
      groups: pairs(grouped),
      cities: pairs(cities),
      recurring: pairs(recurring),
      daily: daysRows,
      total: sumKnown([...categories.values()]),
      excluded,
      excludeCategory,
    };
  }
  function investmentMetrics(snapshot, productId = null) {
    const products = (snapshot?.tables?.tProductos || []).filter(
      (p) => !productId || p.ID === productId,
    );
    const total = (key) =>
      products.length ? sumKnown(products.map((p) => p[key])) : null;
    const missing = (snapshot?.summary?.missingPrices || []).some((name) =>
      products.some((p) => p.Producto === name || p.ID === name),
    );
    const capital = total('Aportado neto'),
      value = missing ? null : total('Valor'),
      gain = missing ? null : total('Resultado');
    return {
      capital,
      value,
      gain,
      returnPct:
        !missing && products.length === 1 && finite(products[0].Rentabilidad)
          ? 100 * products[0].Rentabilidad
          : null,
      currentCost: null,
      capitalKind: 'netContributions',
    };
  }
  function investmentTimeline(
    snapshot,
    { productId = null, range = 'all' } = {},
  ) {
    const products = (snapshot?.tables?.tProductos || []).filter(
      (p) => !productId || p.ID === productId,
    );
    const relevant = (snapshot?.tables?.tOperaciones || []).filter((o) =>
      products.some((p) => p.ID === o.Producto),
    );
    const invalidProducts = new Set(
      relevant
        .filter((o) => {
          const p = products.find((p) => p.ID === o.Producto);
          return (
            !validDate(o.Fecha) ||
            o.Fecha < (p['Fecha base'] || snapshot.settings.start)
          );
        })
        .map((o) => o.Producto),
    );
    const operations = relevant
      .filter((o) => validDate(o.Fecha))
      .sort((a, b) => a.Fecha.localeCompare(b.Fecha));
    const starts = products
      .filter((p) => p['Unidades base'] > 0)
      .map((p) => p['Fecha base'] || snapshot.settings.start)
      .concat(operations.map((o) => o.Fecha))
      .filter(validDate);
    const firstDate = starts.sort()[0] || null,
      lastDate =
        snapshot?.settings?.valuation || snapshot?.settings?.asof || null;
    const prices = (snapshot?.tables?.tPrecios || []).filter((q) =>
      validDate(q.Fecha),
    );
    let previous = null,
      previousValuation = null,
      linked = null,
      supportedIntervals = 0,
      returnStartDate = null,
      priceAnchor = null,
      missingDays = 0,
      carriedDays = 0;
    const rows = days(firstDate, lastDate).map((date) => {
      const values = [],
        capitals = [],
        priceDates = {};
      let carried = false,
        flow = 0,
        flowKnown = true;
      for (const p of products) {
        let units =
          date >= (p['Fecha base'] || snapshot.settings.start)
            ? (p['Unidades base'] ?? 0)
            : 0;
        let capital =
          date >= (p['Fecha base'] || snapshot.settings.start)
            ? (p['Coste base'] ?? 0)
            : 0;
        for (const o of operations.filter(
          (o) =>
            o.Producto === p.ID &&
            o.Fecha <= date &&
            o.Fecha >= (p['Fecha base'] || snapshot.settings.start),
        )) {
          const fee = o.Comisión ?? 0,
            tax = o.Retención ?? 0;
          const amount = finite(o.Importe)
            ? o.Importe
            : finite(o.Precio) &&
                finite(fee) &&
                finite(tax) &&
                (o.Tipo === 'Cobro' || finite(o.Participaciones))
              ? o.Tipo === 'Cobro'
                ? o.Precio - fee - tax
                : o.Participaciones * o.Precio +
                  (o.Tipo === 'Compra' ? fee : -fee - tax)
              : null;
          if (o.Tipo === 'Compra' || o.Tipo === 'Venta') {
            units = sumKnown([
              units,
              finite(o.Participaciones)
                ? o.Participaciones * (o.Tipo === 'Compra' ? 1 : -1)
                : null,
            ]);
            capital = sumKnown([
              capital,
              finite(amount) ? amount * (o.Tipo === 'Compra' ? 1 : -1) : null,
            ]);
          }
          if (o.Fecha === date) {
            if (!finite(amount)) flowKnown = false;
            else flow += amount * (o.Tipo === 'Compra' ? 1 : -1);
          }
        }
        if (
          date === (p['Fecha base'] || snapshot.settings.start) &&
          p['Unidades base'] > 0 &&
          previous
        )
          flowKnown = false;
        const quote = prices
          .filter(
            (q) =>
              q.Producto === p.ID && q.Fecha <= date && finite(q['VL EUR']),
          )
          .sort((a, b) => b.Fecha.localeCompare(a.Fecha))[0];
        priceDates[p.ID] = quote?.Fecha || null;
        if (units > 0 && quote && quote.Fecha !== date) carried = true;
        if (invalidProducts.has(p.ID)) {
          units = null;
          capital = null;
          flowKnown = false;
        }
        capitals.push(capital);
        values.push(
          units === 0
            ? 0
            : finite(units) && quote
              ? units * quote['VL EUR']
              : null,
        );
      }
      const value = sumKnown(values),
        capital = sumKnown(capitals);
      let returnPct = null;
      if (productId) {
        const quote = prices
          .filter(
            (q) =>
              q.Producto === productId &&
              q.Fecha <= date &&
              finite(q['VL EUR']),
          )
          .sort((a, b) => b.Fecha.localeCompare(a.Fecha))[0];
        if (value !== null && value > 0 && quote) {
          if (priceAnchor === null && quote.Fecha === date) {
            priceAnchor = quote['VL EUR'];
            returnStartDate = date;
          }
          if (priceAnchor > 0 && quote.Fecha === date)
            returnPct = 100 * (quote['VL EUR'] / priceAnchor - 1);
        } else priceAnchor = null;
      } else if (value !== null && !carried && flowKnown) {
        if (previousValuation?.value > 0 && linked !== null) {
          // Quotes need not exist every calendar day. Without an intervening
          // external flow, real endpoint valuations determine the whole return.
          // Endpoint flows use the declared end-of-day convention.
          const factor = (value - flow) / previousValuation.value;
          if (finite(factor) && factor >= 0) {
            linked *= factor;
            returnPct = 100 * (linked - 1);
            supportedIntervals++;
          } else linked = null;
        } else if (returnStartDate === null && value > 0) {
          // Missing inception quotes permit a measured segment from this real
          // valuation, explicitly dated; never reconstruct the unknown prefix.
          returnStartDate = date;
          linked = 1;
          returnPct = 0;
        } else linked = null;
        previousValuation = { date, value };
      } else if (!flowKnown || flow !== 0) {
        // A contribution during an unvalued interval cannot be neutralized
        // exactly. Do not silently restart a since-inception series afterwards.
        linked = null;
      }
      if (value === null) missingDays++;
      if (carried) carriedDays++;
      const row = {
        date,
        label: date,
        capital,
        value,
        returnPct,
        carried,
        priceDates,
      };
      previous = row;
      return row;
    });
    let cutoff = firstDate;
    if (lastDate && range !== 'all') {
      const d = new Date(lastDate + 'T00:00:00Z');
      if (range === 'ytd') cutoff = lastDate.slice(0, 4) + '-01-01';
      else {
        const count = { '1m': 1, '3m': 3, '6m': 6, '1y': 12 }[range];
        if (count) {
          const day = d.getUTCDate();
          d.setUTCDate(1);
          d.setUTCMonth(d.getUTCMonth() - count);
          d.setUTCDate(
            Math.min(
              day,
              new Date(
                Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
              ).getUTCDate(),
            ),
          );
          cutoff = d.toISOString().slice(0, 10);
        }
      }
    }
    return {
      rows: rows.filter((r) => r.date >= cutoff),
      firstDate,
      lastDate,
      coverage: {
        missingDays,
        carriedDays,
        invalidProducts: [...invalidProducts],
        method: productId ? 'navChange' : 'twrRealValuationIntervals',
        supportedIntervals,
        returnStartDate,
        sinceInception:
          returnStartDate !== null && returnStartDate === firstDate,
        flowConvention: 'endOfDay',
        notices: [
          'Valoraciones con último VL real disponible; precios arrastrados identificados.',
          ...(invalidProducts.size
            ? [
                'Operaciones con fecha inválida o anterior a posición base; proyección no disponible para los productos afectados.',
              ]
            : []),
          productId
            ? 'Variación de VL desde primera cotización observada; no incluye distribuciones.'
            : 'TWR entre cortes de valoración reales y flujos al cierre; los intervalos sin flujos pueden enlazarse sin inventar precios diarios. Un flujo sin valoración rompe el histórico de rentabilidad.',
        ],
      },
    };
  }
  return {
    finite,
    spending,
    budget,
    groups,
    cashTimeline,
    investmentTimeline,
    investmentMetrics,
    salarySavings,
    freeBudget,
    spendingAnalysis,
  };
})();
if (typeof module !== 'undefined' && module.exports)
  module.exports = FinanceAnalytics;
