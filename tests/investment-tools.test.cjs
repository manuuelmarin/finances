const { test } = require('node:test');
const assert = require('node:assert/strict');
const T = require('../web/investment-tools.js');

test('allocation directs a contribution to underweight funds and reconciles cents', () => {
  const positions = [
    { id: 'a', value: 600 },
    { id: 'b', value: 400 },
  ];
  const result = T.allocation(positions, { a: 50, b: 50 }, 200);
  assert.deepEqual(
    result.rows.map((r) => r.contribution),
    [0, 200],
  );
  assert.equal(result.residual, 0);
  assert.equal(result.rows[0].difference, 10);
  const zero = T.allocation(
    positions.map((p) => ({ ...p, value: 0 })),
    { a: 33, b: 67 },
    0.01,
  );
  assert.equal(
    zero.rows.reduce((sum, r) => sum + r.contribution, 0) + zero.residual,
    0.01,
  );
  assert.equal(zero.rows[0].current, null);
  assert.throws(
    () => T.allocation([{ id: 'a', value: null }], { a: 100 }, 10),
    /Faltan valoraciones/,
  );
  assert.throws(
    () => T.allocation(positions, { a: 50, b: 49 }, 10),
    /sumar 100/,
  );
});

test('exposure weights each fund and keeps uncovered portfolio visible', () => {
  const positions = [
    { name: 'A', isin: 'IE00BYX5NX33', value: 60 },
    { name: 'B', isin: 'IE00BYX5M476', value: 40 },
  ];
  const records = [
    {
      isin: 'IE00BYX5NX33',
      date: '2026-01-01',
      source: 'Gestora',
      countries: [{ name: 'EE. UU.', percent: 50 }],
      sectors: [],
    },
  ];
  const result = T.exposure(positions, records, '2026-02-01');
  assert.deepEqual(result.countries.rows, [{ label: 'EE. UU.', value: 30 }]);
  assert.equal(result.countries.unknown, 70);
  assert.equal(result.sectors.unknown, 100);
  assert.equal(result.sources[0].source, 'Gestora');
  assert.equal(
    T.exposure(positions, records, '2025-12-31').countries.unknown,
    100,
  );
  assert.throws(
    () => T.exposure(positions, [...records, ...records], '2026-02-01'),
    /duplicadas/,
  );
  assert.throws(() =>
    T.exposure(
      positions,
      [{ ...records[0], countries: [{ name: 'A', percent: 101 }] }],
      '2026-02-01',
    ),
  );
});

test('distributions preserve unknown net amounts instead of presenting a partial total', () => {
  const snapshot = {
    settings: { asof: '2026-03-01' },
    tables: {
      tProductos: [{ ID: 'a', Producto: 'Fondo' }],
      tOperaciones: [
        { Producto: 'a', Tipo: 'Cobro', Fecha: '2026-01-02', Importe: 5 },
        { Producto: 'a', Tipo: 'Cobro', Fecha: '2026-02-01', Importe: null },
        { Producto: 'a', Tipo: 'Cobro', Fecha: '2027-01-01', Importe: 999 },
      ],
    },
  };
  const result = T.distributions(snapshot);
  assert.equal(result.total, null);
  assert.equal(result.unknown, 1);
  assert.deepEqual(result.months, [{ date: '2026-01-01', value: 5 }]);
  assert.equal(result.rows.length, 2);
  assert.deepEqual(result.years, [{ year: '2026', net: 5 }]);
});

test('alternative portfolio uses exact prices on every cash-flow date and refuses missing quotes', () => {
  const flows = [
    { date: '2026-01-01', amount: -100 },
    { date: '2026-02-01', amount: -120 },
  ];
  const prices = [
    { date: '2026-01-01', price: 10 },
    { date: '2026-02-01', price: 12 },
    { date: '2026-03-01', price: 15 },
  ];
  assert.equal(T.alternative(flows, prices, '2026-03-01').at(-1).value, 300);
  assert.throws(
    () =>
      T.alternative(
        flows,
        prices.filter((p) => p.date !== '2026-02-01'),
        '2026-03-01',
      ),
    /Falta un precio real/,
  );
  assert.throws(
    () =>
      T.alternative(
        [...flows, { date: '2026-03-01', amount: 1000 }],
        prices,
        '2026-03-01',
      ),
    /retirada supera/,
  );
});

test('alternative basket splits contributions and proportional withdrawals without guessing prices', () => {
  const flows = [
    { date: '2026-01-01', amount: -100 },
    { date: '2026-02-01', amount: 30 },
  ];
  const components = [
    {
      weight: 50,
      prices: [
        { date: '2026-01-01', price: 10 },
        { date: '2026-02-01', price: 12 },
      ],
    },
    {
      weight: 50,
      prices: [
        { date: '2026-01-01', price: 20 },
        { date: '2026-02-01', price: 24 },
      ],
    },
  ];
  assert.equal(
    T.alternativeBasket(flows, components, '2026-02-01').at(-1).value,
    90,
  );
  assert.throws(
    () =>
      T.alternativeBasket(
        flows,
        [{ ...components[0], weight: 49 }, components[1]],
        '2026-02-01',
      ),
    /sumar 100/,
  );
  assert.throws(
    () =>
      T.alternativeBasket(
        flows,
        [
          components[0],
          { ...components[1], prices: components[1].prices.slice(0, 1) },
        ],
        '2026-02-01',
      ),
    /Falta un precio real/,
  );
});
