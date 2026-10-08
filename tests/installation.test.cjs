const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

test('los bloques copiables contienen exactamente los tres archivos vigentes', () => {
  const page = fs.readFileSync(path.join(root, 'web/install.html'), 'utf8');
  for (const [i, name] of [
    'Code.gs',
    'Bridge.html',
    'appsscript.json',
  ].entries()) {
    const match = page.match(
      new RegExp('<pre id="code-' + i + '"[^>]*>([\\s\\S]*?)</pre>'),
    );
    assert.ok(match, name);
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

test('las versiones del instalador y backend coinciden con el paquete vigente', () => {
  const version = JSON.parse(
    fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
  ).version;
  const backend = fs.readFileSync(
    path.join(root, 'apps-script/Code.gs'),
    'utf8',
  );
  assert.equal(backend.match(/const BUILD_VERSION_ = '([^']+)';/)[1], version);
  const page = fs.readFileSync(path.join(root, 'web/install.html'), 'utf8');
  const versions = [
    ...page.matchAll(/(?:Entrega|ENTREGA|buildVersion) (\d+\.\d+\.\d+)/g),
  ].map((m) => m[1]);
  assert.ok(versions.length >= 3);
  assert.deepEqual([...new Set(versions)], [version]);
  assert.ok(page.includes('La activación del principal está suspendida'));
});
