const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const appScript = path.join(root, 'apps-script');
const packageVersion = JSON.parse(
  fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
).version;
const manifest = JSON.parse(
  fs.readFileSync(
    process.env.INSTALL_MODULES_MANIFEST ||
      path.join(appScript, 'modules.json'),
    'utf8',
  ),
);
if (!Array.isArray(manifest.scripts) || manifest.scripts.length === 0)
  throw new Error('Apps Script module manifest must contain scripts');

const scripts = manifest.scripts;
if (new Set(scripts).size !== scripts.length)
  throw new Error('Apps Script module manifest contains duplicate paths');
for (const name of scripts) {
  if (
    typeof name !== 'string' ||
    !name.endsWith('.gs') ||
    path.isAbsolute(name) ||
    name.split(/[\\/]/).includes('..') ||
    name.includes('/') ||
    name.includes('\\')
  )
    throw new Error('Invalid Apps Script module path: ' + name);
}
const diskScripts = fs
  .readdirSync(appScript)
  .filter((name) => name.endsWith('.gs'))
  .sort();
const manifestScripts = [...scripts].sort();
if (JSON.stringify(diskScripts) !== JSON.stringify(manifestScripts))
  throw new Error(
    'Manifest must include every Apps Script .gs file exactly once',
  );

const files = [
  ...scripts.map((name) => ({
    name,
    source: fs.readFileSync(path.join(appScript, name), 'utf8'),
  })),
  {
    name: 'Bridge.html',
    source: fs.readFileSync(path.join(appScript, 'Bridge.html'), 'utf8'),
  },
  {
    name: 'appsscript.json',
    source: fs.readFileSync(path.join(appScript, 'appsscript.json'), 'utf8'),
  },
];
const serverSource = files
  .filter(({ name }) => name.endsWith('.gs'))
  .map(({ source }) => source)
  .join('\n');
const buildVersion = serverSource.match(
  /const BUILD_VERSION_ = '([^']+)';/,
)?.[1];
if (buildVersion !== packageVersion)
  throw new Error('Package and Apps Script build versions differ');
const bridgeVersion = files
  .find(({ name }) => name === 'Bridge.html')
  .source.match(/const BRIDGE_VERSION = '([^']+)';/)?.[1];
if (bridgeVersion !== packageVersion)
  throw new Error('Package and Bridge build versions differ');

const escapeHtml = (text) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
const sections = files
  .map(({ name, source }, index) => {
    const fileNumber = index + 1;
    const filename = escapeHtml(name);
    const codeId = 'code-' + fileNumber;
    const headingId = 'file-' + fileNumber;
    const instruction = scripts.includes(name)
      ? 'Añade o sustituye el archivo indicado en el proyecto de Apps Script.'
      : 'Sustituye el contenido del archivo indicado por este código.';
    return [
      '<section class="code-section" aria-labelledby="' + headingId + '">',
      '  <header>',
      '    <div>',
      '      <p class="eyebrow">ARCHIVO ' +
        fileNumber +
        ' DE ' +
        files.length +
        '</p>',
      '      <h2 id="' + headingId + '">' + filename + '</h2>',
      '    </div>',
      '    <button type="button" data-copy="' +
        codeId +
        '">Copiar ' +
        filename +
        '</button>',
      '  </header>',
      '  <p>' + instruction + '</p>',
      '  <details>',
      '    <summary>Ver código completo</summary>',
      '    <pre id="' +
        codeId +
        '" tabindex="0">' +
        escapeHtml(source) +
        '</pre>',
      '  </details>',
      '</section>',
    ].join('\n');
  })
  .join('\n');
const templatePath = path.join(__dirname, 'install-template.html');
const targetPath = path.join(root, 'web/install.html');
const template = fs.readFileSync(templatePath, 'utf8');
if (template.split('{{INSTALL_FILES}}').length !== 2)
  throw new Error('Installation template must contain {{INSTALL_FILES}} once');
const page = template
  .replaceAll('{{BUILD_VERSION}}', packageVersion)
  .replace('{{INSTALL_FILES}}', () => sections);
fs.writeFileSync(targetPath, page);
console.log(
  'Installer code updated from ' + files.length + ' Apps Script files.',
);
