'use strict';

// Historical net worth is reconstructed from the same read-only timelines used
// by the dashboard. Values are reported only for dates with real observations.
const FinanceWealth = (() => {
  const finite = (value) => typeof value === 'number' && Number.isFinite(value);
  const validDate = (date) => {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date))
      return false;
    const parsed = new Date(date + 'T00:00:00Z');
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === date
    );
  };

  function subtractMonths(date, months) {
    if (!validDate(date) || !Number.isSafeInteger(months) || months < 1)
      return null;
    const [year, month, day] = date.split('-').map(Number);
    const monthIndex = year * 12 + month - 1 - months;
    const targetYear = Math.floor(monthIndex / 12);
    const targetMonth = monthIndex % 12;
    const lastDay = new Date(
      Date.UTC(targetYear, targetMonth + 1, 0),
    ).getUTCDate();
    return new Date(Date.UTC(targetYear, targetMonth, Math.min(day, lastDay)))
      .toISOString()
      .slice(0, 10);
  }

  function cashAt(snapshot, date, analytics) {
    if (!Array.isArray(snapshot?.tables?.tCuentas))
      return { value: null, reason: 'No hay datos completos de cuentas.' };
    const row = analytics
      .cashTimeline(snapshot, date.slice(0, 7))
      .find((item) => item.date === date);
    if (!row || !row.coverage?.observed || !finite(row.total))
      return {
        value: null,
        reason: 'El saldo de efectivo no está disponible en esa fecha.',
      };
    return { value: row.total, reason: null };
  }

  function investmentAt(snapshot, date, analytics) {
    const products = snapshot?.tables?.tProductos || [];
    if (!Array.isArray(products))
      return {
        value: null,
        reason: 'No se puede comprobar el histórico de inversiones.',
      };
    if (!products.length) return { value: 0, reason: null };
    const timeline = analytics.investmentTimeline(snapshot, { range: 'all' });
    if (
      timeline.coverage?.invalidProducts?.length ||
      !Array.isArray(timeline.rows)
    )
      return {
        value: null,
        reason: 'El histórico de inversiones contiene datos incompletos.',
      };
    const row = timeline.rows.find((item) => item.date === date);
    if (!row || !finite(row.value) || row.carried)
      return {
        value: null,
        reason: 'Falta una valoración real de inversiones en esa fecha.',
      };
    return { value: row.value, reason: null };
  }

  function debtAt(snapshot, date) {
    const tables = snapshot?.tables || {};
    const debts = tables.tDeudas || [];
    if (!Array.isArray(debts))
      return {
        value: null,
        reason: 'No se puede comprobar el histórico de deudas.',
      };
    if (!debts.length) return { value: 0, reason: null };
    const movements = tables.tMovimientos;
    const links = tables.tVinculos;
    if (!Array.isArray(movements) || !Array.isArray(links))
      return { value: null, reason: 'Faltan movimientos o vínculos de deuda.' };

    const balances = new Map();
    for (const debt of debts) {
      if (
        !debt ||
        debt.ID == null ||
        balances.has(debt.ID) ||
        !finite(debt['Saldo inicial']) ||
        debt['Saldo inicial'] < 0
      )
        return {
          value: null,
          reason: 'El saldo inicial de una deuda no es válido.',
        };
      balances.set(debt.ID, debt['Saldo inicial']);
    }
    const relevant = movements
      .filter((movement) =>
        ['Préstamo recibido', 'Devolución deuda'].includes(movement?.Tipo),
      )
      .sort((a, b) =>
        String(a?.Fecha || '').localeCompare(String(b?.Fecha || '')),
      );
    for (const movement of relevant) {
      if (!validDate(movement.Fecha))
        return {
          value: null,
          reason: 'Hay movimientos de deuda con fecha no válida.',
        };
      if (movement.Fecha < snapshot.settings.start || movement.Fecha > date)
        continue;
      if (!finite(movement.Importe) || movement.Importe < 0)
        return {
          value: null,
          reason: 'Hay movimientos de deuda con importe no válido.',
        };
      const matching = links.filter((link) => link?.Movimiento === movement.ID);
      if (matching.length !== 1 || !balances.has(matching[0]?.['Vinculado a']))
        return {
          value: null,
          reason: 'Falta un vínculo válido para un movimiento de deuda.',
        };
      const debtId = matching[0]['Vinculado a'];
      const sign = movement.Tipo === 'Préstamo recibido' ? 1 : -1;
      balances.set(debtId, balances.get(debtId) + sign * movement.Importe);
    }
    const total = [...balances.values()].reduce(
      (sum, balance) => sum + balance,
      0,
    );
    return finite(total) && total >= 0
      ? { value: total, reason: null }
      : { value: null, reason: 'El saldo de deuda no se puede calcular.' };
  }

  function valueAt(
    snapshot,
    date,
    analytics = typeof FinanceAnalytics !== 'undefined'
      ? FinanceAnalytics
      : globalThis.FinanceAnalytics,
  ) {
    if (
      !validDate(date) ||
      !validDate(snapshot?.settings?.start) ||
      date < snapshot.settings.start
    )
      return {
        value: null,
        reason: 'La fecha es anterior al inicio del libro.',
      };
    if (date > snapshot.settings.asof)
      return {
        value: null,
        reason: 'La fecha supera el último día del libro.',
      };
    if (!analytics?.cashTimeline || !analytics?.investmentTimeline)
      return {
        value: null,
        reason: 'No están disponibles los cálculos históricos.',
      };
    const parts = [
      cashAt(snapshot, date, analytics),
      investmentAt(snapshot, date, analytics),
      debtAt(snapshot, date),
    ];
    const missing = parts.find((part) => !finite(part.value));
    if (missing) return { value: null, reason: missing.reason };
    return {
      value: parts[0].value + parts[1].value - parts[2].value,
      reason: null,
    };
  }

  function dayBefore(date) {
    return new Date(Date.parse(date + 'T00:00:00Z') - 86400000)
      .toISOString()
      .slice(0, 10);
  }

  function nearestObserved(snapshot, targetDate, analytics) {
    let date = targetDate;
    let reason =
      'No se encontró una valoración completa en los últimos 7 días.';
    for (let offset = 0; offset <= 7; offset++) {
      if (date < snapshot.settings.start) {
        reason =
          offset === 0
            ? 'La fecha es anterior al inicio del libro.'
            : 'No hay una valoración completa desde el inicio del libro.';
        break;
      }
      const result = valueAt(snapshot, date, analytics);
      if (finite(result.value)) return { date, ...result };
      if (offset === 0) reason = result.reason || reason;
      date = dayBefore(date);
    }
    return { date: null, value: null, reason };
  }

  function compare(
    snapshot,
    months,
    analytics = typeof FinanceAnalytics !== 'undefined'
      ? FinanceAnalytics
      : globalThis.FinanceAnalytics,
  ) {
    const requestedCurrentDate = snapshot?.settings?.asof || null;
    if (
      !validDate(requestedCurrentDate) ||
      !subtractMonths(requestedCurrentDate, months)
    ) {
      return {
        currentDate: null,
        previousDate: null,
        requestedCurrentDate,
        requestedPreviousDate: null,
        current: null,
        previous: null,
        change: null,
        pct: null,
        reason: 'Selecciona un periodo válido.',
      };
    }
    const currentResult = nearestObserved(
      snapshot,
      requestedCurrentDate,
      analytics,
    );
    const currentDate = currentResult.date;
    const requestedPreviousDate = subtractMonths(
      currentDate || requestedCurrentDate,
      months,
    );
    const previousResult = currentDate
      ? nearestObserved(snapshot, requestedPreviousDate, analytics)
      : { date: null, value: null, reason: currentResult.reason };
    const previousDate = previousResult.date;
    const current = currentResult.value;
    const previous = previousResult.value;
    const note =
      (currentDate && currentDate !== requestedCurrentDate) ||
      (previousDate && previousDate !== requestedPreviousDate)
        ? 'Últimos cortes con valoración completa.'
        : null;
    if (!finite(current) || !finite(previous)) {
      return {
        currentDate,
        previousDate,
        requestedCurrentDate,
        requestedPreviousDate,
        current,
        previous,
        change: null,
        pct: null,
        note,
        reason:
          currentResult.reason ||
          previousResult.reason ||
          'No hay datos completos para comparar estas fechas.',
      };
    }
    const change = current - previous;
    if (previous <= 0) {
      return {
        currentDate,
        previousDate,
        requestedCurrentDate,
        requestedPreviousDate,
        current,
        previous,
        change,
        pct: null,
        note,
        reason:
          'El patrimonio inicial debe ser positivo para calcular el porcentaje.',
      };
    }
    return {
      currentDate,
      previousDate,
      requestedCurrentDate,
      requestedPreviousDate,
      current,
      previous,
      change,
      pct: (change / previous) * 100,
      note,
      reason: null,
    };
  }

  return { compare, valueAt, subtractMonths };
})();

if (typeof module !== 'undefined' && module.exports)
  module.exports = FinanceWealth;
if (typeof globalThis !== 'undefined') globalThis.FinanceWealth = FinanceWealth;
