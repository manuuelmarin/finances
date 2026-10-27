const fs = require('node:fs');
console.log('### Quality evidence for this run');
console.log('Commit: `' + (process.env.GITHUB_SHA || 'local') + '`');
console.log(
  '\nFormatting: Prettier. Analysis: ESLint. Dependencies: npm audit (high/critical vulnerabilities block the run). Actions pinned by SHA. Business rules/API/queue: node:test. Browsers: the full desktop suite, selected @responsive mobile workflows and @safari WebKit sending/recovery checks, including CSP and embedded-access restrictions.',
);
let missingEvidence = false;
const unitReport = 'quality-results/unit-tests.tap';
if (fs.existsSync(unitReport)) {
  const tap = fs.readFileSync(unitReport, 'utf8');
  console.log('\n| Unit tests | Result |\n|---|---:|');
  for (const name of ['tests', 'pass', 'fail', 'skipped']) {
    const match = tap.match(new RegExp('^# ' + name + ' (\\d+)', 'm'));
    console.log('| ' + name + ' | ' + (match ? match[1] : 'no report') + ' |');
  }
  if (!/^# pass [1-9]\d*$/m.test(tap) || !/^# fail 0$/m.test(tap)) {
    console.log('\nUnit test evidence is missing or unsuccessful.');
    missingEvidence = true;
  }
} else {
  console.log('\nUnit test report was not generated.');
  missingEvidence = true;
}
const report = 'test-results/browser-results.json';
if (fs.existsSync(report)) {
  const data = JSON.parse(fs.readFileSync(report, 'utf8'));
  console.log('\n| Browser tests | Result |\n|---|---:|');
  for (const key of ['expected', 'unexpected', 'flaky', 'skipped'])
    console.log('| ' + key + ' | ' + data.stats[key] + ' |');
  const projects = new Map();
  const passedProjects = new Set();
  function countProjects(suite) {
    for (const spec of suite.specs || [])
      for (const test of spec.tests || []) {
        projects.set(
          test.projectName,
          (projects.get(test.projectName) || 0) + 1,
        );
        if (
          test.status === 'expected' &&
          test.results?.some((result) => result.status === 'passed')
        )
          passedProjects.add(test.projectName);
      }
    for (const child of suite.suites || []) countProjects(child);
  }
  for (const suite of data.suites || []) countProjects(suite);
  console.log('\n| Browser profile | Executions |\n|---|---:|');
  for (const [name, count] of projects)
    console.log('| ' + name + ' | ' + count + ' |');
  const missing = ['desktop', 'mobile', 'safari'].filter(
    (name) => !passedProjects.has(name),
  );
  if (
    missing.length ||
    data.stats.unexpected ||
    data.stats.flaky ||
    !data.stats.expected
  ) {
    console.log(
      '\nIncomplete or unsuccessful browser evidence: ' +
        (missing.join(', ') || 'failed tests'),
    );
    missingEvidence = true;
  }
} else {
  console.log(
    '\nThe browser report was not generated; check the preceding steps.',
  );
  missingEvidence = true;
}
if (missingEvidence) process.exitCode = 1;
console.log(
  '\nDeployment requires the quality job to succeed. Tests use fictional data and do not verify the private Google deployment.',
);
