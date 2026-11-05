const { test } = require('node:test');
const assert = require('node:assert/strict');
const metrics = require('../web/performance.js');

test('timings preserve results and errors, remain bounded, and contain no financial payload', async () => {
  metrics.clear();
  const response = { ok: true, amount: 12345, concept: 'private concept' };
  assert.equal(await metrics.measure('send', async () => response), response);
  await assert.rejects(
    metrics.measure('read', async () => {
      throw Error('private error');
    }),
    /private error/,
  );
  assert.deepEqual(
    metrics.measure('after', () => ({ ok: false })),
    {
      ok: false,
    },
  );
  const first = metrics.entries();
  assert.deepEqual(
    first.map((item) => item.ok),
    [true, false, false],
  );
  assert.equal(JSON.stringify(first).includes('private'), false);
  assert.equal(JSON.stringify(first).includes('12345'), false);
  metrics.measure('private concept', () => 1);
  assert.equal(metrics.entries().length, 3);
  for (let i = 0; i < 45; i++) metrics.measure('home', () => {});
  assert.equal(metrics.entries().length, 40);
  metrics.clear();
  assert.deepEqual(metrics.entries(), []);
});
