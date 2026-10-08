'use strict';

// Solo agregación del registro para presupuestos. Las valoraciones y gráficos
// financieros se leen del motor de Sheets; no se recalculan en el navegador.
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
  return { finite, spending, budget, groups };
})();
if (typeof module !== 'undefined' && module.exports)
  module.exports = FinanceAnalytics;
