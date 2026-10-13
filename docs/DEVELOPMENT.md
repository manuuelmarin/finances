# Development

Finanzas 3.9.3 uses API 3.3.0 and workbook model 3. Keep `ENVIRONMENT=test`; repository maintenance does not modify the private Google deployment.

## Local setup

Use Node.js 24 or later (CI uses 24 on Ubuntu):

```sh
npm ci --ignore-scripts
npx playwright install --with-deps chromium
npm run build
node tools/serve.cjs
```

Open `http://127.0.0.1:4173`. If system dependencies are already installed, use `npx playwright install chromium`. The server serves public assets only; tests need no credentials or real workbook. Private setup uses the [installer](https://manuuelmarin.github.io/finances/install.html).

## Code map

| Path                                 | Purpose                                                              |
| ------------------------------------ | -------------------------------------------------------------------- |
| `web/`                               | Interface, API client, connection, queue, charts and PWA.            |
| `apps-script/*.gs`                   | Modular Apps Script backend; `modules.json` defines installer order. |
| `apps-script/Bridge.html`            | Authenticated Google session bridge.                                 |
| `apps-script/appsscript.json`        | Google permissions and manifest.                                     |
| `tools/`                             | Builds, local server, checks and agent adapters.                     |
| `tests/*.test.cjs`, `tests/browser/` | Simulated Node and Playwright tests.                                 |
| `.github/workflows/`                 | Quality checks and Pages publication.                                |

See [Architecture](ARCHITECTURE.md), [Contributing](../CONTRIBUTING.md), [Security](../SECURITY.md), [Prices](../apps-script/PRICES.md) and [branch protection](BRANCH_PROTECTION.md).

## Checks and generated files

| Command                           | Purpose                                                                      |
| --------------------------------- | ---------------------------------------------------------------------------- |
| `npm run build`                   | Generate installer, CSP and service worker, in order.                        |
| `npm run format` / `format:check` | Apply/check Prettier; `.gs` uses Babel.                                      |
| `npm run lint`                    | ESLint for `.js`, `.cjs` and `.gs`.                                          |
| `npm test`                        | Node suites and TAP report.                                                  |
| `npm run test:browser`            | Full Desktop Chrome suite and selected Pixel 7 workflows.                    |
| `npm run audit`                   | Block known high/critical dependency vulnerabilities.                        |
| `npm run check`                   | Build, format check, lint and both suites; excludes audit and commit checks. |

Edit `tools/install-template.html` for installer instructions and the `apps-script/` modules for embedded code, then rebuild; do not manually edit generated `web/install.html`, `web/sw.js` or CSP hashes. Documentation does not require a version increase. Results use `quality-results/`, `test-results/` and `playwright-report/`; CI retains reports for 14 days. Tests simulate services; the dedicated PWA test checks offline reopening, not installation on a physical phone. Pages publication does not update Apps Script.

See [Test coverage and audit](TESTING.md) for scenario selection, mobile coverage and CI scheduling. Quality runs on pull requests, pushes to `main`, and manual dispatch; feature-branch pushes do not start a duplicate run.

## Agent workflow

`tools/agent-envelope.cjs` and `tools/agent-queue.cjs` require an already authenticated private client; they neither sign in nor expose a public endpoint. Store state outside the repository, without inline credentials or private IDs/URLs.

Read with `client.read()`, review operations, persist the envelope before submission, and recover uncertain responses through `client.requestStatus(envelope)` using the same UUID. See [Architecture](ARCHITECTURE.md) for revision, binding and conflict rules.

After shutdown, reopen the same queue and call `run(client)` without enqueueing again. A corrupt file or occupied lock blocks replacement; remove a stale `.lock` only after checking no process uses it. Preserve pending files. Use `financialApi`, never direct cells or temporary transactions. Keep source XLSX and private coordination records until an authorized cutover.
