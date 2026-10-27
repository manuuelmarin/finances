// Read the real renderer's public options; visual/interaction checks use the DOM.
async function chartState(chart) {
  return chart
    .locator('.finance-chart, .donut-chart')
    .first()
    .evaluate((node) => FinanceChartRenderer.state(node));
}
async function chartSeries(chart) {
  return (await chartState(chart)).series;
}
module.exports = { chartState, chartSeries };
