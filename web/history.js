/* Owner-reviewed historical NAV exports. This module never requests remote URLs. */
(function (root) {
  'use strict';
  const columns = [
    'isin',
    'referenceName',
    'classCurrency',
    'quoteCurrency',
    'date',
    'price',
    'provider',
    'sourceUrl',
    'exportedAt',
  ];
  function csv(text) {
    if (typeof text !== 'string' || text.length > 2000000)
      throw Error('Archivo demasiado grande.');
    text = text.replace(/^\uFEFF/, '');
    const first = text.split(/\r?\n/)[0],
      separator = first.includes(';') ? ';' : ',';
    const rows = [];
    let row = [],
      field = '',
      quoted = false,
      afterQuote = false;
    for (let i = 0; i <= text.length; i++) {
      const c = i === text.length ? '\n' : text[i];
      if (quoted) {
        if (c === '"' && text[i + 1] === '"') {
          field += '"';
          i++;
        } else if (c === '"') {
          quoted = false;
          afterQuote = true;
        } else if (i === text.length) throw Error('Comillas sin cerrar.');
        else field += c;
      } else if (c === '"' && !field && !afterQuote) quoted = true;
      else if (c === separator || c === '\n' || c === '\r') {
        row.push(field);
        field = '';
        afterQuote = false;
        if (c !== separator) {
          if (row.some((v) => v.trim())) rows.push(row);
          row = [];
          if (c === '\r' && text[i + 1] === '\n') i++;
        }
      } else if (afterQuote || c === '"') throw Error('CSV ambiguo.');
      else field += c;
    }
    if (
      rows.length < 2 ||
      rows.length > 10001 ||
      rows[0].join('|') !== columns.join('|')
    )
      throw Error('Usa las nueve columnas de la plantilla CSV.');
    const dates = new Set();
    return rows
      .slice(1)
      .map((cells, index) => {
        if (
          cells.length !== columns.length ||
          cells.some(
            (v) => /^[\s]*[=+@-]/.test(v) || /[\u0000-\u001f<>]/.test(v),
          )
        )
          throw Error(
            'Texto inseguro o columnas incorrectas en fila ' + (index + 2),
          );
        const result = Object.fromEntries(
          columns.map((c, i) => [c, cells[i].trim()]),
        );
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(result.date) ||
          !Number.isFinite(Date.parse(result.date + 'T00:00:00Z')) ||
          new Date(result.date + 'T00:00:00Z').toISOString().slice(0, 10) !==
            result.date
        )
          throw Error('Fecha inexistente en fila ' + (index + 2));
        if (dates.has(result.date))
          throw Error('Fecha duplicada: ' + result.date);
        dates.add(result.date);
        if (!/^\d+(?:[.,]\d{1,12})?$/.test(result.price))
          throw Error('NAV ambiguo en fila ' + (index + 2));
        result.price = Number(result.price.replace(',', '.'));
        if (
          !Number.isFinite(result.price) ||
          result.price <= 0 ||
          result.price > 1e12
        )
          throw Error('NAV fuera de rango.');
        result.sourceUrl = result.sourceUrl || null;
        return result;
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }
  function bind(hooks) {
    const $ = (id) => document.getElementById(id);
    if (!$('history-preview')) return;
    let pending = null,
      fileRows = [],
      offset = 0,
      fileKey = '',
      bookKey = null,
      submitted = null;
    const invalidate = () => {
      pending = null;
      $('history-confirm').disabled = true;
    };
    for (const id of [
      'history-file',
      'history-product',
      'history-source-verified',
    ])
      $(id).addEventListener('change', invalidate);
    const selection = (snap) => {
      if (bookKey !== snap.bookKey) {
        bookKey = snap.bookKey;
        fileKey = '';
        fileRows = [];
        offset = 0;
        submitted = null;
        invalidate();
        $('history-product').replaceChildren();
        $('history-product').dataset.choices = '';
        $('history-output').textContent = '';
      }
      const current = $('history-product').value,
        choices = snap.prices || [];
      const signature = choices.map((p) => p.product + ':' + p.name).join('|');
      if ($('history-product').dataset.choices !== signature) {
        $('history-product').replaceChildren();
        for (const p of choices) {
          const option = document.createElement('option');
          option.value = p.product;
          option.textContent = p.name;
          $('history-product').append(option);
        }
        if (choices.some((p) => p.product === current))
          $('history-product').value = current;
        $('history-product').dataset.choices = signature;
        invalidate();
      }
    };
    $('history-preview').addEventListener('click', async () => {
      invalidate();
      try {
        const snap = hooks.getSnapshot();
        if (!snap) throw Error('Conecta y lee el libro antes de importar.');
        selection(snap);
        if (submitted) {
          const receipt = await hooks.receipt(submitted.requestId);
          if (receipt?.status === 'discarded') {
            submitted = null;
          } else {
            const rows = snap.tables?.tPrecios || [];
            if (
              receipt?.status !== 'confirmed' ||
              !submitted.rows.every((r) =>
                rows.some(
                  (p) =>
                    p.Producto === submitted.product &&
                    p.Fecha === r.date &&
                    p['VL EUR'] === r.price,
                ),
              )
            )
              throw Error(
                'El lote anterior sigue pendiente o necesita una lectura confirmada. Revísalo en la cola; si fue rechazado, descártalo allí y vuelve a previsualizar.',
              );
            offset += submitted.rows.length;
            submitted = null;
          }
        }
        const file = $('history-file').files[0];
        if (!file || file.size > 2000000)
          throw Error('Selecciona un CSV de hasta 2 MB.');
        if (!$('history-source-verified').checked)
          throw Error('Confirma la clase y la procedencia del exportado.');
        const key = [
          snap.bookKey,
          file.name,
          file.size,
          file.lastModified,
          $('history-product').value,
        ].join('|');
        if (fileKey !== key) {
          fileRows = csv(await file.text());
          offset = 0;
          fileKey = key;
        }
        if (offset >= fileRows.length)
          throw Error(
            'Todos los lotes se han enviado; revisa su confirmación en la cola.',
          );
        const payload = {
          action: 'previewPriceHistory',
          product: $('history-product').value,
          rows: fileRows.slice(offset, offset + 20),
          expectedRevision: snap.revision,
          bookKey: snap.bookKey,
          sourceVerified: true,
        };
        const result = await hooks.preview(payload);
        if (!result.ok) throw Error(result.message || result.error);
        const current = hooks.getSnapshot();
        if (
          !current ||
          current.bookKey !== snap.bookKey ||
          current.revision !== snap.revision ||
          file !== $('history-file').files[0] ||
          payload.product !== $('history-product').value ||
          !$('history-source-verified').checked
        )
          throw Error(
            'La selección o el libro cambió; vuelve a previsualizar.',
          );
        $('history-output').textContent =
          result.rows
            .map((r) =>
              [
                r.date,
                r.price + ' EUR',
                r.isin,
                r.referenceName,
                r.classCurrency,
                r.provider,
                r.sourceUrl || 'Documento del dueño',
                r.exportedAt,
                r.verification,
                r.status,
              ].join(' · '),
            )
            .join('\n') +
          '\nLote ' +
          (Math.floor(offset / 20) + 1) +
          ' de ' +
          Math.ceil(fileRows.length / 20) +
          '. Solo fechas publicadas; sin interpolar.';
        if (result.canImport) {
          pending = { payload, revision: snap.revision, bookKey: snap.bookKey };
          $('history-confirm').disabled = false;
        } else hooks.status('Hay conflictos de NAV. El lote no se importará.');
      } catch (error) {
        hooks.status(error.message);
      }
    });
    $('history-confirm').addEventListener('click', async () => {
      try {
        const selected = pending,
          snap = hooks.getSnapshot();
        invalidate();
        if (
          !selected ||
          !snap ||
          selected.revision !== snap.revision ||
          selected.bookKey !== snap.bookKey
        )
          throw Error('El libro cambió; vuelve a previsualizar.');
        const queued = await hooks.enqueue(
          'Importar histórico · lote ' + (Math.floor(offset / 20) + 1),
          'importPriceHistory',
          {
            product: selected.payload.product,
            rows: selected.payload.rows,
            sourceVerified: true,
          },
        );
        if (!queued?.requestId)
          throw Error(
            'No se ha identificado el receipt; revisa la cola antes de continuar.',
          );
        submitted = {
          requestId: queued.requestId,
          rows: selected.payload.rows,
          product: selected.payload.product,
        };
        hooks.status(
          'Lote histórico en cola. Confirma su resultado y vuelve a leer antes del siguiente lote.',
        );
      } catch (error) {
        hooks.status(error.message);
      }
    });
    $('history-product').addEventListener('focus', () => {
      const snap = hooks.getSnapshot();
      if (snap) selection(snap);
    });
    return {
      refresh: (snap) => {
        if (!snap || (bookKey && snap.bookKey !== bookKey)) {
          invalidate();
          fileRows = [];
          offset = 0;
          fileKey = '';
          submitted = null;
          $('history-file').value = '';
          $('history-source-verified').checked = false;
          $('history-output').textContent = '';
          $('history-product').replaceChildren();
          $('history-product').dataset.choices = '';
          if (!snap) {
            bookKey = null;
            return;
          }
        }
        if (
          pending &&
          (pending.bookKey !== snap.bookKey ||
            pending.revision !== snap.revision)
        )
          invalidate();
        selection(snap);
      },
    };
  }
  root.FinanceHistory = Object.freeze({ csv, bind });
  if (typeof module !== 'undefined' && module.exports) module.exports = { csv };
})(typeof window === 'undefined' ? globalThis : window);
