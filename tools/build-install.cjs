const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

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
const releasePath = path.join(__dirname, 'install-releases.json');
const releases = JSON.parse(fs.readFileSync(releasePath, 'utf8'));
const hashes = Object.fromEntries(
  files.map(({ name, source }) => [
    name,
    crypto.createHash('sha256').update(source).digest('hex'),
  ]),
);
const sorted = (value) =>
  Object.fromEntries(
    Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
  );
if (!releases || typeof releases !== 'object' || Array.isArray(releases))
  throw new Error('Install release manifest must map versions to file hashes');
for (const [version, release] of Object.entries(releases)) {
  if (
    !/^\d+\.\d+\.\d+$/.test(version) ||
    !release ||
    typeof release !== 'object'
  )
    throw new Error('Invalid install release manifest version: ' + version);
  for (const [name, hash] of Object.entries(release)) {
    if (
      !/^[A-Za-z0-9.-]+\.(?:gs|html|json)$/.test(name) ||
      !/^[a-f0-9]{64}$/.test(hash)
    )
      throw new Error(
        'Invalid install release manifest entry: ' + version + ' / ' + name,
      );
  }
}
if (releases[packageVersion]) {
  if (
    JSON.stringify(sorted(releases[packageVersion])) !==
    JSON.stringify(sorted(hashes))
  )
    throw new Error(
      'The published install release manifest is immutable: ' + packageVersion,
    );
}
const releaseCatalog = releases[packageVersion]
  ? releases
  : { ...releases, [packageVersion]: hashes };
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
      '<section class="code-section" aria-labelledby="' +
        headingId +
        '" data-file-name="' +
        filename +
        '">',
      '  <header>',
      '    <div>',
      '      <p class="eyebrow">ARCHIVO ' +
        fileNumber +
        ' DE ' +
        files.length +
        '</p>',
      '      <h2 id="' + headingId + '">' + filename + '</h2>',
      '    </div>',
      '    <span class="file-status" data-file-status aria-live="polite">SIN REFERENCIA</span>',
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
for (const placeholder of [
  '{{INSTALL_FILES}}',
  '{{INSTALL_RELEASE_OPTIONS}}',
  '{{INSTALL_RELEASES}}',
]) {
  if (template.split(placeholder).length !== 2)
    throw new Error(
      'Installation template must contain ' + placeholder + ' once',
    );
}
const releaseOptions = Object.keys(releaseCatalog)
  .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
  .map(
    (version) =>
      '<option value="' +
      escapeHtml(version) +
      '">' +
      escapeHtml(version) +
      '</option>',
  )
  .join('\n');
const page = template
  .replaceAll('{{BUILD_VERSION}}', packageVersion)
  .replace('{{INSTALL_RELEASE_OPTIONS}}', () => releaseOptions)
  .replace('{{INSTALL_RELEASES}}', () =>
    JSON.stringify(releaseCatalog).replace(/</g, '\\u003c'),
  )
  .replace('{{INSTALL_FILES}}', () => sections);
fs.writeFileSync(targetPath, page);
if (!releases[packageVersion])
  fs.writeFileSync(releasePath, JSON.stringify(releaseCatalog, null, 2) + '\n');
console.log(
  'Installer code updated from ' + files.length + ' Apps Script files.',
);
