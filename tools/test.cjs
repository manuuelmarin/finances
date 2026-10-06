const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
fs.mkdirSync('quality-results', { recursive: true });
const files = fs
  .readdirSync('tests')
  .filter((name) => name.endsWith('.test.cjs'))
  .map((name) => 'tests/' + name);
execFileSync(
  process.execPath,
  [
    '--test',
    '--test-reporter=spec',
    '--test-reporter-destination=stdout',
    '--test-reporter=tap',
    '--test-reporter-destination=quality-results/unit-tests.tap',
    ...files,
  ],
  { stdio: 'inherit' },
);
