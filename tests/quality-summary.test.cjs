const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const script = path.resolve(__dirname, '../tools/quality-summary.cjs');

test('quality evidence requires successful unit results and every browser profile', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-quality-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const run = () =>
    spawnSync(process.execPath, [script], { cwd: dir, encoding: 'utf8' });
  fs.mkdirSync(path.join(dir, 'quality-results'));
  fs.mkdirSync(path.join(dir, 'test-results'));
  fs.writeFileSync(
    path.join(dir, 'quality-results/unit-tests.tap'),
    '# tests 2\n# pass 2\n# fail 0\n# skipped 0\n',
  );
  const report = (
    tests,
    stats = { expected: tests.length, unexpected: 0, flaky: 0, skipped: 0 },
  ) =>
    fs.writeFileSync(
      path.join(dir, 'test-results/browser-results.json'),
      JSON.stringify({ stats, suites: [{ specs: [{ tests }] }] }),
    );
  const passed = ['desktop', 'mobile', 'safari'].map((projectName) => ({
    projectName,
    status: 'expected',
    results: [{ status: 'passed' }],
  }));
  report(passed);
  assert.equal(run().status, 0);
  fs.writeFileSync(
    path.join(dir, 'quality-results/unit-tests.tap'),
    '# tests 2\n# pass 1\n# fail 0\n# skipped 1\n',
  );
  assert.equal(run().status, 1, 'skipped unit tests must fail quality');
  fs.writeFileSync(
    path.join(dir, 'quality-results/unit-tests.tap'),
    '# tests 2\n# pass 1\n# fail 0\n# skipped 0\n',
  );
  assert.equal(run().status, 1, 'incomplete unit counts must fail quality');
  fs.writeFileSync(
    path.join(dir, 'quality-results/unit-tests.tap'),
    '# tests 2\n# pass 2\n# fail 0\n# skipped 0\n',
  );
  report(passed, { expected: 3, unexpected: 0, flaky: 0, skipped: 1 });
  assert.equal(run().status, 1, 'skipped browser tests must fail quality');
  report(passed);
  report(passed.slice(0, 2));
  const missing = run();
  assert.equal(missing.status, 1);
  assert.match(missing.stdout, /safari/);
  report([...passed.slice(0, 2), { projectName: 'safari', status: 'skipped' }]);
  assert.equal(run().status, 1);
  report([
    ...passed.slice(0, 2),
    {
      projectName: 'safari',
      status: 'expected',
      results: [{ status: 'skipped' }],
    },
  ]);
  assert.equal(run().status, 1);
  report(passed, { expected: 3, unexpected: 1, flaky: 0, skipped: 0 });
  assert.equal(run().status, 1);
  fs.unlinkSync(path.join(dir, 'test-results/browser-results.json'));
  assert.equal(run().status, 1);
  report(passed);
  fs.unlinkSync(path.join(dir, 'quality-results/unit-tests.tap'));
  assert.equal(run().status, 1);
});
