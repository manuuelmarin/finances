'use strict';

// Read-only calculations: imported metadata and simulated scenarios never write to Sheets.
const FinanceInvestmentTools = (() => {
  const finite = (n) => typeof n === 'number' && Number.isFinite(n);
  const validDate = (value) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value || '') &&
    Number.isFinite(Date.parse(value + 'T00:00:00Z')) &&
    new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;

  function allocation(positions, targets, contribution) {
    if (!Array.isArray(positions) || !positions.length)
      throw Error('Añade al menos un producto.');
    if (!finite(contribution) || contribution < 0 || contribution > 1e9)
      throw Error('Indica una aportación válida.');
    if (positions.some((p) => !finite(p.value) || p.value < 0))
      throw Error('Faltan valoraciones: no se puede calcular el reparto.');
    const weights = positions.map((p) => targets[p.id]);
    if (weights.some((v) => !finite(v) || v < 0 || v > 100))
      throw Error('Indica un objetivo entre 0 y 100 para cada producto.');
    if (Math.abs(weights.reduce((a, b) => a + b, 0) - 100) > 1e-7)
      throw Error('Los porcentajes objetivo deben sumar 100 %.');
    const total = positions.reduce((s, p) => s + p.value, 0);
    const cents = Math.round(contribution * 100);
    const newTotal = total + cents / 100;
    const deficits = positions.map((p, i) =>
      Math.max(0, (newTotal * weights[i]) / 100 - p.value),
    );
    const need = deficits.reduce((a, b) => a + b, 0);
    const raw = deficits.map((v) => (need ? (cents * v) / need : 0));
    const rounded = raw.map(Math.floor);
    const order = raw.map((v, i) => ({ i, rest: v - rounded[i] }));
    order.sort((a, b) => b.rest - a.rest || a.i - b.i);
    let remaining = cents - rounded.reduce((a, b) => a + b, 0);
    for (let i = 0; i < remaining && i < order.length; i++)
      rounded[order[i].i]++;
    remaining = cents - rounded.reduce((a, b) => a + b, 0);
    return {
      total,
      residual: remaining / 100,
      rows: positions.map((p, i) => ({
        ...p,
        current: total > 0 ? (100 * p.value) / total : null,
        target: weights[i],
        difference: total > 0 ? (100 * p.value) / total - weights[i] : null,
        contribution: rounded[i] / 100,
      })),
    };
  }

  function exposure(positions, records, cutoff) {
    if (!validDate(cutoff)) throw Error('La fecha de valoración no es válida.');
    if (positions.some((p) => !finite(p.value) || p.value < 0))
      throw Error('Faltan valoraciones: no se puede calcular la exposición.');
    if (!Array.isArray(records) || records.length > 1000)
      throw Error('El archivo de exposición debe contener una lista válida.');
    const keys = new Set();
    for (const r of records) {
      if (
        !r ||
        !/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(r.isin || '') ||
        !validDate(r.date) ||
        typeof r.source !== 'string' ||
        !r.source.trim() ||
        r.source.length > 300
      )
        throw Error('Cada ficha necesita ISIN, fecha y fuente.');
      const key = r.isin + ':' + r.date;
      if (keys.has(key))
        throw Error('Hay fichas duplicadas para un ISIN y fecha.');
      keys.add(key);
      for (const type of ['countries', 'sectors', 'assetClasses']) {
        if (type === 'assetClasses' && r[type] === undefined) continue;
        if (!Array.isArray(r[type]))
          throw Error('Faltan países o sectores en una ficha.');
        const names = new Set();
        let sum = 0;
        for (const x of r[type]) {
          if (
            !x ||
            typeof x.name !== 'string' ||
            !x.name.trim() ||
            x.name.length > 100 ||
            names.has(x.name.trim()) ||
            !finite(x.percent) ||
            x.percent < 0 ||
            x.percent > 100
          )
            throw Error('Hay un nombre o porcentaje de exposición no válido.');
          names.add(x.name.trim());
          sum += x.percent;
        }
        if (sum > 100.000001)
          throw Error('Los porcentajes no pueden sumar más de 100 %.');
      }
    }
    const total = positions.reduce((sum, p) => sum + p.value, 0);
    const categories = {
      countries: new Map(),
      sectors: new Map(),
      assetClasses: new Map(),
    };
    const sources = [];
    for (const p of positions) {
      if (!p.value) continue;
      const record = records
        .filter((r) => r.isin === p.isin && r.date <= cutoff)
        .sort((a, b) => b.date.localeCompare(a.date))[0];
      if (!record) continue;
      sources.push({
        product: p.name,
        isin: p.isin,
        date: record.date,
        source: record.source,
      });
      for (const type of ['countries', 'sectors', 'assetClasses'])
        for (const entry of record[type] || []) {
          const name = entry.name.trim();
          const value = (p.value * entry.percent) / 100;
          categories[type].set(name, (categories[type].get(name) || 0) + value);
        }
    }
    const result = { total, sources };
    for (const type of ['countries', 'sectors', 'assetClasses']) {
      const rows = [...categories[type]].map(([label, value]) => ({
        label,
        value: total ? (100 * value) / total : 0,
      }));
      const covered = rows.reduce((sum, row) => sum + row.value, 0);
      result[type] = {
        rows: rows.sort((a, b) => b.value - a.value),
        unknown: total ? Math.max(0, 100 - covered) : null,
      };
    }
    return result;
  }

  function distributions(snapshot, productId = null) {
    const cutoff = snapshot.settings?.asof;
    if (!validDate(cutoff)) throw Error('La fecha de informe no es válida.');
    const [year, month, day] = cutoff.split('-').map(Number);
    const lastYear = new Date(Date.UTC(year - 1, month - 1, 1));
    const lastYearDays = new Date(Date.UTC(year - 1, month, 0)).getUTCDate();
    lastYear.setUTCDate(Math.min(day, lastYearDays));
    const from = lastYear.toISOString().slice(0, 10);
    const products = new Map(
      (snapshot.tables?.tProductos || []).map((p) => [p.ID, p.Producto]),
    );
    const selected = (snapshot.tables?.tOperaciones || []).filter(
      (o) =>
        o.Tipo === 'Cobro' &&
        products.has(o.Producto) &&
        (!productId || o.Producto === productId) &&
        (!validDate(o.Fecha) || o.Fecha <= cutoff),
    );
    const rows = selected.map((o) => ({
      date: o.Fecha,
      productId: o.Producto,
      product: products.get(o.Producto),
      net: finite(o.Importe) ? o.Importe : null,
    }));
    const unknown = rows.filter(
      (r) => !validDate(r.date) || !finite(r.net),
    ).length;
    const months = new Map();
    const productsSummary = new Map();
    const years = new Map();
    for (const row of rows)
      if (validDate(row.date) && finite(row.net)) {
        const month = row.date.slice(0, 7) + '-01';
        months.set(month, (months.get(month) || 0) + row.net);
        years.set(
          row.date.slice(0, 4),
          (years.get(row.date.slice(0, 4)) || 0) + row.net,
        );
        productsSummary.set(
          row.productId,
          (productsSummary.get(row.productId) || 0) + row.net,
        );
      }
    return {
      total: unknown ? null : rows.reduce((s, r) => s + r.net, 0),
      last12: unknown
        ? null
        : rows.filter((r) => r.date > from).reduce((s, r) => s + r.net, 0),
      unknown,
      rows,
      years: [...years]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([year, net]) => ({ year, net })),
      products: [...productsSummary]
        .map(([id, net]) => ({ id, product: products.get(id), net }))
        .sort(
          (a, b) =>
            a.product.localeCompare(b.product) || a.id.localeCompare(b.id),
        ),
      months: [...months]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, value]) => ({ date, value })),
    };
  }

  function alternative(flows, prices, ending) {
    if (!validDate(ending) || !Array.isArray(flows) || !flows.length)
      throw Error('Se necesitan flujos y una fecha final válidos.');
    const quotes = new Map();
    for (const p of prices) {
      if (
        !validDate(p.date) ||
        !finite(p.price) ||
        p.price <= 0 ||
        quotes.has(p.date)
      )
        throw Error('La referencia contiene precios inválidos o duplicados.');
      quotes.set(p.date, p.price);
    }
    const grouped = new Map();
    for (const f of flows) {
      if (!validDate(f.date) || !finite(f.amount) || f.date > ending)
        throw Error('Hay flujos sin fecha o importe válido.');
      grouped.set(f.date, (grouped.get(f.date) || 0) + f.amount);
    }
    if (!quotes.has(ending) || [...grouped.keys()].some((d) => !quotes.has(d)))
      throw Error(
        'Falta un precio real de referencia en alguna fecha de flujo o en el corte final.',
      );
    const dates = [...quotes.keys()]
      .filter((d) => d <= ending && d >= [...grouped.keys()].sort()[0])
      .sort();
    let units = 0;
    const rows = [];
    for (const date of dates) {
      const price = quotes.get(date);
      units -= (grouped.get(date) || 0) / price;
      if (units < -1e-8)
        throw Error('La retirada supera el valor simulado de la referencia.');
      rows.push({ date, value: Math.max(0, units) * price });
    }
    return rows;
  }
  function alternativeBasket(flows, components, ending) {
    if (!validDate(ending) || !Array.isArray(flows) || !flows.length)
      throw Error('Se necesitan flujos y una fecha final válidos.');
    if (
      !Array.isArray(components) ||
      !components.length ||
      components.some((c) => !finite(c.weight) || c.weight <= 0)
    )
      throw Error('Indica pesos positivos para los fondos de referencia.');
    if (Math.abs(components.reduce((sum, c) => sum + c.weight, 0) - 100) > 1e-7)
      throw Error('Los pesos de la cartera de referencia deben sumar 100 %.');
    const grouped = new Map();
    for (const flow of flows) {
      if (!validDate(flow.date) || !finite(flow.amount) || flow.date > ending)
        throw Error('Hay flujos sin fecha o importe válido.');
      grouped.set(flow.date, (grouped.get(flow.date) || 0) + flow.amount);
    }
    const maps = components.map((component) => {
      const map = new Map();
      for (const quote of component.prices) {
        if (
          !validDate(quote.date) ||
          !finite(quote.price) ||
          quote.price <= 0 ||
          map.has(quote.date)
        )
          throw Error('La referencia contiene precios inválidos o duplicados.');
        map.set(quote.date, quote.price);
      }
      if (
        !map.has(ending) ||
        [...grouped.keys()].some((date) => !map.has(date))
      )
        throw Error(
          'Falta un precio real de referencia en alguna fecha de flujo o en el corte final.',
        );
      return map;
    });
    const first = [...grouped.keys()].sort()[0];
    const dates = [...maps[0].keys()]
      .filter(
        (date) =>
          date >= first && date <= ending && maps.every((map) => map.has(date)),
      )
      .sort();
    const units = components.map(() => 0),
      rows = [];
    for (const date of dates) {
      const prices = maps.map((map) => map.get(date));
      const flow = grouped.get(date) || 0;
      if (flow < 0)
        units.forEach((_, i) => {
          units[i] += (-flow * components[i].weight) / 100 / prices[i];
        });
      if (flow > 0) {
        const total = units.reduce(
          (sum, count, i) => sum + count * prices[i],
          0,
        );
        if (flow > total + 1e-8)
          throw Error('La retirada supera el valor simulado de la referencia.');
        units.forEach((count, i) => {
          units[i] = total ? count * (1 - flow / total) : 0;
        });
      }
      rows.push({
        date,
        value: units.reduce((sum, count, i) => sum + count * prices[i], 0),
      });
    }
    return rows;
  }
  return {
    allocation,
    exposure,
    distributions,
    alternative,
    alternativeBasket,
  };
})();
if (typeof module !== 'undefined' && module.exports)
  module.exports = FinanceInvestmentTools;
