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
  function dataTable(parent, title, rows, fields, format) {
    const details = html('details', undefined, 'chart-data');
    details.append(html('summary', 'Ver datos'));
    const wrap = html('div', undefined, 'table-responsive');
    const table = html('table', undefined, 'chart-table');
    table.append(html('caption', title));
    const columns = [
      {
        label: 'Fecha / categoría',
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
    details.append(summary);
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
      details.append(b);
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
        if (original.classList?.contains('chart-axis'))
          copies[index].setAttribute('fill', '#263442');
      });
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clone.setAttribute('width', source.viewBox.baseVal.width || 1000);
      const baseHeight = source.viewBox.baseVal.height || 600;
      const baseWidth = source.viewBox.baseVal.width || 1000;
      const hasRange = Boolean(source.dataset.range);
      const items = legendItems();
      const legendRows = Math.ceil(items.length / 3);
      const legendStart = baseHeight + (hasRange ? 58 : 40);
      const exportHeight = legendStart + legendRows * 22 + 12;
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
      clone.append(
        svg(
          'text',
          {
            x: baseWidth / 2,
            y: baseHeight + 18,
            'text-anchor': 'middle',
            fill: '#263442',
            'font-size': 18,
          },
          title,
        ),
      );
      if (hasRange)
        clone.append(
          svg(
            'text',
            {
              x: baseWidth / 2,
              y: baseHeight + 36,
              'text-anchor': 'middle',
              fill: '#344054',
              'font-size': 14,
            },
            source.dataset.range,
          ),
        );
      const colWidth = (baseWidth - 24) / 3;
      items.forEach((item, index) => {
        const col = index % 3;
        const row = Math.floor(index / 3);
        const x = 12 + col * colWidth;
        const y = legendStart + row * 22;
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
        clone.append(
          svg(
            'text',
            { x: x + 15, y, fill: '#263442', 'font-size': 14 },
            item.label,
          ),
        );
      });
      return new XMLSerializer().serializeToString(clone);
    };
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
        c.width = img.width * 2;
        c.height = img.height * 2;
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
      description = '',
      emptyMessage = 'Sin datos en este periodo',
      dateRange = null,
      onDateRangeChange = null,
      reference = null,
      barMode = 'grouped',
      onSelect = null,
      showDataTable = true,
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
    const graph = svg('svg', {
      role: 'img',
      'aria-label': title,
      class: 'finance-chart',
      tabindex: '0',
      'aria-describedby': readout.id,
    });
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
      dates.append(fromLabel, from, toLabel, to, lo, hi);
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
          .filter((f) => visible.has(f.key))
          .map(
            (f) =>
              f.label +
              ': ' +
              (finite(row[f.key]) ? format(row[f.key], f) : 'Sin dato'),
          )
          .join(' · ') +
        (row.carried ? ' · Última cotización registrada' : '');
      if (guide && geometry) {
        const x = geometry.x(cursor);
        guide.setAttribute('x1', x);
        guide.setAttribute('x2', x);
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
      graph.replaceChildren();
      const width = Math.max(
        260,
        Math.round(
          stage.getBoundingClientRect().width ||
            Math.min(700, window.innerWidth - 56),
        ),
      );
      const height = 260,
        left = 64,
        right = width - 18,
        top = 18,
        bottom = 213;
      graph.setAttribute('viewBox', `0 0 ${width} ${height}`);
      const active = fields.filter((f) => !f.tooltipOnly && visible.has(f.key));
      const values = rows
        .flatMap((r) => active.map((f) => r[f.key]))
        .filter(finite);
      if (reference && values.length && finite(reference.value))
        values.push(reference.value);
      if (!values.length) {
        graph.append(
          svg(
            'text',
            {
              x: width / 2,
              y: 125,
              'text-anchor': 'middle',
              class: 'chart-axis',
            },
            active.length ? emptyMessage : 'Selecciona una serie en la leyenda',
          ),
        );
        geometry = null;
        guide = null;
        if (!rows.length) {
          cursor = 0;
          readout.textContent = active.length
            ? emptyMessage
            : 'Selecciona una serie en la leyenda';
        } else {
          inspect(cursor);
        }
        return;
      }
      const bars = active.some((f) => f.shape === 'bar');
      const zeroBaseline = bars || fields.some((f) => f.area);
      const lo = values.reduce((a, b) => Math.min(a, b), Infinity),
        hi = values.reduce((a, b) => Math.max(a, b), -Infinity);
      const span = Math.max(hi - lo, Math.abs(hi) * 0.08, 1);
      const min = zeroBaseline
        ? Math.min(0, lo)
        : lo >= 0
          ? Math.max(0, lo - span * 0.08)
          : lo - span * 0.08;
      const max = bars
        ? Math.max(0, hi) || 1
        : zeroBaseline
          ? Math.max(0, hi + span * 0.08) || 1
          : hi + span * 0.08;
      const y = (v) => bottom - ((v - min) / (max - min || 1)) * (bottom - top);
      const time = (r, i) => {
        const n = Date.parse((r.date || '') + 'T00:00:00Z');
        return Number.isFinite(n) ? n : i;
      };
      const start = time(rows[0], 0),
        end = time(rows[rows.length - 1], rows.length - 1);
      const pad = bars ? (right - left) / (2 * Math.max(1, rows.length)) : 0;
      const x = (i) =>
        rows.length === 1
          ? (left + right) / 2
          : left +
            pad +
            ((time(rows[i], i) - start) / (end - start || 1)) *
              (right - left - 2 * pad);
      geometry = { x, left, right };
      const rawStep = (max - min) / 4,
        power = Math.pow(10, Math.floor(Math.log10(rawStep || 1)));
      const fraction = rawStep / power,
        niceStep =
          (fraction <= 1
            ? 1
            : fraction <= 2
              ? 2
              : fraction <= 2.5
                ? 2.5
                : fraction <= 5
                  ? 5
                  : 10) * power;
      const step = unit === 'count' ? Math.max(1, niceStep) : niceStep;
      const tickStart = Math.ceil(min / step) * step;
      for (let v = tickStart; v <= max + step * 0.001; v += step) {
        graph.append(
          svg('line', {
            x1: left,
            x2: right,
            y1: y(v),
            y2: y(v),
            class: 'chart-gridline',
          }),
        );
        graph.append(
          svg(
            'text',
            {
              x: left - 8,
              y: y(v) + 4,
              'text-anchor': 'end',
              class: 'chart-axis',
            },
            new Intl.NumberFormat('es-ES', {
              maximumFractionDigits: unit === 'count' ? 0 : 2,
            }).format(v),
          ),
        );
      }
      graph.append(
        svg(
          'text',
          { x: left, y: 12, class: 'chart-axis axis-title' },
          displayUnit,
        ),
      );
      if (reference && finite(reference.value)) {
        const ry = y(reference.value);
        graph.append(
          svg('line', {
            x1: left,
            x2: right,
            y1: ry,
            y2: ry,
            class: 'chart-reference',
          }),
        );
        if (reference.label)
          graph.append(
            svg(
              'text',
              {
                x: right,
                y: ry - 4,
                'text-anchor': 'end',
                class: 'chart-axis',
              },
              reference.label,
            ),
          );
      }
      const count = Math.min(
        width < 360 ? 2 : width < 480 ? 3 : 5,
        rows.length,
      );
      const ticks = new Set(
        Array.from({ length: count }, (_, i) =>
          Math.round((i * (rows.length - 1)) / Math.max(1, count - 1)),
        ),
      );
      for (const i of ticks)
        graph.append(
          svg(
            'text',
            {
              x: x(i),
              y: 240,
              'text-anchor':
                i === 0 ? 'start' : i === rows.length - 1 ? 'end' : 'middle',
              class: 'chart-axis',
            },
            dateLabel(rows[i].label || rows[i].date).slice(0, 15),
          ),
        );
      active.forEach((f, color) => {
        const tone = f.tone || tones[fields.indexOf(f) % tones.length];
        if (f.shape === 'bar') {
          const w = Math.min(
            28,
            ((right - left) / Math.max(1, rows.length) / active.length) * 0.65,
          );
          rows.forEach((r, i) => {
            if (finite(r[f.key])) {
              const b = svg('rect', {
                x: Math.min(
                  right - w,
                  Math.max(
                    left,
                    x(i) +
                      (barMode === 'diverging'
                        ? -0.5
                        : color - active.length / 2) *
                        w,
                  ),
                ),
                y: Math.min(y(0), y(r[f.key])),
                width: Math.max(2, w - 1),
                height: Math.max(1, Math.abs(y(r[f.key]) - y(0))),
                rx: 2,
                class: tone,
              });
              b.append(
                svg(
                  'title',
                  {},
                  (r.date || r.label) +
                    ' · ' +
                    f.label +
                    ' · ' +
                    format(r[f.key], f),
                ),
              );
              graph.append(b);
            }
          });
        } else {
          let path = '',
            area = '',
            segment = '',
            lastX = null,
            connected = false;
          const closeArea = () => {
            if (segment) area += segment + ` L ${lastX} ${y(0)} Z`;
            segment = '';
          };
          rows.forEach((r, i) => {
            if (!finite(r[f.key])) {
              if (f.connectGaps) return;
              closeArea();
              connected = false;
              return;
            }
            const command = !connected
              ? ` M ${x(i)} ${y(r[f.key])}`
              : f.shape === 'step'
                ? ` H ${x(i)} V ${y(r[f.key])}`
                : ` L ${x(i)} ${y(r[f.key])}`;
            path += command;
            segment += !connected
              ? ` M ${x(i)} ${y(0)} L ${x(i)} ${y(r[f.key])}`
              : command;
            lastX = x(i);
            connected = true;
          });
          closeArea();
          if (f.area)
            graph.append(
              svg('path', {
                d: area.trim(),
                class: 'chart-area ' + tone,
                'data-baseline': '0',
              }),
            );
          graph.append(
            svg('path', {
              d: path.trim(),
              class:
                'chart-line ' +
                tone +
                (f.shape === 'step' ? ' chart-step' : ''),
            }),
          );
        }
      });
      guide = svg('line', {
        x1: left,
        x2: left,
        y1: top,
        y2: bottom,
        class: 'chart-hover-guide',
        'aria-hidden': 'true',
      });
      graph.append(guide);
      const hit = svg('rect', {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
        class: 'chart-hit',
        'data-chart-hover-overlay': 'cross-series',
      });
      hit.addEventListener('pointermove', (e) => {
        const rect = graph.getBoundingClientRect();
        const pos = ((e.clientX - rect.left) * width) / rect.width;
        let best = 0;
        rows.forEach((r, i) => {
          if (Math.abs(x(i) - pos) < Math.abs(x(best) - pos)) best = i;
        });
        inspect(best);
      });
      hit.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        graph.focus();
      });
      hit.addEventListener('click', (e) => {
        const rect = graph.getBoundingClientRect(),
          pos = ((e.clientX - rect.left) * width) / rect.width;
        let best = 0;
        rows.forEach((r, i) => {
          if (Math.abs(x(i) - pos) < Math.abs(x(best) - pos)) best = i;
        });
        if (rows[best]) onSelect?.(rows[best]);
      });
      graph.append(hit);
      inspect(cursor);
    }
    const observer = new ResizeObserver(draw);
    observer.observe(stage);
    cleanup.set(article, () => observer.disconnect());
    draw();
    chartMenu(
      article,
      title,
      () => graph,
      () => rows,
      () => fields.filter((f) => f.tooltipOnly || visible.has(f.key)),
      () =>
        fields
          .filter((f) => f.tooltipOnly || visible.has(f.key))
          .map((field) => {
            const tone =
              field.tone || tones[fields.indexOf(field) % tones.length];
            const element = [...graph.querySelectorAll('*')].find((node) =>
              node.classList.contains(tone),
            );
            const style = element ? getComputedStyle(element) : null;
            return {
              label: field.label,
              color: style
                ? style.fill !== 'none'
                  ? style.fill
                  : style.stroke
                : '#667085',
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
    const chart = svg('svg', {
      viewBox: '0 0 240 240',
      role: 'img',
      'aria-label': title,
      class: 'donut-chart',
    });
    const legend = html('div', undefined, 'distribution-legend');
    const readout = html(
      'p',
      total
        ? 'Selecciona una categoría para consultar su peso.'
        : 'Sin importes positivos.',
      'chart-readout',
    );
    let start = -Math.PI / 2;
    valid.forEach((r, i) => {
      const angle = (r.value / total) * Math.PI * 2,
        end = start + Math.min(angle, Math.PI * 2 - 0.00001);
      const tone = tones[i % tones.length];
      const arc = svg('path', {
        d: `M120 120 L${120 + 96 * Math.cos(start)} ${120 + 96 * Math.sin(start)} A96 96 0 ${angle > Math.PI ? 1 : 0} 1 ${120 + 96 * Math.cos(end)} ${120 + 96 * Math.sin(end)} Z`,
        class: tone,
      });
      arc.append(svg('title', {}, r.label + ' · ' + money.format(r.value)));
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
      arc.addEventListener('pointermove', preview);
      arc.addEventListener('click', select);
      if (onSelect) {
        arc.setAttribute('tabindex', '0');
        arc.setAttribute('role', 'button');
        arc.setAttribute('aria-label', r.label);
        arc.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            select();
          }
        });
      }
      chart.append(arc);
      legend.append(b);
      start += angle;
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
    chart.append(
      svg('circle', { cx: 120, cy: 120, r: 68, class: 'donut-hole' }),
      svg(
        'text',
        { x: 120, y: 117, 'text-anchor': 'middle', class: 'donut-total' },
        money.format(total),
      ),
      svg(
        'text',
        { x: 120, y: 140, 'text-anchor': 'middle', class: 'chart-axis' },
        'Total mostrado',
      ),
    );
    content.append(chart, legend);
    article.append(content, readout);
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
      () => chart,
      () => rows,
      () => [{ key: 'value', label: 'Importe EUR' }],
      () => [
        ...valid.map((row, index) => {
          const element = [...chart.querySelectorAll('*')].find((node) =>
            node.classList.contains(tones[index % tones.length]),
          );
          const style = element ? getComputedStyle(element) : null;
          return {
            label: `${row.label}: ${money.format(row.value)} (${number.format((row.value / total) * 100)} %)`,
            color: style
              ? style.fill !== 'none'
                ? style.fill
                : style.stroke
              : '#667085',
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
  return { plot, donut, clear };
})();
