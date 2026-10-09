const { test } = require('node:test');
const assert = require('node:assert/strict');
const { compoundInterest, mortgage } = require('../web/calculators.js');
const { savedDeployment } = require('../web/connection.js');

test('interés compuesto coincide con el escenario comprobado en Sheets', () => {
  const result = compoundInterest({
    capital: 1000,
    monthly: 100,
    annualReturn: 5,
    years: 10,
    inflation: 2,
  });
  assert.equal(result.contributed, 13000);
  assert.ok(Math.abs(result.nominal - 17065.21) < 0.005);
  assert.ok(Math.abs(result.real - 13999.42) < 0.005);
  assert.ok(Math.abs(result.gain - 4065.21) < 0.005);
  const zero = compoundInterest({
    capital: 1000,
    monthly: 100,
    annualReturn: 0,
    years: 1,
    inflation: 0,
  });
  assert.equal(zero.nominal, 2200);
  assert.equal(zero.real, 2200);
  assert.equal(zero.gain, 0);
});

test('hipoteca coincide con el escenario comprobado y el límite a TIN cero', () => {
  const result = mortgage({
    price: 200000,
    downPayment: 40000,
    annualRate: 3,
    years: 20,
    costs: 0,
  });
  assert.ok(Math.abs(result.payment - 887.36) < 0.005);
  assert.ok(Math.abs(result.interest - 52965.48) < 0.005);
  assert.equal(result.initialCash, 40000);
  const zero = mortgage({
    price: 200000,
    downPayment: 40000,
    annualRate: 0,
    years: 20,
    costs: 5000,
  });
  assert.ok(Math.abs(zero.payment - 160000 / 240) < 1e-9);
  assert.equal(zero.interest, 0);
  assert.equal(zero.initialCash, 45000);
});

test('rechaza importes vacíos, escenarios inválidos y desbordamientos', () => {
  const valid = {
    capital: 1000,
    monthly: 100,
    annualReturn: 5,
    years: 10,
    inflation: 2,
  };
  for (const patch of [
    { capital: '' },
    { capital: -1 },
    { annualReturn: -100 },
    { inflation: -100 },
    { years: 2.5 },
    { years: 0 },
    { years: 10000, annualReturn: 100 },
  ]) {
    assert.throws(() => compoundInterest({ ...valid, ...patch }));
  }
  assert.throws(() =>
    mortgage({
      price: 10,
      downPayment: 11,
      annualRate: 3,
      years: 10,
      costs: 0,
    }),
  );
  assert.throws(() =>
    mortgage({ price: '', downPayment: 0, annualRate: 3, years: 10, costs: 0 }),
  );
});

test('solo recupera URLs válidas, incluso sin almacenamiento disponible', () => {
  const url = 'https://script.google.com/macros/s/fixture-deployment/exec';
  assert.equal(savedDeployment({ getItem: () => url }), url);
  assert.equal(
    savedDeployment({ getItem: () => 'https://example.com/exec' }),
    null,
  );
  assert.equal(
    savedDeployment({
      getItem: () => {
        throw new Error('Blocked');
      },
    }),
    null,
  );
  assert.equal(savedDeployment(null), null);
});

const {
  timeToGoal,
  monthlyForGoal,
  liquidityBuffer,
  bindPlanningCalculators,
} = require('../web/calculators.js');

test('meta: primer mes alcanzable, cero rentabilidad y meta ya cubierta', () => {
  const plain = timeToGoal({
    capital: 1000,
    monthly: 100,
    target: 2250,
    annualReturn: 0,
  });
  assert.equal(plain.months, 13);
  assert.equal(plain.nominal, 2300);
  assert.equal(plain.contributed, 2300);
  assert.equal(plain.gain, 0);
  assert.equal(
    timeToGoal({ capital: 1000, monthly: 0, target: 500, annualReturn: -50 })
      .months,
    0,
  );
  const scenario = {
    capital: 1000,
    monthly: 100,
    target: 10000,
    annualReturn: 5,
  };
  const result = timeToGoal(scenario);
  const rate = Math.expm1(Math.log1p(0.05) / 12);
  const balance = (months) =>
    1000 * Math.pow(1 + rate, months) +
    (100 * Math.expm1(months * Math.log1p(rate))) / rate;
  assert.ok(balance(result.months) >= scenario.target);
  assert.ok(balance(result.months - 1) < scenario.target);
  assert.ok(result.gain > 0);
});

test('meta: sin aportación, tasas negativas y límite de horizonte explícito', () => {
  assert.deepEqual(
    timeToGoal({ capital: 0, monthly: 0, target: 1, annualReturn: 5 }),
    { reachable: false, reason: 'unreachable' },
  );
  assert.equal(
    timeToGoal({ capital: 100, monthly: 0, target: 101, annualReturn: 0 })
      .reason,
    'unreachable',
  );
  assert.equal(
    timeToGoal({ capital: 100, monthly: 0, target: 200, annualReturn: 100 })
      .months,
    12,
  );
  const rate = Math.expm1(Math.log1p(-0.12) / 12);
  const ceiling = 100 / -rate;
  assert.equal(
    timeToGoal({ capital: 0, monthly: 100, target: ceiling, annualReturn: -12 })
      .reason,
    'unreachable',
  );
  const negative = timeToGoal({
    capital: 0,
    monthly: 100,
    target: 1000,
    annualReturn: -12,
  });
  assert.equal(negative.reachable, true);
  assert.ok(negative.gain < 0);
  assert.equal(
    timeToGoal({ capital: 0, monthly: 1, target: 120001, annualReturn: 0 })
      .reason,
    'beyond-range',
  );
  assert.equal(
    timeToGoal({ capital: 0, monthly: 1, target: 120000, annualReturn: 0 })
      .months,
    120000,
  );
  assert.equal(
    timeToGoal({
      capital: 0,
      monthly: 100,
      target: 200,
      annualReturn: 0.0000000001,
    }).months,
    2,
  );
});

test('aportación requerida: cero, rentabilidad, redondeo y pérdidas sobre capital existente', () => {
  const input = { capital: 1000, target: 10000, years: 5, annualReturn: 0 };
  const plain = monthlyForGoal(input);
  assert.equal(plain.monthly, 150);
  assert.equal(plain.nominal, 10000);
  const positive = monthlyForGoal({ ...input, annualReturn: 5 });
  assert.ok(positive.monthly < plain.monthly);
  assert.ok(positive.nominal >= input.target);
  assert.ok(positive.nominal - input.target < 1);
  assert.equal(monthlyForGoal({ ...input, capital: 20000 }).monthly, 0);
  const negative = monthlyForGoal({
    capital: 1000,
    target: 1000,
    years: 1,
    annualReturn: -50,
  });
  assert.ok(negative.monthly > 0);
  assert.ok(negative.nominal >= 1000);
  assert.equal(
    monthlyForGoal({ capital: 0, target: 1, years: 1 / 12, annualReturn: 0 })
      .monthly,
    1,
  );
  assert.throws(() => monthlyForGoal({ ...input, years: 0.1 }));
});

test('liquidez: cobertura, diferencia y exceso con gasto positivo', () => {
  assert.deepEqual(
    liquidityBuffer({
      essentialMonthly: 1200,
      liquidCapital: 3000,
      targetMonths: 6,
    }),
    { coveredMonths: 2.5, target: 7200, gap: 4200, surplus: 0 },
  );
  assert.deepEqual(
    liquidityBuffer({
      essentialMonthly: 1000,
      liquidCapital: 7000,
      targetMonths: 6,
    }),
    { coveredMonths: 7, target: 6000, gap: 0, surplus: 1000 },
  );
  assert.equal(
    liquidityBuffer({
      essentialMonthly: 1000,
      liquidCapital: 0,
      targetMonths: 3,
    }).coveredMonths,
    0,
  );
  assert.throws(() =>
    liquidityBuffer({ essentialMonthly: 0, liquidCapital: 1, targetMonths: 3 }),
  );
  assert.throws(() =>
    liquidityBuffer({
      essentialMonthly: 1e308,
      liquidCapital: 1,
      targetMonths: 3,
    }),
  );
});

test('planificación rechaza importes inválidos y errores numéricos', () => {
  const input = {
    capital: 1000,
    monthly: 100,
    target: 10000,
    annualReturn: 5,
    years: 5,
  };
  for (const patch of [
    { capital: '' },
    { capital: -1 },
    { monthly: -1 },
    { target: 0 },
    { target: Infinity },
    { capital: null },
    { monthly: true },
    { annualReturn: -100 },
    { annualReturn: 'no' },
  ])
    assert.throws(() => timeToGoal({ ...input, ...patch }));
  assert.throws(() => monthlyForGoal({ ...input, years: 10001 }));
  assert.throws(() =>
    monthlyForGoal({ ...input, years: 10000, annualReturn: 100 }),
  );
});

test('formularios muestran texto, ocultan resultados obsoletos y no necesitan DOM global', () => {
  const elements = new Map();
  const form = {
    events: {},
    addEventListener(name, handler) {
      this.events[name] = handler;
    },
  };
  elements.set('goal-time-form', form);
  const result = { hidden: true, textContent: '' };
  const message = { hidden: true, textContent: '' };
  elements.set('goal-time-result', result);
  elements.set('goal-time-message', message);
  for (const [field, value] of Object.entries({
    capital: '1000',
    monthly: '100',
    target: '2250',
    annualReturn: '0',
  }))
    elements.set('goal-time-' + field, { value });
  bindPlanningCalculators({ getElementById: (id) => elements.get(id) });
  let prevented = false;
  form.events.submit({
    preventDefault() {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
  assert.equal(result.hidden, false);
  assert.match(result.textContent, /13 meses/);
  assert.match(result.textContent, /Capital aportado/);
  form.events.input();
  assert.equal(result.hidden, true);
  elements.get('goal-time-monthly').value = '-1';
  form.events.submit({ preventDefault() {} });
  assert.equal(message.hidden, false);
  assert.match(message.textContent, /aportación/);
  assert.equal(result.hidden, true);
  form.events.reset();
  assert.equal(message.hidden, true);
});
