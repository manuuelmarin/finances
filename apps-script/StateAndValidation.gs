function revision_(s) {
  const tables = {};
  Object.keys(s.tables).forEach(
    (name) =>
      (tables[name] = s.tables[name]
        .slice()
        .sort((a, b) => rowKey_(name, a).localeCompare(rowKey_(name, b)))),
  );
  return hash_({
    tables,
    settings: s.settings,
    ...Object.fromEntries(
      ['archives', 'templates', 'planned', 'transfers', 'migrations']
        .filter((k) => s.technical[k]?.length)
        .map((k) => [k, s.technical[k]]),
    ),
    observations: s.technical.observations,
    funds: s.technical.funds,
    ...(s.technical.budgets?.length ? { budgets: s.technical.budgets } : {}),
  });
}

function tradeAmount_(r) {
  const fee = r.Comisión || 0,
    tax = r.Retención || 0;
  return r.Tipo === 'Compra'
    ? r.Participaciones * r.Precio + fee
    : r.Tipo === 'Venta'
      ? r.Participaciones * r.Precio - fee - tax
      : r.Precio - fee - tax;
}
function fundAdjustmentFormula_(product, date, kind) {
  const ref = (c) => "'_Finanzas_TraspasosFondos'!$" + c + '$2:$' + c;
  const sum = (value, side) =>
    'SUMIFS(' +
    ref(value) +
    ';' +
    ref(side) +
    ';' +
    product +
    ';' +
    ref('B') +
    ';"<="&' +
    date +
    ';' +
    ref('J') +
    ';1)';
  return kind === 'capital'
    ? sum('M', 'C') +
        '-' +
        sum('G', 'C') +
        '+' +
        sum('G', 'D') +
        '-' +
        sum('N', 'D')
    : '-' + sum('H', 'C') + '+' + sum('H', 'D') + '-' + sum('N', 'D');
}
function fundCapitalAdjustedFormula_(formula, product, date) {
  return (
    formula.slice(0, -1) +
    '+' +
    fundAdjustmentFormula_(product, date, 'capital') +
    ')'
  );
}
function fundProductFormulas_(s, row) {
  const m = s.layout.tProductos,
    cell = (h) =>
      columnA1_(m.range.startColumnIndex + m.headers.indexOf(h)) + row;
  const id = cell('ID'),
    base = cell('Coste base'),
    start = cell('Fecha base'),
    gain = cell('Resultado'),
    date = "'Configuración'!$C$8";
  const sum = (type) =>
    'SUMIFS(tOperaciones[Importe];tOperaciones[Producto];' +
    id +
    ';tOperaciones[Tipo];"' +
    type +
    '";tOperaciones[Fecha];">="&' +
    start +
    ';tOperaciones[Fecha];"<="&' +
    date +
    ')';
  const capital =
    '=IF(OR(' +
    id +
    '="";' +
    date +
    '<' +
    start +
    ');"";' +
    base +
    '+' +
    sum('Compra') +
    '-' +
    sum('Venta') +
    ')';
  const invested =
    base +
    '+SUMIFS(tOperaciones[Importe];tOperaciones[Producto];' +
    id +
    ';tOperaciones[Tipo];"Compra";tOperaciones[Fecha];"<="&' +
    date +
    ')';
  const rate =
    '=IF(OR(' +
    id +
    '="";COUNT(' +
    gain +
    ')=0;' +
    invested +
    '=0);"";' +
    gain +
    '/(' +
    invested +
    '))';
  const adjustedInvested =
    '(' + invested + fundAdjustmentFormula_(id, date, 'invested') + ')';
  return [
    {
      column: m.range.startColumnIndex + m.headers.indexOf('Aportado neto'),
      original: capital,
      updated: fundCapitalAdjustedFormula_(capital, id, date),
    },
    {
      column: m.range.startColumnIndex + m.headers.indexOf('Rentabilidad'),
      original: rate,
      updated: rate.split(invested).join(adjustedInvested),
    },
  ];
}
function sameNativeFormula_(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  // Sheets removes optional quotes around ASCII sheet identifiers on readback.
  // Preserve quoted string literals; do not relax operators, values or ranges.
  const canonical = (formula) =>
    formula
      .split(/("(?:[^"]|"")*")/g)
      .map((part, index) =>
        index % 2 ? part : part.replace(/'([A-Za-z_][A-Za-z0-9_]*)'!/g, '$1!'),
      )
      .join('');
  return canonical(a) === canonical(b);
}
function prepareFundFormulaMigration_(config, before, after, requestId, now) {
  const activeMigration = (before.technical.migrations || []).some(
    (r) => r[1] === 'fund-transfer-v1',
  );
  if (
    !(after.technical.transfers || []).some((r) => r[9]) &&
    !activeMigration &&
    !after.restoreFundFormulas
  )
    return [];
  const targets = [],
    p = before.layout.tProductos;
  for (let row = p.range.startRowIndex + 1; row < p.range.endRowIndex; row++)
    fundProductFormulas_(before, row + 1).forEach((f) =>
      targets.push({ ...f, sheetId: p.range.sheetId, row }),
    );
  const h = supportRanges_(before).history.range;
  const originals = supportFormulaRequests_(before, true).find(
    (r) =>
      r.updateCells?.start?.sheetId === h.sheetId &&
      r.updateCells.start.rowIndex === h.startRowIndex &&
      r.updateCells.start.columnIndex === h.startColumnIndex,
  );
  check_(!!originals, 'Falta el histórico nativo de inversiones.');
  originals.updateCells.rows.forEach((r, i) => {
    const row = h.startRowIndex + i,
      original = r.values[5].userEnteredValue.formulaValue;
    targets.push({
      sheetId: h.sheetId,
      row,
      column: h.startColumnIndex + 5,
      original,
      updated: fundCapitalAdjustedFormula_(
        original,
        'C' + (row + 1),
        'D' + (row + 1),
      ),
    });
  });
  const ranges = targets.map((t) =>
    rangeA1_(
      before.book.sheets.find((s) => s.properties.sheetId === t.sheetId)
        .properties.title,
      {
        sheetId: t.sheetId,
        startRowIndex: t.row,
        endRowIndex: t.row + 1,
        startColumnIndex: t.column,
        endColumnIndex: t.column + 1,
      },
    ),
  );
  const response = Sheets.Spreadsheets.Values.batchGet(config.id, {
      ranges,
      valueRenderOption: 'FORMULA',
    }),
    requests = [];
  targets.forEach((t, i) => {
    const current = response.valueRanges[i]?.values?.[0]?.[0],
      id = 'FTR1-' + t.sheetId + '-' + t.row + '-' + t.column;
    const originalNative = nativeFormula_(before, t.original),
      updatedNative = nativeFormula_(before, t.updated);
    const backup = after.technical.migrations.find((r) => r[0] === id);
    if (after.restoreFundFormulas) {
      if (!backup || backup[1] !== 'fund-transfer-v1') return;
      check_(
        sameNativeFormula_(current, t.updated) ||
          sameNativeFormula_(current, updatedNative),
        'La fórmula migrada cambió. No se restaurará sobre una edición manual.',
      );
      const original = nativeFormula_(before, backup[7] || t.original);
      requests.push({
        updateCells: {
          start: { sheetId: t.sheetId, rowIndex: t.row, columnIndex: t.column },
          rows: [
            { values: [{ userEnteredValue: { formulaValue: original } }] },
          ],
          fields: 'userEnteredValue',
        },
      });
      backup[1] = 'restored-fund-transfer-v1';
      return;
    }
    if (backup && backup[1] === 'fund-transfer-v1') {
      check_(
        sameNativeFormula_(current, t.updated) ||
          sameNativeFormula_(current, updatedNative),
        'La fórmula migrada cambió. Revisa el libro antes de traspasar fondos.',
      );
      return;
    }
    if (
      sameNativeFormula_(current, t.updated) ||
      sameNativeFormula_(current, updatedNative)
    ) {
      after.technical.migrations.push([
        id,
        'fund-transfer-v1',
        t.sheetId,
        t.row,
        t.column,
        originalNative,
        now,
        t.original,
      ]);
      return;
    }
    check_(
      sameNativeFormula_(current, t.original) ||
        sameNativeFormula_(current, originalNative),
      'La fórmula nativa no coincide con el modelo revisado. No se ha registrado el traspaso.',
    );
    if (backup) {
      backup[1] = 'fund-transfer-v1';
      backup[6] = now;
    } else
      after.technical.migrations.push([
        id,
        'fund-transfer-v1',
        t.sheetId,
        t.row,
        t.column,
        current,
        now,
        t.original,
      ]);
    requests.push({
      updateCells: {
        start: { sheetId: t.sheetId, rowIndex: t.row, columnIndex: t.column },
        rows: [
          { values: [{ userEnteredValue: { formulaValue: updatedNative } }] },
        ],
        fields: 'userEnteredValue',
      },
    });
  });
  after.revision = revision_(after);
  return requests;
}

function refreshTransferBases_(s) {
  const transfers = (s.technical.transfers || []).filter((r) => r[9]);
  if (!transfers.length) return;
  const holdings = new Map(
    s.tables.tProductos.map((p) => [
      p.ID,
      { units: 0, capital: 0, invested: 0 },
    ]),
  );
  const paired = new Set(transfers.flatMap((t) => [t[4], t[5]]));
  const events = [
    ...s.tables.tProductos.map((p) => ({
      date: p['Fecha base'],
      order: 0,
      id: p.ID,
      product: p,
    })),
    ...s.tables.tOperaciones
      .filter((o) => !paired.has(o.ID))
      .map((o) => ({
        date: o.Fecha,
        order: o.Tipo === 'Compra' ? 1 : 3,
        id: o.ID,
        trade: o,
      })),
    ...transfers.map((t) => ({ date: t[1], order: 2, id: t[0], transfer: t })),
  ].sort(
    (a, b) => a.date - b.date || a.order - b.order || a.id.localeCompare(b.id),
  );
  events.forEach((e) => {
    if (e.product) {
      const h = holdings.get(e.id);
      h.units += e.product['Unidades base'];
      h.capital += e.product['Coste base'];
      h.invested += e.product['Coste base'];
    } else if (e.trade) {
      const o = e.trade,
        h = holdings.get(o.Producto);
      check_(!!h, 'Producto desconocido.');
      if (o.Tipo === 'Compra') {
        h.units += o.Participaciones;
        h.capital += tradeAmount_(o);
        h.invested += tradeAmount_(o);
      } else if (o.Tipo === 'Venta') {
        h.units -= o.Participaciones;
        h.capital -= tradeAmount_(o);
      }
    } else {
      const t = e.transfer,
        out = s.tables.tOperaciones.find((o) => o.ID === t[4]),
        incoming = s.tables.tOperaciones.find((o) => o.ID === t[5]),
        from = holdings.get(t[2]),
        to = holdings.get(t[3]);
      check_(
        from &&
          to &&
          out &&
          incoming &&
          out.Tipo === 'Venta' &&
          incoming.Tipo === 'Compra' &&
          out.Producto === t[2] &&
          incoming.Producto === t[3] &&
          out.Fecha === t[1] &&
          incoming.Fecha === t[1] &&
          blank_(out.Movimiento) &&
          blank_(incoming.Movimiento) &&
          !out.Comisión &&
          !incoming.Comisión &&
          !out.Retención &&
          !incoming.Retención,
        'Partes de traspaso incompatibles.',
      );
      check_(
        from.units > 0 && out.Participaciones <= from.units + 1e-8,
        'Traspaso superior a las participaciones disponibles.',
      );
      const amount = tradeAmount_(out),
        incomingAmount = tradeAmount_(incoming);
      check_(
        Math.abs(amount - t[12]) <= 1e-8 &&
          Math.abs(incomingAmount - t[13]) <= 1e-8 &&
          money_(amount) === t[8] &&
          money_(incomingAmount) === t[8],
        'Las dos partes deben liquidar el importe ejecutado, sin cambiar participaciones ni precios.',
      );
      const fraction = Math.min(1, out.Participaciones / from.units);
      t[6] = from.capital * fraction;
      t[7] = from.invested * fraction;
      from.units -= out.Participaciones;
      from.capital -= t[6];
      from.invested -= t[7];
      to.units += incoming.Participaciones;
      to.capital += t[6];
      to.invested += t[7];
    }
  });
}
function validateFinancialState_(s) {
  const t = s.tables,
    cfg = s.settings;
  check_(
    cfg.start <= cfg.asof && cfg.valuation <= cfg.asof,
    'Cortes de fechas incompatibles.',
  );
  Object.keys(INPUT_SCHEMA_).forEach((name) => {
    const seen = new Set();
    t[name].forEach((row) => {
      keyFields_(name).forEach((k) =>
        text_(
          row[k] === undefined ? null : String(row[k] || ''),
          'Clave ' + name,
        ),
      );
      if (keyFields_(name).indexOf('ID') >= 0) text_(row.ID, 'ID');
      const key = rowKey_(name, row);
      check_(!seen.has(key), 'Clave duplicada en ' + name + '.');
      seen.add(key);
    });
  });
  const by = (name, key) => new Map(t[name].map((r) => [r[key], r]));
  const accounts = by('tCuentas', 'Cuenta'),
    categories = by('tCategorias', 'Subcategoría'),
    movements = by('tMovimientos', 'ID');
  const products = by('tProductos', 'ID'),
    debts = by('tDeudas', 'ID'),
    goals = by('tObjetivos', 'ID'),
    links = by('tVinculos', 'Movimiento');
  ['archives', 'templates', 'planned'].forEach((kind) => {
    const rows = s.technical[kind] || [];
    check_(
      new Set(rows.map((r) => r[0])).size === rows.length,
      'ID de metadatos duplicado.',
    );
    rows.forEach((r) => text_(r[0], 'ID de metadatos'));
  });
  (s.technical.archives || []).forEach((r) => {
    check_(
      ['account', 'category'].includes(r[1]) && [0, 1].includes(r[3]),
      'Archivo inválido.',
    );
    if (r[3])
      check_(
        (r[1] === 'account' ? accounts : categories).has(r[2]),
        'Una referencia archivada debe conservarse o recuperarse antes de anularla.',
      );
  });
  (s.technical.templates || []).forEach((r) => {
    text_(r[1], 'Plantilla');
    check_([0, 1].includes(r[3]), 'Estado de plantilla inválido.');
    let op;
    try {
      op = JSON.parse(r[2]);
    } catch (_) {
      check_(false, 'Plantilla inválida.');
    }
    check_(
      object_(op) &&
        [
          'gasto',
          'ingreso',
          'nomina',
          'traspaso',
          'prestamo',
          'pago_deuda',
          'cobro_compartido',
          'devolucion_gasto',
        ].includes(op.process) &&
        Object.keys(op).every(
          (k) => k === 'process' || PROCESS_FIELDS_[op.process].includes(k),
        ),
      'Campos de plantilla inválidos.',
    );
    if (r[3]) {
      ['account', 'from', 'to'].forEach((k) => {
        if (!blank_(op[k]))
          check_(
            accounts.has(op[k]),
            'Una cuenta utilizada por una plantilla activa debe conservarse.',
          );
      });
      if (!blank_(op.category))
        check_(
          categories.has(op.category),
          'Una subcategoría utilizada por una plantilla activa debe conservarse.',
        );
      if (!blank_(op.debt))
        check_(
          debts.has(op.debt),
          'Una deuda utilizada por una plantilla activa debe conservarse.',
        );
      if (!blank_(op.original))
        check_(
          movements.get(op.original)?.Tipo === 'Gasto',
          'Un gasto utilizado por una plantilla activa debe conservarse.',
        );
    }
  });
  (s.technical.planned || []).forEach((r) => {
    serialDate_(r[1]);
    text_(r[2], 'Concepto previsto');
    moneyInput_(r[5], 'Importe previsto');
    check_(
      ['expense', 'income'].includes(r[6]) && [0, 1].includes(r[7]),
      'Estado previsto inválido.',
    );
    if (r[7])
      check_(
        accounts.has(r[3]) &&
          categories.get(r[4])?.Grupo ===
            (r[6] === 'expense' ? 'Gastos' : 'Ingresos'),
        'Referencia prevista desconocida.',
      );
  });
  (s.technical.transfers || []).forEach((r) => {
    text_(r[0], 'Traspaso');
    check_([0, 1].includes(r[9]), 'Estado de traspaso inválido.');
    if (r[9]) {
      check_(
        s.technical.funds.some((f) => f[0] === r[2]) &&
          s.technical.funds.some((f) => f[0] === r[3]),
        'Fondo sin ISIN.',
      );
      number_(r[6], 'Aportado neto trasladado', false, -1e12);
      number_(r[7], 'Aportado bruto trasladado');
      number_(r[8], 'Valor del traspaso', false, 0, true);
      moneyInput_(r[8], 'Importe ejecutado');
      number_(r[12], 'Valor bruto de salida', false, 0, true);
      number_(r[13], 'Valor bruto de entrada', false, 0, true);
    }
  });
  if ((s.technical.transfers || []).some((r) => r[9])) {
    const recalculated = clone_(s);
    refreshTransferBases_(recalculated);
    check_(
      canonical_(recalculated.technical.transfers) ===
        canonical_(s.technical.transfers),
      'Bases de traspaso incompatibles.',
    );
  }
  const budgetKeys = new Set();
  (s.technical.budgets || []).forEach((row) => {
    check_(
      typeof row[1] === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(row[1]),
      'Mes de presupuesto inválido.',
    );
    number_(row[3], 'Límite mensual', false);
    check_(row[4] === 0 || row[4] === 1, 'Estado de presupuesto inválido.');
    const key = canonical_([row[1], row[2]]);
    check_(!budgetKeys.has(key), 'Presupuesto mensual duplicado.');
    budgetKeys.add(key);
    if (row[4] && row[2] !== null)
      check_(
        categories.get(row[2])?.Grupo === 'Gastos',
        'Subcategoría de presupuesto desconocida.',
      );
  });
  check_(
    new Set(t.tProductos.map((r) => r.Producto)).size === products.size,
    'Nombre de producto duplicado.',
  );
  accounts.forEach((a) => {
    text_(a.Cuenta, 'Cuenta');
    number_(a['Saldo inicial'], 'Saldo inicial', false, -1e12);
    number_(a['Saldo real'], 'Saldo observado', true, -1e12);
    check_(
      blank_(a['Saldo real']) === blank_(a['Fecha saldo']),
      'Observación y fecha deben venir juntas.',
    );
  });
  s.technical.observations.forEach((row) =>
    check_(
      accounts.has(row[1]),
      'Una cuenta con observaciones históricas debe conservarse.',
    ),
  );
  categories.forEach((c) =>
    INPUT_SCHEMA_.tCategorias.inputs.forEach((h) => text_(c[h], h)),
  );
  movements.forEach((m) => {
    text_(m.Concepto, 'Concepto');
    check_(
      MOVEMENT_TYPES_.indexOf(m.Tipo) >= 0,
      'Tipo de movimiento inválido.',
    );
    number_(m.Importe, 'Importe', false, 0, true);
    number_(m.Recuperable, 'Recuperable', true);
    check_((m.Recuperable || 0) <= m.Importe, 'Recuperable mayor que importe.');
    check_(m.Fecha >= cfg.start, 'Movimiento anterior al seguimiento.');
    ['Origen', 'Destino'].forEach((k) =>
      check_(blank_(m[k]) || accounts.has(m[k]), 'Cuenta desconocida.'),
    );
    check_(
      blank_(m.Localización) || typeof m.Localización === 'string',
      'Localización debe ser texto.',
    );
    check_(
      blank_(m.Recurrente) || m.Tipo === 'Gasto',
      'Recurrencia solo para gastos.',
    );
    const out =
      ['Gasto', 'Compra inversión', 'Devolución deuda'].indexOf(m.Tipo) >= 0;
    const incoming =
      [
        'Ingreso',
        'Venta inversión',
        'Rendimiento inversión',
        'Préstamo recibido',
        'Cobro compartido',
        'Devolución gasto',
      ].indexOf(m.Tipo) >= 0;
    if (out)
      check_(
        !blank_(m.Origen) && blank_(m.Destino),
        'Movimiento de salida requiere solo Origen.',
      );
    if (incoming)
      check_(
        !blank_(m.Destino) && blank_(m.Origen),
        'Movimiento de entrada requiere solo Destino.',
      );
    if (m.Tipo === 'Transferencia')
      check_(
        m.Origen && m.Destino && m.Origen !== m.Destino,
        'Transferencia entre dos cuentas distintas.',
      );
    check_(
      blank_(m.Subcategoría) || categories.has(m.Subcategoría),
      'Subcategoría desconocida.',
    );
    if (['Ingreso', 'Gasto', 'Devolución gasto'].indexOf(m.Tipo) >= 0)
      check_(
        categories.has(m.Subcategoría) &&
          categories.get(m.Subcategoría).Grupo ===
            (m.Tipo === 'Ingreso' ? 'Ingresos' : 'Gastos'),
        'Grupo de subcategoría incompatible.',
      );
    if (['Gasto', 'Devolución gasto'].indexOf(m.Tipo) < 0)
      check_(!(m.Recuperable || 0), 'Recuperable no permitido.');
  });
  links.forEach((l) => {
    check_(movements.has(l.Movimiento), 'Vínculo sin movimiento.');
    const m = movements.get(l.Movimiento);
    if (['Préstamo recibido', 'Devolución deuda'].indexOf(m.Tipo) >= 0)
      check_(debts.has(l['Vinculado a']), 'Deuda desconocida.');
    else {
      const original = movements.get(l['Vinculado a']);
      check_(
        ['Cobro compartido', 'Devolución gasto'].indexOf(m.Tipo) >= 0 &&
          original &&
          original.Tipo === 'Gasto',
        'Vínculo incompatible.',
      );
      check_(m.Fecha >= original.Fecha, 'Cobro anterior al gasto.');
      if (m.Tipo === 'Devolución gasto')
        check_(
          m.Subcategoría === original.Subcategoría,
          'Categoría de devolución incompatible.',
        );
    }
  });
  movements.forEach((m) => {
    if (
      [
        'Préstamo recibido',
        'Devolución deuda',
        'Cobro compartido',
        'Devolución gasto',
      ].indexOf(m.Tipo) >= 0
    )
      check_(links.has(m.ID), 'Falta vínculo.');
  });
  debts.forEach((d) => {
    text_(d.Acreedor, 'Acreedor');
    number_(d['Saldo inicial'], 'Deuda inicial');
    let balance = d['Saldo inicial'];
    [...movements.values()]
      .filter((m) => links.has(m.ID) && links.get(m.ID)['Vinculado a'] === d.ID)
      .sort(
        (a, b) =>
          a.Fecha - b.Fecha ||
          (a.Tipo === 'Préstamo recibido' ? 0 : 1) -
            (b.Tipo === 'Préstamo recibido' ? 0 : 1),
      )
      .forEach((m) => {
        balance += m.Tipo === 'Préstamo recibido' ? m.Importe : -m.Importe;
        check_(balance >= -0.005, 'Devolución superior a la deuda.');
      });
  });
  movements.forEach((original) => {
    if (original.Tipo !== 'Gasto') return;
    let recoverable = original.Recuperable || 0,
      refunded = 0;
    [...movements.values()]
      .filter(
        (m) =>
          links.has(m.ID) && links.get(m.ID)['Vinculado a'] === original.ID,
      )
      .sort((a, b) => a.Fecha - b.Fecha)
      .forEach((m) => {
        if (m.Tipo === 'Cobro compartido') recoverable -= m.Importe;
        else {
          refunded += m.Importe;
          recoverable -= m.Recuperable || 0;
        }
        check_(
          recoverable >= -0.005 && refunded <= original.Importe + 0.005,
          'Cobro o devolución excesivo.',
        );
      });
  });
  products.forEach((p) => {
    ['Producto', 'Cuenta', 'Clase'].forEach((k) => text_(p[k], k));
    check_(accounts.has(p.Cuenta), 'Cuenta de producto desconocida.');
    check_(ASSET_CLASSES_.indexOf(p.Clase) >= 0, 'Clase de activo inválida.');
    number_(p['Unidades base'], 'Unidades base');
    number_(p['Coste base'], 'Coste base');
  });
  const linked = new Map();
  t.tOperaciones.forEach((r) => {
    const p = products.get(r.Producto);
    check_(!!p, 'Producto desconocido.');
    check_(
      ['Compra', 'Venta', 'Cobro'].indexOf(r.Tipo) >= 0,
      'Tipo de inversión inválido.',
    );
    check_(
      r.Fecha >= p['Fecha base'],
      'Operación anterior a la posición base.',
    );
    number_(
      r.Participaciones,
      'Participaciones',
      r.Tipo === 'Cobro',
      0,
      r.Tipo !== 'Cobro',
    );
    number_(r.Precio, 'Precio', false, 0, true);
    number_(r.Comisión, 'Comisión', true);
    number_(r.Retención, 'Retención', true);
    check_(
      r.Tipo !== 'Cobro' || !(r.Participaciones || 0),
      'Cobro no cambia participaciones.',
    );
    check_(r.Tipo !== 'Compra' || !(r.Retención || 0), 'Compra con retención.');
    check_(tradeAmount_(r) > 0, 'Neto de inversión no positivo.');
    if (blank_(r.Movimiento))
      check_(
        r.Fecha < cfg.start ||
          (s.technical.transfers || []).some(
            (t) => t[9] && [t[4], t[5]].includes(r.ID),
          ),
        'Operación actual sin movimiento de caja.',
      );
    else {
      const m = movements.get(r.Movimiento);
      check_(!!m, 'Movimiento de caja inexistente.');
      check_(
        m.Tipo ===
          {
            Compra: 'Compra inversión',
            Venta: 'Venta inversión',
            Cobro: 'Rendimiento inversión',
          }[r.Tipo] && m.Fecha === r.Fecha,
        'Tipo o fecha de inversión no coincide con caja.',
      );
      check_(
        m[r.Tipo === 'Compra' ? 'Origen' : 'Destino'] === p.Cuenta,
        'Cuenta de inversión incompatible.',
      );
      linked.set(m.ID, (linked.get(m.ID) || 0) + tradeAmount_(r));
    }
  });
  movements.forEach((m) => {
    if (
      ['Compra inversión', 'Venta inversión', 'Rendimiento inversión'].indexOf(
        m.Tipo,
      ) >= 0
    )
      check_(
        linked.has(m.ID) && Math.abs(linked.get(m.ID) - m.Importe) <= 0.011,
        'Inversión y efectivo no cuadran.',
      );
  });
  products.forEach((p) => {
    let units = p['Unidades base'];
    t.tOperaciones
      .filter((r) => r.Producto === p.ID)
      .sort(
        (a, b) =>
          a.Fecha - b.Fecha ||
          (a.Tipo === 'Compra' ? 0 : 1) - (b.Tipo === 'Compra' ? 0 : 1),
      )
      .forEach((r) => {
        units +=
          r.Tipo === 'Compra'
            ? r.Participaciones
            : r.Tipo === 'Venta'
              ? -r.Participaciones
              : 0;
        check_(
          units >= -1e-8,
          'Venta superior a las participaciones disponibles.',
        );
      });
  });
  t.tPrecios.forEach((p) => {
    check_(products.has(p.Producto), 'Precio de producto desconocido.');
    number_(p['VL EUR'], 'VL', false, 0, true);
    text_(p.Fuente, 'Fuente');
  });
  t.tNominas.forEach((n) => {
    const m = movements.get(n.Movimiento);
    check_(m && m.Tipo === 'Ingreso', 'Nómina sin ingreso.');
    const cols = ['Bruto', 'Cotización', 'IRPF', 'Otras deducciones'];
    cols.forEach((k) => number_(n[k], k, true));
    if (cols.every((k) => !blank_(n[k])))
      check_(
        Math.abs(
          n.Bruto - n.Cotización - n.IRPF - n['Otras deducciones'] - m.Importe,
        ) <= 0.011,
        'Desglose de nómina incompatible con el neto.',
      );
  });
  goals.forEach((g) => {
    text_(g.Objetivo, 'Objetivo');
    number_(g.Meta, 'Meta', false, 0, true);
  });
  t.tAsignaciones.forEach((a) => {
    check_(goals.has(a.Objetivo), 'Objetivo inexistente.');
    check_(
      accounts.has(a.Origen) || products.has(a.Origen),
      'Origen de asignación desconocido.',
    );
    number_(a.Importe, 'Asignación');
  });
}

function resolveReference_(s, table, value, aliases, label) {
  if (typeof value === 'string' && value.charAt(0) === '$')
    value = aliases[value.slice(1)];
  const key = keyFields_(table)[0],
    fields =
      table === 'tProductos'
        ? ['ID', 'Producto']
        : table === 'tDeudas'
          ? ['ID', 'Acreedor']
          : table === 'tObjetivos'
            ? ['ID', 'Objetivo']
            : [key];
  const matches = s.tables[table].filter((row) =>
    fields.some((k) => row[k] === value),
  );
  if (matches.length !== 1)
    fail_('NOT_FOUND', label + ': referencia ausente o ambigua.');
  return matches[0][key];
}
function putRow_(s, name, row, replace) {
  row = normalizeRow_(name, row);
  const key = rowKey_(name, row),
    rows = s.tables[name],
    index = rows.findIndex((r) => rowKey_(name, r) === key);
  if (index >= 0) {
    if (!replace && canonical_(rows[index]) !== canonical_(row))
      fail_('CONFLICT', 'Registro existente con contenido distinto.');
    rows[index] = row;
  } else rows.push(row);
  return row;
}
function dropRow_(s, name, key) {
  const index = s.tables[name].findIndex(
    (r) => rowKey_(name, r) === rowKey_(name, key),
  );
  if (index >= 0) return s.tables[name].splice(index, 1)[0];
  return null;
}
function synchronizeTradeCash_(s) {
  const groups = new Map();
  s.tables.tOperaciones.forEach((r) => {
    if (r.Movimiento) {
      if (!groups.has(r.Movimiento)) groups.set(r.Movimiento, []);
      groups.get(r.Movimiento).push(r);
    }
  });
  groups.forEach((trades, id) => {
    const cash = s.tables.tMovimientos.find((m) => m.ID === id);
    check_(!!cash, 'Falta movimiento asociado a la inversión.');
    const first = trades[0],
      p = s.tables.tProductos.find((p) => p.ID === first.Producto);
    check_(
      !!p &&
        trades.every(
          (r) =>
            r.Tipo === first.Tipo &&
            r.Fecha === first.Fecha &&
            s.tables.tProductos.some(
              (q) => q.ID === r.Producto && q.Cuenta === p.Cuenta,
            ),
        ),
      'Operaciones agrupadas incompatibles.',
    );
    cash.Fecha = first.Fecha;
    cash.Tipo = {
      Compra: 'Compra inversión',
      Venta: 'Venta inversión',
      Cobro: 'Rendimiento inversión',
    }[first.Tipo];
    cash.Origen = first.Tipo === 'Compra' ? p.Cuenta : null;
    cash.Destino = first.Tipo === 'Compra' ? null : p.Cuenta;
    cash.Importe = money_(trades.reduce((sum, r) => sum + tradeAmount_(r), 0));
  });
}
