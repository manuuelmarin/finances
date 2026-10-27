const { chartState, chartSeries } = require('./helpers/charts.cjs');
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

test('charts expose accessible date bounds, reference line and export menu', async ({
  page,
}) => {
  await page.setContent('<main id="host"></main>');
  await page.addStyleTag({
    path: path.join(__dirname, '../../web/styles.css'),
  });
  await page.addScriptTag({
    path: path.join(__dirname, '../../web/vendor/echarts.min.js'),
  });
  await page.addScriptTag({
    path: path.join(__dirname, '../../web/chart-renderer.js'),
  });
  await page.addScriptTag({
    path: path.join(__dirname, '../../web/charts.js'),
  });
  await page.evaluate(() => {
    window.ResizeObserver = class {
      observe() {}
      disconnect() {}
    };
    FinanceCharts.plot(document.querySelector('#host'), {
      title: 'Evolución',
      rows: [
        { date: '2026-01-01', total: 100 },
        { date: '2026-02-01', total: null },
        { date: '2026-03-01', total: 140 },
        { date: '2026-04-01', total: 160 },
      ],
      fields: [{ key: 'total', label: 'Total' }],
      reference: { value: 120, label: 'Objetivo' },
    });
  });
  await expect(page.getByLabel('Desde Evolución')).toHaveValue('2026-01-01');
  expect(
    (await chartSeries(page.locator('.chart-card')))[0].markLine.data[0],
  ).toMatchObject({ yAxis: 120 });
  await expect(page.locator('.chart-menu summary')).toHaveAttribute(
    'aria-label',
    'Acciones del gráfico: Evolución',
  );
  const graph = page.locator('.finance-chart');
  await graph.focus();
  await page.keyboard.press('Home');
  await expect(page.locator('.chart-readout')).toContainText('01 ene 2026');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.chart-readout')).toContainText('01 feb 2026');
  await expect(page.locator('.chart-readout')).toContainText('Total: Sin dato');
  await page.getByLabel('Desde Evolución').fill('2026-02-01');
  await page.getByLabel('Desde Evolución').dispatchEvent('change');
  await expect(page.getByLabel('Desde Evolución')).toHaveValue('2026-02-01');
  await expect(graph).toHaveAttribute('data-range', '2026-02-01 – 2026-04-01');
  const chart = page.locator('.chart-card');
  await expect(chart.getByLabel('Límite inicial del periodo')).toHaveValue(
    '31',
  );
  await chart.locator('.chart-data > summary').click();
  await expect(chart.locator('tbody tr')).toHaveCount(3);
  await chart.locator('.chart-data > summary').click();
  await page.getByLabel('Desde Evolución').fill('2026-01-01');
  await page.getByLabel('Desde Evolución').dispatchEvent('change');
  await page.locator('.chart-menu summary').click();
  const svgDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar SVG' }).click();
  const svgDownload = await svgDownloadPromise;
  const svgPath = await svgDownload.path();
  const svgText = fs.readFileSync(svgPath, 'utf8');
  expect(svgText).toMatch(/stroke="(?:#91d8bd|rgb\(145, 216, 189\))"/i);
  expect(svgText).toContain('fill="#fff"');
  const pngDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar PNG' }).click();
  const pngDownload = await pngDownloadPromise;
  const pngBuffer = fs.readFileSync(await pngDownload.path());
  expect(
    pngBuffer
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  ).toBeTruthy();
  const mintPixels = await page.evaluate(
    (base64) =>
      new Promise((resolve, reject) => {
        const image = new Image();
        image.onerror = reject;
        image.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = image.width;
          canvas.height = image.height;
          const context = canvas.getContext('2d');
          context.drawImage(image, 0, 0);
          const pixels = context.getImageData(
            0,
            0,
            canvas.width,
            canvas.height,
          ).data;
          let count = 0;
          for (let i = 0; i < pixels.length; i += 4)
            if (
              pixels[i] === 145 &&
              pixels[i + 1] === 216 &&
              pixels[i + 2] === 189
            )
              count++;
          resolve(count);
        };
        image.src = 'data:image/png;base64,' + base64;
      }),
    pngBuffer.toString('base64'),
  );
  expect(mintPixels).toBeGreaterThan(20);
  await page.getByLabel('Desde Evolución').fill('2026-05-01');
  await page.getByLabel('Desde Evolución').dispatchEvent('change');
  await page.getByLabel('Hasta Evolución').fill('2026-06-01');
  await page.getByLabel('Hasta Evolución').dispatchEvent('change');
  await expect(page.locator('.chart-readout')).toHaveText(
    'Sin datos en este periodo',
  );
});

test('sparse date windows keep daily range handles ordered without fabricating observations', async ({
  page,
}) => {
  await page.setContent('<main id="host"></main>');
  await page.addScriptTag({
    path: path.join(__dirname, '../../web/vendor/echarts.min.js'),
  });
  await page.addScriptTag({
    path: path.join(__dirname, '../../web/chart-renderer.js'),
  });
  await page.addScriptTag({
    path: path.join(__dirname, '../../web/charts.js'),
  });
  await page.evaluate(() => {
    FinanceCharts.plot(document.querySelector('#host'), {
      title: 'Serie dispersa',
      rows: [
        { date: '2026-01-01', total: 100 },
        { date: '2026-03-01', total: 120 },
      ],
      fields: [{ key: 'total', label: 'Total' }],
    });
  });
  await page.getByLabel('Desde Serie dispersa').fill('2026-01-15');
  await page.getByLabel('Desde Serie dispersa').dispatchEvent('change');
  await page.getByLabel('Hasta Serie dispersa').fill('2026-02-15');
  await page.getByLabel('Hasta Serie dispersa').dispatchEvent('change');
  await expect(page.getByLabel('Límite inicial del periodo')).toHaveValue('14');
  await expect(page.getByLabel('Límite final del periodo')).toHaveValue('45');
  await expect(page.locator('.chart-readout')).toHaveText(
    'Sin datos en este periodo',
  );
  expect((await chartSeries(page.locator('.chart-card')))[0].data).toHaveLength(
    0,
  );
  await page
    .getByLabel('Límite inicial del periodo')
    .evaluate((input) => (input.value = '0'));
  await page.getByLabel('Límite inicial del periodo').dispatchEvent('input');
  await expect(page.getByLabel('Desde Serie dispersa')).toHaveValue(
    '2026-01-01',
  );
  await expect(page.locator('.chart-readout')).toContainText('100,00');
  await page.getByLabel('Desde Serie dispersa').fill('2026-02-20');
  await page.getByLabel('Desde Serie dispersa').dispatchEvent('change');
  await expect(page.getByRole('alert')).toContainText('anterior o igual');
  await expect(page.locator('.finance-chart')).toHaveAttribute(
    'data-range',
    '2026-01-01 – 2026-02-15',
  );
});

test('chart CSV neutralizes formula-like labels and preserves numeric negatives', async ({
  page,
}) => {
  await page.setContent('<main id="host"></main>');
  await page.addStyleTag({
    path: path.join(__dirname, '../../web/styles.css'),
  });
  await page.addScriptTag({
    path: path.join(__dirname, '../../web/vendor/echarts.min.js'),
  });
  await page.addScriptTag({
    path: path.join(__dirname, '../../web/chart-renderer.js'),
  });
  await page.addScriptTag({
    path: path.join(__dirname, '../../web/charts.js'),
  });
  await page.evaluate(() => {
    FinanceCharts.donut(document.querySelector('#host'), {
      title: 'Categorías',
      rows: [
        { label: '=1+1', value: 4 },
        { label: '-texto', value: -2 },
        { label: '@formula', value: 1 },
      ],
    });
  });
  await page.locator('.chart-menu summary').click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar CSV' }).click();
  const file = await (await downloadPromise).path();
  const csv = fs.readFileSync(file, 'utf8');
  expect(csv).toContain('"\'=1+1";4');
  expect(csv).toContain('"\'-texto";-2');
  expect(csv).toContain('"\'@formula";1');
  const svgPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar SVG' }).click();
  const donutSvg = fs.readFileSync(await (await svgPromise).path(), 'utf8');
  expect(donutSvg).toMatch(/=1\+1: 4,00.{1}€/);
  expect(donutSvg).toContain('fill="rgb(145, 216, 189)"');
});

test('frequency charts expose integer counts without currency in axes, data, or CSV', async ({
  page,
}) => {
  await page.setContent('<main id="host"></main>');
  await page.addStyleTag({
    path: path.join(__dirname, '../../web/styles.css'),
  });
  await page.addScriptTag({
    path: path.join(__dirname, '../../web/vendor/echarts.min.js'),
  });
  await page.addScriptTag({
    path: path.join(__dirname, '../../web/chart-renderer.js'),
  });
  await page.addScriptTag({
    path: path.join(__dirname, '../../web/charts.js'),
  });
  await page.evaluate(() => {
    FinanceCharts.plot(document.querySelector('#host'), {
      title: 'Frecuencia ficticia',
      unit: 'count',
      rows: [
        { label: '1,00–<2,00 €', value: 5 },
        { label: '2,00–<3,00 €', value: 0 },
        { label: '3,00–<4,00 €', value: 2 },
      ],
      fields: [{ key: 'value', label: 'Movimientos', shape: 'bar' }],
    });
  });
  const chart = page.locator('.chart-card');
  expect((await chartState(chart)).yAxis[0].name).toBe('Recuento');
  await chart.locator('.chart-data > summary').click();
  await expect(chart.locator('tbody')).toContainText('5');
  await expect(chart.locator('tbody')).not.toContainText('5,00');
  await chart.locator('.chart-menu summary').click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar CSV' }).click();
  const csv = fs.readFileSync(await (await downloadPromise).path(), 'utf8');
  expect(csv).toContain('"1,00–<2,00 €";5');
  expect(csv).toContain('"2,00–<3,00 €";0');
  expect(csv).not.toContain('5,00 €');
  await page.evaluate(() => {
    FinanceCharts.clear(document.querySelector('#host'));
    FinanceCharts.plot(document.querySelector('#host'), {
      title: 'Nueve movimientos',
      unit: 'count',
      rows: [{ label: '0–<10', value: 9 }],
      fields: [{ key: 'value', label: 'Movimientos', shape: 'bar' }],
    });
  });
  const countAxis = (await chartState(page.locator('.chart-card'))).yAxis[0];
  expect(countAxis.minInterval).toBe(1);
  expect(countAxis.min).toBe(0);
  await expect(page.locator('.chart-card svg')).toContainText('Recuento');
});
