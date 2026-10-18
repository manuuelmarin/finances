const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const releases = JSON.parse(
  fs.readFileSync(path.join(root, 'tools/install-releases.json'), 'utf8'),
);
const currentVersion = JSON.parse(
  fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
).version;
const baselineVersion = Object.keys(releases).find(
  (version) => version !== currentVersion,
);
const baseline = releases[baselineVersion];
const installFiles = ['Code.gs', 'Bridge.html', 'appsscript.json'];
const { buildRuntime } = require('../../tools/build-runtime.cjs');
const fileCount = installFiles.length;
const current = releases[currentVersion];

test('unknown baseline keeps all files visible and never labels them as new', async ({
  page,
}) => {
  await page.goto('/install.html');
  const sections = page.locator('.code-section');
  await expect(sections).toHaveCount(fileCount);
  await expect(page.locator('#release-summary')).toContainText(
    'obligatorios los ' + fileCount + ' archivos',
  );
  await expect(page.locator('.file-status')).toHaveText(
    Array(fileCount).fill('SIN REFERENCIA'),
  );
  expect(
    await sections.evaluateAll((items) => items.every((item) => !item.hidden)),
  ).toBe(true);
});

test('@responsive release comparison assigns truthful per-file badges and filters without removing code', async ({
  page,
}) => {
  await page.goto('/install.html');
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page.locator('#installed-release').selectOption(baselineVersion);
  const changedNames = Object.keys(current).filter(
    (name) => baseline[name] !== current[name],
  );
  await expect(page.locator('#release-summary')).toContainText(
    changedNames.length + ' de ' + fileCount + ' archivos',
  );
  const sections = await page.locator('.code-section').evaluateAll((items) =>
    items.map((item) => ({
      name: item.dataset.fileName,
      status: item.querySelector('[data-file-status]').textContent,
    })),
  );
  for (const section of sections) {
    expect(section.status).toBe(
      !Object.hasOwn(baseline, section.name)
        ? 'NUEVO'
        : baseline[section.name] === current[section.name]
          ? 'SIN CAMBIOS'
          : 'MODIFICADO',
    );
  }
  await page.locator('#changed-only').check();
  expect(
    await page
      .locator('.code-section')
      .evaluateAll((items) =>
        items
          .filter((item) => !item.hidden)
          .map((item) => item.dataset.fileName),
      ),
  ).toEqual(changedNames);
  expect(await page.locator('.code-section').count()).toBe(fileCount);
  await page.locator('#changed-only').uncheck();
  expect(
    await page
      .locator('.code-section')
      .evaluateAll((items) => items.every((item) => !item.hidden)),
  ).toBe(true);
  await page.locator('#changed-only').check();
  await page.locator('#installed-release').selectOption('');
  await expect(page.locator('#changed-only')).not.toBeChecked();
  await expect(page.locator('#changed-only')).toBeDisabled();
  expect(
    await page
      .locator('.code-section')
      .evaluateAll((items) => items.every((item) => !item.hidden)),
  ).toBe(true);
});

test('synthetic release identifies new files and tells users to retire removed files', async ({
  page,
}) => {
  const synthetic = { ...current };
  delete synthetic['Code.gs'];
  synthetic['RetiredModule.gs'] = 'a'.repeat(64);
  await page.route('**/install.html', async (route) => {
    const response = await route.fetch();
    const html = await response.text();
    const match = html.match(
      /(<template id="install-releases"[\s\S]*?>)([\s\S]*?)(<\/template\s*>)/,
    );
    expect(match).not.toBeNull();
    const catalog = JSON.parse(match[2]);
    catalog['3.9.2'] = synthetic;
    await route.fulfill({
      response,
      body: html.replace(
        match[0],
        match[1] + JSON.stringify(catalog) + match[3],
      ),
    });
  });
  await page.goto('/install.html');
  await page.locator('#installed-release').evaluate((select) => {
    select.add(new Option('3.9.2', '3.9.2'));
  });
  await page.locator('#installed-release').selectOption('3.9.2');
  await expect(
    page.locator('[data-file-name="Code.gs"] [data-file-status]'),
  ).toHaveText('NUEVO');
  await expect(page.locator('#removed-files')).toContainText(
    'RetiredModule.gs',
  );
  await expect(page.locator('#removed-files')).toContainText(
    'backend está aislado',
  );
  await expect(page.locator('#removed-files')).toContainText(
    'pueden permanecer sin usarse',
  );
  await expect(page.locator('.code-section')).toHaveCount(fileCount);
  expect(
    await page.locator('[data-file-name="Code.gs"] pre').textContent(),
  ).toBe(buildRuntime());
});

test('installer copies exact files without claiming an installed baseline', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/install.html');
  for (const [index, name] of installFiles.entries()) {
    const id = index + 1;
    const button = page.locator('[data-copy="code-' + id + '"]');
    await expect(button).toHaveText('Copiar ' + name);
    const expected = await page.locator('#code-' + id).textContent();
    await button.click();
    await expect(page.locator('#copy-status')).toContainText(
      name + ' copiado.',
    );
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      expected,
    );
    if (name === 'Bridge.html')
      expect(expected.trim()).toMatch(/^<!doctype html>/i);
  }
  await expect(page.locator('#installed-release')).toHaveValue('');
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});
