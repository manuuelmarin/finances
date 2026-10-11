const { execFileSync } = require('node:child_process');
const [base, head = 'HEAD'] = process.argv.slice(2);
if (
  !base ||
  !/^[0-9a-f]{40}$/.test(base) ||
  !/^(?:[0-9a-f]{40}|HEAD)$/.test(head)
)
  throw Error('Use full Git revision hashes.');
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
  console.error('Invalid commit subjects:\n' + invalid.join('\n'));
  process.exitCode = 1;
} else console.log(lines.length + ' new commits follow Conventional Commits.');
