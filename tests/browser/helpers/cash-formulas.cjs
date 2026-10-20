// Model native cash formula results in the simulated Sheets service. The base
// runtime's zero placeholders do not evaluate formulas. Leave other calculated
// fields and unknown values alone; production Sheets remains the source of truth.
const analytics = require('../../../web/analytics.js');

function installCashFormulas(server) {
  const nativeGet = server.ctx.Sheets.Spreadsheets.Values.batchGet;
  server.ctx.Sheets.Spreadsheets.Values.batchGet = (id, request) => {
    const result = nativeGet(id, request);
    const blocks = result.valueRanges.map((r) => r.values || []);
    const accounts = blocks.find(
      (rows) =>
        rows[0]?.[0] === 'Cuenta' && rows[0].includes('Saldo calculado'),
    );
    const movements = blocks.find(
      (rows) => rows[0]?.[0] === 'ID' && rows[0].includes('Concepto'),
    );
    const parameters = blocks.find((rows) => rows[0]?.[0] === 'Parámetro');
    if (!accounts || !movements || !parameters) return result;
    const records = (rows) =>
      rows
        .slice(1)
        .filter((r) => r[0])
        .map((row) =>
          Object.fromEntries(rows[0].map((h, i) => [h, row[i] ?? null])),
        );
    const setting = (name) =>
      server.ctx.isoDate_(parameters.find((r) => r[0] === name)[1]);
    const snapshot = {
      settings: {
        start: setting('Inicio seguimiento'),
        asof: setting('Fecha informe'),
      },
      tables: {
        tCuentas: records(accounts),
        tMovimientos: records(movements).map((m) => ({
          ...m,
          Fecha: server.ctx.isoDate_(m.Fecha),
        })),
      },
    };
    const closing = analytics
      .cashTimeline(snapshot, snapshot.settings.asof.slice(0, 7))
      .at(-1);
    const index = accounts[0].indexOf('Saldo calculado');
    for (const row of accounts.slice(1))
      if (row[0]) row[index] = closing?.accounts[row[0]] ?? null;
    const balances = Object.values(closing?.accounts || {});
    const cash = balances.every(analytics.finite)
      ? balances.reduce((sum, n) => sum + n, 0)
      : null;
    for (const rows of blocks) {
      const header = rows.findIndex((r) =>
        ['Patrimonio neto', 'Efectivo', 'Inversiones', 'Deuda'].every((h) =>
          r.includes(h),
        ),
      );
      if (header < 0) continue;
      const column = rows[header].indexOf('Efectivo');
      if (typeof rows[header + 1]?.[column] === 'number')
        rows[header + 1][column] = cash;
    }
    return result;
  };
}
module.exports = { installCashFormulas };
