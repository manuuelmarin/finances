const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, 'apps-script/modules.json'), 'utf8'),
);
const releases = JSON.parse(
  fs.readFileSync(path.join(root, 'tools/install-releases.json'), 'utf8'),
);
const packageVersion = JSON.parse(
  fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
).version;
const names = [...manifest.scripts, 'Bridge.html', 'appsscript.json'];
const hash = (name) =>
  crypto
    .createHash('sha256')
    .update(fs.readFileSync(path.join(root, 'apps-script', name)))
    .digest('hex');

test('the current release hash manifest exactly covers the shipped source files', () => {
  assert.ok(
    releases[packageVersion],
    'current release must have a frozen hash entry',
  );
  assert.deepEqual(
    Object.keys(releases[packageVersion]).sort(),
    [...names].sort(),
  );
  for (const name of names)
    assert.equal(releases[packageVersion][name], hash(name));
});

test('the frozen 3.9.3 baseline contains all 15 installer files', () => {
  const legacyNames = [
    'Code.gs',
    'Configuration.gs',
    'AccessAndUtilities.gs',
    'BackendAndReporting.gs',
    'DailyHistory.gs',
    'DailyPriceAutomation.gs',
    'OperatorChecks.gs',
    'PriceHistory.gs',
    'PriceProvidersAndRefresh.gs',
    'StateAndValidation.gs',
    'Operations.gs',
    'SupportAndCapacity.gs',
    'Transactions.gs',
    'Bridge.html',
    'appsscript.json',
  ];
  const baseline = releases['3.9.3'];
  assert.deepEqual(Object.keys(baseline).sort(), legacyNames.sort());
  const canonical = JSON.stringify(
    Object.fromEntries(
      Object.entries(baseline).sort(([a], [b]) => a.localeCompare(b)),
    ),
  );
  assert.equal(
    crypto.createHash('sha256').update(canonical).digest('hex'),
    'fc04616a97746ceecfb37307ea7dd3d7a81533731d20c499bc829b6e65ad4129',
  );
});

test('generated installer exposes known versions and starts with no asserted baseline', () => {
  const page = fs.readFileSync(path.join(root, 'web/install.html'), 'utf8');
  assert.match(page, /<option value="">No sé \/ instalación nueva<\/option>/);
  for (const version of Object.keys(releases))
    assert.match(
      page,
      new RegExp('<option value="' + version + '">' + version + '<\/option>'),
    );
  assert.match(page, /data-current-version="\d+\.\d+\.\d+"/);
  assert.match(page, /id="changed-only" type="checkbox"/);
  assert.match(page, /id="install-releases"[^>]*>\s*\{/);
});

test('a rejected new release does not modify the frozen release catalogue', () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'installer-fixture-'));
  try {
    fs.cpSync(
      path.join(root, 'apps-script'),
      path.join(fixture, 'apps-script'),
      {
        recursive: true,
      },
    );
    fs.mkdirSync(path.join(fixture, 'tools'));
    fs.mkdirSync(path.join(fixture, 'web'));
    fs.copyFileSync(
      path.join(root, 'tools/build-install.cjs'),
      path.join(fixture, 'tools/build-install.cjs'),
    );
    fs.copyFileSync(
      path.join(root, 'tools/install-template.html'),
      path.join(fixture, 'tools/install-template.html'),
    );
    const releaseFile = path.join(fixture, 'tools/install-releases.json');
    fs.copyFileSync(
      path.join(root, 'tools/install-releases.json'),
      releaseFile,
    );
    fs.writeFileSync(
      path.join(fixture, 'package.json'),
      JSON.stringify({ version: '99.0.0' }),
    );
    const before = fs.readFileSync(releaseFile, 'utf8');
    const result = spawnSync(
      process.execPath,
      [path.join(fixture, 'tools/build-install.cjs')],
      { cwd: fixture, encoding: 'utf8' },
    );
    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /Package and Apps Script build versions differ/,
    );
    assert.equal(fs.readFileSync(releaseFile, 'utf8'), before);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});
