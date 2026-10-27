'use strict';

// Rendering only. No financial aggregation, resampling, rounding or interpolation.
const FinanceChartRenderer = (() => {
  const finite = (value) => typeof value === 'number' && Number.isFinite(value);
  const toneNames = [
    'chart-mint',
    'chart-blue',
    'chart-red',
    'chart-lilac',
    'chart-gold',
    'chart-copper',
    'chart-city',
    'chart-unclassified',
  ];
  const toneVars = [
    '--series-mint',
    '--series-blue',
    '--series-red',
    '--series-lilac',
    '--series-gold',
    '--copper',
    '--series-city',
    '--series-unclassified',
  ];
  function palette(node) {
    const css = getComputedStyle(node);
    const colors = Object.fromEntries(
      toneNames.map((tone, i) => [
        tone,
        css.getPropertyValue(toneVars[i]).trim() || '#27765a',
      ]),
    );
    return {
      colors,
      text: css.getPropertyValue('--text').trim() || '#263442',
      muted: css.getPropertyValue('--muted').trim() || '#667085',
      line: css.getPropertyValue('--line').trim() || '#d6ddd8',
      surface: css.getPropertyValue('--surface').trim() || '#fff',
      font: css.fontFamily,
    };
  }
  const value = (row, key) => (finite(row[key]) ? row[key] : null);
  function plotOption(
    {
      rows,
      fields,
      unit,
      xKey,
      xTickRotation = 0,
      xAxisTitle = '',
      reference,
      barMode,
      horizontal = false,
    },
    theme,
  ) {
    const bars = fields.some((f) => f.shape === 'bar');
    const temporal =
      !bars &&
      rows.length > 0 &&
      rows.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date || ''));
    const numeric = !!xKey;
    const position = (r, i) =>
      numeric ? r[xKey] : temporal ? Date.parse(r.date + 'T00:00:00Z') : i;
    const label = (r) => r.axisLabel || r.label || r.date || '';
    const labels = rows.map(label);
    const axisColor = theme.muted;
    const categoryAxis = {
      type: numeric ? 'value' : temporal ? 'time' : 'category',
      ...(temporal ? { minInterval: 86400000 } : {}),
      ...(numeric || temporal ? {} : { data: labels }),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: axisColor,
        fontSize: 11,
        hideOverlap: true,
        rotate: -xTickRotation,
        margin: 14,
        ...(horizontal ? { width: 120, overflow: 'truncate' } : {}),
        formatter: temporal
          ? (value) =>
              new Intl.DateTimeFormat('es-ES', {
                day: '2-digit',
                month: 'short',
                timeZone: 'UTC',
              }).format(value)
          : numeric
            ? (value) => new Intl.NumberFormat('es-ES').format(value)
            : (value) =>
                /^\d{4}-\d{2}$/.test(value)
                  ? new Intl.DateTimeFormat('es-ES', {
                      month: 'short',
                      year: '2-digit',
                      timeZone: 'UTC',
                    }).format(new Date(value + '-01T00:00:00Z'))
                  : value,
      },
      splitLine: { show: false },
      ...(horizontal ? { inverse: true } : {}),
      name: xAxisTitle,
      nameLocation: 'middle',
      nameGap: xTickRotation ? 80 : 38,
      nameTextStyle: { color: axisColor, fontSize: 11 },
    };
    const values = rows
      .flatMap((r) => fields.map((f) => value(r, f.key)))
      .filter(finite);
    const low = values.reduce((a, b) => Math.min(a, b), Infinity);
    const high = values.reduce((a, b) => Math.max(a, b), -Infinity);
    if (finite(reference?.value)) values.push(reference.value);
    const baseline = bars || fields.some((f) => f.area);
    const format = (n) =>
      new Intl.NumberFormat('es-ES', {
        maximumFractionDigits: unit === 'count' || unit === 'Días' ? 0 : 2,
        notation: Math.abs(n) >= 10000 ? 'compact' : 'standard',
      }).format(Object.is(n, -0) || Math.abs(n) < 1e-10 ? 0 : n);
    const valueAxis = {
      type: 'value',
      scale: !baseline,
      min:
        finite(reference?.value) && reference.value <= low
          ? Math.min(
              baseline ? 0 : Infinity,
              reference.value - Math.max(Math.abs(reference.value) * 0.08, 1),
            )
          : baseline && values.every((v) => v >= 0)
            ? 0
            : undefined,
      max:
        finite(reference?.value) && reference.value >= high
          ? Math.max(
              baseline ? 0 : -Infinity,
              reference.value + Math.max(Math.abs(reference.value) * 0.08, 1),
            )
          : baseline && values.length && values.every((v) => v <= 0)
            ? 0
            : undefined,
      minInterval: unit === 'count' || unit === 'Días' ? 1 : undefined,
      splitNumber: 4,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: axisColor,
        fontSize: 11,
        formatter: format,
        hideOverlap: true,
      },
      splitLine: {
        lineStyle: { color: theme.line, type: 'dashed', opacity: 0.55 },
      },
      name: unit === 'count' ? 'Recuento' : unit,
      nameTextStyle: { color: axisColor, fontSize: 11 },
    };
    const series = fields.map((f, i) => {
      const color = theme.colors[f.tone || toneNames[i % 6]];
      return {
        id: f.key,
        name: f.label,
        type: f.shape === 'bar' ? 'bar' : 'line',
        data: rows.map((r, index) => {
          const y = value(r, f.key);
          const v = numeric || temporal ? [position(r, index), y] : y;
          return {
            value: v,
            itemStyle: { color: theme.colors[r.tone] || color },
          };
        }),
        ...(numeric || temporal ? { encode: { x: 0, y: 1 } } : {}),
        smooth: false,
        sampling: undefined,
        connectNulls: f.connectGaps === true,
        step: f.shape === 'step' ? 'end' : false,
        showSymbol: rows.length === 1,
        symbolSize: 5,
        lineStyle: { color, width: 2.5 },
        itemStyle: { color },
        areaStyle: f.area ? { color, opacity: 0.12, origin: 0 } : undefined,
        barMaxWidth: horizontal ? 22 : 30,
        barGap: barMode === 'diverging' ? '-100%' : '25%',
        emphasis: { disabled: true },
        ...(i === 0 && finite(reference?.value)
          ? {
              markLine: {
                silent: true,
                symbol: 'none',
                animation: false,
                lineStyle: {
                  type: 'dashed',
                  color: theme.colors['chart-copper'],
                  width: 1.5,
                },
                label: {
                  formatter: reference.label || '',
                  position: 'insideEndTop',
                  color: theme.text,
                },
                data: [{ [horizontal ? 'xAxis' : 'yAxis']: reference.value }],
              },
            }
          : {}),
      };
    });
    return {
      animation: false,
      useUTC: true,
      textStyle: { fontFamily: theme.font },
      grid: {
        left: horizontal ? 136 : 62,
        right: 24,
        top: 32,
        bottom: xTickRotation ? 100 : 56,
      },
      xAxis: horizontal ? valueAxis : categoryAxis,
      yAxis: horizontal ? categoryAxis : valueAxis,
      series,
    };
  }
  function instance(host, height) {
    return (
      FinanceECharts.getInstanceByDom(host) ||
      FinanceECharts.init(host, null, {
        renderer: 'svg',
        width: Math.max(1, host.clientWidth || 600),
        height,
      })
    );
  }
  function render(host, option, height) {
    const engine = instance(host, height);
    engine.resize({ width: Math.max(1, host.clientWidth || 600), height });
    engine.setOption(option, { notMerge: true });
    const svg = host.querySelector('svg');
    svg?.setAttribute('viewBox', `0 0 ${engine.getWidth()} ${height}`);
    return engine;
  }
  function dispose(host) {
    FinanceECharts.getInstanceByDom(host)?.dispose();
  }
  function state(host) {
    return FinanceECharts.getInstanceByDom(host)?.getOption();
  }
  return { palette, plotOption, render, dispose, state };
})();
if (typeof module !== 'undefined') module.exports = FinanceChartRenderer;
