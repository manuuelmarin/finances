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
