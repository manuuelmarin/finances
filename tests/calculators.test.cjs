const { test } = require('node:test');
const assert = require('node:assert/strict');
const { compoundInterest, mortgage } = require('../web/calculators.js');
const { savedDeployment } = require('../web/connection.js');

test('interés compuesto coincide con el escenario comprobado en Sheets', () => {
  const result = compoundInterest({ capital: 1000, monthly: 100, annualReturn: 5, years: 10, inflation: 2 });
  assert.equal(result.contributed, 13000);
  assert.ok(Math.abs(result.nominal - 17065.21) < 0.005);
  assert.ok(Math.abs(result.real - 13999.42) < 0.005);
  assert.ok(Math.abs(result.gain - 4065.21) < 0.005);
  const zero = compoundInterest({ capital: 1000, monthly: 100, annualReturn: 0, years: 1, inflation: 0 });
  assert.equal(zero.nominal, 2200);
  assert.equal(zero.real, 2200);
  assert.equal(zero.gain, 0);
});

test('hipoteca coincide con el escenario comprobado y el límite a TIN cero', () => {
  const result = mortgage({ price: 200000, downPayment: 40000, annualRate: 3, years: 20, costs: 0 });
  assert.ok(Math.abs(result.payment - 887.36) < 0.005);
  assert.ok(Math.abs(result.interest - 52965.48) < 0.005);
  assert.equal(result.initialCash, 40000);
  const zero = mortgage({ price: 200000, downPayment: 40000, annualRate: 0, years: 20, costs: 5000 });
  assert.ok(Math.abs(zero.payment - 160000 / 240) < 1e-9);
  assert.equal(zero.interest, 0);
  assert.equal(zero.initialCash, 45000);
});

test('rechaza importes vacíos, escenarios inválidos y desbordamientos', () => {
  const valid = { capital: 1000, monthly: 100, annualReturn: 5, years: 10, inflation: 2 };
  for (const patch of [{ capital: '' }, { capital: -1 }, { annualReturn: -100 },
    { inflation: -100 }, { years: 2.5 }, { years: 0 }, { years: 10000, annualReturn: 100 }]) {
    assert.throws(() => compoundInterest({ ...valid, ...patch }));
  }
  assert.throws(() => mortgage({ price: 10, downPayment: 11, annualRate: 3, years: 10, costs: 0 }));
  assert.throws(() => mortgage({ price: '', downPayment: 0, annualRate: 3, years: 10, costs: 0 }));
});

test('solo recupera URLs válidas, incluso sin almacenamiento disponible', () => {
  const url = 'https://script.google.com/macros/s/fixture-deployment/exec';
  assert.equal(savedDeployment({ getItem: () => url }), url);
  assert.equal(savedDeployment({ getItem: () => 'https://example.com/exec' }), null);
  assert.equal(savedDeployment({ getItem: () => { throw new Error('Blocked'); } }), null);
  assert.equal(savedDeployment(null), null);
});
