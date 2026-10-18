const fs = require('node:fs');
console.log('### Quality evidence for this run');
console.log('Commit: `' + (process.env.GITHUB_SHA || 'local') + '`');
console.log(
  '\nFormatting: Prettier. Analysis: ESLint. Dependencies: npm audit (high/critical vulnerabilities block the run). Actions pinned by SHA. Business rules/API/queue: node:test. Browsers: the full desktop suite, selected @responsive mobile workflows and @safari WebKit sending/recovery checks, including CSP and embedded-access restrictions.',
);
const unitReport = 'quality-results/unit-tests.tap';
if (fs.existsSync(unitReport)) {
  const tap = fs.readFileSync(unitReport, 'utf8');
  console.log('\n| Unit tests | Result |\n|---|---:|');
  for (const name of ['tests', 'pass', 'fail', 'skipped']) {
    const match = tap.match(new RegExp('^# ' + name + ' (\\d+)', 'm'));
    console.log('| ' + name + ' | ' + (match ? match[1] : 'no report') + ' |');
  }
}
const report = 'test-results/browser-results.json';
if (fs.existsSync(report)) {
  const data = JSON.parse(fs.readFileSync(report, 'utf8'));
  console.log('\n| Browser tests | Result |\n|---|---:|');
  for (const key of ['expected', 'unexpected', 'flaky', 'skipped'])
    console.log('| ' + key + ' | ' + data.stats[key] + ' |');
  const projects = new Map();
  function countProjects(suite) {
    for (const spec of suite.specs || [])
      for (const test of spec.tests || [])
        projects.set(
          test.projectName,
          (projects.get(test.projectName) || 0) + 1,
        );
    for (const child of suite.suites || []) countProjects(child);
  }
  for (const suite of data.suites || []) countProjects(suite);
  console.log('\n| Browser profile | Executions |\n|---|---:|');
  for (const [name, count] of projects)
    console.log('| ' + name + ' | ' + count + ' |');
} else
  console.log(
    '\nThe browser report was not generated; check the preceding steps.',
  );
console.log(
  '\nDeployment requires the quality job to succeed. Tests use fictional data and do not verify the private Google deployment.',
);
