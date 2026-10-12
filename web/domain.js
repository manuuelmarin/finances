'use strict';

// El cliente describe entradas; Sheets conserva las reglas y los cálculos financieros.
const FinanceDomain = (() => {
  const field = (
    key,
    label,
    type = 'text',
    required = true,
    source,
    initial,
  ) => ({ key, label, type, required, source, initial });
  const date = field('date', 'Fecha', 'date');
  const concept = field('concept', 'Concepto');
  const account = field('account', 'Cuenta', 'select', true, 'accounts');
  const amount = field('amount', 'Importe EUR', 'money');
  const category = field(
    'category',
    'Subcategoría',
    'select',
    true,
    'categories',
  );
  const location = field(
    'location',
    'Localización',
    'select',
    false,
    'locations',
  );
  const product = field('product', 'Producto', 'select', true, 'products');
  const recoverable = field(
    'recoverable',
    'Parte recuperable EUR',
    'money',
    false,
    null,
    '0',
  );
  const debt = field('debt', 'Deuda', 'select', true, 'debts');
  const original = field(
    'original',
    'Gasto original',
    'select',
    true,
    'expenses',
  );
  const fee = field('fee', 'Comisión EUR', 'money', true, null, '0');
  const tax = field('tax', 'Retención EUR', 'money', true, null, '0');
  const historical = field(
    'historical',
    'Operación anterior al inicio, sin caja nueva',
    'boolean',
    true,
    null,
    'false',
  );
  const processes = {
    traspaso_fondo: {
      label: 'Traspaso entre fondos',
      fields: [
        date,
        concept,
        field('fromProduct', 'Fondo de origen', 'select', true, 'products'),
        field('toProduct', 'Fondo de destino', 'select', true, 'products'),
        field('outUnits', 'Participaciones de salida', 'decimal'),
        field('outPrice', 'Valor liquidativo de salida EUR', 'decimal'),
        field('inUnits', 'Participaciones de entrada', 'decimal'),
        field('inPrice', 'Valor liquidativo de entrada EUR', 'decimal'),
        field(
          'amount',
          'Importe ejecutado por el intermediario EUR · vacío para calcular céntimos',
          'money',
          false,
        ),
      ],
    },
    archivar: {
      label: 'Archivar o recuperar referencia',
      ui: false,
      fields: [
        field('kind', 'Tipo'),
        field('reference', 'Referencia'),
        field('archived', 'Archivado', 'boolean'),
      ],
    },
    obligacion: {
      label: 'Obligación prevista',
      ui: false,
      fields: [date, concept, account, category, amount, field('kind', 'Tipo')],
    },

    presupuesto: {
      label: 'Límite mensual de gasto',
      ui: false,
      fields: [
        field('month', 'Mes AAAA-MM'),
        field('category', 'Subcategoría · vacía para el total', 'text', false),
        amount,
      ],
    },
    quitar_presupuesto: {
      label: 'Quitar límite mensual',
      ui: false,
      fields: [
        field('month', 'Mes AAAA-MM'),
        field('category', 'Subcategoría · vacía para el total', 'text', false),
      ],
    },
    gasto: {
      label: 'Gasto',
      fields: [
        date,
        concept,
        account,
        category,
        amount,
        recoverable,
        location,
        field('recurring', 'Recurrente', 'nullableBoolean', false),
      ],
    },
    ingreso: {
      label: 'Ingreso',
      fields: [date, concept, account, category, amount, location],
    },
    nomina: {
      label: 'Nómina',
      fields: [
        date,
        concept,
        account,
        category,
        amount,
        ...[
          ['gross', 'Bruto'],
          ['contribution', 'Cotización'],
          ['tax', 'IRPF'],
          ['otherDeductions', 'Otras deducciones'],
        ].map(([k, l]) =>
          field(k, l + ' EUR · dejar vacío si se desconoce', 'money', false),
        ),
        location,
      ],
    },
    traspaso: {
      label: 'Transferencia entre cuentas',
      fields: [
        date,
        concept,
        field('from', 'Cuenta de origen', 'select', true, 'accounts'),
        field('to', 'Cuenta de destino', 'select', true, 'accounts'),
        amount,
        location,
      ],
    },
    cobro_compartido: {
      label: 'Cobro de gasto compartido',
      fields: [date, concept, account, original, amount, location],
    },
    devolucion_gasto: {
      label: 'Devolución de gasto',
      fields: [date, concept, account, original, amount, recoverable, location],
    },
    prestamo: {
      label: 'Préstamo recibido',
      fields: [date, concept, account, debt, amount, location],
    },
    pago_deuda: {
      label: 'Pago de deuda',
      fields: [date, concept, account, debt, amount, location],
    },
    compra: {
      label: 'Compra de inversión',
      fields: [
        date,
        concept,
        product,
        field('units', 'Participaciones', 'decimal'),
        field('price', 'Precio unitario EUR', 'decimal'),
        fee,
        historical,
        location,
      ],
    },
    venta: {
      label: 'Venta de inversión',
      fields: [
        date,
        concept,
        product,
        field('units', 'Participaciones', 'decimal'),
        field('price', 'Precio unitario EUR', 'decimal'),
        fee,
        tax,
        historical,
        location,
      ],
    },
    rendimiento: {
      label: 'Rendimiento de inversión',
      fields: [
        date,
        concept,
        product,
        field('gross', 'Cobro bruto EUR', 'money'),
        fee,
        tax,
        historical,
        location,
      ],
    },
    precio: {
      label: 'Precio manual',
      fields: [
        product,
        date,
        field('price', 'Valor liquidativo EUR', 'decimal'),
        field('source', 'Fuente del precio'),
        field(
          'replace',
          'Sustituir el precio guardado para esta fecha',
          'boolean',
          true,
          null,
          'false',
        ),
      ],
    },
    cuenta: {
      label: 'Nueva cuenta',
      fields: [
        field('account', 'Nombre de la cuenta'),
        field('opening', 'Saldo inicial EUR', 'signedMoney', true, null, '0'),
      ],
    },
    saldo_observado: {
      label: 'Observación bancaria',
      fields: [
        account,
        date,
        field('amount', 'Saldo observado EUR', 'signedMoney'),
        field(
          'scope',
          'Alcance del saldo',
          'select',
          true,
          'scopes',
          'desconocido',
        ),
        field('time', 'Hora conocida', 'time', false),
        field('source', 'Fuente', 'text', true, null, 'Usuario'),
      ],
    },
    deuda_inicial: {
      label: 'Nueva deuda',
      fields: [
        field('creditor', 'Acreedor'),
        field('opening', 'Deuda inicial EUR', 'money', true, null, '0'),
      ],
    },
    producto: {
      label: 'Nuevo producto',
      fields: [
        field('name', 'Nombre del producto'),
        account,
        field('class', 'Clase de activo', 'select', true, 'classes'),
        field('date', 'Fecha de posición base', 'date'),
        field('units', 'Unidades base', 'decimal', true, null, '0'),
        field('cost', 'Coste base EUR', 'money', true, null, '0'),
        field('isin', 'ISIN del fondo', 'text', false),
        field(
          'referenceName',
          'Nombre de referencia de la clase',
          'text',
          false,
        ),
      ],
    },
    vincular_isin: {
      label: 'Configurar ISIN y nombre de referencia',
      fields: [
        product,
        field('isin', 'ISIN del fondo'),
        field('referenceName', 'Nombre de referencia de la clase'),
      ],
    },
    objetivo: {
      label: 'Nuevo objetivo',
      fields: [
        field('name', 'Nombre del objetivo'),
        field('amount', 'Meta EUR', 'money'),
        field('date', 'Fecha objetivo', 'date', false),
      ],
    },
    asignacion: {
      label: 'Asignar activos a un objetivo',
      fields: [
        field('goal', 'Objetivo', 'select', true, 'goals'),
        field(
          'origin',
          'Cuenta o producto de origen',
          'select',
          true,
          'origins',
        ),
        amount,
      ],
    },
    categoria: {
      label: 'Nueva subcategoría',
      fields: [
        field('group', 'Grupo', 'select', true, 'groups'),
        field('subgroup', 'Subgrupo'),
        field('category', 'Categoría'),
        field('subcategory', 'Subcategoría'),
      ],
    },
    fechas: {
      label: 'Fechas del informe',
      fields: [
        field('start', 'Inicio del seguimiento', 'date'),
        field('asof', 'Fecha del informe', 'date'),
        field('valuation', 'Fecha de valoración', 'date'),
      ],
    },
    renombrar: {
      label: 'Renombrar cuenta o subcategoría',
      fields: [
        field('kind', 'Tipo', 'select', true, 'renameKinds'),
        field('from', 'Nombre actual', 'select', true, 'renameFrom'),
        field('to', 'Nuevo nombre'),
      ],
    },
  };
  const normalize = (value) =>
    String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  const decimal = (value, money = false, signed = false) => {
    const text = String(value).trim();
    if (!/^-?\d+(?:[.,]\d+)?$/.test(text))
      throw Error('Introduce un número sin separadores de miles.');
    const digits = (text.split(/[.,]/)[1] || '').length;
    if (digits > (money ? 2 : 12))
      throw Error(
        money
          ? 'El importe admite hasta dos decimales.'
          : 'El valor admite hasta doce decimales.',
      );
    const result = Number(text.replace(',', '.'));
    if (
      !Number.isFinite(result) ||
      Math.abs(result) > 1e12 ||
      (!signed && result < 0)
    )
      throw Error('Importe fuera de rango.');
    return result;
  };
  function operation(process, values) {
    const spec = processes[process];
    if (!spec) throw Error('Operación desconocida.');
    const result = { process };
    for (const f of spec.fields) {
      const value = String(values[f.key] ?? '').trim();
      if (!value) {
        if (f.required) throw Error('Completa ' + f.label + '.');
        result[f.key] = null;
        continue;
      }
      if (['money', 'signedMoney', 'decimal'].includes(f.type))
        result[f.key] = decimal(
          value,
          f.type !== 'decimal',
          f.type === 'signedMoney',
        );
      else if (['boolean', 'nullableBoolean'].includes(f.type)) {
        if (!['true', 'false'].includes(value))
          throw Error('Selección inválida.');
        result[f.key] = value === 'true';
      } else result[f.key] = value;
    }
    if (process === 'traspaso_fondo') {
      const cents = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
      if (result.amount === null)
        result.amount = cents(result.outUnits * result.outPrice);
      if (
        cents(result.outUnits * result.outPrice) !== result.amount ||
        cents(result.inUnits * result.inPrice) !== result.amount
      )
        throw Error(
          'Las dos partes deben liquidar el mismo importe ejecutado en céntimos.',
        );
    }
    if (process === 'producto' && result.isin && !result.referenceName)
      result.referenceName = result.name;
    if (
      ['presupuesto', 'quitar_presupuesto'].includes(process) &&
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(result.month)
    )
      throw Error('El mes debe tener formato AAAA-MM.');
    if (process === 'traspaso' && result.from === result.to)
      throw Error('Elige cuentas de origen y destino distintas.');
    if (
      process === 'saldo_observado' &&
      result.scope === 'intradía' &&
      !result.time
    )
      throw Error('La observación intradía necesita una hora conocida.');
    if (
      process === 'fechas' &&
      (result.start > result.asof || result.valuation > result.asof)
    )
      throw Error(
        'El inicio y la valoración no pueden superar la fecha del informe.',
      );
    if (
      [
        'gasto',
        'ingreso',
        'nomina',
        'traspaso',
        'cobro_compartido',
        'devolucion_gasto',
        'prestamo',
        'pago_deuda',
        'objetivo',
      ].includes(process) &&
      result.amount <= 0
    )
      throw Error('El importe debe ser positivo.');
    if (result.recoverable > result.amount)
      throw Error('La parte recuperable supera el importe.');
    return result;
  }
  const pairs = (items) => items.map((v) => [v, v]);
  function linkEligibility(snapshot, kind, reference, excludingMovement) {
    const t = snapshot?.tables || {},
      movements = (t.tMovimientos || []).filter(
        (m) => m.ID !== excludingMovement,
      ),
      links = (t.tVinculos || []).filter(
        (l) => l.Movimiento !== excludingMovement,
      );
    const linked = movements.filter((m) =>
      links.some(
        (l) => l.Movimiento === m.ID && l['Vinculado a'] === reference,
      ),
    );
    if (['prestamo', 'pago_deuda'].includes(kind)) {
      const debt = (t.tDeudas || []).find((d) => d.ID === reference);
      return debt
        ? Math.max(
            0,
            (debt['Saldo inicial'] || 0) +
              linked.reduce(
                (sum, m) =>
                  sum +
                  (m.Tipo === 'Préstamo recibido'
                    ? m.Importe
                    : m.Tipo === 'Devolución deuda'
                      ? -m.Importe
                      : 0),
                0,
              ),
          )
        : 0;
    }
    const original = (t.tMovimientos || []).find(
      (m) => m.ID === reference && m.Tipo === 'Gasto',
    );
    if (!original) return 0;
    return Math.max(
      0,
      kind === 'cobro_compartido'
        ? (original.Recuperable || 0) -
            linked.reduce(
              (sum, m) =>
                sum +
                (m.Tipo === 'Cobro compartido'
                  ? m.Importe
                  : m.Tipo === 'Devolución gasto'
                    ? m.Recuperable || 0
                    : 0),
              0,
            )
        : original.Importe -
            linked
              .filter((m) => m.Tipo === 'Devolución gasto')
              .reduce((sum, m) => sum + m.Importe, 0),
    );
  }
  function options(source, snapshot, process, values = {}) {
    const t = snapshot?.tables || {};
    const accounts = pairs(
      (t.tCuentas || [])
        .filter(
          (r) =>
            !snapshot?.archives?.accounts?.includes(r.Cuenta) ||
            (values._allowArchived && Object.values(values).includes(r.Cuenta)),
        )
        .map((r) => r.Cuenta),
    );
    const products = (t.tProductos || [])
      .filter(
        (r) =>
          !snapshot?.archives?.accounts?.includes(r.Cuenta) ||
          values._allowArchived,
      )
      .map((r) => [r.ID, r.Producto]);
    const map = {
      accounts,
      products,
      debts: (t.tDeudas || [])
        .filter(
          (r) =>
            process !== 'pago_deuda' ||
            linkEligibility(snapshot, process, r.ID, values._editingMovement) >
              0 ||
            values.debt === r.ID,
        )
        .map((r) => [
          r.ID,
          r.Acreedor +
            (process === 'pago_deuda'
              ? ' · pendiente ' +
                linkEligibility(
                  snapshot,
                  process,
                  r.ID,
                  values._editingMovement,
                ) +
                ' EUR'
              : ''),
        ]),
      goals: (t.tObjetivos || []).map((r) => [r.ID, r.Objetivo]),
      categories: pairs(
        (t.tCategorias || [])
          .filter(
            (r) =>
              !snapshot?.archives?.categories?.includes(r.Subcategoría) ||
              (values._allowArchived &&
                Object.values(values).includes(r.Subcategoría)),
          )
          .filter(
            (r) => r.Grupo === (process === 'gasto' ? 'Gastos' : 'Ingresos'),
          )
          .map((r) => r.Subcategoría),
      ),
      expenses: (t.tMovimientos || [])
        .filter(
          (r) =>
            r.Tipo === 'Gasto' &&
            (linkEligibility(snapshot, process, r.ID, values._editingMovement) >
              0 ||
              values.original === r.ID),
        )
        .map((r) => [
          r.ID,
          `${r.Fecha} · ${r.Concepto} · ${r.Origen} · disponible ${linkEligibility(snapshot, process, r.ID, values._editingMovement)} EUR`,
        ]),
      origins: [
        ...accounts.map(([id, name]) => [id, 'Cuenta · ' + name]),
        ...products.map(([id, name]) => [id, 'Producto · ' + name]),
      ],
      locations: pairs(['Madrid', 'Alicante', 'La Manga', 'Albacete', 'N/A']),
      classes: pairs([
        'Renta variable',
        'Renta fija',
        'Cripto',
        'Monetario',
        'Mixto',
        'Otros',
      ]),
      groups: pairs(['Gastos', 'Ingresos']),
      scopes: [
        ['desconocido', 'Hora o corte desconocido'],
        ['cierre_dia', 'Cierre del día'],
        ['intradía', 'Durante el día · hora conocida'],
      ],
      renameKinds: [
        ['cuenta', 'Cuenta'],
        ['subcategoria', 'Subcategoría'],
      ],
      renameFrom:
        values.kind === 'subcategoria'
          ? pairs((t.tCategorias || []).map((r) => r.Subcategoría))
          : accounts,
    };
    return map[source] || [];
  }
  const keys = {
    tMovimientos: ['ID'],
    tOperaciones: ['ID'],
    tProductos: ['ID'],
    tCuentas: ['Cuenta'],
    tDeudas: ['ID'],
    tNominas: ['Movimiento'],
    tObjetivos: ['ID'],
    tAsignaciones: ['Objetivo', 'Origen'],
    tPrecios: ['Producto', 'Fecha'],
    tCategorias: ['Subcategoría'],
  };
  function rowKey(table, row) {
    return Object.fromEntries((keys[table] || []).map((k) => [k, row[k]]));
  }
  function readable(table, row, snapshot) {
    const product = (id) =>
      (snapshot?.tables.tProductos || []).find((p) => p.ID === id)?.Producto ||
      'Producto sin referencia';
    const goal = (id) =>
      (snapshot?.tables.tObjetivos || []).find((p) => p.ID === id)?.Objetivo ||
      'Objetivo sin referencia';
    if (table === 'tMovimientos')
      return `${row.Fecha} · ${row.Concepto} · ${row.Importe} EUR`;
    if (table === 'tOperaciones')
      return `${row.Fecha} · ${row.Tipo} · ${product(row.Producto)}`;
    if (table === 'tPrecios')
      return `${product(row.Producto)} · ${row.Fecha} · ${row['VL EUR']} EUR`;
    if (table === 'tNominas') {
      const m = snapshot.tables.tMovimientos.find(
        (m) => m.ID === row.Movimiento,
      );
      return m ? `${m.Fecha} · ${m.Concepto}` : 'Nómina';
    }
    if (table === 'tAsignaciones')
      return `${goal(row.Objetivo)} · ${row.Importe} EUR`;
    return (
      row.Producto ||
      row.Cuenta ||
      row.Acreedor ||
      row.Objetivo ||
      row.Subcategoría ||
      'Registro'
    );
  }
  function displayValue(key, value, snapshot) {
    if (value === null || value === undefined || value === '')
      return 'Sin dato';
    const tables = snapshot?.tables || {};
    if (['product', 'Producto'].includes(key))
      return (
        (tables.tProductos || []).find((r) => r.ID === value)?.Producto || value
      );
    if (['goal', 'Objetivo'].includes(key))
      return (
        (tables.tObjetivos || []).find((r) => r.ID === value)?.Objetivo || value
      );
    if (key === 'debt')
      return (
        (tables.tDeudas || []).find((r) => r.ID === value)?.Acreedor || value
      );
    if (key === 'original')
      return readable(
        'tMovimientos',
        (tables.tMovimientos || []).find((r) => r.ID === value) || {},
        snapshot,
      );
    if (['origin', 'Origen'].includes(key))
      return (
        (tables.tProductos || []).find((r) => r.ID === value)?.Producto || value
      );
    return typeof value === 'boolean' ? (value ? 'Sí' : 'No') : String(value);
  }
  function csv(rows, columns) {
    const escape = (value) => {
      let text =
        value === null || value === undefined
          ? ''
          : typeof value === 'number'
            ? String(value).replace('.', ',')
            : String(value);
      if (/^[\s]*[=+\-@]/.test(text) && typeof value !== 'number')
        text = "'" + text;
      return '"' + text.replace(/"/g, '""') + '"';
    };
    return (
      '\ufeff' +
      [
        columns.map(([key, label]) => escape(label || key)).join(';'),
        ...rows.map((row) =>
          columns.map(([key]) => escape(row[key])).join(';'),
        ),
      ].join('\r\n')
    );
  }
  return {
    csv,
    linkEligibility,
    processes,
    operation,
    decimal,
    normalize,
    options,
    rowKey,
    readable,
    displayValue,
  };
})();
if (typeof module !== 'undefined' && module.exports)
  module.exports = FinanceDomain;
