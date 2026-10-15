async function navigate(page, view) {
  const parentView = { goals: 'budgets', activity: 'connection' }[view] || view;
  const button = page
    .locator(`nav [data-view="${parentView}"]:visible`)
    .first();
  if (!(await button.count())) {
    await page.locator('#mobile-menu').click();
    await page
      .locator(`#navigation-dialog [data-view="${parentView}"]`)
      .waitFor({ state: 'visible' });
  }
  await button.click();
  await page.locator('#view-' + parentView).waitFor({ state: 'visible' });
  if (view === 'goals') {
    const goals = page.locator('#goals-panel');
    await goals.scrollIntoViewIfNeeded();
  }
  if (view === 'activity') {
    const activity = page.locator('#activity-panel');
    if (!(await activity.evaluate((node) => node.open)))
      await activity.locator('summary').first().click();
    await activity.scrollIntoViewIfNeeded();
  }
}
async function diagnostic(page) {
  await navigate(page, 'connection');
  const details = page.locator('#connection-diagnostics');
  if (!(await details.evaluate((node) => node.open)))
    await details.locator('summary').click();
}
module.exports = { navigate, diagnostic };
