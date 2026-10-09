async function navigate(page, view) {
  const button = page.locator(`nav [data-view="${view}"]:visible`).first();
  if (!(await button.count())) await page.locator('#mobile-menu').click();
  await button.click();
  await page.locator('#view-' + view).waitFor({ state: 'visible' });
}
async function diagnostic(page) {
  await navigate(page, 'connection');
  const details = page.locator('#connection-diagnostics');
  if (!(await details.evaluate((node) => node.open)))
    await details.locator('summary').click();
}
module.exports = { navigate, diagnostic };
