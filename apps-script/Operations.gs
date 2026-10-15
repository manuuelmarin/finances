function applyOperations_(
  initial,
  operations,
  requestId,
  now,
  deferValidation,
) {
  const s = clone_(initial),
    results = [],
    aliases = {};
  function required(o, k) {
    check_(!blank_(o[k]), 'Falta ' + k + '.');
    return o[k];
  }
  function cash(o, type, id, origin, destination, category, amount) {
    const row = putRow_(
      s,
      'tMovimientos',
      {
        ID: id,
        Fecha: serialDate_(required(o, 'date')),
        Tipo: type,
        Concepto: required(o, 'concept'),
        Subcategoría: category || null,
        Origen: origin || null,
        Destino: destination || null,
        Importe: moneyInput_(
          amount === undefined ? required(o, 'amount') : amount,
          'Importe',
        ),
        Recuperable: o.recoverable || 0,
        Localización: blank_(o.location) ? null : o.location,
        Recurrente:
          type === 'Gasto'
            ? recurrence_(blank_(o.recurring) ? 'No' : o.recurring)
            : null,
      },
      false,
    );
    s.settings.asof = Math.max(s.settings.asof, row.Fecha);
    return row;
  }
  operations.forEach((original, index) => {
    check_(object_(original), 'Operación inválida.');
    const o = clone_(original),
      p = o.process,
      allowed = PROCESS_FIELDS_[p];
    check_(
      Object.prototype.hasOwnProperty.call(PROCESS_FIELDS_, p),
      'Proceso desconocido.',
    );
    check_(
      Object.keys(o).every((k) => k === 'process' || allowed.indexOf(k) >= 0),
      'Campo desconocido, calculado o ID manual.',
    );
    if (
      !deferValidation &&
      [
        'gasto',
        'ingreso',
        'nomina',
        'traspaso',
        'prestamo',
        'pago_deuda',
        'cobro_compartido',
        'devolucion_gasto',
        'producto',
      ].includes(p)
    ) {
      ['account', 'from', 'to', 'category'].forEach((k) => {
        if (!blank_(o[k]))
          check_(
            !(s.technical.archives || []).some(
              (r) =>
                r[3] &&
                r[1] === (k === 'category' ? 'category' : 'account') &&
                r[2] === o[k],
            ),
            'Recupera la referencia archivada antes de crear una operación.',
          );
      });
    }
    if (
      !deferValidation &&
      ['compra', 'venta', 'rendimiento', 'traspaso_fondo'].includes(p)
    ) {
      const productReferences =
        p === 'traspaso_fondo' ? [o.fromProduct, o.toProduct] : [o.product];
      productReferences.forEach((ref) => {
        const product = s.tables.tProductos.find(
          (r) => r.ID === ref || r.Producto === ref,
        );
        if (product)
          check_(
            !(s.technical.archives || []).some(
              (r) => r[3] && r[1] === 'account' && r[2] === product.Cuenta,
            ),
            'Recupera la cuenta archivada antes de registrar una inversión.',
          );
      });
    }
    if (o.alias)
      check_(
        typeof o.alias === 'string' &&
          /^[A-Za-z][A-Za-z0-9_-]{0,40}$/.test(o.alias) &&
          !Object.prototype.hasOwnProperty.call(aliases, o.alias),
        'Alias inválido o duplicado.',
      );
    const id = 'MOV-' + requestId + '-' + (index + 1),
      tradeId = 'INV-' + requestId + '-' + (index + 1);
    let result = { process: p },
      primary = null;
    if (['gasto', 'ingreso', 'nomina'].indexOf(p) >= 0) {
      const a = resolveReference_(
          s,
          'tCuentas',
          required(o, 'account'),
          aliases,
          'Cuenta',
        ),
        type = p === 'gasto' ? 'Gasto' : 'Ingreso';
      const row = cash(
        o,
        type,
        id,
        p === 'gasto' ? a : null,
        p === 'gasto' ? null : a,
        required(o, 'category'),
      );
      if (p === 'nomina')
        putRow_(
          s,
          'tNominas',
          {
            Movimiento: row.ID,
            Bruto: o.gross,
            Cotización: o.contribution,
            IRPF: o.tax,
            'Otras deducciones': o.otherDeductions,
          },
          false,
        );
      primary = row.ID;
    } else if (p === 'traspaso') {
      primary = cash(
        o,
        'Transferencia',
        id,
        resolveReference_(
          s,
          'tCuentas',
          required(o, 'from'),
          aliases,
          'Origen',
        ),
        resolveReference_(s, 'tCuentas', required(o, 'to'), aliases, 'Destino'),
      ).ID;
    } else if (
      [
        'cobro_compartido',
        'devolucion_gasto',
        'prestamo',
        'pago_deuda',
      ].indexOf(p) >= 0
    ) {
      const isDebt = ['prestamo', 'pago_deuda'].indexOf(p) >= 0;
      const target = resolveReference_(
        s,
        isDebt ? 'tDeudas' : 'tMovimientos',
        required(o, isDebt ? 'debt' : 'original'),
        aliases,
        'Vínculo',
      );
      const original = s.tables.tMovimientos.find((m) => m.ID === target);
      const a = resolveReference_(
        s,
        'tCuentas',
        required(o, 'account'),
        aliases,
        'Cuenta',
      );
      const type = {
        cobro_compartido: 'Cobro compartido',
        devolucion_gasto: 'Devolución gasto',
        prestamo: 'Préstamo recibido',
        pago_deuda: 'Devolución deuda',
      }[p];
      const row = cash(
        o,
        type,
        id,
        p === 'pago_deuda' ? a : null,
        p === 'pago_deuda' ? null : a,
        p === 'devolucion_gasto' && original ? original.Subcategoría : null,
      );
      putRow_(
        s,
        'tVinculos',
        { Movimiento: row.ID, 'Vinculado a': target },
        false,
      );
      primary = row.ID;
    } else if (['compra', 'venta', 'rendimiento'].indexOf(p) >= 0) {
      const product = resolveReference_(
          s,
          'tProductos',
          required(o, 'product'),
          aliases,
          'Producto',
        ),
        prd = s.tables.tProductos.find((r) => r.ID === product);
      const type = { compra: 'Compra', venta: 'Venta', rendimiento: 'Cobro' }[
          p
        ],
        date = serialDate_(required(o, 'date'));
      if (o.historical !== undefined)
        check_(
          typeof o.historical === 'boolean',
          'historical debe ser booleano.',
        );
      check_(
        !o.historical || date < s.settings.start,
        'Histórico solo antes del inicio del seguimiento.',
      );
      const r = {
        ID: tradeId,
        Fecha: date,
        Producto: product,
        Tipo: type,
        Participaciones: type === 'Cobro' ? 0 : required(o, 'units'),
        Precio: required(o, type === 'Cobro' ? 'gross' : 'price'),
        Comisión: o.fee || 0,
        Retención: o.tax || 0,
        Movimiento: o.historical ? null : id,
      };
      if (!o.historical)
        cash(
          o,
          {
            compra: 'Compra inversión',
            venta: 'Venta inversión',
            rendimiento: 'Rendimiento inversión',
          }[p],
          id,
          p === 'compra' ? prd.Cuenta : null,
          p === 'compra' ? null : prd.Cuenta,
          null,
          money_(tradeAmount_(r)),
        );
      putRow_(s, 'tOperaciones', r, false);
      s.settings.valuation = Math.max(s.settings.valuation, date);
      primary = tradeId;
      result.movement = r.Movimiento;
    } else if (p === 'precio') {
      const r = {
        Producto: resolveReference_(
          s,
          'tProductos',
          required(o, 'product'),
          aliases,
          'Producto',
        ),
        Fecha: serialDate_(required(o, 'date')),
        'VL EUR': required(o, 'price'),
        Fuente: required(o, 'source'),
      };
      putRow_(s, 'tPrecios', r, o.replace === true);
      s.settings.valuation = Math.max(s.settings.valuation, r.Fecha);
      s.settings.asof = Math.max(s.settings.asof, r.Fecha);
      result.key = [r.Producto, isoDate_(r.Fecha)];
    } else if (p === 'cuenta') {
      check_(
        blank_(o.observed) && blank_(o.observedDate),
        'Añade la observación mediante saldo_observado para conservar su historial.',
      );
      primary = required(o, 'account');
      putRow_(
        s,
        'tCuentas',
        {
          Cuenta: primary,
          'Saldo inicial': o.opening === undefined ? 0 : o.opening,
          'Saldo real': null,
          'Fecha saldo': null,
        },
        false,
      );
    } else if (p === 'saldo_observado') {
      const account = resolveReference_(
          s,
          'tCuentas',
          required(o, 'account'),
          aliases,
          'Cuenta',
        ),
        amount = required(o, 'amount'),
        date = serialDate_(required(o, 'date'));
      number_(amount, 'Saldo observado', false, -1e12);
      const scope = o.scope || 'desconocido';
      check_(
        ['desconocido', 'cierre_dia', 'intradía'].indexOf(scope) >= 0,
        'Alcance de observación inválido.',
      );
      const time = blank_(o.time) ? null : o.time;
      check_(
        time === null ||
          (typeof time === 'string' &&
            /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(time)),
        'Hora inválida.',
      );
      if (scope === 'intradía')
        check_(time !== null, 'Una observación intradía necesita hora.');
      const source = o.source || 'usuario';
      text_(source, 'Fuente');
      const obs = [
        'OBS-' + requestId + '-' + (index + 1),
        account,
        amount,
        date,
        time,
        scope,
        source,
        now,
      ];
      s.technical.observations.push(obs);
      primary = obs[0];
      const row = s.tables.tCuentas.find((a) => a.Cuenta === account);
      if (blank_(row['Fecha saldo']) || date >= row['Fecha saldo']) {
        row['Saldo real'] = amount;
        row['Fecha saldo'] = date;
      }
      s.settings.asof = Math.max(s.settings.asof, date);
    } else if (p === 'deuda_inicial') {
      primary = 'DEU-' + requestId + '-' + (index + 1);
      putRow_(
        s,
        'tDeudas',
        {
          ID: primary,
          Acreedor: required(o, 'creditor'),
          'Saldo inicial': o.opening === undefined ? 0 : o.opening,
        },
        false,
      );
    } else if (p === 'categoria') {
      const r = {};
      ['Grupo', 'Subgrupo', 'Categoría', 'Subcategoría'].forEach(
        (h, i) =>
          (r[h] = required(
            o,
            ['group', 'subgroup', 'category', 'subcategory'][i],
          )),
      );
      putRow_(s, 'tCategorias', r, false);
      primary = r.Subcategoría;
    } else if (p === 'producto') {
      primary = 'PRO-' + requestId + '-' + (index + 1);
      putRow_(
        s,
        'tProductos',
        {
          ID: primary,
          Producto: required(o, 'name'),
          Cuenta: resolveReference_(
            s,
            'tCuentas',
            required(o, 'account'),
            aliases,
            'Cuenta',
          ),
          Clase: required(o, 'class'),
          'Fecha base': serialDate_(required(o, 'date')),
          'Unidades base': o.units === undefined ? 0 : o.units,
          'Coste base': o.cost === undefined ? 0 : o.cost,
        },
        false,
      );
      if (!blank_(o.isin))
        bindFund_(s, primary, o.isin, o.referenceName || o.name, now);
      else
        check_(
          blank_(o.referenceName),
          'El nombre de referencia necesita un ISIN.',
        );
    } else if (p === 'vincular_isin') {
      primary = resolveReference_(
        s,
        'tProductos',
        required(o, 'product'),
        aliases,
        'Producto',
      );
      bindFund_(
        s,
        primary,
        required(o, 'isin'),
        required(o, 'referenceName'),
        now,
      );
    } else if (p === 'restaurar_formulas_fondos') {
      check_(
        !(s.technical.transfers || []).some((r) => r[9]),
        'Anula todos los traspasos antes de restaurar sus fórmulas.',
      );
      s.restoreFundFormulas = true;
    } else if (p === 'traspaso_fondo') {
      const from = resolveReference_(
          s,
          'tProductos',
          required(o, 'fromProduct'),
          aliases,
          'Fondo de origen',
        ),
        to = resolveReference_(
          s,
          'tProductos',
          required(o, 'toProduct'),
          aliases,
          'Fondo de destino',
        );
      check_(from !== to, 'Elige fondos distintos.');
      check_(
        [from, to].every((id) => s.technical.funds.some((r) => r[0] === id)),
        'Configura el ISIN de ambos fondos antes del traspaso.',
      );
      const date = serialDate_(required(o, 'date'));
      ['outUnits', 'outPrice', 'inUnits', 'inPrice'].forEach((k) =>
        number_(required(o, k), k, false, 0, true),
      );
      const value = o.outUnits * o.outPrice,
        incomingValue = o.inUnits * o.inPrice;
      const settlement = moneyInput_(
        blank_(o.amount) ? money_(value) : o.amount,
        'Importe ejecutado',
      );
      check_(
        money_(value) === settlement && money_(incomingValue) === settlement,
        'Las dos partes deben liquidar el mismo importe ejecutado en céntimos.',
      );
      text_(required(o, 'concept'), 'Concepto');
      const out = tradeId + '-OUT',
        incoming = tradeId + '-IN';
      putRow_(
        s,
        'tOperaciones',
        {
          ID: out,
          Fecha: date,
          Producto: from,
          Tipo: 'Venta',
          Participaciones: o.outUnits,
          Precio: o.outPrice,
          Comisión: 0,
          Retención: 0,
          Movimiento: null,
        },
        false,
      );
      putRow_(
        s,
        'tOperaciones',
        {
          ID: incoming,
          Fecha: date,
          Producto: to,
          Tipo: 'Compra',
          Participaciones: o.inUnits,
          Precio: o.inPrice,
          Comisión: 0,
          Retención: 0,
          Movimiento: null,
        },
        false,
      );
      primary = 'TRF-' + requestId + '-' + (index + 1);
      s.technical.transfers.push([
        primary,
        date,
        from,
        to,
        out,
        incoming,
        0,
        0,
        settlement,
        1,
        now,
        o.concept,
        value,
        incomingValue,
      ]);
      s.settings.asof = Math.max(s.settings.asof, date);
      s.settings.valuation = Math.max(s.settings.valuation, date);
    } else if (p === 'anular_traspaso_fondo') {
      const transfer = s.technical.transfers.find(
        (r) => r[0] === required(o, 'id') && r[9],
      );
      check_(!!transfer, 'Traspaso desconocido.');
      [transfer[4], transfer[5]].forEach((id) =>
        dropRow_(s, 'tOperaciones', { ID: id }),
      );
      transfer[9] = 0;
      transfer[10] = now;
      primary = transfer[0];
    } else if (p === 'editar_movimiento') {
      const movement = required(o, 'movement');
      const row = s.tables.tMovimientos.find((r) => r.ID === movement);
      check_(
        row &&
          !s.tables.tNominas.some((r) => r.Movimiento === movement) &&
          !s.tables.tOperaciones.some((r) => r.Movimiento === movement),
        'Usa el editor de nómina o inversión correspondiente.',
      );
      check_(
        [
          'gasto',
          'ingreso',
          'traspaso',
          'prestamo',
          'pago_deuda',
          'cobro_compartido',
          'devolucion_gasto',
        ].includes(o.kind),
        'Tipo de movimiento inválido.',
      );
      // Remove the original only on the isolated state, then reuse the complete typed process validation.
      dropRow_(s, 'tMovimientos', { ID: movement });
      dropRow_(s, 'tVinculos', { Movimiento: movement });
      const input = Object.fromEntries(
        Object.entries(o).filter(([k]) => PROCESS_FIELDS_[o.kind].includes(k)),
      );
      const changed = applyOperations_(
        s,
        [{ process: o.kind, ...input }],
        requestId + '-edit-' + index,
        now,
        true,
      ).state;
      const replacement = changed.tables.tMovimientos.at(-1),
        temporary = replacement.ID;
      replacement.ID = movement;
      changed.tables.tVinculos.forEach((r) => {
        if (r.Movimiento === temporary) r.Movimiento = movement;
      });
      s.tables = changed.tables;
      s.settings = changed.settings;
      primary = movement;
    } else if (p === 'corregir_nomina') {
      const movement = required(o, 'movement');
      const row = s.tables.tMovimientos.find((r) => r.ID === movement);
      const payroll = s.tables.tNominas.find((r) => r.Movimiento === movement);
      check_(row && payroll, 'Nómina desconocida.');
      Object.assign(row, {
        Fecha: serialDate_(required(o, 'date')),
        Concepto: required(o, 'concept'),
        Destino: resolveReference_(
          s,
          'tCuentas',
          required(o, 'account'),
          aliases,
          'Cuenta',
        ),
        Subcategoría: required(o, 'category'),
        Importe: moneyInput_(required(o, 'amount'), 'Neto'),
        Localización: blank_(o.location) ? null : o.location,
      });
      Object.assign(payroll, {
        Bruto: blank_(o.gross) ? null : o.gross,
        Cotización: blank_(o.contribution) ? null : o.contribution,
        IRPF: blank_(o.tax) ? null : o.tax,
        'Otras deducciones': blank_(o.otherDeductions)
          ? null
          : o.otherDeductions,
      });
      s.settings.asof = Math.max(s.settings.asof, row.Fecha);
      primary = movement;
    } else if (p === 'archivar') {
      check_(
        ['account', 'category'].includes(o.kind) &&
          typeof o.archived === 'boolean',
        'Archivo inválido.',
      );
      const reference = resolveReference_(
        s,
        o.kind === 'account' ? 'tCuentas' : 'tCategorias',
        required(o, 'reference'),
        aliases,
        'Referencia',
      );
      const rows = s.technical.archives;
      let row = rows.find((r) => r[1] === o.kind && r[2] === reference);
      if (!row) {
        row = [
          'ARC-' + requestId + '-' + (index + 1),
          o.kind,
          reference,
          0,
          now,
        ];
        rows.push(row);
      }
      row[3] = o.archived ? 1 : 0;
      row[4] = now;
      primary = row[0];
    } else if (p === 'plantilla' || p === 'quitar_plantilla') {
      const rows = s.technical.templates;
      let row = blank_(o.id) ? null : rows.find((r) => r[0] === o.id);
      if (!blank_(o.id)) check_(!!row, 'Plantilla desconocida.');
      if (p === 'quitar_plantilla') {
        check_(row && row[3], 'Plantilla inexistente.');
        row[3] = 0;
      } else {
        text_(required(o, 'name'), 'Nombre');
        check_(
          object_(o.operation) &&
            [
              'gasto',
              'ingreso',
              'nomina',
              'traspaso',
              'prestamo',
              'pago_deuda',
              'cobro_compartido',
              'devolucion_gasto',
            ].includes(o.operation.process),
          'Proceso de plantilla inválido.',
        );
        // Validate the typed financial input on an isolated copy; saving never applies it.
        applyOperations_(s, [o.operation], 'template-validation', now);
        const value = JSON.stringify(o.operation);
        check_(value.length <= 5000, 'Plantilla demasiado larga.');
        if (!row) {
          row = ['TPL-' + requestId + '-' + (index + 1), o.name, value, 1, now];
          rows.push(row);
        } else {
          row[1] = o.name;
          row[2] = value;
          row[3] = 1;
        }
      }
      row[4] = now;
      primary = row[0];
    } else if (p === 'obligacion' || p === 'quitar_obligacion') {
      const rows = s.technical.planned;
      let row = blank_(o.id) ? null : rows.find((r) => r[0] === o.id);
      if (!blank_(o.id)) check_(!!row, 'Obligación desconocida.');
      if (p === 'quitar_obligacion') {
        check_(row && row[7], 'Obligación inexistente.');
        row[7] = 0;
      } else {
        check_(
          ['expense', 'income'].includes(o.kind),
          'Tipo de obligación inválido.',
        );
        text_(required(o, 'concept'), 'Concepto');
        const account = resolveReference_(
          s,
          'tCuentas',
          required(o, 'account'),
          aliases,
          'Cuenta',
        );
        const category = resolveReference_(
          s,
          'tCategorias',
          required(o, 'category'),
          aliases,
          'Subcategoría',
        );
        check_(
          s.tables.tCategorias.some(
            (c) =>
              c.Subcategoría === category &&
              c.Grupo === (o.kind === 'expense' ? 'Gastos' : 'Ingresos'),
          ),
          'Grupo de obligación incompatible.',
        );
        const values = [
          serialDate_(required(o, 'date')),
          o.concept,
          account,
          category,
          moneyInput_(required(o, 'amount'), 'Importe'),
          o.kind,
          1,
          now,
        ];
        if (!row) {
          row = ['PLN-' + requestId + '-' + (index + 1), ...values];
          rows.push(row);
        } else row.splice(1, 8, ...values);
      }
      row[8] = now;
      primary = row[0];
    } else if (
      p === 'presupuesto_intervalo' ||
      p === 'quitar_presupuesto_intervalo'
    ) {
      if (!s.tech.intervalBudgets)
        fail_(
          'UPDATE_REQUIRED',
          'Prepara el backend para límites por intervalo.',
        );
      const rows = s.technical.intervalBudgets;
      let row;
      if (p === 'quitar_presupuesto_intervalo') {
        const id = required(o, 'id');
        check_(
          typeof id === 'string' && /^BUD-I-[A-Za-z0-9-]{1,100}$/.test(id),
          'ID de límite inválido.',
        );
        row = rows.find((r) => r[0] === id && r[6]);
        check_(row, 'Límite inexistente.');
        row[6] = 0;
      } else {
        const title = required(o, 'title'),
          start = required(o, 'start'),
          end = blank_(o.end) ? null : o.end,
          category = blank_(o.category) ? null : o.category,
          amount = required(o, 'amount');
        text_(title, 'Título');
        const startSerial = serialDate_(start),
          endSerial = end === null ? null : serialDate_(end);
        check_(
          endSerial === null || endSerial >= startSerial,
          'La fecha final debe ser igual o posterior a la inicial.',
        );
        if (category !== null)
          check_(
            s.tables.tCategorias.some(
              (c) => c.Subcategoría === category && c.Grupo === 'Gastos',
            ),
            'Subcategoría de gasto desconocida.',
          );
        moneyInput_(amount, 'Límite');
        const id = blank_(o.id) ? null : o.id;
        if (id !== null) {
          check_(
            typeof id === 'string' && /^BUD-I-[A-Za-z0-9-]{1,100}$/.test(id),
            'ID de límite inválido.',
          );
          row = rows.find((r) => r[0] === id && r[6]);
          check_(row, 'Límite inexistente.');
          row.splice(1, 6, title, startSerial, endSerial, category, amount, 1);
        } else {
          row = [
            'BUD-I-' + requestId + '-' + (index + 1),
            title,
            startSerial,
            endSerial,
            category,
            amount,
            1,
            now,
          ];
          rows.push(row);
        }
      }
      row[7] = now;
      primary = row[0];
    } else if (p === 'presupuesto' || p === 'quitar_presupuesto') {
      const month = required(o, 'month');
      check_(
        typeof month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(month),
        'Mes inválido.',
      );
      serialDate_(month + '-01');
      const category = blank_(o.category) ? null : o.category;
      if (category !== null)
        check_(
          s.tables.tCategorias.some(
            (c) => c.Subcategoría === category && c.Grupo === 'Gastos',
          ),
          'Subcategoría de gasto desconocida.',
        );
      const rows = s.technical.budgets;
      let row = rows.find((r) => r[1] === month && r[2] === category);
      if (p === 'quitar_presupuesto') {
        check_(row && row[4], 'Presupuesto inexistente.');
        row[4] = 0;
      } else {
        const amount = required(o, 'amount');
        number_(amount, 'Límite mensual', false);
        check_(
          Math.abs(amount - money_(amount)) < 1e-7,
          'Límite mensual: máximo dos decimales.',
        );
        if (row) {
          row[3] = amount;
          row[4] = 1;
        } else {
          row = [
            'BUD-' + requestId + '-' + (index + 1),
            month,
            category,
            amount,
            1,
            now,
          ];
          rows.push(row);
        }
      }
      row[5] = now;
      primary = row[0];
    } else if (p === 'objetivo') {
      primary = 'OBJ-' + requestId + '-' + (index + 1);
      putRow_(
        s,
        'tObjetivos',
        {
          ID: primary,
          Objetivo: required(o, 'name'),
          Meta: required(o, 'amount'),
          Fecha: blank_(o.date) ? null : serialDate_(o.date),
        },
        false,
      );
    } else if (p === 'asignacion') {
      const goal = resolveReference_(
        s,
        'tObjetivos',
        required(o, 'goal'),
        aliases,
        'Objetivo',
      );
      let origin = o.origin;
      if (typeof origin === 'string' && origin.charAt(0) === '$')
        origin = aliases[origin.slice(1)];
      if (!s.tables.tCuentas.some((a) => a.Cuenta === origin))
        origin = resolveReference_(s, 'tProductos', origin, aliases, 'Origen');
      putRow_(
        s,
        'tAsignaciones',
        { Objetivo: goal, Origen: origin, Importe: required(o, 'amount') },
        true,
      );
      result.key = [goal, origin];
    } else if (p === 'fechas') {
      Object.keys(PARAMETER_NAMES_).forEach((k) => {
        if (o[k] !== undefined) s.settings[k] = serialDate_(o[k]);
      });
    } else if (p === 'corregir') {
      const name = required(o, 'table');
      check_(
        Object.prototype.hasOwnProperty.call(INPUT_SCHEMA_, name) &&
          object_(o.key) &&
          object_(o.changes) &&
          Object.keys(o.changes).length > 0,
        'Corrección incompleta.',
      );
      const key = normalizeRow_(name, o.key),
        row = s.tables[name].find(
          (r) => rowKey_(name, r) === rowKey_(name, key),
        );
      if (!row) fail_('NOT_FOUND', 'Registro desconocido.');
      check_(
        Object.keys(o.changes).every(
          (k) =>
            INPUT_SCHEMA_[name].inputs.indexOf(k) >= 0 &&
            keyFields_(name).indexOf(k) < 0,
        ),
        'No se corrigen claves ni columnas calculadas.',
      );
      if (name === 'tCuentas')
        check_(
          !Object.prototype.hasOwnProperty.call(o.changes, 'Saldo real') &&
            !Object.prototype.hasOwnProperty.call(o.changes, 'Fecha saldo'),
          'Usa saldo_observado para conservar las observaciones.',
        );
      if (name === 'tOperaciones')
        check_(
          !(s.technical.transfers || []).some(
            (r) => r[9] && [r[4], r[5]].includes(row.ID),
          ),
          'Anula el traspaso completo antes de sustituirlo.',
        );
      if (name === 'tOperaciones')
        check_(
          !Object.prototype.hasOwnProperty.call(o.changes, 'Movimiento'),
          'El movimiento enlazado lo administra el backend.',
        );
      if (
        name === 'tMovimientos' &&
        s.tables.tOperaciones.some((r) => r.Movimiento === row.ID)
      )
        check_(
          Object.keys(o.changes).every(
            (k) => ['Concepto', 'Localización'].indexOf(k) >= 0,
          ),
          'Corrige la operación de inversión para cambiar su efectivo.',
        );
      putRow_(s, name, Object.assign({}, row, o.changes), true);
      if (name === 'tOperaciones' || name === 'tProductos')
        synchronizeTradeCash_(s);
      s.tables.tMovimientos.forEach(
        (m) => (s.settings.asof = Math.max(s.settings.asof, m.Fecha)),
      );
      s.tables.tOperaciones.forEach(
        (r) => (s.settings.valuation = Math.max(s.settings.valuation, r.Fecha)),
      );
    } else if (p === 'renombrar') {
      const spec = {
        cuenta: ['tCuentas', 'Cuenta'],
        subcategoria: ['tCategorias', 'Subcategoría'],
      }[o.kind];
      check_(
        !!spec,
        'Solo se renombran cuentas o subcategorías; los IDs internos permanecen estables.',
      );
      const [name, field] = spec,
        old = required(o, 'from'),
        value = required(o, 'to');
      text_(value, 'Nuevo nombre');
      const row = s.tables[name].find((r) => r[field] === old);
      if (!row) fail_('NOT_FOUND', 'Nombre anterior desconocido.');
      check_(
        !s.tables[name].some((r) => r[field] === value),
        'Nombre ya utilizado.',
      );
      row[field] = value;
      const refs =
        o.kind === 'cuenta'
          ? {
              tMovimientos: ['Origen', 'Destino'],
              tProductos: ['Cuenta'],
              tAsignaciones: ['Origen'],
            }
          : { tMovimientos: ['Subcategoría'] };
      Object.keys(refs).forEach((t) =>
        s.tables[t].forEach((r) =>
          refs[t].forEach((k) => {
            if (r[k] === old) r[k] = value;
          }),
        ),
      );
      if (o.kind === 'cuenta')
        s.technical.observations.forEach((r) => {
          if (r[1] === old) r[1] = value;
        });
      if (o.kind === 'subcategoria')
        s.technical.budgets.forEach((r) => {
          if (r[2] === old) {
            r[2] = value;
            r[5] = now;
          }
        });
      if (o.kind === 'subcategoria')
        (s.technical.intervalBudgets || []).forEach((r) => {
          if (r[4] === old) {
            r[4] = value;
            r[7] = now;
          }
        });
      (s.technical.archives || []).forEach((r) => {
        if (
          r[1] === (o.kind === 'cuenta' ? 'account' : 'category') &&
          r[2] === old
        )
          r[2] = value;
      });
      (s.technical.planned || []).forEach((r) => {
        const i = o.kind === 'cuenta' ? 3 : 4;
        if (r[i] === old) r[i] = value;
      });
      (s.technical.templates || []).forEach((r) => {
        const op = JSON.parse(r[2]);
        const keys =
          o.kind === 'cuenta' ? ['account', 'from', 'to'] : ['category'];
        keys.forEach((k) => {
          if (op[k] === old) op[k] = value;
        });
        r[2] = JSON.stringify(op);
      });
      // Conserva los filtros existentes; el adaptador de escritura actualiza la selección si coincide.
      s.renames = (s.renames || []).concat([
        { kind: o.kind, from: old, to: value },
      ]);
      primary = value;
    } else if (p === 'eliminar') {
      const name = required(o, 'table');
      check_(
        Object.prototype.hasOwnProperty.call(INPUT_SCHEMA_, name) &&
          object_(o.key),
        'Anulación incompleta.',
      );
      const key = normalizeRow_(name, o.key);
      if (name === 'tOperaciones')
        check_(
          !(s.technical.transfers || []).some(
            (r) => r[9] && [r[4], r[5]].includes(key.ID),
          ),
          'Anula las dos partes del traspaso juntas.',
        );
      const row = dropRow_(s, name, key);
      if (row && name === 'tMovimientos') {
        s.tables.tOperaciones = s.tables.tOperaciones.filter(
          (r) => r.Movimiento !== row.ID,
        );
        s.tables.tNominas = s.tables.tNominas.filter(
          (r) => r.Movimiento !== row.ID,
        );
        s.tables.tVinculos = s.tables.tVinculos.filter(
          (r) => r.Movimiento !== row.ID,
        );
      }
      if (
        row &&
        name === 'tOperaciones' &&
        row.Movimiento &&
        !s.tables.tOperaciones.some((r) => r.Movimiento === row.Movimiento)
      )
        dropRow_(s, 'tMovimientos', { ID: row.Movimiento });
      if (row && name === 'tOperaciones') synchronizeTradeCash_(s);
      if (row && name === 'tObjetivos')
        s.tables.tAsignaciones = s.tables.tAsignaciones.filter(
          (r) => r.Objetivo !== row.ID,
        );
      result.result = row ? 'anulado' : 'ya ausente';
    }
    if (primary !== null) {
      result.id = primary;
      if (o.alias) aliases[o.alias] = primary;
    }
    results.push(result);
  });
  if (!deferValidation) {
    refreshTransferBases_(s);
    validateFinancialState_(s);
  }
  s.revision = revision_(s);
  return { state: s, results };
}
