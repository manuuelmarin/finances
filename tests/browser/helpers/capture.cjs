const { test } = require('@playwright/test');

// Optional diagnostic images are not visual assertions. Failure screenshots and
// traces are controlled independently by Playwright's configuration.
async function capture(page, name, { fullPage = true } = {}) {
  if (process.env.FINANCE_CAPTURE_SUCCESS !== '1') return;
  await page.screenshot({
    path: test.info().outputPath(name + '.png'),
    fullPage,
    scale: 'css',
  });
}
module.exports = { capture };
