const { defineConfig, devices } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 30000,
  reporter: [
    ['line'],
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results/browser-results.json' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', grep: /@responsive/, use: { ...devices['Pixel 7'] } },
    { name: 'safari', grep: /@safari/, use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    command: 'node tools/serve.cjs',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
  },
});
