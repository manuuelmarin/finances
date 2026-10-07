// Pages no permite configurar cabeceras propias: CSP se aplica antes de los recursos.
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
for (const file of ['index.html', 'install.html', 'preview.html']) {
  const target = path.resolve(__dirname, '../web', file);
  let page = fs.readFileSync(target, 'utf8');
  const styles = [...page.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(
    (match) =>
      "'sha256-" +
      crypto.createHash('sha256').update(match[1]).digest('base64') +
      "'",
  );
  const policy = [
    "default-src 'none'",
    "script-src 'self'",
    ['style-src', "'self'", ...styles].join(' '),
    "img-src 'self'",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    file === 'preview.html' ? "frame-src 'self'" : "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
  page = page.replace(
    /\s*<meta\b(?=[^>]*http-equiv=["']Content-Security-Policy["'])[^>]*>/gi,
    '',
  );
  page = page.replace(
    /<head>/i,
    '<head>\n    <meta\n      http-equiv="Content-Security-Policy"\n      content="' +
      policy +
      '"\n    />',
  );
  fs.writeFileSync(target, page);
}
console.log(
  'CSP generada: scripts locales y estilos identificados por su huella.',
);
