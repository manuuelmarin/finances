'use strict';

const FinanceInsights = (() => {
  const finite = (value) => typeof value === 'number' && Number.isFinite(value);
  function spendingMovements(snapshot, period) {
    const range = typeof period === 'object' && period !== null;
    const categories = new Map(
      (snapshot?.tables?.tCategorias || []).map((r) => [r.Subcategoría, r]),
    );
    return (snapshot?.tables?.tMovimientos || [])
      .filter(
        (m) =>
          (range
            ? m.Fecha >= period.from && m.Fecha <= period.to
            : m.Fecha.startsWith(period)) &&
          m.Fecha >= snapshot.settings.start &&
          m.Fecha <= snapshot.settings.asof &&
          ['Gasto', 'Devolución gasto'].includes(m.Tipo),
      )
      .map((m) => ({
        date: m.Fecha,
        concept: m.Concepto || '',
        category:
          categories.get(m.Subcategoría)?.Categoría ||
          m.Subcategoría ||
          'Sin categoría',
        subcategory: m.Subcategoría || 'Sin categoría',
        city: m.Localización || 'Sin ciudad',
        recurring: m.Recurrente || 'No',
        amount:
          finite(m.Importe) && (m.Recuperable == null || finite(m.Recuperable))
            ? ((Math.round(m.Importe * 100) -
                Math.round((m.Recuperable || 0) * 100)) /
                100) *
              (m.Tipo === 'Gasto' ? 1 : -1)
            : null,
        type: m.Tipo,
      }));
  }
  function monthlyFlows(snapshot, period = null) {
    const grouped = new Map();
    if (!snapshot?.settings?.start || !snapshot?.settings?.asof) return [];
    const from =
      period?.from > snapshot.settings.start
        ? period.from
        : snapshot.settings.start;
    const to =
      period?.to < snapshot.settings.asof ? period.to : snapshot.settings.asof;
    if (from > to) return [];
    let cursor = from.slice(0, 7);
    const last = to.slice(0, 7);
    if (!period && from.slice(8, 10) !== '01' && cursor < last) {
      const [year, month] = cursor.split('-').map(Number);
      cursor = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 7);
    }
    while (cursor <= last) {
      grouped.set(cursor, { month: cursor, income: 0, expense: 0 });
      const [year, month] = cursor.split('-').map(Number);
      cursor = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 7);
    }
    for (const m of snapshot?.tables?.tMovimientos || []) {
      if (m.Fecha < from || m.Fecha > to || m.Tipo !== 'Ingreso') continue;
      const month = m.Fecha.slice(0, 7);
      const row = grouped.get(month);
      if (!row) continue;
      if (finite(m.Importe) && row.income !== null) row.income += m.Importe;
      else row.income = null;
    }
    for (const m of snapshot.tables.tMovimientos || []) {
      if (
        m.Fecha < from ||
        m.Fecha > to ||
        !['Gasto', 'Devolución gasto'].includes(m.Tipo)
      )
        continue;
      const row = grouped.get(m.Fecha.slice(0, 7));
      if (!row) continue;
      if (
        finite(m.Importe) &&
        (m.Recuperable == null || finite(m.Recuperable)) &&
        row.expense !== null
      )
        row.expense +=
          (m.Importe - (m.Recuperable || 0)) * (m.Tipo === 'Gasto' ? 1 : -1);
      else row.expense = null;
    }
    return [...grouped.values()]
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((r) => ({
        ...r,
        date: `${r.month}-01` < from ? from : `${r.month}-01`,
        label: r.month,
      }));
  }
  function expenseStatistics(rows) {
    const expenses = rows.filter(
      (r) => r.type === 'Gasto' && finite(r.amount) && r.amount > 0,
    );
    if (!expenses.length)
      return { mean: null, median: null, modes: [], largest: null };
    const values = expenses
      .map((r) => Math.round(r.amount * 100))
      .sort((a, b) => a - b);
    const middle = Math.floor(values.length / 2);
    const frequencies = new Map();
    for (const value of values)
      frequencies.set(value, (frequencies.get(value) || 0) + 1);
    const highest = Math.max(...frequencies.values());
    return {
      mean: values.reduce((sum, value) => sum + value, 0) / values.length / 100,
      median:
        (values.length % 2
          ? values[middle]
          : (values[middle - 1] + values[middle]) / 2) / 100,
      modes:
        highest > 1
          ? [...frequencies]
              .filter(([, n]) => n === highest)
              .map(([value]) => value / 100)
          : [],
      largest: expenses.find(
        (r) => Math.round(r.amount * 100) === values.at(-1),
      ),
    };
  }
  function expenseHistogram(rows, binWidth = null) {
    if (binWidth !== null && ![5, 10, 20, 50, 100].includes(binWidth))
      throw new RangeError('Unsupported histogram interval');
    const cents = rows
      .filter(
        (r) =>
          r.type === 'Gasto' &&
          typeof r.amount === 'number' &&
          Number.isFinite(r.amount) &&
          r.amount > 0,
      )
      .map((r) => Math.round(r.amount * 100))
      .sort((a, b) => a - b);
    if (!cents.length) return [];
    const min = cents[0];
    const max = cents.at(-1);
    const desiredBins =
      min === max
        ? 1
        : Math.min(12, Math.max(3, Math.ceil(Math.sqrt(cents.length))));
    const targetWidth = Math.max(1, (max - min + 1) / desiredBins);
    const niceWidths = [];
    for (let power = 0; power <= 18; power++)
      for (const factor of [1, 2, 2.5, 5, 10]) {
        const width = factor * 10 ** power;
        if (Number.isInteger(width)) niceWidths.push(width);
      }
    const width =
      binWidth === null
        ? niceWidths
            .sort((a, b) => a - b)
            .find((candidate) => candidate >= targetWidth) ||
          Math.ceil(targetWidth)
        : Math.round(binWidth * 100);
    const firstLow = Math.floor(min / width) * width;
    const lastLow = Math.floor(max / width) * width;
    const bins = new Map();
    if ((lastLow - firstLow) / width <= 400)
      for (let low = firstLow; low <= lastLow; low += width) bins.set(low, 0);
    for (const value of cents) {
      const low = Math.floor(value / width) * width;
      bins.set(low, (bins.get(low) || 0) + 1);
    }
    const currency = new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const axisNumber = new Intl.NumberFormat('es-ES', {
      maximumFractionDigits: 2,
    });
    return [...bins]
      .sort(([a], [b]) => a - b)
      .map(([low, count]) => ({
        x: low / 100,
        low: low / 100,
        high: (low + width) / 100,
        value: count,
        axisLabel: `${axisNumber.format(low / 100)}–<${axisNumber.format((low + width) / 100)}`,
        label: `${currency.format(low / 100)}–<${currency.format((low + width) / 100)}`,
      }));
  }
  return {
    spendingMovements,
    monthlyFlows,
    expenseHistogram,
    expenseStatistics,
  };
})();
if (typeof module !== 'undefined' && module.exports)
  module.exports = FinanceInsights;
