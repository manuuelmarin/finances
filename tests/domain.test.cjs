const { test } = require('node:test'),
  assert = require('node:assert/strict');
const D = require('../web/domain.js');
const { runtime } = require('./helpers/runtime.cjs');
test('nómina mantiene datos desconocidos, céntimos y un único ingreso', () => {
  const op = D.operation('nomina', {
    date: '2026-01-02',
    concept: 'Nómina ficticia',
    account: 'Cuenta A',
    category: 'Nómina',
    amount: '1200,33',
  });
  assert.equal(op.gross, null);
  assert.equal(op.tax, null);
  assert.equal(op.amount, 1200.33);
  const r = runtime();
  r.init();
  assert.equal(r.transact([op]).ok, true);
  assert.equal(r.state().tables.tMovimientos.length, 1);
  assert.equal(r.state().tables.tNominas[0].Bruto, null);
});
test('precio conserva precisión y los formularios no admiten separadores de miles ambiguos', () => {
  assert.equal(D.decimal('345,197060'), 345.19706);
  for (const value of ['1.234,56', '1,234.56', 'NaN', '1e2', '1.005'])
    assert.throws(() => D.decimal(value, true));
  assert.equal(D.decimal('-123,45', true, true), -123.45);
  assert.throws(() => D.decimal('-1'));
});
test('transferencia y observación intradía exigen referencias y cortes explícitos', () => {
  assert.throws(() =>
    D.operation('traspaso', {
      date: '2026-01-02',
      concept: 'Mover',
      from: 'A',
      to: 'A',
      amount: '1',
    }),
  );
  assert.throws(() =>
    D.operation('saldo_observado', {
      account: 'A',
      date: '2026-01-02',
      amount: '12',
      scope: 'intradía',
      source: 'Banco',
    }),
  );
  assert.equal(
    D.operation('saldo_observado', {
      account: 'A',
      date: '2026-01-02',
      amount: '12',
      scope: 'desconocido',
      source: 'Banco',
    }).time,
    null,
  );
});
test('selectores de gasto/ingreso y activos usan nombres legibles y ocultan claves del backend', () => {
  const snapshot = runtime().api({ action: 'read' });
  assert.deepEqual(D.options('categories', snapshot, 'gasto'), [
    ['Café', 'Café'],
  ]);
  assert.deepEqual(D.options('categories', snapshot, 'nomina'), [
    ['Nómina', 'Nómina'],
  ]);
  assert.equal(D.options('products', snapshot)[0][1], 'Fondo A');
  assert.equal(D.options('origins', snapshot).at(-1)[1], 'Producto · Fondo A');
  assert.equal(D.displayValue('Producto', 'PRODUCT-A', snapshot), 'Fondo A');
});
test('alta de producto y asignaciones usan la misma API, sin compra ni ingreso inventado', () => {
  const r = runtime();
  r.init();
  const product = D.operation('producto', {
    name: 'Nuevo fondo',
    account: 'Cuenta A',
    class: 'Renta variable',
    date: '2026-01-01',
    units: '0',
    cost: '0',
  });
  assert.equal(r.transact([product]).ok, true);
  assert.equal(r.state().tables.tMovimientos.length, 0);
  assert.equal(r.state().tables.tOperaciones.length, 0);
  assert.equal(
    r.transact([D.operation('objetivo', { name: 'Reserva', amount: '100' })])
      .ok,
    true,
  );
  const goal = r.state().tables.tObjetivos[0];
  assert.equal(
    r.transact([
      D.operation('asignacion', {
        goal: goal.ID,
        origin: 'Cuenta A',
        amount: '50',
      }),
    ]).ok,
    true,
  );
  assert.equal(r.state().tables.tMovimientos.length, 0);
});

test('adaptador de agentes genera referencias y exige guardar antes de enviar', async () => {
  const { prepare, submit } = require('../tools/agent-envelope.cjs');
  const r = runtime();
  r.init();
  const snapshot = r.api({ action: 'read' });
  const envelope = prepare(snapshot, [
    {
      process: 'gasto',
      date: '2026-01-02',
      concept: 'Agente ficticio',
      account: 'Cuenta A',
      category: 'Café',
      amount: 1,
    },
  ]);
  assert.match(envelope.requestId, /^[0-9a-f-]{36}$/);
  assert.throws(() => prepare({ ...snapshot, environment: 'production' }, []));
  let persisted = false;
  const result = await submit(
    {
      submit: async (req) => {
        assert.equal(persisted, true);
        const result = r.api(req);
        throw Error('Perdida');
      },
      requestStatus: async (req) =>
        r.api({ action: 'requestStatus', requestId: req.requestId }),
    },
    envelope,
    {
      persist: async () => {
        persisted = true;
      },
    },
  );
  assert.equal(result.replayed, true);
  assert.equal(r.state().tables.tMovimientos.length, 1);
});
