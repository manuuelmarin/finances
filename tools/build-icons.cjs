// Run manually after editing the vector originals: node tools/build-icons.cjs.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch();
  try {
    for (const stem of ['icon', 'icon-maskable']) {
      const svg = fs.readFileSync(
        path.join(__dirname, '../web', stem + '.svg'),
        'utf8',
      );
      for (const size of [192, 512]) {
        const page = await browser.newPage({
          viewport: { width: size, height: size },
          deviceScaleFactor: 1,
        });
        await page.setContent(
          '<style>html,body{margin:0;width:100%;height:100%}svg{display:block;width:100%;height:100%}</style>' +
            svg,
        );
        await page.screenshot({
          path: path.join(__dirname, '../web', stem + '-' + size + '.png'),
          omitBackground: true,
        });
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
