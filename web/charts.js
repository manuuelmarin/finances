'use strict';

// Presentation only: every value is supplied by Sheets or a read-only projection.
const FinanceCharts = (() => {
  const finite = (n) => typeof n === 'number' && Number.isFinite(n);
  const money = new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  });
  const number = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });
  const dateLabel = (value) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value || '')
      ? new Intl.DateTimeFormat('es-ES', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          timeZone: 'UTC',
        }).format(new Date(value + 'T00:00:00Z'))
      : /^\d{4}-\d{2}(?:$| ·)/.test(value || '')
        ? new Intl.DateTimeFormat('es-ES', {
            month: 'short',
            year: 'numeric',
            timeZone: 'UTC',
          }).format(new Date(value.slice(0, 7) + '-01T00:00:00Z')) +
          value.slice(7)
        : value || '';
  const tones = [
    'chart-mint',
    'chart-blue',
    'chart-red',
    'chart-lilac',
    'chart-gold',
    'chart-copper',
  ];
  const cleanup = new WeakMap();
  const redraw = new Map();
  const repaint = () => {
    for (const [node, draw] of redraw)
      if (node.isConnected && node.getClientRects().length) draw();
  };
  new MutationObserver(repaint).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme', 'data-color-scheme', 'class'],
  });
  window
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', repaint);
  let chartSequence = 0;
  const html = (tag, text, cls) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  };
  const svg = (tag, attrs = {}, text) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attrs))
      node.setAttribute(key, value);
    if (text !== undefined) node.textContent = text;
    return node;
  };
  function clear(parent) {
    if (!parent) return;
    for (const node of parent.querySelectorAll('[data-chart-root]'))
      cleanup.get(node)?.();
    parent.replaceChildren();
  }
  function card(parent, title, description) {
    const article = html('article', undefined, 'chart-card');
    article.dataset.chartRoot = '';
    const head = html('div', undefined, 'chart-heading');
    head.append(html('h3', title));
    article.append(head);
    if (description) {
      const information = html('details', undefined, 'chart-explanation');
      const toggle = html('summary', 'i');
      toggle.setAttribute('aria-label', 'Información sobre ' + title);
      information.append(toggle, html('p', description));
      head.append(information);
    }
    parent.append(article);
    return article;
  }
  function dataTable(
    parent,
    title,
    rows,
    fields,
    format,
    { firstColumn = 'Fecha / categoría', toggleLabel = 'Ver datos' } = {},
  ) {
    const details = html('details', undefined, 'chart-data');
    details.append(html('summary', toggleLabel));
    const wrap = html('div', undefined, 'table-responsive');
    const table = html('table', undefined, 'chart-table');
    table.append(html('caption', title));
    const columns = [
      {
        label: firstColumn,
        value: (row) => row.date || row.label,
        numeric: false,
      },
      ...fields.map((field) => ({
        label: field.label,
        value: (row) => row[field.key],
        numeric: true,
        field,
      })),
    ];
    const filters = columns.map(() => '');
    const headers = [];
    let sortColumn = null,
      direction = 'none';
    const normalize = (text) =>
      String(text)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('es-ES');
    const known = (column, value) =>
      column.numeric
        ? finite(value)
        : value !== null && value !== undefined && value !== '';
    const display = (column, value) =>
      known(column, value)
        ? column.numeric
          ? format(value, column.field)
          : String(value)
        : 'Sin dato';
    function matches(column, value, query) {
      if (!query.trim()) return true;
      // Comparisons use raw numbers, never rounded currency text.
      const comparison =
        column.numeric &&
        query.trim().match(/^(>=|<=|>|<|=)\s*(-?\d+(?:[.,]\d+)?)$/);
      if (comparison) {
        if (!finite(value)) return false;
        const threshold = Number(comparison[2].replace(',', '.'));
        if (!Number.isFinite(threshold)) return false;
        switch (comparison[1]) {
          case '>':
            return value > threshold;
          case '<':
            return value < threshold;
          case '>=':
            return value >= threshold;
          case '<=':
            return value <= threshold;
          case '=':
            return value === threshold;
        }
      }
      return normalize(display(column, value)).includes(
        normalize(query.trim()),
      );
    }
    const thead = html('thead'),
      headings = html('tr'),
      filterRow = html('tr', undefined, 'table-filter-row');
    const tbody = html('tbody');
    const status = html('p', undefined, 'chart-description');
    status.setAttribute('aria-live', 'polite');
    function renderRows() {
      const selected = rows
        .map((row, index) => ({ row, index }))
        .filter(({ row }) =>
          columns.every((column, i) =>
            matches(column, column.value(row), filters[i]),
          ),
        );
      if (sortColumn !== null && direction !== 'none') {
        const column = columns[sortColumn];
        selected.sort((a, b) => {
          const av = column.value(a.row),
            bv = column.value(b.row);
          const ak = known(column, av),
            bk = known(column, bv);
          if (ak !== bk) return ak ? -1 : 1;
          if (!ak) return a.index - b.index;
          const order = column.numeric
            ? av - bv
            : String(av).localeCompare(String(bv), 'es-ES', { numeric: true });
          return (
            (direction === 'ascending' ? order : -order) || a.index - b.index
          );
        });
      }
      tbody.replaceChildren();
      for (const { row } of selected) {
        const line = html('tr');
        columns.forEach((column, i) => {
          const cell = html(
            i === 0 ? 'th' : 'td',
            display(column, column.value(row)),
          );
          if (i === 0) cell.scope = 'row';
          line.append(cell);
        });
        tbody.append(line);
      }
      if (!selected.length) {
        const line = html('tr'),
          cell = html('td', 'No hay datos para estos filtros.');
        cell.colSpan = columns.length;
        line.append(cell);
        tbody.append(line);
      }
      status.textContent =
        selected.length +
        ' de ' +
        rows.length +
        ' filas. Filtra por texto; en importes puedes usar >, <, >=, <= o = (ejemplo: > 100).';
    }
    columns.forEach((column, i) => {
      const th = html('th');
      th.scope = 'col';
      th.setAttribute('aria-sort', 'none');
      headers.push(th);
      const button = html('button', column.label, 'column-sort');
      button.type = 'button';
      button.setAttribute('aria-label', 'Ordenar por ' + column.label);
      button.addEventListener('click', () => {
        direction =
          sortColumn !== i || direction === 'none'
            ? 'ascending'
            : direction === 'ascending'
              ? 'descending'
              : 'none';
        sortColumn = direction === 'none' ? null : i;
        headers.forEach((header, index) =>
          header.setAttribute(
            'aria-sort',
            sortColumn === index ? direction : 'none',
          ),
        );
        renderRows();
      });
      th.append(button);
      headings.append(th);
      const filterCell = html('td');
      const input = html('input', undefined, 'column-filter');
      input.type = 'search';
      input.placeholder = column.numeric ? 'Texto o > 100' : 'Filtrar';
      input.setAttribute('aria-label', 'Filtrar ' + column.label);
      input.addEventListener('input', () => {
        filters[i] = input.value;
        renderRows();
      });
      filterCell.append(input);
      filterRow.append(filterCell);
    });
    thead.append(headings, filterRow);
    table.append(thead, tbody);
    wrap.append(table);
    details.append(wrap, status);
    parent.append(details);
    renderRows();
    return (nextRows) => {
      rows = nextRows;
      renderRows();
    };
  }
  function chartMenu(article, title, getSvg, rows, fields, legendItems) {
    const details = html('details', undefined, 'chart-menu');
    const summary = html('summary', '…');
    summary.setAttribute('aria-label', 'Acciones del gráfico: ' + title);
    summary.tabIndex = 0;
    const actions = html('div', undefined, 'chart-menu-actions');
    details.append(summary, actions);
    const slug =
      String(title || 'grafico')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'grafico';
    const add = (label, action) => {
      const b = html('button', label);
      b.type = 'button';
      b.addEventListener('click', action);
      actions.append(b);
    };
    const download = (blob, ext) => {
      const a = html('a', '');
      a.href = URL.createObjectURL(blob);
      a.download = slug + '.' + ext;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    const snapshot = () => {
      const source = getSvg();
      if (!source) return null;
      const clone = source.cloneNode(true);
      const presentation = [
        'fill',
        'fill-opacity',
        'fill-rule',
        'stroke',
        'stroke-width',
        'stroke-opacity',
        'stroke-dasharray',
        'stroke-dashoffset',
        'stroke-linecap',
        'stroke-linejoin',
        'opacity',
        'font-family',
        'font-size',
        'font-weight',
        'font-style',
        'text-anchor',
        'dominant-baseline',
        'visibility',
        'shape-rendering',
      ];
      const originals = [source, ...source.querySelectorAll('*')];
      const copies = [clone, ...clone.querySelectorAll('*')];
      originals.forEach((original, index) => {
        const styles = getComputedStyle(original);
        for (const property of presentation) {
          const value = styles.getPropertyValue(property);
          if (value) copies[index].setAttribute(property, value);
        }
        if (original.tagName.toLowerCase() === 'text')
          copies[index].setAttribute('fill', '#263442');
      });
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clone.setAttribute('width', source.viewBox.baseVal.width || 1000);
      const baseHeight =
        source.viewBox.baseVal.height ||
        Number(source.getAttribute('height')) ||
        600;
      const baseWidth = source.viewBox.baseVal.width || 1000;
      const hasRange = Boolean(source.dataset.range);
      const items = legendItems();
      const columns = baseWidth >= 640 ? 2 : 1;
      const colWidth = (baseWidth - 24) / columns;
      const maxChars = Math.max(12, Math.floor((colWidth - 20) / 7));
      const wrapLabel = (text, limit = maxChars) => {
        const lines = [''];
        for (const word of String(text).match(
          new RegExp('.{1,' + limit + '}', 'g'),
        ) || []) {
          if (lines.at(-1).length + word.length > limit && lines.at(-1))
            lines.push('');
          lines[lines.length - 1] += (lines.at(-1) ? ' ' : '') + word;
        }
        return lines;
      };
      const itemLines = items.map((item) => wrapLabel(item.label));
      const titleLines = wrapLabel(
        title,
        Math.max(12, Math.floor((baseWidth - 24) / 9)),
      );
      const rowHeights = Array.from(
        { length: Math.ceil(items.length / columns) },
        (_, row) =>
          Math.max(
            ...itemLines
              .slice(row * columns, (row + 1) * columns)
              .map((lines) => lines.length),
          ) *
            17 +
          10,
      );
      const legendStart =
        baseHeight + titleLines.length * 22 + (hasRange ? 36 : 18);
      const exportHeight =
        legendStart + rowHeights.reduce((a, b) => a + b, 0) + 12;
      clone.setAttribute('height', exportHeight);
      clone.setAttribute('viewBox', `0 0 ${baseWidth} ${exportHeight}`);
      const background = svg('rect', {
        x: 0,
        y: 0,
        width: baseWidth,
        height: exportHeight,
        fill: '#fff',
      });
      clone.insertBefore(background, clone.firstChild);
      titleLines.forEach((line, i) =>
        clone.append(
          svg(
            'text',
            {
              x: baseWidth / 2,
              y: baseHeight + 18 + i * 22,
              'text-anchor': 'middle',
              fill: '#263442',
              'font-size': 18,
            },
            line,
          ),
        ),
      );
      if (hasRange)
        clone.append(
          svg(
            'text',
            {
              x: baseWidth / 2,
              y: baseHeight + titleLines.length * 22 + 16,
              'text-anchor': 'middle',
              fill: '#344054',
              'font-size': 14,
            },
            source.dataset.range,
          ),
        );
      items.forEach((item, index) => {
        const col = index % columns;
        const row = Math.floor(index / columns);
        const x = 12 + col * colWidth;
        const y =
          legendStart + rowHeights.slice(0, row).reduce((a, b) => a + b, 0);
        clone.append(
          svg('rect', {
            x,
            y: y - 10,
            width: 10,
            height: 10,
            rx: 2,
            fill: item.color || '#667085',
          }),
        );
        itemLines[index].forEach((line, lineIndex) =>
          clone.append(
            svg(
              'text',
              {
                x: x + 15,
                y: y + lineIndex * 17,
                fill: '#263442',
                'font-size': 12,
              },
              line,
            ),
          ),
        );
      });
      return new XMLSerializer().serializeToString(clone);
    };
    add('Ampliar gráfico', () => {
      details.open = false;
      const slot = html('div');
      slot.dataset.chartRoot = '';
      article.before(slot);
      const dialog = html('dialog', undefined, 'chart-dialog');
      dialog.setAttribute('aria-label', title);
      const close = html(
        'button',
        'Cerrar vista ampliada',
        'button button-secondary',
      );
      close.type = 'button';
      dialog.append(close, article);
      document.body.append(dialog);
      cleanup.set(slot, () => {
        cleanup.get(article)?.();
        dialog.close();
      });
      dialog.addEventListener(
        'close',
        () => {
          if (slot.isConnected) slot.replaceWith(article);
          else article.remove();
          dialog.remove();
          requestAnimationFrame(() => {
            if (summary.isConnected) summary.focus({ preventScroll: true });
          });
        },
        { once: true },
      );
      close.addEventListener('click', () => dialog.close());
      dialog.showModal();
      close.focus();
    });
    add('Abrir en pestaña nueva', () => {
      const data = snapshot();
      if (!data) return;
      const document = new DOMParser().parseFromString(data, 'image/svg+xml');
      document.documentElement.setAttribute('width', '100%');
      document.documentElement.setAttribute('height', '100%');
      const url = URL.createObjectURL(
        new Blob([new XMLSerializer().serializeToString(document)], {
          type: 'image/svg+xml',
        }),
      );
      const child = window.open(url, '_blank', 'noopener');
      if (child)
        child.addEventListener('load', () => URL.revokeObjectURL(url), {
          once: true,
        });
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    });
    add('Descargar SVG', () => {
      const data = snapshot();
      if (data) download(new Blob([data], { type: 'image/svg+xml' }), 'svg');
    });
    add('Descargar PNG', () => {
      const data = snapshot();
      if (!data) return;
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        const scale = Math.min(
          Math.max(2, 1600 / img.width),
          Math.sqrt(16000000 / (img.width * img.height)),
        );
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        c.toBlob((blob) => {
          if (blob) download(blob, 'png');
          URL.revokeObjectURL(url);
        });
      };
      const url = URL.createObjectURL(
        new Blob([data], { type: 'image/svg+xml' }),
      );
      img.onerror = () => URL.revokeObjectURL(url);
      img.src = url;
    });
    if (rows()?.length)
      add('Descargar CSV', () => {
        const esc = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
        const safeCell = (value) => {
          if (typeof value === 'number' && Number.isFinite(value))
            return String(value);
          const text = String(value ?? '');
          return esc(/^[\s]*[=+\-@]/.test(text) ? "'" + text : text);
        };
        const currentRows = rows();
        const currentFields = fields();
        const csv = [
          ['Fecha / categoría', ...currentFields.map((f) => f.label)],
          ...currentRows.map((r) => [
            r.date || r.label,
            ...currentFields.map((f) => r[f.key]),
          ]),
        ]
          .map((row) => row.map(safeCell).join(';'))
          .join('\r\n');
        download(
          new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }),
          'csv',
        );
      });
    article.querySelector('.chart-heading').append(details);
  }
  function plot(
    parent,
    {
      title,
      rows = [],
      fields = [],
      unit = 'EUR',
      xAxisTitle = '',
      xTickRotation = 0,
      xKey = null,
      description = '',
      emptyMessage = 'Sin datos en este periodo',
      dateRange = null,
      onDateRangeChange = null,
      reference = null,
      barMode = 'grouped',
      onSelect = null,
      showDataTable = true,
      horizontal = false,
    },
  ) {
    const article = card(parent, title, description);
    const format = (v, field = {}) => {
      if (field.unit === '%') return number.format(v) + ' %';
      if (field.unit === 'count')
        return new Intl.NumberFormat('es-ES', {
          maximumFractionDigits: 0,
        }).format(v);
      if (field.unit === 'number') return number.format(v);
      if (unit === '%') return number.format(v) + ' %';
      if (unit === 'Días') return number.format(v) + ' días';
      if (unit === 'count')
        return new Intl.NumberFormat('es-ES', {
          maximumFractionDigits: 0,
        }).format(v);
      return money.format(v);
    };
    const displayUnit = unit === 'count' ? 'Recuento' : unit;
    const visible = new Set(fields.map((f) => f.key));
    const legend = html('div', undefined, 'chart-legend interactive-legend');
    const stage = html('div', undefined, 'chart-stage');
    const readout = html(
      'p',
      'Desliza sobre el gráfico o usa las flechas para consultar una fecha.',
      'chart-readout',
    );
    readout.id = 'chart-readout-' + ++chartSequence;
    readout.setAttribute('aria-live', 'polite');
    readout.setAttribute('aria-atomic', 'true');
    // Temporal bounds and paths use chronological order without mutating input.
    const allRows = rows.every((row) =>
      /^\d{4}-\d{2}-\d{2}$/.test(row.date || ''),
    )
      ? [...rows].sort((a, b) => a.date.localeCompare(b.date))
      : rows;
    rows = allRows;
    let cursor = Math.max(0, rows.length - 1);
    const graph = html('div', undefined, 'finance-chart');
    graph.tabIndex = 0;
    graph.setAttribute('role', 'img');
    graph.setAttribute('aria-label', title);
    graph.setAttribute('aria-describedby', readout.id);
    graph.dataset.renderer = 'echarts-svg';
    const buttons = new Map();
    fields.forEach((f, i) => {
      if (f.tooltipOnly) return;
      const b = html(
        'button',
        f.label,
        'legend-toggle ' + (f.tone || tones[i % tones.length]),
      );
      b.type = 'button';
      b.setAttribute('aria-pressed', 'true');
      b.addEventListener('click', () => {
        if (visible.has(f.key)) visible.delete(f.key);
        else visible.add(f.key);
        b.setAttribute('aria-pressed', String(visible.has(f.key)));
        draw();
      });
      legend.append(b);
      buttons.set(f.key, b);
    });
    article.append(legend);
    stage.append(graph);
    article.append(stage, readout);
    let guide = null,
      geometry = null;
    let updateTable = () => {};
    const dateRows = allRows.filter((r) =>
      /^\d{4}-\d{2}-\d{2}$/.test(r.date || ''),
    );
    if (dateRows.length) {
      const day = 86400000;
      const firstDay = Date.parse(dateRows[0].date + 'T00:00:00Z');
      const lastDay = Date.parse(dateRows.at(-1).date + 'T00:00:00Z');
      const spanDays = Math.round((lastDay - firstDay) / day);
      const offset = (date) =>
        Math.max(
          0,
          Math.min(
            spanDays,
            Math.round((Date.parse(date + 'T00:00:00Z') - firstDay) / day),
          ),
        );
      const dateAt = (value) =>
        new Date(firstDay + Number(value) * day).toISOString().slice(0, 10);
      const dates = html('div', undefined, 'chart-date-controls');
      const controlId = readout.id + '-date';
      const from = html('input');
      from.type = 'date';
      from.value = dateRange?.from || dateRows[0].date;
      from.id = controlId + '-from';
      from.setAttribute('aria-label', 'Desde ' + title);
      const to = html('input');
      to.type = 'date';
      to.value = dateRange?.to || dateRows[dateRows.length - 1].date;
      to.id = controlId + '-to';
      to.setAttribute('aria-label', 'Hasta ' + title);
      const lo = html('input');
      lo.type = 'range';
      lo.min = 0;
      lo.max = spanDays;
      lo.step = 1;
      lo.value = 0;
      lo.setAttribute('aria-label', 'Límite inicial del periodo');
      const hi = html('input');
      hi.type = 'range';
      hi.min = 0;
      hi.max = spanDays;
      hi.step = 1;
      hi.value = spanDays;
      hi.setAttribute('aria-label', 'Límite final del periodo');
      const fromLabel = html('label', 'Desde');
      fromLabel.htmlFor = from.id;
      const toLabel = html('label', 'Hasta');
      toLabel.htmlFor = to.id;
      const startControls = html('div', undefined, 'chart-date-field');
      const endControls = html('div', undefined, 'chart-date-field');
      startControls.append(fromLabel, from, lo);
      endControls.append(toLabel, to, hi);
      dates.append(startControls, endControls);
      const rangeError = html('p', '', 'chart-date-error');
      rangeError.setAttribute('role', 'alert');
      rangeError.hidden = true;
      dates.append(rangeError);
      article.append(dates);
      const sync = () => {
        const start = from.value,
          end = to.value;
        const invalid = !start || !end || start > end;
        rangeError.hidden = !invalid;
        rangeError.textContent = invalid
          ? !start || !end
            ? 'Indica ambas fechas.'
            : 'La fecha inicial debe ser anterior o igual a la final.'
          : '';
        from.setAttribute('aria-invalid', String(invalid));
        to.setAttribute('aria-invalid', String(invalid));
        if (invalid) return;
        lo.value = offset(start);
        hi.value = offset(end);
        lo.setAttribute('aria-valuetext', dateLabel(start));
        hi.setAttribute('aria-valuetext', dateLabel(end));
        graph.dataset.range = start + ' – ' + end;
        const next = allRows.filter(
          (r) => !r.date || (r.date >= start && r.date <= end),
        );
        rows = next;
        cursor = Math.max(0, rows.length - 1);
        draw();
        updateTable(rows);
        onDateRangeChange?.({ from: start, to: end });
      };
      from.addEventListener('change', sync);
      to.addEventListener('change', sync);
      lo.addEventListener('input', () => {
        const index = Number(lo.value);
        if (index > Number(hi.value)) {
          hi.value = index;
          to.value = dateAt(index);
        }
        from.value = dateAt(index);
        sync();
      });
      hi.addEventListener('input', () => {
        const index = Number(hi.value);
        if (index < Number(lo.value)) {
          lo.value = index;
          from.value = dateAt(index);
        }
        to.value = dateAt(index);
        sync();
      });
      sync();
    }
    if (showDataTable)
      updateTable = dataTable(
        article,
        title + ' · ' + unit,
        rows,
        fields,
        format,
      );
    function inspect(index) {
      if (!rows.length) return;
      cursor = Math.min(rows.length - 1, Math.max(0, Math.round(index)));
      const row = rows[cursor];
      readout.textContent =
        dateLabel(row.date || row.label) +
        ' · ' +
        fields
          .filter((f) => f.inspection !== false && visible.has(f.key))
          .map(
            (f) =>
              f.label +
              ': ' +
              (finite(row[f.key]) ? format(row[f.key], f) : 'Sin dato'),
          )
          .join(' · ') +
        (row.carried
          ? ' · VL: ' +
            [
              ...new Set(
                Object.entries(row.priceDates || {})
                  .filter(([id, date]) => date && row.productValues?.[id] > 0)
                  .map(([, date]) => date),
              ),
            ]
              .sort()
              .map(dateLabel)
              .join(' / ')
          : '');
      if (guide && geometry) {
        const x = geometry.x(cursor);
        guide.setAttribute(horizontal ? 'y1' : 'x1', x);
        guide.setAttribute(horizontal ? 'y2' : 'x2', x);
        guide.hidden = false;
      }
    }
    graph.addEventListener('keydown', (event) => {
      if (!rows.length) return;
      let next = cursor;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next--;
      else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next++;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = rows.length - 1;
      else return;
      event.preventDefault();
      inspect(next);
      onSelect?.(rows[cursor]);
    });
    function draw() {
      const active = fields
        .filter((f) => !f.tooltipOnly && visible.has(f.key))
        .map((f) => ({
          ...f,
          tone: f.tone || tones[fields.indexOf(f) % tones.length],
        }));
      const themed = FinanceChartRenderer.palette(article);
      const height = horizontal
        ? Math.max(
            article.closest('.chart-dialog') ? 420 : 280,
            rows.length * 44 + 90,
          )
        : xTickRotation
          ? 360
          : article.closest('.chart-dialog')
            ? 420
            : 300;
      graph.style.height = height + 'px';
      const option = FinanceChartRenderer.plotOption(
        {
          rows,
          fields: active,
          unit,
          xKey,
          xTickRotation,
          xAxisTitle,
          reference,
          barMode,
          horizontal,
        },
        themed,
      );
      const hasValues = rows.some((r) => active.some((f) => finite(r[f.key])));
      if (!hasValues) {
        option.xAxis.show = false;
        option.yAxis.show = false;
        option.graphic = [
          {
            type: 'text',
            left: 'center',
            top: 'middle',
            style: {
              text: active.length
                ? emptyMessage
                : 'Selecciona una serie en la leyenda',
              fill: themed.muted,
              fontSize: 12,
              width: Math.max(160, graph.clientWidth - 36),
              overflow: 'break',
              align: 'center',
            },
          },
        ];
      }
      const engine = FinanceChartRenderer.render(graph, option, height);
      const image = graph.querySelector('svg');
      if (image) {
        image.dataset.range = graph.dataset.range || '';
        image.setAttribute('aria-hidden', 'true');
      }
      if (!hasValues) {
        geometry = guide = null;
        graph.onpointermove = graph.onclick = null;
        readout.textContent = active.length
          ? emptyMessage
          : 'Selecciona una serie en la leyenda';
        if (rows.length) inspect(cursor);
        return;
      }
      const categorical =
        option[horizontal ? 'yAxis' : 'xAxis'].type === 'category';
      const coordinate = (row, i) =>
        xKey
          ? row[xKey]
          : categorical
            ? i
            : Date.parse(row.date + 'T00:00:00Z');
      const position = (i) =>
        engine.convertToPixel(
          horizontal ? { yAxisIndex: 0 } : { xAxisIndex: 0 },
          coordinate(rows[i], i),
        );
      const grid = option.grid;
      geometry = { x: position };
      guide = svg('line', {
        x1: grid.left,
        x2: horizontal ? engine.getWidth() - grid.right : grid.left,
        y1: grid.top,
        y2: horizontal ? grid.top : height - grid.bottom,
        class: 'chart-hover-guide',
        'aria-hidden': 'true',
      });
      image?.querySelector('.chart-hover-guide')?.remove();
      image?.append(guide);
      const closest = (event) => {
        const rect = graph.getBoundingClientRect();
        const pos = horizontal
          ? event.clientY - rect.top
          : event.clientX - rect.left;
        let best = 0;
        rows.forEach((r, i) => {
          if (Math.abs(position(i) - pos) < Math.abs(position(best) - pos))
            best = i;
        });
        return best;
      };
      graph.onpointermove = (event) => inspect(closest(event));
      graph.onclick = (event) => {
        const index = closest(event);
        inspect(index);
        onSelect?.(rows[index]);
      };
      inspect(cursor);
    }
    redraw.set(article, draw);
    const observer = new ResizeObserver(draw);
    observer.observe(stage);
    cleanup.set(article, () => {
      observer.disconnect();
      redraw.delete(article);
      FinanceChartRenderer.dispose(graph);
    });
    draw();
    chartMenu(
      article,
      title,
      () => graph.querySelector('svg'),
      () => rows,
      () =>
        fields.filter(
          (f) => f.export !== false && (f.tooltipOnly || visible.has(f.key)),
        ),
      () =>
        fields
          .filter((f) => f.tooltipOnly || visible.has(f.key))
          .map((field) => {
            const tone =
              field.tone || tones[fields.indexOf(field) % tones.length];
            return {
              label: field.label,
              color: FinanceChartRenderer.palette(article).colors[tone],
            };
          }),
    );
    return article;
  }
  function donut(
    parent,
    {
      title,
      rows = [],
      description = '',
      onSelect = null,
      showDataTable = true,
    },
  ) {
    const article = card(parent, title, description);
    const valid = rows.filter((r) => finite(r.value) && r.value > 0);
    const total = valid.reduce((s, r) => s + r.value, 0);
    const content = html('div', undefined, 'distribution-layout');
    const chart = html('div', undefined, 'donut-chart');
    chart.setAttribute('role', 'img');
    chart.setAttribute('aria-label', title);
    chart.dataset.renderer = 'echarts-svg';
    const legend = html('div', undefined, 'distribution-legend');
    const readout = html(
      'p',
      total
        ? 'Selecciona una categoría para consultar su peso.'
        : 'Sin importes positivos.',
      'chart-readout',
    );
    valid.forEach((r, i) => {
      const tone = tones[i % tones.length];
      const b = html('button', undefined, 'distribution-item ' + tone);
      b.type = 'button';
      b.append(
        html('span', r.label),
        html('strong', money.format(r.value)),
        html(
          'span',
          number.format((r.value / total) * 100) + ' %',
          'distribution-percent',
        ),
      );
      const preview = () => {
        readout.textContent =
          r.label +
          ' · ' +
          money.format(r.value) +
          ' · ' +
          number.format((r.value / total) * 100) +
          ' % del total mostrado';
        for (const button of legend.querySelectorAll('button'))
          button.setAttribute('aria-pressed', String(button === b));
      };
      const select = () => {
        preview();
        onSelect?.(r);
      };
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', select);
      b.addEventListener('focus', preview);
      legend.append(b);
    });
    for (const row of rows.filter((r) => !finite(r.value))) {
      const item = html('div', undefined, 'distribution-item');
      item.append(
        html('span', row.label),
        html('strong', 'Sin dato'),
        html('span', 'Peso desconocido', 'distribution-percent'),
      );
      legend.append(item);
    }
    content.append(chart, legend);
    article.append(content, readout);
    function drawDistribution() {
      const theme = FinanceChartRenderer.palette(article);
      const ranked = valid.length > 4;
      content.classList.toggle('distribution-ranked', ranked);
      const height = ranked ? Math.max(260, valid.length * 36 + 72) : 250;
      chart.style.height = height + 'px';
      const option = ranked
        ? FinanceChartRenderer.plotOption(
            {
              rows: valid.map((row, i) => ({
                ...row,
                tone: tones[i % tones.length],
              })),
              fields: [{ key: 'value', label: 'Importe', shape: 'bar' }],
              unit: 'EUR',
              horizontal: true,
            },
            theme,
          )
        : {
            animation: false,
            textStyle: { fontFamily: theme.font },
            series: [
              {
                type: 'pie',
                radius: ['67%', '86%'],
                center: ['50%', '50%'],
                silent: false,
                avoidLabelOverlap: true,
                label: { show: false },
                emphasis: { disabled: true },
                itemStyle: {
                  borderWidth: 3,
                  borderColor: theme.surface,
                  borderRadius: 4,
                },
                data: valid.map((r, i) => ({
                  name: r.label,
                  value: r.value,
                  itemStyle: { color: theme.colors[tones[i % tones.length]] },
                })),
              },
            ],
            graphic: [
              {
                type: 'text',
                left: 'center',
                top: '43%',
                style: {
                  text: money.format(total),
                  fill: theme.text,
                  fontSize: 20,
                  fontWeight: 650,
                },
              },
              {
                type: 'text',
                left: 'center',
                top: '55%',
                style: {
                  text: 'Total mostrado',
                  fill: theme.muted,
                  fontSize: 11,
                },
              },
            ],
          };
      const engine = FinanceChartRenderer.render(chart, option, height);
      engine.off('click');
      engine.off('mouseover');
      engine.on('mouseover', (event) => {
        if (event.componentType === 'series')
          legend.children[event.dataIndex]?.dispatchEvent(new Event('focus'));
      });
      engine.on('click', (event) => {
        if (event.componentType === 'series')
          legend.children[event.dataIndex]?.click();
      });
      chart.querySelector('svg')?.setAttribute('aria-hidden', 'true');
    }
    redraw.set(article, drawDistribution);
    const observer = new ResizeObserver(drawDistribution);
    observer.observe(chart);
    cleanup.set(article, () => {
      observer.disconnect();
      redraw.delete(article);
      FinanceChartRenderer.dispose(chart);
    });
    drawDistribution();

    if (rows.some((r) => !finite(r.value)))
      article.append(
        html(
          'p',
          'Reparto parcial: faltan valores. Los porcentajes corresponden al subtotal positivo conocido; no representan la composición completa.',
          'chart-description',
        ),
      );
    if (rows.some((r) => r.value < 0))
      article.append(
        html(
          'p',
          'Las devoluciones netas negativas se conservan en los datos; el reparto muestra importes positivos.',
          'chart-description',
        ),
      );
    if (showDataTable)
      dataTable(
        article,
        title,
        rows.map((r) => ({ ...r, amount: r.value })),
        [{ key: 'amount', label: 'Importe EUR' }],
        (v) => money.format(v),
      );
    chartMenu(
      article,
      title,
      () => chart.querySelector('svg'),
      () => rows,
      () => [{ key: 'value', label: 'Importe EUR' }],
      () => [
        ...valid.map((row, index) => {
          return {
            label: `${row.label}: ${money.format(row.value)} (${number.format((row.value / total) * 100)} %)`,
            color:
              FinanceChartRenderer.palette(article).colors[
                tones[index % tones.length]
              ],
          };
        }),
        ...rows
          .filter((row) => !finite(row.value))
          .map((row) => ({
            label: `${row.label}: Sin dato`,
            color: '#667085',
          })),
      ],
    );
    return article;
  }
  function table(parent, { title, rows, fields, firstColumn, toggleLabel }) {
    return dataTable(
      parent,
      title,
      rows,
      fields,
      (value) => money.format(value),
      {
        firstColumn,
        toggleLabel,
      },
    );
  }
  return { plot, donut, clear, table };
})();
