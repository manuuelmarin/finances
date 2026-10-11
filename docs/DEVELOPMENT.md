# Development and tools

Finanzas 3.8.1 combines a static PWA and private Google Apps Script. The API remains at version 3.3.0 and the workbook uses model 3. The operational environment remains `ENVIRONMENT=test`; repository maintenance does not activate the primary workbook or modify a private Google installation.

## Repository map

| Path                          | Responsibility                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------ |
| `web/`                        | Interface, API client, connection channel, queue, charts, calculations, and PWA resources. |
| `apps-script/Code.gs`         | Backend, authorization, reads, operations, revision, journal, and prices.                  |
| `apps-script/Bridge.html`     | Bridge from the private Google session to the app.                                         |
| `apps-script/appsscript.json` | Google project manifest and permissions.                                                   |
| `apps-script/PRICES.md`       | Verified NAV sources, historical limits, and the optional test routine.                    |
| `tools/`                      | Generators, local server, checks, and agent adapters.                                      |
| `tests/*.test.cjs`            | Tests using `node:test` and simulated services.                                            |
| `tests/browser/`              | Desktop and mobile Playwright tests with fictional data.                                   |
| `.github/workflows/`          | Quality checks and publication of `web/` to Pages.                                         |

See [Architecture](ARCHITECTURE.md), [Contributing](../CONTRIBUTING.md), and [Security](../SECURITY.md) for contracts, the review workflow, and privacy.

## Set up and run

Install Node.js 24 or later; CI uses Node 24. From the root:

```sh
npm ci --ignore-scripts
npx playwright install --with-deps chromium
```

CI installs Chromium with system dependencies on Ubuntu. If those dependencies are already available, you can use `npx playwright install chromium`. Tests do not require credentials or Sheets access.

To serve the app locally:

```sh
npm run build
node tools/serve.cjs
```

Open `http://127.0.0.1:4173`. The server only serves `web/`; it does not authenticate a Google session or create a local backend. Private installation remains in the [installer](https://manuuelmarin.github.io/finances/install.html). Playwright starts this server automatically and tests Desktop Chrome and Pixel 7 profiles. Tests block service workers except in the dedicated PWA test, which checks public caching and offline reopening. These profiles do not replace installation checks on a physical phone.

## Quality commands

| Command                | Effect                                                                                                          |
| ---------------------- | --------------------------------------------------------------------------------------------------------------- |
| `npm run build`        | Runs `build-install.cjs`, `build-security.cjs`, and `build-sw.cjs`, in that order.                              |
| `npm run format`       | Applies Prettier to files that are not excluded.                                                                |
| `npm run format:check` | Checks formatting without writing changes.                                                                      |
| `npm run lint`         | Runs ESLint, including `.js`, `.cjs`, and `.gs`.                                                                |
| `npm test`             | Runs `tools/test.cjs`, the `tests/*.test.cjs` suites, and saves the TAP report.                                 |
| `npm run test:browser` | Runs Playwright and generates results and an HTML report.                                                       |
| `npm run audit`        | Runs `npm audit --audit-level=high`; fails on known high or critical vulnerabilities.                           |
| `npm run check`        | Runs the build, formatting check, lint, Node tests, and browser tests. Does not include audit or commit checks. |

Prettier uses single quotes and handles `.gs` with the Babel parser. It also formats HTML, CSS, JSON, Markdown, and YAML. `.prettierignore` excludes dependencies, results, the lockfile, and the generated installer/service worker. There is no Python code or Black step.

Local results are written to `quality-results/`, `test-results/`, and `playwright-report/`. `tools/quality-summary.cjs` summarizes results in GitHub Actions; CI retains reports for 14 days. Always use fictional data, including in screenshots and traces.

The workflow checks dependencies, new commits, the build, formatting, lint, and both suites. The Pages job depends on quality and only publishes from `main` on events other than PRs. It does not install or update Apps Script.

The [`main` protection policy](BRANCH_PROTECTION.md) requires a PR and the existing `quality` check, with no bypass actors. The versioned JSON must be imported and activated in GitHub settings; committing it alone does not protect the branch.

## Source and generated files

`tools/build-install.cjs` embeds the three Apps Script files into the installer and checks release versions. `tools/build-security.cjs` generates the CSP in `web/index.html`, `web/install.html`, and `web/preview.html`; `tools/build-sw.cjs` calculates the cache version from public resources.

Edit source files and run `npm run build`. Do not manually edit the blocks in `web/install.html`, the contents of `web/sw.js`, or generated CSP hashes. Review the diff after regenerating. Documentation changes do not require increasing the app, API, or model version.

## Agent tools

`tools/agent-envelope.cjs` and `tools/agent-queue.cjs` are CommonJS modules, not commands that open a session or accept credentials. They require a private `FinanceApiClient` client with authenticated Google transport. There is no public HTTP write endpoint or mechanism to bypass sign-in. Do not include credentials, private URLs, or real IDs in terminal arguments, examples, commits, or reports.

Start with `client.read()` and review the workbook's state and revision. To check an operation already submitted, use `client.requestStatus(envelope)` with the preserved envelope and the same `requestId` UUID. Querying the journal lets you determine whether the server confirmed it; an uncertain response does not authorize creating another operation.

`prepare(snapshot, operations)` creates a `transact` envelope from an API 3.3.0 snapshot with revision and workbook binding. It accepts 1 to 20 operations; the API generates final record IDs. Preparing an envelope does not submit it. `submit(client, envelope, { persist })` requires persistence before submission and queries the receipt if the response fails.

The persistent queue shares the `web/queue.js` engine. This example assumes the operations have already been reviewed and their submission is authorized:

```js
const { openQueue } = require('./tools/agent-queue.cjs');
const queue = await openQueue({
  directory: privateStateDirectory,
  deploymentUrl,
});
await queue.saveSnapshot(await client.read());
await queue.enqueue(operations, 'Reviewed operation');
await queue.run(client);
```

Store state outside the repository. The queue preserves the snapshot, workbook, envelope, UUID, and state before submission; it separates deployments and blocks a workbook change. It uses user permissions, exclusive locking, atomic writes, and disk synchronization. These files contain financial information and are not encrypted by the tool.

After a shutdown, open the same queue and call `run(client)` without preparing or enqueueing the operation again. The engine queries receipts for uncertain requests and preserves conflicts for review. A conflict requires a new read and explicit review; do not silently change a submitted envelope. A corrupt file or busy lock prevents replacement of the queue. If a `.lock` remains after shutdown, preserve the files and remove it only after checking that no process is using it.

Use `financialApi` processes to create, correct, and void records. Querying transactions or a UUID in the journal does not require writing cells, inserting temporary transactions, or modifying credentials. The tools do not authorize direct writes to Sheets or production activation. Preserve the source XLSX and private coordination documents until the cutover has been explicitly accepted.

## Prices and private verification

A successful query can return `ok:true` while remaining incomplete: check `complete` and the individual results. Preserve the last NAV when a source fails. Each price requires verifiable identity, share class, currency, and effective date; do not reconstruct daily history from current values or interpolated samples. Read [PRICES.md](../apps-script/PRICES.md) before modifying sources or the daily routine.

`comprobarCierre()` and **Comprobar sistema** (Check system) check structure, calculations, the channel, sources, and revision without writes. `technicalReady:true` requires every check to pass, but does not validate installation on a phone, another account, or a current source. Procedures that prepare the backend, update prices, or install triggers have effects in Google and are not part of local tests. Preserve the existing environment and deployment during repository maintenance.
