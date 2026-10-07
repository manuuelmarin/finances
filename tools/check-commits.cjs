const { execFileSync } = require('node:child_process');
const [base, head = 'HEAD'] = process.argv.slice(2);
if (
  !base ||
  !/^[0-9a-f]{40}$/.test(base) ||
  !/^(?:[0-9a-f]{40}|HEAD)$/.test(head)
)
  throw Error('Usa revisiones Git completas.');
const output = execFileSync(
  'git',
  ['log', '--format=%H%x09%s', base + '..' + head],
  { encoding: 'utf8' },
).trim();
const lines = output ? output.split('\n') : [];
const pattern =
  /^(feat|fix|chore|refactor|test|docs|build|ci|perf|style|revert)(\([a-z0-9./_-]+\))?!?: .{5,100}$/u;
const invalid = lines.filter((line) => !pattern.test(line.slice(41)));
if (invalid.length) {
  console.error('Asuntos de commit inválidos:\n' + invalid.join('\n'));
  process.exitCode = 1;
} else
  console.log(
    lines.length + ' commits nuevos con formato Conventional Commits.',
  );
