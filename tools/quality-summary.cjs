const fs = require('node:fs');
console.log('### Evidencia de calidad de esta ejecución');
console.log('Commit: `' + (process.env.GITHUB_SHA || 'local') + '`');
console.log(
  '\nFormato: Prettier. Análisis: ESLint. Reglas/API/cola: node:test. Navegador: Playwright en móvil y ordenador.',
);
const unitReport = 'quality-results/unit-tests.tap';
if (fs.existsSync(unitReport)) {
  const tap = fs.readFileSync(unitReport, 'utf8');
  console.log('\n| Pruebas de código | Resultado |\n|---|---:|');
  for (const name of ['tests', 'pass', 'fail', 'skipped']) {
    const match = tap.match(new RegExp('^# ' + name + ' (\\d+)', 'm'));
    console.log(
      '| ' + name + ' | ' + (match ? match[1] : 'sin informe') + ' |',
    );
  }
}
const report = 'test-results/browser-results.json';
if (fs.existsSync(report)) {
  const data = JSON.parse(fs.readFileSync(report, 'utf8'));
  console.log('\n| Pruebas de navegador | Resultado |\n|---|---:|');
  for (const key of ['expected', 'unexpected', 'flaky', 'skipped'])
    console.log('| ' + key + ' | ' + data.stats[key] + ' |');
} else
  console.log(
    '\nNo se ha generado el informe de navegador; comprueba los pasos anteriores.',
  );
console.log(
  '\nLa publicación requiere que el trabajo quality termine correctamente. Las pruebas usan datos ficticios y no acreditan la implementación privada de Google.',
);
