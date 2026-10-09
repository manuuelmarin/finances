'use strict';

// Presentation only: every value is supplied by Sheets or a read-only projection.
const FinanceCharts = (() => {
  const finite = (n) => typeof n === 'number' && Number.isFinite(n);
  const money = new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  });
  const number = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });
  const tones = [
    'chart-mint',
    'chart-blue',
    'chart-red',
    'chart-lilac',
    'chart-gold',
    'chart-copper',
  ];
  const cleanup = new WeakMap();
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
    if (description)
      article.append(html('p', description, 'chart-description'));
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
          ? format(value)
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
  }
  function plot(
    parent,
    { title, rows = [], fields = [], unit = 'EUR', description = '' },
  ) {
    const article = card(parent, title, description);
    const format =
      unit === '%' ? (v) => number.format(v) + ' %' : (v) => money.format(v);
    const visible = new Set(fields.map((f) => f.key));
    const legend = html('div', undefined, 'chart-legend interactive-legend');
    const stage = html('div', undefined, 'chart-stage');
    const readout = html(
      'p',
      'Desliza sobre el gráfico o usa las flechas para consultar una fecha.',
      'chart-readout',
    );
    let cursor = Math.max(0, rows.length - 1);
    const graph = svg('svg', {
      role: 'img',
      'aria-label': title,
      class: 'finance-chart',
    });
    const buttons = new Map();
    fields.forEach((f, i) => {
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
    const navigator = html('input', undefined, 'chart-navigator');
    navigator.type = 'range';
    navigator.min = 0;
    navigator.max = Math.max(0, rows.length - 1);
    navigator.value = cursor;
    navigator.setAttribute('aria-label', 'Fecha en ' + title);
    navigator.disabled = !rows.length;
    article.append(navigator);
    dataTable(article, title + ' · ' + unit, rows, fields, format);
    let guide = null,
      geometry = null;
    function inspect(index) {
      if (!rows.length) return;
      cursor = Math.min(rows.length - 1, Math.max(0, Math.round(index)));
      navigator.value = cursor;
      const row = rows[cursor];
      navigator.setAttribute('aria-valuetext', row.date || row.label);
      readout.textContent =
        (row.date || row.label) +
        ' · ' +
        fields
          .filter((f) => visible.has(f.key))
          .map(
            (f) =>
              f.label +
              ': ' +
              (finite(row[f.key]) ? format(row[f.key]) : 'Sin dato'),
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
    navigator.addEventListener('input', () => inspect(Number(navigator.value)));
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
      const active = fields.filter((f) => visible.has(f.key));
      const values = rows
        .flatMap((r) => active.map((f) => r[f.key]))
        .filter(finite);
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
            active.length
              ? 'Sin datos en este periodo'
              : 'Selecciona una serie en la leyenda',
          ),
        );
        geometry = null;
        guide = null;
        inspect(cursor);
        return;
      }
      const bars = active.some((f) => f.shape === 'bar');
      const lo = values.reduce((a, b) => Math.min(a, b), Infinity),
        hi = values.reduce((a, b) => Math.max(a, b), -Infinity);
      const span = Math.max(hi - lo, Math.abs(hi) * 0.08, 1);
      const min = bars
        ? Math.min(0, lo)
        : lo >= 0
          ? Math.max(0, lo - span * 0.08)
          : lo - span * 0.08;
      const max = bars ? Math.max(0, hi) || 1 : hi + span * 0.08;
      const y = (v) => bottom - ((v - min) / (max - min || 1)) * (bottom - top);
      const time = (r, i) => {
        const n = Date.parse((r.date || '') + 'T00:00:00Z');
        return Number.isFinite(n) ? n : i;
      };
      const start = time(rows[0], 0),
        end = time(rows[rows.length - 1], rows.length - 1);
      const x = (i) =>
        left +
        ((time(rows[i], i) - start) / (end - start || 1)) * (right - left);
      geometry = { x, left, right };
      for (let i = 0; i < 4; i++) {
        const v = min + ((max - min) * i) / 3;
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
              notation: 'compact',
              maximumFractionDigits: 1,
            }).format(v),
          ),
        );
      }
      graph.append(
        svg('text', { x: left, y: 12, class: 'chart-axis axis-title' }, unit),
      );
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
            (rows[i].label || rows[i].date || '').slice(0, 12),
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
                  Math.max(left, x(i) + (color - active.length / 2) * w),
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
                    format(r[f.key]),
                ),
              );
              graph.append(b);
            }
          });
        } else {
          let path = '',
            connected = false;
          rows.forEach((r, i) => {
            if (!finite(r[f.key])) {
              connected = false;
              return;
            }
            if (!connected) path += ` M ${x(i)} ${y(r[f.key])}`;
            else
              path +=
                f.shape === 'step'
                  ? ` H ${x(i)} V ${y(r[f.key])}`
                  : ` L ${x(i)} ${y(r[f.key])}`;
            connected = true;
          });
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
        navigator.focus();
      });
      graph.append(hit);
      inspect(cursor);
    }
    const observer = new ResizeObserver(draw);
    observer.observe(stage);
    cleanup.set(article, () => observer.disconnect());
    draw();
    return article;
  }
  function donut(parent, { title, rows = [], description = '' }) {
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
      const select = () => {
        readout.textContent =
          r.label +
          ' · ' +
          money.format(r.value) +
          ' · ' +
          number.format((r.value / total) * 100) +
          ' % del total mostrado';
        for (const button of legend.children)
          button.setAttribute('aria-pressed', String(button === b));
      };
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', select);
      arc.addEventListener('pointermove', select);
      chart.append(arc);
      legend.append(b);
      start += angle;
    });
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
    if (rows.some((r) => r.value === null))
      article.append(
        html('p', 'Reparto parcial: faltan valores.', 'chart-description'),
      );
    if (rows.some((r) => r.value < 0))
      article.append(
        html(
          'p',
          'Las devoluciones netas negativas se conservan en los datos; el reparto muestra importes positivos.',
          'chart-description',
        ),
      );
    dataTable(
      article,
      title,
      rows.map((r) => ({ ...r, amount: r.value })),
      [{ key: 'amount', label: 'Importe EUR' }],
      (v) => money.format(v),
    );
    return article;
  }
  return { plot, donut, clear };
})();
