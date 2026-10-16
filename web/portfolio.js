'use strict';

// Read-only portfolio analysis. No quote interpolation, balance-based risk,
// invented cash flows or persistence. Rates use actual dated observations.
const FinancePortfolio = (() => {
  const finite = (x) => typeof x === 'number' && Number.isFinite(x);
  const day = 86400000;
  const days = (a, b) => (Date.parse(b) - Date.parse(a)) / day;
  const validDate = (d) =>
    /^\d{4}-\d{2}-\d{2}$/.test(d || '') &&
    Number.isFinite(Date.parse(d)) &&
    new Date(d).toISOString().slice(0, 10) === d;

  function xirr(input) {
    if (
      !input.length ||
      input.some((f) => !validDate(f.date) || !finite(f.amount))
    )
      return { rate: null, status: 'invalid' };
    const grouped = new Map();
    for (const f of input)
      grouped.set(f.date, (grouped.get(f.date) || 0) + f.amount);
    const flows = [...grouped]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, amount]) => ({ date, amount }))
      .filter((f) => Math.abs(f.amount) > 1e-9);
    if (!flows.some((f) => f.amount < 0) || !flows.some((f) => f.amount > 0))
      return { rate: null, status: 'signs' };
    if (days(flows[0].date, flows.at(-1).date) < 30)
      return { rate: null, status: 'short' };
    // One sign change guarantees at most one IRR. For nonconventional flows,
    // do not select an arbitrary root from a numeric scan.
    const signs = flows.map((f) => Math.sign(f.amount));
    if (signs.filter((s, i) => i && s !== signs[i - 1]).length !== 1)
      return { rate: null, status: 'nonconventional' };
    const times = flows.map((f) => days(flows[0].date, f.date) / 365);
    const npv = (z) => {
      const shift = Math.max(0, ...times.map((t) => -z * t));
      return flows.reduce(
        (sum, f, i) => sum + f.amount * Math.exp(-z * times[i] - shift),
        0,
      );
    };
    let low = -20,
      high = 20,
      left = npv(low);
    if (Math.sign(left) === Math.sign(npv(high)))
      return { rate: null, status: 'bounds' };
    for (let i = 0; i < 120; i++) {
      const mid = (low + high) / 2;
      const value = npv(mid);
      if (value === 0) {
        low = high = mid;
        break;
      }
      if (Math.sign(value) === Math.sign(left)) {
        low = mid;
        left = value;
      } else high = mid;
    }
    const rate = Math.expm1((low + high) / 2);
    return {
      rate: finite(rate) ? rate : null,
      status: finite(rate) ? 'ok' : 'bounds',
    };
  }

  function cashFlows(snapshot, productId = null) {
    const products = (snapshot.tables.tProductos || []).filter(
      (p) => !productId || p.ID === productId,
    );
    return (snapshot.tables.tOperaciones || [])
      .filter((o) => products.some((p) => p.ID === o.Producto))
      .map((o) => {
        const transfer = (snapshot.fundTransfers || []).find(
          (t) => t.outTradeID === o.ID || t.inTradeID === o.ID,
        );
        if (transfer && !productId) return null;
        const fee = o.Comisión ?? 0,
          tax = o.Retención ?? 0;
        let amount = finite(o.Importe)
          ? o.Importe
          : finite(o.Precio) && finite(fee) && finite(tax)
            ? o.Tipo === 'Cobro'
              ? o.Precio - fee - tax
              : finite(o.Participaciones)
                ? o.Participaciones * o.Precio +
                  (o.Tipo === 'Compra' ? fee : -fee - tax)
                : null
            : null;
        if (transfer)
          amount =
            o.ID === transfer.outTradeID ? transfer.rawOut : transfer.rawIn;
        return {
          date: o.Fecha,
          amount:
            ['Compra', 'Venta', 'Cobro'].includes(o.Tipo) && finite(amount)
              ? amount * (o.Tipo === 'Compra' ? -1 : 1)
              : null,
          product: o.Producto,
        };
      })
      .filter(Boolean);
  }

  function exactDiagnostics(snapshot, timeline, productId = null) {
    const flows = cashFlows(snapshot, productId);
    const missing = [
      ...new Set(
        flows
          .filter((f) => {
            const row = timeline.rows.find((r) => r.date === f.date);
            return (
              !row || !finite(f.amount) || row.carried || !finite(row.value)
            );
          })
          .map((f) => f.date),
      ),
    ];
    const valid = timeline.rows.filter((r) => finite(r.totalReturnPct));
    const valued = timeline.rows.filter((r) => finite(r.value) && !r.carried);
    return {
      missing,
      last: valid.at(-1)?.date || null,
      complete: !!valid.length && valid.at(-1).date === valued.at(-1)?.date,
    };
  }

  function returnSeries(timeline) {
    const valued = timeline.rows.filter((r) => finite(r.value) && !r.carried);
    const exact =
      !!valued.length &&
      timeline.coverage.sinceInception &&
      valued.every((r) => finite(r.totalReturnPct));
    return {
      estimated: !exact,
      rows: timeline.rows.map((r) => ({
        ...r,
        adjustedReturnPct: exact ? r.totalReturnPct : r.adjustedReturnPct,
      })),
    };
  }

  function drawdowns(points) {
    let peak = null,
      max = null;
    const rows = points.map((p) => {
      const index = 1 + p.adjustedReturnPct / 100;
      if (!peak || index >= peak.index - 1e-12) peak = { index, date: p.date };
      const drawdown = peak.index > 0 ? 100 * (index / peak.index - 1) : null;
      if (finite(drawdown) && (!max || drawdown < max.value))
        max = {
          value: drawdown,
          peak: peak.date,
          trough: p.date,
          peakIndex: peak.index,
        };
      return {
        date: p.date,
        drawdown,
        underwaterDays:
          index < peak.index - 1e-12 ? days(peak.date, p.date) : 0,
        index,
      };
    });
    const recovery =
      max && max.value < 0
        ? rows.find(
            (r) => r.date > max.trough && r.index >= max.peakIndex - 1e-12,
          )?.date || null
        : null;
    return { rows, max, recovery };
  }

  function averageReturns(rows, frequency = 'month') {
    const size = frequency === 'year' ? 4 : 7;
    const points = rows
      .filter((r) => validDate(r.date) && finite(r.adjustedReturnPct))
      .sort((a, b) => a.date.localeCompare(b.date));
    const groups = new Map();
    for (const p of points) {
      const key = p.date.slice(0, size);
      if (!groups.has(key)) groups.set(key, { first: p, last: p });
      else groups.get(key).last = p;
    }
    const ordinal = (key) =>
      frequency === 'year'
        ? Number(key)
        : Number(key.slice(0, 4)) * 12 + Number(key.slice(5));
    let previous = null;
    const periods = [];
    for (const [period, group] of groups) {
      const consecutive =
        !previous || ordinal(period) - ordinal(previous.period) === 1;
      const opening = previous ? previous.last : group.first;
      const base = 1 + opening.adjustedReturnPct / 100;
      const end = 1 + group.last.adjustedReturnPct / 100;
      // A period with only its initial anchor is not an observed return.
      // Do not attribute several months/years across a data gap to one period.
      if (
        consecutive &&
        opening.date < group.last.date &&
        base > 0 &&
        end >= 0
      ) {
        periods.push({
          period,
          from: opening.date,
          to: group.last.date,
          value: 100 * (end / base - 1),
        });
      }
      previous = { period, last: group.last };
    }
    return {
      periods,
      value: periods.length
        ? periods.reduce((sum, p) => sum + p.value, 0) / periods.length
        : null,
    };
  }

  function stdev(values) {
    if (values.length < 2 || values.some((v) => !finite(v))) return null;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return Math.sqrt(
      values.reduce((sum, x) => sum + (x - mean) ** 2, 0) / (values.length - 1),
    );
  }
  function correlation(a, b) {
    if (a.length !== b.length || a.length < 2) return null;
    const sa = stdev(a),
      sb = stdev(b);
    if (!finite(sa) || !finite(sb) || sa <= 1e-14 || sb <= 1e-14) return null;
    const ma = a.reduce((s, x) => s + x, 0) / a.length;
    const mb = b.reduce((s, x) => s + x, 0) / b.length;
    return Math.max(
      -1,
      Math.min(
        1,
        a.reduce((s, x, i) => s + (x - ma) * (b[i] - mb), 0) /
          ((a.length - 1) * sa * sb),
      ),
    );
  }
  function week(date) {
    const d = new Date(date);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  }
  function risk(snapshot, from, to, portfolioRows, productId = null) {
    const prices = (snapshot.tables.tPrecios || []).filter(
      (q) =>
        validDate(q.Fecha) &&
        q.Fecha >= from &&
        q.Fecha <= to &&
        finite(q['VL EUR']) &&
        q['VL EUR'] > 0,
    );
    const allProducts = (snapshot.tables.tProductos || []).filter(
      (p) => !productId || p.ID === productId,
    );
    const excluded = [];
    const products = allProducts.filter((p) => {
      const count = new Set(
        prices.filter((q) => q.Producto === p.ID).map((q) => week(q.Fecha)),
      ).size;
      if (count < 13) excluded.push(p.Producto);
      return count >= 13;
    });
    const byProduct = new Map(
      products.map((p) => [
        p.ID,
        new Map(
          prices
            .filter((q) => q.Producto === p.ID)
            .map((q) => [q.Fecha, q['VL EUR']]),
        ),
      ]),
    );
    const dates = products.length
      ? [...byProduct.get(products[0].ID).keys()]
          .filter((d) => products.every((p) => byProduct.get(p.ID).has(d)))
          .sort()
      : [];
    const weekly = new Map();
    for (const date of dates) {
      const monday = week(date);
      // Exclude boundary partial weeks; use the last real common quote of
      // each completed week. A holiday never becomes a zero return.
      if (monday >= from && days(monday, to) >= 4) weekly.set(monday, date);
    }
    const endpoints = [...weekly].sort(([a], [b]) => a.localeCompare(b));
    const observations = [];
    for (let i = 1; i < endpoints.length; i++) {
      const [wa, a] = endpoints[i - 1],
        [wb, b] = endpoints[i];
      if (days(wa, wb) !== 7) continue;
      observations.push({
        from: a,
        to: b,
        values: products.map(
          (p) => byProduct.get(p.ID).get(b) / byProduct.get(p.ID).get(a) - 1,
        ),
      });
    }
    const enough = observations.length >= 12;
    const volatility = products.map((p, i) => ({
      label: p.Producto,
      value: enough
        ? 100 * Math.sqrt(52) * stdev(observations.map((r) => r.values[i]))
        : null,
    }));
    const correlations = [];
    for (let i = 0; i < products.length; i++)
      for (let j = i + 1; j < products.length; j++)
        correlations.push({
          a: products[i].ID,
          b: products[j].ID,
          label: products[i].Producto + ' / ' + products[j].Producto,
          value: enough
            ? correlation(
                observations.map((r) => r.values[i]),
                observations.map((r) => r.values[j]),
              )
            : null,
        });
    const portfolio = new Map(
      portfolioRows.map((r) => [r.date, 1 + r.adjustedReturnPct / 100]),
    );
    const portfolioReturns = observations.map((r) =>
      portfolio.has(r.from) && portfolio.has(r.to) && portfolio.get(r.from) > 0
        ? portfolio.get(r.to) / portfolio.get(r.from) - 1
        : null,
    );
    if (!productId && enough && portfolioReturns.every(finite))
      volatility.unshift({
        label: 'Cartera (estimada)',
        value: 100 * Math.sqrt(52) * stdev(portfolioReturns),
      });
    return {
      products,
      volatility,
      correlations,
      count: observations.length,
      from: observations[0]?.from || null,
      to: observations.at(-1)?.to || null,
      short: observations.length < 52,
      excluded,
      observations,
    };
  }

  function analyze(
    snapshot,
    timeline,
    {
      productId = null,
      from = timeline.firstDate,
      to = timeline.lastDate,
    } = {},
  ) {
    const selected = timeline.rows.filter(
      (r) => r.date >= from && r.date <= to,
    );
    const valued = selected.filter((r) => finite(r.value) && !r.carried);
    const points = selected.filter((r) => finite(r.adjustedReturnPct));
    const diagnostics = exactDiagnostics(snapshot, timeline, productId);
    const opening = valued[0];
    const ending = valued.at(-1);
    const products = (snapshot.tables.tProductos || []).filter(
      (p) => !productId || p.ID === productId,
    );
    const allFlows = cashFlows(snapshot, productId);
    const inception =
      !!opening &&
      opening.date === timeline.firstDate &&
      products.every((p) => !(p['Unidades base'] > 0));
    const flows = allFlows.filter(
      (f) =>
        opening && f.date >= opening.date && (!ending || f.date <= ending.date),
    );
    const unknown =
      flows.some((f) => !finite(f.amount) || !validDate(f.date)) ||
      !!timeline.coverage.invalidProducts.length ||
      (timeline.coverage.precisionAdjustments || []).some((t) => !t.verified);
    const effectiveFlows = inception
      ? flows
      : opening
        ? [
            { date: opening.date, amount: -opening.value },
            ...flows.filter((f) => f.date > opening.date),
          ]
        : [];
    const xirrRows = valued.map((r) => {
      const result = unknown
        ? { rate: null, status: 'invalid' }
        : xirr([
            ...effectiveFlows.filter((f) => f.date <= r.date),
            { date: r.date, amount: r.value },
          ]);
      return {
        date: r.date,
        value: finite(result.rate) ? 100 * result.rate : null,
        status: result.status,
      };
    });
    const contributions = products.map((p) => {
      const pf = cashFlows(snapshot, p.ID).filter(
        (f) =>
          opening &&
          ending &&
          f.date >= opening.date &&
          f.date <= ending.date &&
          (inception || f.date > opening.date),
      );
      const start = inception ? 0 : opening?.productValues[p.ID];
      const end = ending?.productValues[p.ID];
      return {
        label: p.Producto,
        value:
          finite(start) && finite(end) && pf.every((f) => finite(f.amount))
            ? end - start + pf.reduce((s, f) => s + f.amount, 0)
            : null,
      };
    });
    const dd = drawdowns(points);
    return {
      diagnostics,
      xirrRows,
      flows: effectiveFlows,
      opening: opening?.date || null,
      ending: ending?.date || null,
      contributions,
      drawdowns: dd,
      risk: risk(snapshot, from, to, points, productId),
      complete: !!ending && points.at(-1)?.date === ending.date,
      inception,
    };
  }
  return {
    xirr,
    cashFlows,
    exactDiagnostics,
    returnSeries,
    drawdowns,
    averageReturns,
    stdev,
    correlation,
    risk,
    analyze,
  };
})();
if (typeof module !== 'undefined' && module.exports)
  module.exports = FinancePortfolio;
