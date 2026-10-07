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
