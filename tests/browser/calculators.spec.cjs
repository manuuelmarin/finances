const { test, expect } = require('@playwright/test');
const { navigate } = require('./helpers/navigation.cjs');

async function fill(page, prefix, values) {
  for (const [field, value] of Object.entries(values))
    await page.locator(`#${prefix}-${field}`).fill(String(value));
}

test('existing investment and mortgage forms preserve ordinary calculations and clear stale errors', async ({
  page,
}) => {
  await page.goto('/');
  await navigate(page, 'tools');
  await fill(page, 'inflation', {
    capital: 1000,
    monthly: 100,
    return: 5,
    years: 10,
    rate: 2,
  });
  await page.locator('#inflation-form button').click();
  await expect(page.locator('#inflation-result-value')).toContainText(
    '17.065,21',
  );
  await expect(page.locator('#inflation-result-real')).toContainText(
    '13.999,42',
  );
  await fill(page, 'inflation', { return: -12, rate: -2 });
  await page.locator('#inflation-form button').click();
  await expect(page.locator('#inflation-result')).toBeVisible();
  await fill(page, 'mortgage', {
    price: 200000,
    'down-payment': 40000,
    rate: 3,
    years: 20,
    costs: 5000,
  });
  await page.locator('#mortgage-form button').click();
  await expect(page.locator('#mortgage-payment')).toContainText('887,36');
  await expect(page.locator('#mortgage-initial-cash')).toContainText(
    '45.000,00',
  );
  await fill(page, 'mortgage', { 'down-payment': 200001 });
  await page.locator('#mortgage-form button').click();
  await expect(page.locator('#mortgage-message')).toContainText(
    'no puede superar',
  );
  await expect(page.locator('#mortgage-result')).toBeHidden();
  await fill(page, 'mortgage', { 'down-payment': 40000, rate: 0 });
  await expect(page.locator('#mortgage-message')).toBeHidden();
  await page.locator('#mortgage-form button').click();
  await expect(page.locator('#mortgage-payment')).toContainText('666,67');
});

test('planning forms accept actual month deadlines and reject overflowing zero-capital annuity', async ({
  page,
}) => {
  await page.goto('/');
  await navigate(page, 'tools');
  await fill(page, 'goal-time', {
    capital: 1000,
    monthly: 100,
    target: 2250,
    annualReturn: 0,
  });
  await page.locator('#goal-time-form button').click();
  await expect(page.locator('#goal-time-result')).toContainText('13 meses');
  await fill(page, 'goal-time', {
    capital: 0,
    monthly: 100,
    target: 1000,
    annualReturn: -12,
  });
  await page.locator('#goal-time-form button').click();
  await expect(page.locator('#goal-time-result')).toContainText(
    'Plazo estimado',
  );
  for (const months of [1, 6, 18, 60]) {
    await fill(page, 'goal-saving', {
      capital: 0,
      target: 1201.92,
      months,
      annualReturn: 0,
    });
    await page.locator('#goal-saving-form button').click();
    await expect(page.locator('#goal-saving-result')).toContainText(
      `${months} meses`,
    );
  }
  await fill(page, 'goal-saving', { months: 12 });
  await page.locator('#goal-saving-form button').click();
  await expect(page.locator('#goal-saving-result')).toContainText('100,16');
  await fill(page, 'goal-saving', {
    target: 10000,
    months: 12000,
    annualReturn: 110,
  });
  await page.locator('#goal-saving-form button').click();
  await expect(page.locator('#goal-saving-message')).toContainText('rango');
  await expect(page.locator('#goal-saving-result')).toBeHidden();
  await fill(page, 'goal-saving', { months: 18, annualReturn: -12 });
  await expect(page.locator('#goal-saving-message')).toBeHidden();
  await page.locator('#goal-saving-form button').click();
  await expect(page.locator('#goal-saving-result')).toBeVisible();
  await fill(page, 'liquidity', {
    essentialMonthly: 1200,
    liquidCapital: 3000,
    targetMonths: 6,
  });
  await page.locator('#liquidity-form button').click();
  await expect(page.locator('#liquidity-result')).toContainText('2,5 meses');
});

test('integrated early repayment compares fees, quota and term and handles full/zero repayment', async ({
  page,
}) => {
  await page.goto('/');
  await navigate(page, 'tools');
  await page
    .locator('summary')
    .filter({ hasText: 'Comparar una amortización' })
    .click();
  await fill(page, 'repayment', {
    outstanding: 1200,
    months: 12,
    annualRate: 0,
    repayment: 300,
    feeRate: 1,
    availableCash: 500,
  });
  await page.locator('#repayment-form button').click();
  await expect(page.locator('#repayment-summary')).toContainText('197,00');
  const rows = page.locator('#repayment-comparison tr');
  await expect(rows.nth(1)).toContainText('75,00');
  await expect(rows.nth(2)).toContainText('9');
  await expect(rows.nth(2)).toContainText('-3,00');
  await fill(page, 'repayment', { repayment: 0 });
  await page.locator('#repayment-form button').click();
  await expect(rows.nth(2)).toContainText('12');
  await fill(page, 'repayment', { repayment: 1200 });
  await page.locator('#repayment-form button').click();
  await expect(rows.nth(1).locator('td').nth(1)).toHaveText('0');
  await fill(page, 'repayment', { repayment: 1201 });
  await page.locator('#repayment-form button').click();
  await expect(page.locator('#repayment-message')).toContainText(
    'no puede superar',
  );
  await fill(page, 'repayment', { repayment: 300, annualRate: 3 });
  await expect(page.locator('#repayment-message')).toBeHidden();
  await page.locator('#repayment-form button').click();
  await expect(page.locator('#repayment-result')).toBeVisible();
});
