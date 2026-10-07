const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const target = path.join(root, 'web/install.html');
const escapeHtml = (text) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
let page = fs.readFileSync(target, 'utf8');
for (const [i, name] of [
  'Code.gs',
  'Bridge.html',
  'appsscript.json',
].entries()) {
  const code = escapeHtml(
    fs.readFileSync(path.join(root, 'apps-script', name), 'utf8'),
  );
  const expression = new RegExp(
    '(<pre id="code-' + i + '"[^>]*>)[\\s\\S]*?(</pre>)',
  );
  if (!expression.test(page))
    throw new Error('Missing installation block ' + name);
  page = page.replace(expression, (_, open, close) => open + code + close);
}
fs.writeFileSync(target, page);
console.log(
  'Código de instalación actualizado desde los tres archivos de Apps Script.',
);
