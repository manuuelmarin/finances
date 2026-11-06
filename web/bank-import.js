'use strict';

const FinanceBankImport = (() => {
  function parse(text, separator) {
    if (
      typeof text !== 'string' ||
      text.length > 2000000 ||
      text.includes('\ufffd')
    )
      throw Error('El archivo debe ser UTF-8 y tener como máximo 2 MB.');
    if (![';', ','].includes(separator)) throw Error('Separador inválido.');
    text = text.replace(/^\uFEFF/, '');
    const rows = [];
    let row = [],
      field = '',
      quoted = false,
      ended = false;
    for (let i = 0; i <= text.length; i++) {
      const c = i === text.length ? '\n' : text[i];
      if (quoted) {
        if (c === '"' && text[i + 1] === '"') {
          field += '"';
          i++;
        } else if (c === '"') {
          quoted = false;
          ended = true;
        } else if (i === text.length) throw Error('Comillas sin cerrar.');
        else field += c;
      } else if (c === '"' && !field && !ended) quoted = true;
      else if (c === separator || c === '\r' || c === '\n') {
        row.push(field);
        field = '';
        ended = false;
        if (c !== separator) {
          if (row.some((v) => v.trim())) rows.push(row);
          row = [];
          if (c === '\r' && text[i + 1] === '\n') i++;
        }
      } else if (ended || c === '"')
        throw Error('El CSV contiene comillas ambiguas.');
      else field += c;
    }
    if (
      rows.length < 2 ||
      rows.length > 10001 ||
      rows[0].some((v) => !v.trim())
    )
      throw Error('El archivo necesita cabecera y entre 1 y 10.000 filas.');
    if (rows.some((r) => r.length !== rows[0].length))
      throw Error('Las filas no tienen el mismo número de columnas.');
    return rows;
  }
  function date(value, format) {
    const m =
      format === 'iso'
        ? value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
        : value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) throw Error('Fecha incompatible con el formato seleccionado.');
    const d = format === 'iso' ? value : `${m[3]}-${m[2]}-${m[1]}`;
    if (
      !Number.isFinite(Date.parse(d + 'T00:00:00Z')) ||
      new Date(d + 'T00:00:00Z').toISOString().slice(0, 10) !== d
    )
      throw Error('Fecha inexistente.');
    return d;
  }
  function amount(value, decimal) {
    const pattern =
      decimal === ',' ? /^-?\d+(?:,\d{1,2})?$/ : /^-?\d+(?:\.\d{1,2})?$/;
    if (!pattern.test(value))
      throw Error('Importe ambiguo: no uses separadores de miles.');
    const n = Number(value.replace(',', '.'));
    if (!Number.isFinite(n) || n === 0 || Math.abs(n) > 1e12)
      throw Error(
        'El importe debe ser distinto de cero y estar dentro de rango.',
      );
    return n;
  }
  function prepare(rows, mapping, options, snapshot) {
    const required = ['date', 'concept', 'amount', 'reference'];
    const indexes = required.map((name) => mapping[name]);
    if (
      indexes.some(
        (v) => !Number.isInteger(v) || v < 0 || v >= rows[0].length,
      ) ||
      new Set(indexes).size !== 4
    )
      throw Error(
        'Selecciona cuatro columnas distintas para fecha, concepto, importe y referencia.',
      );
    const accounts = snapshot.tables?.tCuentas || [];
    if (
      !accounts.some((a) => a.Cuenta === options.account) ||
      snapshot.archives?.accounts?.includes(options.account)
    )
      throw Error('Selecciona una cuenta activa del libro.');
    const seen = new Set();
    return rows.slice(1).map((cells, i) => {
      try {
        const concept = cells[mapping.concept].trim();
        const reference = cells[mapping.reference].trim();
        if (
          !concept ||
          concept.length > 1000 ||
          !reference ||
          reference.length > 200 ||
          /[\u0000-\u001f]/.test(concept + reference)
        )
          throw Error(
            'Concepto o referencia vacíos, demasiado largos o con caracteres de control.',
          );
        if (seen.has(reference))
          throw Error('La referencia aparece más de una vez en el archivo.');
        seen.add(reference);
        const d = date(cells[mapping.date].trim(), options.dateFormat);
        const n = amount(cells[mapping.amount].trim(), options.decimal);
        const existing = (snapshot.bankImports || []).find(
          (r) => r.account === options.account && r.reference === reference,
        );
        const possible = (snapshot.tables.tMovimientos || [])
          .filter(
            (r) =>
              r.Fecha === d &&
              r.Importe === Math.abs(n) &&
              (n < 0
                ? r.Tipo === 'Gasto' && r.Origen === options.account
                : r.Tipo === 'Ingreso' && r.Destino === options.account),
          )
          .map((r) => r.ID);
        return {
          line: i + 2,
          date: d,
          concept,
          amount: n,
          reference,
          existing: existing?.movement || null,
          possible,
        };
      } catch (error) {
        throw Error('Fila ' + (i + 2) + ': ' + error.message);
      }
    });
  }
  function bind(hooks) {
    const $ = (id) => document.getElementById(id);
    if (!$('bank-file')) return null;
    const mapping = $('bank-mapping'),
      output = $('bank-preview-rows');
    const status = $('bank-import-status'),
      confirm = $('bank-review');
    let rows = null,
      preview = null,
      bookKey = null;
    const invalidate = () => {
      preview = null;
      confirm.disabled = true;
      output.replaceChildren();
    };
    function refresh(snapshot) {
      if (bookKey !== snapshot?.bookKey) {
        bookKey = snapshot?.bookKey || null;
        rows = null;
        mapping.replaceChildren();
        $('bank-file').value = '';
        invalidate();
      }
      const account = $('bank-account'),
        selected = account.value;
      account.replaceChildren(new Option('Selecciona una cuenta', ''));
      for (const [value, label] of FinanceDomain.options(
        'accounts',
        snapshot,
        'gasto',
      ))
        account.append(new Option(label, value));
      account.value = [...account.options].some((o) => o.value === selected)
        ? selected
        : '';
      if (preview && preview.revision !== snapshot?.revision) {
        invalidate();
        status.textContent =
          'El libro ha cambiado. Vuelve a previsualizar el extracto.';
      }
    }
    for (const id of [
      'bank-account',
      'bank-separator',
      'bank-decimal',
      'bank-date-format',
    ])
      $(id).addEventListener('change', () => {
        invalidate();
        if (id === 'bank-separator') {
          rows = null;
          mapping.replaceChildren();
          $('bank-file').value = '';
        }
      });
    $('bank-file').addEventListener('change', async () => {
      invalidate();
      mapping.replaceChildren();
      rows = null;
      try {
        const file = $('bank-file').files[0];
        if (!file || file.size > 2000000)
          throw Error('Selecciona un CSV de hasta 2 MB.');
        rows = parse(await file.text(), $('bank-separator').value);
        for (const [name, label] of [
          ['date', 'Fecha'],
          ['concept', 'Concepto'],
          ['amount', 'Importe con signo'],
          ['reference', 'Referencia única bancaria'],
        ]) {
          const field = document.createElement('label');
          field.className = 'field';
          field.textContent = label;
          const select = document.createElement('select');
          select.dataset.bankColumn = name;
          select.append(new Option('Selecciona una columna', ''));
          rows[0].forEach((header, index) =>
            select.append(new Option(header.trim(), String(index))),
          );
          select.addEventListener('change', invalidate);
          field.append(select);
          mapping.append(field);
        }
        status.textContent = 'Selecciona las columnas antes de previsualizar.';
      } catch (error) {
        status.textContent = error.message || 'No se pudo leer el archivo.';
      }
    });
    $('bank-preview').addEventListener('click', () => {
      invalidate();
      try {
        const snapshot = hooks.snapshot();
        if (!snapshot?.capabilities?.bankImports)
          throw Error(
            'Actualiza y prepara Apps Script para habilitar la importación.',
          );
        if (!rows) throw Error('Selecciona un extracto CSV.');
        const selects = [...mapping.querySelectorAll('select')];
        const map = Object.fromEntries(
          selects.map((s) => [
            s.dataset.bankColumn,
            s.value === '' ? -1 : Number(s.value),
          ]),
        );
        const options = {
          account: $('bank-account').value,
          dateFormat: $('bank-date-format').value,
          decimal: $('bank-decimal').value,
        };
        const items = prepare(rows, map, options, snapshot);
        const list = document.createElement('div');
        list.className = 'bank-import-list';
        const controls = [];
        for (const item of items) {
          const block = document.createElement('article');
          block.className = 'budget-card';
          const label = document.createElement('label');
          label.className = 'check-field';
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.checked = !item.existing && !item.possible.length;
          checkbox.disabled = !!item.existing;
          const title = document.createElement('span');
          title.textContent = `${item.date} · ${item.concept} · ${item.amount.toFixed(2)} € · Ref. ${item.reference}`;
          label.append(checkbox, title);
          block.append(label);
          const note = document.createElement('p');
          note.className = 'calculator-note';
          note.textContent = item.existing
            ? 'Referencia ya registrada: ' + item.existing
            : item.possible.length
              ? 'Posible coincidencia con ' +
                item.possible.join(', ') +
                '. Revisa antes de marcar.'
              : 'Sin coincidencias por cuenta, fecha e importe.';
          block.append(note);
          const categoryLabel = document.createElement('label');
          categoryLabel.className = 'field';
          categoryLabel.textContent = 'Subcategoría';
          const category = document.createElement('select');
          category.append(new Option('Selecciona una subcategoría', ''));
          const process = item.amount < 0 ? 'gasto' : 'ingreso';
          for (const [value, label] of FinanceDomain.options(
            'categories',
            snapshot,
            process,
          ))
            category.append(new Option(label, value));
          categoryLabel.append(category);
          block.append(categoryLabel);
          list.append(block);
          controls.push({ item, checkbox, category, process });
        }
        output.append(list);
        preview = {
          revision: snapshot.revision,
          bookKey: snapshot.bookKey,
          account: options.account,
          controls,
        };
        const total =
          items.reduce((sum, item) => sum + Math.round(item.amount * 100), 0) /
          100;
        const income =
          items
            .filter((item) => item.amount > 0)
            .reduce((sum, item) => sum + Math.round(item.amount * 100), 0) /
          100;
        const expenses =
          items
            .filter((item) => item.amount < 0)
            .reduce((sum, item) => sum - Math.round(item.amount * 100), 0) /
          100;
        status.textContent = `${items.length} filas · ingresos ${income.toFixed(2)} € · gastos ${expenses.toFixed(2)} € · saldo neto ${total.toFixed(2)} €. Revisa coincidencias y asigna categorías. Máximo 20 por envío.`;
        confirm.disabled = false;
      } catch (error) {
        status.textContent = error.message || 'No se pudo previsualizar.';
      }
    });
    confirm.addEventListener('click', () => {
      try {
        const snapshot = hooks.snapshot();
        if (
          !preview ||
          preview.bookKey !== snapshot?.bookKey ||
          preview.revision !== snapshot?.revision
        )
          throw Error('El libro cambió. Vuelve a previsualizar el extracto.');
        const selected = preview.controls.filter(
          (x) => x.checkbox.checked && !x.checkbox.disabled,
        );
        if (!selected.length || selected.length > 20)
          throw Error('Selecciona entre 1 y 20 filas por envío.');
        const operations = selected.map(({ item, category, process }) => {
          if (!category.value)
            throw Error('Elige una subcategoría para cada fila seleccionada.');
          return {
            ...FinanceDomain.operation(process, {
              date: item.date,
              concept: item.concept,
              account: preview.account,
              category: category.value,
              amount: String(Math.abs(item.amount)),
              recurring: 'false',
            }),
            bankRef: item.reference,
          };
        });
        hooks.review(operations, preview.revision);
      } catch (error) {
        status.textContent = error.message || 'No se pudo preparar el envío.';
      }
    });
    return { refresh };
  }
  return { parse, prepare, bind };
})();
if (typeof module !== 'undefined' && module.exports)
  module.exports = FinanceBankImport;
