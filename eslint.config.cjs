const globals = require('globals');
const fs = require('node:fs');
const path = require('node:path');
const espree = require('espree');

const root = __dirname;
const moduleManifest = JSON.parse(
  fs.readFileSync(path.join(root, 'apps-script/modules.json'), 'utf8'),
);
const appsScriptGlobals = {};
const declarePatternNames = (pattern) => {
  if (!pattern) return;
  if (pattern.type === 'Identifier')
    appsScriptGlobals[pattern.name] = 'readonly';
  else if (pattern.type === 'RestElement')
    declarePatternNames(pattern.argument);
  else if (pattern.type === 'AssignmentPattern')
    declarePatternNames(pattern.left);
  else if (pattern.type === 'ArrayPattern')
    pattern.elements.forEach(declarePatternNames);
  else if (pattern.type === 'ObjectPattern')
    pattern.properties.forEach((property) =>
      declarePatternNames(
        property.type === 'RestElement' ? property.argument : property.value,
      ),
    );
};
for (const filename of moduleManifest.scripts) {
  const source = fs.readFileSync(
    path.join(root, 'apps-script', filename),
    'utf8',
  );
  const ast = espree.parse(source, {
    ecmaVersion: 'latest',
    sourceType: 'script',
  });
  for (const statement of ast.body) {
    if (
      statement.type === 'FunctionDeclaration' ||
      statement.type === 'ClassDeclaration'
    )
      declarePatternNames(statement.id);
    else if (statement.type === 'VariableDeclaration')
      statement.declarations.forEach((declaration) =>
        declarePatternNames(declaration.id),
      );
  }
}
module.exports = [
  {
    ignores: [
      'web/install.html',
      'web/sw.js',
      'web/vendor/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      'quality-results/**',
    ],
  },
  {
    files: ['**/*.js', '**/*.cjs', '**/*.gs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...globals.node,
        PropertiesService: 'readonly',
        Session: 'readonly',
        Sheets: 'readonly',
        Utilities: 'readonly',
        LockService: 'readonly',
        HtmlService: 'readonly',
        CacheService: 'readonly',
        UrlFetchApp: 'readonly',
        ScriptApp: 'readonly',
        FinanceDomain: 'readonly',
        FinanceAnalytics: 'readonly',
        FinancePortfolio: 'readonly',
        FinanceInsights: 'readonly',
        FinanceWealth: 'readonly',
        FinanceCharts: 'readonly',
        FinanceChartRenderer: 'readonly',
        FinanceECharts: 'readonly',
        FinanceDashboard: 'readonly',
        FinanceSync: 'readonly',
        FinanceApiClient: 'readonly',
        DEPLOYMENT_STORAGE_KEY: 'readonly',
        savedDeployment: 'readonly',
        validDeploymentUrl: 'readonly',
        acceptsConnectionMessage: 'readonly',
        compoundInterest: 'readonly',
        mortgage: 'readonly',
        mortgageRepayment: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unreachable': 'error',
      'no-dupe-args': 'error',
      'no-dupe-keys': 'error',
      'no-constant-condition': 'error',
      'no-cond-assign': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'valid-typeof': 'error',
    },
  },
  {
    files: ['apps-script/**/*.gs'],
    languageOptions: { globals: appsScriptGlobals },
  },
];
