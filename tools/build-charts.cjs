const fs = require('node:fs');
const path = require('node:path');
const { buildSync } = require('esbuild');
const root = path.resolve(__dirname, '..');
buildSync({
  entryPoints: [path.join(__dirname, 'chart-engine.mjs')],
  outfile: path.join(root, 'web/vendor/echarts.min.js'),
  bundle: true,
  format: 'iife',
  globalName: 'FinanceECharts',
  minify: true,
  legalComments: 'none',
  target: ['safari15', 'chrome100'],
  banner: {
    js: '/* Apache ECharts 6.1.0 + ZRender. Apache-2.0 / BSD-3-Clause notices: echarts-LICENSE.txt */',
  },
});
const engineRoot = path.dirname(require.resolve('echarts/package.json'));
const tslibRoot = path.dirname(require.resolve('tslib'));
const notices = [
  path.join(engineRoot, 'LICENSE'),
  path.join(engineRoot, 'NOTICE'),
  path.join(engineRoot, 'licenses/LICENSE-d3'),
  require.resolve('zrender/LICENSE'),
  path.join(tslibRoot, 'LICENSE.txt'),
  path.join(tslibRoot, 'CopyrightNotice.txt'),
];
fs.writeFileSync(
  path.join(root, 'web/vendor/echarts-LICENSE.txt'),
  notices
    .map(
      (file) =>
        path.basename(file) +
        '\n' +
        fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'),
    )
    .join('\n\n'),
);
console.log('Pinned SVG chart engine bundled locally.');
