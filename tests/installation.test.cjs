const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');

const manifest = JSON.parse(
  fs.readFileSync(path.join(root, 'apps-script/modules.json'), 'utf8'),
);
const installedFiles = [...manifest.scripts, 'Bridge.html', 'appsscript.json'];

test('los bloques copiables contienen exactamente cada archivo vigente en el orden del manifiesto', () => {
  const page = fs.readFileSync(path.join(root, 'web/install.html'), 'utf8');
  for (const [i, name] of installedFiles.entries()) {
    const id = i + 1;
    const match = page.match(
      new RegExp('<pre id="code-' + id + '"[^>]*>([\\s\\S]*?)</pre>'),
    );
    assert.ok(match, name);
    assert.match(
      page,
      new RegExp('<h2 id="file-' + id + '">' + name + '</h2>'),
    );
    assert.match(
      page,
      new RegExp(
        '<button type="button" data-copy="code-' +
          id +
          '">Copiar ' +
          name +
          '</button>',
      ),
    );
    const decoded = match[1]
      .replace(/&#x27;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&gt;/g, '>')
      .replace(/&lt;/g, '<')
      .replace(/&amp;/g, '&');
    assert.equal(
      decoded,
      fs.readFileSync(path.join(root, 'apps-script', name), 'utf8'),
    );
  }
});

test('las versiones del instalador y todos los módulos de backend coinciden con el paquete vigente', () => {
  const version = JSON.parse(
    fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
  ).version;
  const backend = manifest.scripts
    .map((name) =>
      fs.readFileSync(path.join(root, 'apps-script', name), 'utf8'),
    )
    .join('\n');
  assert.equal(backend.match(/const BUILD_VERSION_ = '([^']+)';/)[1], version);
  const page = fs.readFileSync(path.join(root, 'web/install.html'), 'utf8');
  const versions = [
    ...page.matchAll(/(?:Entrega|ENTREGA|buildVersion) (\d+\.\d+\.\d+)/g),
  ].map((m) => m[1]);
  assert.ok(versions.length >= 1);
  assert.deepEqual([...new Set(versions)], [version]);
});

test('la actualización conserva la implementación privada y exige publicar nueva versión', () => {
  const page = fs.readFileSync(path.join(root, 'web/install.html'), 'utf8');
  assert.match(page, /Gestionar implementaciones[\s\S]*?Nueva versión/);
  assert.match(page, /Conserva esa implementación y su[\s\S]*?URL/);
  assert.match(page, /ejecuta como <strong>Yo<\/strong>[\s\S]*?Solo yo/);
  assert.match(page, /ENVIRONMENT=test/);
  assert.match(page, /recarga Finanzas[\s\S]*?API y el bridge vigentes/);
});

test('el constructor rechaza manifiestos duplicados, inseguros o incompletos', () => {
  const manifestPath = path.join(
    os.tmpdir(),
    'modules-' + crypto.randomUUID() + '.json',
  );
  const valid = manifest;
  try {
    for (const scripts of [
      [...valid.scripts, valid.scripts[0]],
      [...valid.scripts.slice(0, -1), '../outside.gs'],
      [...valid.scripts.slice(0, -1), 'other.txt'],
      valid.scripts.slice(0, -1),
    ]) {
      fs.writeFileSync(manifestPath, JSON.stringify({ scripts }));
      const result = spawnSync(
        process.execPath,
        [path.join(root, 'tools/build-install.cjs')],
        {
          cwd: root,
          encoding: 'utf8',
          env: { ...process.env, INSTALL_MODULES_MANIFEST: manifestPath },
        },
      );
      assert.notEqual(result.status, 0);
    }
  } finally {
    fs.rmSync(manifestPath, { force: true });
  }
});

const releases = JSON.parse(
  fs.readFileSync(path.join(root, 'tools/install-releases.json'), 'utf8'),
);
const packageVersion = JSON.parse(
  fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
).version;
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
    [...installedFiles].sort(),
  );
  for (const name of installedFiles)
    assert.equal(releases[packageVersion][name], hash(name));
});

test('every supported installer baseline has valid filenames and complete SHA-256 hashes', () => {
  for (const [version, files] of Object.entries(releases)) {
    assert.match(version, /^\d+\.\d+\.\d+$/);
    assert.ok(Object.keys(files).length > 0);
    for (const [name, digest] of Object.entries(files)) {
      assert.match(
        name,
        /^(?:[A-Za-z][A-Za-z0-9]*\.(?:gs|html)|appsscript\.json)$/,
      );
      assert.match(digest, /^[a-f0-9]{64}$/);
    }
  }
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
