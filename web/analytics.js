'use strict';

// Read-only projections preserve canonical Sheets metrics and real prices.
const FinanceAnalytics = (() => {
  const finite = (v) => typeof v === 'number' && Number.isFinite(v);
  const cents = (v) => Math.round(v * 100);
  function spending(snapshot, month, category = null) {
    if (!monthCoverage(snapshot, month).observed) return null;
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
      coverage: monthCoverage(snapshot, record.month),
      spent,
      remaining:
        spent === null ? null : (cents(record.amount) - cents(spent)) / 100,
      ratio:
        spent === null || record.amount === 0 ? null : spent / record.amount,
      exceeded: spent !== null && spent > record.amount,
    };
  }
  function intervalSpending(snapshot, record) {
    if (
      !validDate(record?.start) ||
      !validDate(snapshot?.settings?.start) ||
      !validDate(snapshot?.settings?.asof)
    )
      return null;
    const trackingStart = snapshot.settings.start;
    const requestedEnd = record.end || snapshot.settings.asof;
    if (requestedEnd < trackingStart || record.start < trackingStart)
      return null;
    const first =
      record.start < snapshot.settings.start
        ? snapshot.settings.start
        : record.start;
    const last =
      requestedEnd > snapshot.settings.asof
        ? snapshot.settings.asof
        : requestedEnd;
    if (first > last || record.start > snapshot.settings.asof) return null;
    let total = 0;
    for (const row of snapshot?.tables?.tMovimientos || []) {
      if (row.Fecha < first || row.Fecha > last) continue;
      if (record.category && row.Subcategoría !== record.category) continue;
      if (!['Gasto', 'Devolución gasto'].includes(row.Tipo)) continue;
      if (
        !finite(row.Importe) ||
        (row.Recuperable != null && !finite(row.Recuperable))
      )
        return null;
      const own = cents(row.Importe) - cents(row.Recuperable || 0);
      total += row.Tipo === 'Gasto' ? own : -own;
      if (!Number.isSafeInteger(total)) return null;
    }
    return total / 100;
  }
  function intervalCoverage(snapshot, record) {
    const settings = snapshot?.settings;
    if (
      !validDate(record?.start) ||
      !validDate(settings?.start) ||
      !validDate(settings?.asof)
    )
      return { status: 'unknown', observed: false, first: null, last: null };
    const end = record.end || settings.asof;
    if (record.start > settings.asof)
      return { status: 'future', observed: false, first: null, last: null };
    if (end < settings.start)
      return { status: 'prestart', observed: false, first: null, last: null };
    const first = record.start < settings.start ? settings.start : record.start;
    const last = end > settings.asof ? settings.asof : end;
    if (record.start < settings.start)
      return { status: 'partial', observed: true, first, last };
    if (!record.end || record.end > settings.asof)
      return { status: 'ongoing', observed: true, first, last };
    return { status: 'full', observed: true, first, last };
  }
  function intervalBudget(snapshot, record) {
    const spent = intervalSpending(snapshot, record);
    return {
      ...record,
      coverage: intervalCoverage(snapshot, record),
      spent,
      remaining:
        spent === null ? null : (cents(record.amount) - cents(spent)) / 100,
      ratio:
        spent === null || record.amount === 0 ? null : spent / record.amount,
      exceeded: spent !== null && spent > record.amount,
    };
  }
  function budgetEvolution(snapshot, record) {
    if (
      !validDate(record?.start) ||
      !validDate(snapshot?.settings?.start) ||
      !validDate(snapshot?.settings?.asof)
    )
      return [];
    const first =
      record.start < snapshot.settings.start
        ? snapshot.settings.start
        : record.start;
    const last =
      record.end && record.end < snapshot.settings.asof
        ? record.end
        : snapshot.settings.asof;
    if (first > last) return [];
    const movements = (snapshot.tables?.tMovimientos || []).filter(
      (r) =>
        r.Fecha >= first &&
        r.Fecha <= last &&
        (!record.category || r.Subcategoría === record.category) &&
        ['Gasto', 'Devolución gasto'].includes(r.Tipo),
    );
    const dates = [
      ...new Set([first, last, ...movements.map((r) => r.Fecha)]),
    ].sort();
    let spent = record.start < snapshot.settings.start ? null : 0;
    return dates.map((date) => {
      for (const row of movements.filter((r) => r.Fecha === date)) {
        if (
          !finite(row.Importe) ||
          (row.Recuperable != null && !finite(row.Recuperable))
        )
          spent = null;
        else if (spent !== null)
          spent +=
            (cents(row.Importe) - cents(row.Recuperable || 0)) *
            (row.Tipo === 'Gasto' ? 1 : -1);
      }
      return {
        date,
        label: date,
        expense: spent === null ? null : spent / 100,
        limit: record.amount,
      };
    });
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
  function monthCoverage(snapshot, month) {
    const settings = snapshot?.settings;
    if (!settings || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month || ''))
      return { status: 'unknown', observed: false, first: null, last: null };
    const start = month + '-01';
    const end = new Date(
      Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0),
    )
      .toISOString()
      .slice(0, 10);
    if (start > settings.asof)
      return { status: 'future', observed: false, first: null, last: null };
    if (end < settings.start)
      return { status: 'prestart', observed: false, first: null, last: null };
    const [first, last] = monthBounds(snapshot, month);
    return {
      status: first === start && last === end ? 'full' : 'partial',
      observed: true,
      first,
      last,
    };
  }
  function months(snapshot) {
    const result = [];
    if (
      !validDate(snapshot?.settings?.start) ||
      !validDate(snapshot?.settings?.asof)
    )
      return result;
    let month = snapshot.settings.start.slice(0, 7);
    const last = snapshot.settings.asof.slice(0, 7);
    while (month <= last) {
      result.push(month);
      const date = new Date(month + '-01T00:00:00Z');
      date.setUTCMonth(date.getUTCMonth() + 1);
      month = date.toISOString().slice(0, 7);
    }
    return result;
  }
  function goalAvailability(snapshot) {
    const origins = [
      ...(snapshot?.tables?.tCuentas || []).map((r) => ({
        origin: r.Cuenta,
        available: r['Saldo calculado'],
        kind: 'account',
      })),
      ...(snapshot?.tables?.tProductos || []).map((r) => ({
        origin: r.ID,
        label: r.Producto,
        available: (snapshot.summary?.missingPrices || []).some(
          (name) => name === r.ID || name === r.Producto,
        )
          ? null
          : r.Valor,
        kind: 'product',
      })),
    ];
    for (const r of snapshot?.tables?.tAsignaciones || [])
      if (!origins.some((o) => o.origin === r.Origen))
        origins.push({ origin: r.Origen, available: null, kind: 'unknown' });
    return origins.map((o) => {
      const assigned = sumKnown(
        (snapshot.tables.tAsignaciones || [])
          .filter((r) => r.Origen === o.origin)
          .map((r) => r.Importe),
      );
      const free =
        finite(o.available) && finite(assigned)
          ? (cents(o.available) - cents(assigned)) / 100
          : null;
      return { ...o, assigned, free, overallocated: finite(free) && free < 0 };
    });
  }
  function goalProgress(snapshot, goal) {
    const remaining =
      finite(goal.Meta) && finite(goal.Asignado)
        ? Math.max(0, (cents(goal.Meta) - cents(goal.Asignado)) / 100)
        : null;
    const dated = validDate(goal.Fecha);
    const expired =
      dated && goal.Fecha < snapshot.settings.asof && remaining !== 0;
    const daysLeft = dated
      ? Math.max(
          0,
          (Date.parse(goal.Fecha + 'T00:00:00Z') -
            Date.parse(snapshot.settings.asof + 'T00:00:00Z')) /
            86400000,
        )
      : null;
    return {
      remaining,
      expired,
      daysLeft,
      monthlyPace:
        finite(remaining) && daysLeft > 0
          ? remaining / (daysLeft / 30.4375)
          : null,
    };
  }
  function budgetHistory(snapshot, category = null) {
    return months(snapshot).map((month) => {
      const records = (snapshot.budgets || []).filter(
        (r) => r.month === month && (r.category || null) === category,
      );
      return {
        month,
        label: month,
        date: month + '-01',
        expense: spending(snapshot, month, category),
        limit:
          records.length === 1 && finite(records[0].amount)
            ? records[0].amount
            : null,
        coverage: monthCoverage(snapshot, month),
      };
    });
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
        coverage: monthCoverage(snapshot, month),
        accounts: { ...balances },
      };
    });
  }
  // Cross-check known native balances against the existing read-only chart
  // projection. Never replace Sheets results or turn unknown values into zero.
  function cashBalancesMatch(snapshot) {
    const month = snapshot?.settings?.asof?.slice(0, 7);
    const last = cashTimeline(snapshot, month).at(-1);
    const accounts = snapshot?.tables?.tCuentas || [];
    if (
      !accounts.every((account) => {
        const native = account['Saldo calculado'];
        const projected = last?.accounts[account.Cuenta];
        return (
          !finite(native) ||
          !finite(projected) ||
          cents(native) === cents(projected)
        );
      })
    )
      return false;
    const cash = snapshot?.summary?.metrics?.find(
      (m) => m.label === 'Efectivo',
    )?.value;
    return (
      !finite(cash) ||
      !accounts.every((a) => finite(a['Saldo calculado'])) ||
      cents(cash) ===
        cents(accounts.reduce((sum, a) => sum + a['Saldo calculado'], 0))
    );
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
    return months(snapshot).map((month) => {
      const registered = payroll.has(month);
      const net = registered ? payroll.get(month) : null;
      const expense = spending(snapshot, month);
      return {
        label: month,
        month,
        payroll: net,
        registered,
        coverage: monthCoverage(snapshot, month),
        expense,
        rate:
          finite(net) && net > 0 && finite(expense)
            ? (100 * (net - expense)) / net
            : null,
      };
    });
  }
  // Limits are intentions, not actual spending or cash. Never add overlapping
  // limits for the same category, including an all-categories limit.
  function salaryAllocation(snapshot, cut, selectedMonth = cut?.slice(0, 7)) {
    if (!validDate(cut)) return { salary: null, reason: 'Sin fecha de corte.' };
    if (!validDate(String(selectedMonth || '') + '-01'))
      return { salary: null, reason: 'Selecciona un mes válido.' };
    const monthStart = selectedMonth + '-01';
    const monthEnd = new Date(
      Date.UTC(
        Number(selectedMonth.slice(0, 4)),
        Number(selectedMonth.slice(5)),
        0,
      ),
    )
      .toISOString()
      .slice(0, 10);
    const movements = snapshot?.tables?.tMovimientos || [];
    const payrollRows = (snapshot?.tables?.tNominas || []).map((row) => {
      const movement = row.Movimiento
        ? movements.find((item) => item.ID === row.Movimiento)
        : null;
      return {
        date: movement?.Fecha || row['Fecha cobro'],
        net: finite(row.Neto) ? row.Neto : movement?.Importe,
      };
    });
    if (payrollRows.some((row) => !validDate(row.date)))
      return {
        salary: null,
        reason: 'Hay una nómina sin fecha válida; revisa el libro.',
      };
    const payroll = payrollRows
      .filter((row) => validDate(row.date) && row.date <= cut)
      .sort((a, b) => b.date.localeCompare(a.date));
    if (!payroll.length)
      return {
        salary: null,
        reason: 'No hay una nómina registrada hasta esta fecha.',
      };
    const latest = payroll.filter((row) => row.date === payroll[0].date);
    if (latest.some((row) => !finite(row.net) || row.net < 0))
      return {
        salary: null,
        date: payroll[0].date,
        reason: 'La última nómina no tiene un importe neto válido.',
      };
    const salary = latest.reduce((sum, row) => sum + cents(row.net), 0) / 100;
    if (!Number.isSafeInteger(cents(salary)) || salary <= 0)
      return {
        salary: null,
        date: payroll[0].date,
        reason: 'La última nómina no tiene un neto positivo.',
      };
    const monthlyRecords = snapshot?.budgets || [];
    const invalidMonths = monthlyRecords.some(
      (row) => !validDate(String(row.month || '') + '-01'),
    );
    const monthly = monthlyRecords
      .filter((row) => row.month === selectedMonth)
      .map((row) => ({
        ...row,
        title: row.category || 'Total',
        start: row.month + '-01',
        end: monthEnd,
      }));
    const intervalRecords = snapshot?.intervalBudgets || [];
    const invalidDates = intervalRecords.some(
      (row) =>
        !validDate(row.start) ||
        (row.end && (!validDate(row.end) || row.end < row.start)),
    );
    const intervals = intervalRecords.filter(
      (row) =>
        validDate(row.start) &&
        row.start <= monthEnd &&
        (!row.end || (validDate(row.end) && row.end >= monthStart)),
    );
    const spanningIntervals = intervals.some(
      (row) => row.start < monthStart || !row.end || row.end > monthEnd,
    );
    const records = [...monthly, ...intervals];
    const invalid =
      invalidDates ||
      invalidMonths ||
      records.some(
        (row) =>
          !finite(row.amount) ||
          row.amount < 0 ||
          !Number.isSafeInteger(cents(row.amount)),
      );
    const categories = records.map((row) => row.category || null);
    const conflict = categories.some((category, index) =>
      categories.slice(index + 1).some((other, offset) => {
        const next = records[index + offset + 1];
        const first = records[index];
        return (
          (!category || !other || category === other) &&
          first.start <= (next.end || monthEnd) &&
          next.start <= (first.end || monthEnd)
        );
      }),
    );
    const totalCents = records.reduce(
      (sum, row) => sum + (finite(row.amount) ? cents(row.amount) : 0),
      0,
    );
    const safe =
      !invalid &&
      !conflict &&
      !spanningIntervals &&
      Number.isSafeInteger(totalCents);
    const planned = safe ? totalCents / 100 : null;
    return {
      salary,
      date: payroll[0].date,
      payrollCount: latest.length,
      records,
      planned,
      available: safe ? Math.max(0, cents(salary) - totalCents) / 100 : null,
      excess: safe ? Math.max(0, totalCents - cents(salary)) / 100 : null,
      reason:
        invalidDates || invalidMonths
          ? 'Hay límites con fechas no válidas.'
          : invalid
            ? 'Hay límites sin importe válido.'
            : conflict
              ? 'Hay límites solapados para las mismas categorías; revisa el reparto.'
              : spanningIntervals
                ? 'Hay límites que abarcan más de un mes; ajusta sus fechas para calcular este reparto mensual.'
                : null,
    };
  }
  function spendingAnalysis(
    snapshot,
    month,
    {
      excludeCategory = null,
      includeCategories = null,
      from = null,
      to = null,
    } = {},
  ) {
    const custom = from !== null || to !== null;
    const coverage =
      custom && (!validDate(from) || !validDate(to) || from > to)
        ? { status: 'unknown', observed: false, first: null, last: null }
        : custom
          ? intervalCoverage(snapshot, { start: from, end: to })
          : monthCoverage(snapshot, month);
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
        !coverage.observed ||
        m.Fecha < coverage.first ||
        m.Fecha > coverage.last ||
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
        (excludeCategory &&
          (label === excludeCategory || m.Subcategoría === excludeCategory)) ||
        (includeCategories !== null && !includeCategories.includes(label))
      ) {
        excluded = sumKnown([excluded, value]);
        continue;
      }
      add(categories, label, value);
      add(grouped, cat?.Subgrupo || cat?.Grupo || 'Sin grupo', value);
      add(cities, m.Localización || 'Sin ciudad', value);
      add(
        recurring,
        m.Recurrente === 'Sí' ? 'Recurrente' : 'No recurrente',
        value,
      );
      add(daily, m.Fecha, value);
    }
    const pairs = (map) =>
      [...map]
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
    let cumulative = 0;
    const { first, last } = coverage;
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
      coverage,
      total: coverage.observed ? sumKnown([...categories.values()]) : null,
      excluded,
      excludeCategory,
    };
  }
  function cashForecast(snapshot, selectedIds = null) {
    const accounts = Object.fromEntries(
      (snapshot?.tables?.tCuentas || []).map((r) => [
        r.Cuenta,
        finite(r['Saldo calculado']) ? r['Saldo calculado'] : null,
      ]),
    );
    const asof = snapshot?.settings?.asof;
    const selected = (snapshot?.planned || [])
      .filter((p) => p.active && (!selectedIds || selectedIds.includes(p.id)))
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const rows = [
      {
        date: asof,
        label: asof,
        projected: sumKnown(Object.values(accounts)),
        accounts: { ...accounts },
        assumption: 'Efectivo calculado al corte',
      },
    ];
    const notices = [];
    for (const p of selected) {
      if (!validDate(p.date) || p.date <= asof) {
        notices.push('Plan vencido o fuera del horizonte: ' + p.concept);
        continue;
      }
      if (
        !Object.hasOwn(accounts, p.account) ||
        !finite(p.amount) ||
        !['income', 'expense'].includes(p.kind)
      ) {
        notices.push('Plan incompleto: ' + p.concept);
        rows.push({
          date: p.date,
          label: p.date,
          projected: null,
          accounts: { ...accounts },
          assumption: p.concept + ' · incompleto',
        });
        for (const name of Object.keys(accounts)) accounts[name] = null;
        continue;
      }
      accounts[p.account] = sumKnown([
        accounts[p.account],
        p.amount * (p.kind === 'income' ? 1 : -1),
      ]);
      rows.push({
        date: p.date,
        label: p.date,
        projected: sumKnown(Object.values(accounts)),
        accounts: { ...accounts },
        assumption: p.concept + ' · ' + p.account,
      });
    }
    return {
      rows,
      notices,
      asof,
      complete: rows.every((r) => finite(r.projected)) && !notices.length,
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
  function transferPrecision(snapshot, transfer) {
    const trades = snapshot?.tables?.tOperaciones || [];
    const out = trades.find((o) => o.ID === transfer.outTradeID);
    const incoming = trades.find((o) => o.ID === transfer.inTradeID);
    const near = (a, b) =>
      finite(a) &&
      finite(b) &&
      Math.abs(a - b) <=
        Math.max(
          1e-10,
          Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b)) * 8,
        );
    const leg = (o, product, type, raw) =>
      o &&
      o.Producto === product &&
      o.Tipo === type &&
      o.Fecha === transfer.date &&
      !o.Movimiento &&
      finite(o.Participaciones) &&
      finite(o.Precio) &&
      (o.Comisión ?? 0) === 0 &&
      (o.Retención ?? 0) === 0 &&
      near(o.Participaciones * o.Precio, raw);
    const quoteMatches = (product, price) => {
      const quote = (snapshot?.tables?.tPrecios || []).find(
        (q) => q.Producto === product && q.Fecha === transfer.date,
      );
      return quote && finite(quote['VL EUR']) && near(quote['VL EUR'], price);
    };
    const verified =
      validDate(transfer.date) &&
      finite(transfer.amount) &&
      transfer.amount > 0 &&
      finite(transfer.rawOut) &&
      finite(transfer.rawIn) &&
      cents(transfer.rawOut) === cents(transfer.amount) &&
      cents(transfer.rawIn) === cents(transfer.amount) &&
      near(transfer.rawIn - transfer.rawOut, transfer.valuationResidual) &&
      leg(out, transfer.fromProduct, 'Venta', transfer.rawOut) &&
      leg(incoming, transfer.toProduct, 'Compra', transfer.rawIn) &&
      quoteMatches(transfer.fromProduct, out.Precio) &&
      quoteMatches(transfer.toProduct, incoming.Precio);
    return { ...transfer, verified };
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
    const precisionAdjustments = (snapshot.fundTransfers || []).map((t) =>
      transferPrecision(snapshot, t),
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
      navStartDate = null,
      dietzPrevious = null,
      dietzLinked = null,
      dietzStartDate = null,
      dietzBroken = false,
      dietzEstimatedIntervals = 0,
      dietzFlows = [],
      missingDays = 0,
      carriedDays = 0;
    const rows = days(firstDate, lastDate).map((date) => {
      const values = [],
        capitals = [],
        distributions = [],
        priceDates = {},
        productValues = {};
      let carried = false,
        flow = 0,
        flowKnown = true,
        precisionAdjustment = 0;
      if (!productId)
        for (const t of precisionAdjustments.filter((t) => t.date === date)) {
          if (!t.verified) flowKnown = false;
          else precisionAdjustment += t.valuationResidual;
        }
      for (const p of products) {
        let paid = 0;
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
          if (o.Tipo === 'Cobro') paid = sumKnown([paid, amount]);
          const transfer = (snapshot.fundTransfers || []).find(
            (t) => t.outTradeID === o.ID || t.inTradeID === o.ID,
          );
          const rawFlow = transfer
            ? o.ID === transfer.outTradeID
              ? transfer.rawOut
              : transfer.rawIn
            : amount;
          const contribution = transfer
            ? finite(transfer.costBasis)
              ? transfer.costBasis
              : null
            : amount;
          if (o.Tipo === 'Compra' || o.Tipo === 'Venta') {
            units = sumKnown([
              units,
              finite(o.Participaciones)
                ? o.Participaciones * (o.Tipo === 'Compra' ? 1 : -1)
                : null,
            ]);
            capital = sumKnown([
              capital,
              finite(contribution)
                ? contribution * (o.Tipo === 'Compra' ? 1 : -1)
                : null,
            ]);
          }
          if (o.Fecha === date && (!transfer || productId)) {
            if (!finite(rawFlow)) flowKnown = false;
            else flow += rawFlow * (o.Tipo === 'Compra' ? 1 : -1);
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
        distributions.push(invalidProducts.has(p.ID) ? null : paid);
        productValues[p.ID] =
          units === 0
            ? 0
            : finite(units) && quote
              ? units * quote['VL EUR']
              : null;
        values.push(productValues[p.ID]);
      }
      const value = sumKnown(values),
        capital = sumKnown(capitals);
      // Independent of exact TWR: link Modified Dietz over real, complete
      // valuation endpoints. An unquoted cash-flow day is weighted by elapsed
      // calendar days, never converted into an invented NAV or execution date.
      let adjustedReturnPct = null;
      if (!flowKnown) dietzBroken = true;
      if (dietzPrevious && (flow !== 0 || precisionAdjustment !== 0))
        dietzFlows.push({ date, flow, precisionAdjustment });
      if (value !== null && !carried && !dietzBroken) {
        if (!dietzPrevious && value > 0) {
          dietzStartDate = date;
          dietzLinked = 1;
          adjustedReturnPct = 0;
        } else if (dietzPrevious && dietzLinked !== null) {
          const duration =
            (Date.parse(date) - Date.parse(dietzPrevious.date)) / 86400000;
          const weighted = dietzFlows.reduce(
            (sum, f) =>
              sum +
              (f.flow * (Date.parse(date) - Date.parse(f.date))) /
                86400000 /
                duration,
            0,
          );
          const denominator = dietzPrevious.value + weighted;
          const netFlow = dietzFlows.reduce((sum, f) => sum + f.flow, 0);
          const adjustment = dietzFlows.reduce(
            (sum, f) => sum + f.precisionAdjustment,
            0,
          );
          const factor =
            1 +
            (value - dietzPrevious.value - netFlow - adjustment) / denominator;
          if (
            duration > 0 &&
            denominator > 0 &&
            finite(factor) &&
            factor >= 0
          ) {
            dietzLinked *= factor;
            adjustedReturnPct = 100 * (dietzLinked - 1);
            if (dietzFlows.some((f) => f.date !== date))
              dietzEstimatedIntervals++;
          } else dietzBroken = true;
        }
        dietzPrevious = { date, value };
        dietzFlows = [];
      }
      let returnPct = null;
      if (value !== null && !carried && flowKnown) {
        if (previousValuation?.value > 0 && linked !== null) {
          // Quotes need not exist every calendar day. Without an intervening
          // external flow, real endpoint valuations determine the whole return.
          // Endpoint flows use the declared end-of-day convention.
          const factor =
            (value - flow - precisionAdjustment) / previousValuation.value;
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
      } else if (!flowKnown || flow !== 0 || precisionAdjustment !== 0) {
        // A contribution during an unvalued interval cannot be neutralized
        // exactly. Do not silently restart a since-inception series afterwards.
        linked = null;
      }
      const totalReturnPct = returnPct;
      if (productId) {
        returnPct = null;
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
            navStartDate = date;
          }
          if (priceAnchor > 0 && quote.Fecha === date)
            returnPct = 100 * (quote['VL EUR'] / priceAnchor - 1);
        } else priceAnchor = null;
      }
      if (value === null) missingDays++;
      if (carried) carriedDays++;
      const row = {
        date,
        label: date,
        capital,
        value,
        returnPct,
        totalReturnPct,
        adjustedReturnPct,
        netResult:
          finite(value) && finite(capital) && finite(sumKnown(distributions))
            ? value - capital + sumKnown(distributions)
            : null,
        resultOnCapitalPct:
          finite(value) &&
          finite(capital) &&
          capital > 0 &&
          finite(sumKnown(distributions))
            ? (100 * (value - capital + sumKnown(distributions))) / capital
            : null,
        precisionAdjustment: productId ? 0 : precisionAdjustment,
        carried,
        priceDates,
        productValues,
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
    const selectedRows = rows.filter((r) => r.date >= cutoff);
    const perProduct = products.map((p) => {
      const dates = [
        ...new Set(
          prices
            .filter(
              (q) =>
                q.Producto === p.ID &&
                finite(q['VL EUR']) &&
                q.Fecha >= cutoff &&
                q.Fecha <= lastDate,
            )
            .map((q) => q.Fecha),
        ),
      ].sort();
      return {
        product: p.ID,
        name: p.Producto,
        firstQuote: dates[0] || null,
        lastQuote: dates.at(-1) || null,
        quoteCount: dates.length,
        missingDays: selectedRows.filter((r) => r.productValues[p.ID] === null)
          .length,
        carriedDays: selectedRows.filter(
          (r) => r.productValues[p.ID] > 0 && r.priceDates[p.ID] !== r.date,
        ).length,
      };
    });
    return {
      rows: selectedRows,
      firstDate,
      lastDate,
      coverage: {
        missingDays: selectedRows.filter((r) => r.value === null).length,
        carriedDays: selectedRows.filter((r) => r.carried).length,
        inceptionMissingDays: missingDays,
        inceptionCarriedDays: carriedDays,
        selectedStartDate: selectedRows[0]?.date || null,
        selectedEndDate: selectedRows.at(-1)?.date || null,
        perProduct,
        precisionAdjustments: precisionAdjustments.filter(
          (t) => t.date >= cutoff && t.date <= lastDate,
        ),
        precisionConvention: 'noncashRawLegResidualAtRealValuation',
        invalidProducts: [...invalidProducts],
        method: productId ? 'navChange' : 'twrRealValuationIntervals',
        supportedIntervals,
        returnStartDate,
        navStartDate,
        adjustedMethod: 'linkedModifiedDietz',
        adjustedStartDate: dietzStartDate,
        adjustedEstimatedIntervals: dietzEstimatedIntervals,
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
            : 'TWR ajustado: diferencias de precisión verificadas se excluyen mediante un ajuste sin efectivo. TWR entre cortes de valoración reales y flujos al cierre; los intervalos sin flujos pueden enlazarse sin inventar precios diarios. Un flujo sin valoración rompe el histórico de rentabilidad.',
        ],
      },
    };
  }
  return {
    finite,
    monthCoverage,
    months,
    goalAvailability,
    goalProgress,
    budgetHistory,
    cashForecast,
    spending,
    budget,
    intervalSpending,
    intervalCoverage,
    intervalBudget,
    budgetEvolution,
    groups,
    cashTimeline,
    cashBalancesMatch,
    investmentTimeline,
    investmentMetrics,
    salarySavings,
    salaryAllocation,
    freeBudget,
    spendingAnalysis,
  };
})();
if (typeof module !== 'undefined' && module.exports)
  module.exports = FinanceAnalytics;
