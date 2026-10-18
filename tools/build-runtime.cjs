// Generate the exact static, isolated Apps Script artifact shipped by the installer.
const fs = require('node:fs');
const path = require('node:path');
const entries = {
  prepareApplication: '',
  checkApplication: '',
  checkSending: '',
  enableDailyPrices: '',
  updatePrices: '',
  disableDailyPrices: '',
  doGet: 'e',
  financialApiJson: 'requestJson',
  financeDailyPricesTest_: 'event',
  financeDailyPricesProduction_: 'event',
};
function buildRuntime(
  directory = path.resolve(__dirname, '../apps-script'),
  scripts,
) {
  scripts ||= JSON.parse(
    fs.readFileSync(path.join(directory, 'modules.json'), 'utf8'),
  ).scripts;
  const source = scripts
    .map(
      (name) =>
        '// Source: ' +
        name +
        '\n' +
        fs.readFileSync(path.join(directory, name), 'utf8'),
    )
    .join('\n')
    .replace(
      "const RUNTIME_DELIVERY_ = 'modules';",
      "const RUNTIME_DELIVERY_ = 'single-file';",
    );
  return (
    '// Generated backend. Replace Code.gs only; helpers are isolated.\n' +
    'var FINANCE_RUNTIME_V1_ = (function () {\n' +
    "'use strict';\n" +
    source +
    '\nreturn { ' +
    Object.keys(entries).join(', ') +
    ' };\n})();\n' +
    Object.entries(entries)
      .map(
        ([name, argument]) =>
          'function ' +
          name +
          '(' +
          argument +
          ') { return FINANCE_RUNTIME_V1_.' +
          name +
          '(' +
          argument +
          '); }',
      )
      .join('\n') +
    '\n'
  );
}
module.exports = { buildRuntime };
