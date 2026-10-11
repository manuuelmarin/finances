# Contributing to Finanzas

Thank you for contributing. The project maintains a public PWA and a private Google Apps Script backend. The current release is 3.8.1, with API 3.3.0 and model 3. Documentation and repository maintenance changes must not alter operations, authentication, permissions, queues, or versions on their own.

## Set up the environment

You need Node.js **24 or later** and npm. CI uses Node 24 on Ubuntu. From the repository root:

```sh
npm ci --ignore-scripts
npx playwright install --with-deps chromium
```

The second command installs Chromium and the system dependencies used by CI on Ubuntu; the latter may require system permissions. If Chromium's system dependencies are already available, `npx playwright install chromium` installs only the browser. Local tests do not require credentials or a real workbook.

See [Development](docs/DEVELOPMENT.md) for the code map, commands, and agent tools; [Architecture](docs/ARCHITECTURE.md) for component boundaries; and [Security](SECURITY.md) for data handling and private reports.

## Prepare a change

1. Start from `main` and work on a branch with a descriptive name.
2. Keep the change within the issue or PR's scope and preserve existing contracts. Use fictional data in examples, fixtures, and screenshots.
3. Edit source files. `web/install.html` and `web/sw.js` are generated: do not edit their blocks manually; regenerate them with `npm run build`. Public pages' CSP is also generated during the build.
4. Apply Prettier and run the checks before opening the PR.
5. Describe the behavior or document being changed, the checks performed, and their limits. If the change affects NAV sources, state the verified identity, share class, currency, effective date, and historical coverage, following [Prices](apps-script/PRICES.md).

Prettier maintains formatting for JavaScript, CommonJS, Apps Script (`.gs`, Babel parser), HTML, CSS, JSON, Markdown, and YAML. Use `npm run format` for the repository or `npx prettier --write path/to/file` for a specific change. ESLint checks `.js`, `.cjs`, and `.gs`. The repository contains no Python code; Black is not part of its quality tools.

```sh
npm run build
npm run format:check
npm run lint
npm test
npm run test:browser
npm run audit
```

`npm run check` combines the build, formatting check, lint, and both test suites. The dependency audit runs separately. CI blocks publication if any of these checks fail; simulated tests do not validate a private Google deployment or a physical phone.

## Commits

New commit subjects must satisfy the rule in `tools/check-commits.cjs`:

```text
type(optional-scope): description
```

Allowed types: `feat`, `fix`, `chore`, `refactor`, `test`, `docs`, `build`, `ci`, `perf`, `style`, `revert`. The scope, if present, contains one or more characters from `a-z`, `0-9`, `.`, `/`, `_`, or `-`. An optional `!` can appear immediately before `:`. After `: `, the description must contain 5 to 100 characters. Examples:

```text
docs: document the development environment
fix(queue): recover the receipt before retrying
ci(quality): check commit subject formatting
```

To check commits since your branch's base:

```sh
node tools/check-commits.cjs "$(git merge-base origin/main HEAD)" HEAD
```

The base must be a full SHA with 40 lowercase hexadecimal characters. The final revision accepts a full SHA or `HEAD`.

## Privacy and scope

Do not include workbook IDs, `OWNER_EMAIL` values, private deployment URLs, credentials, receipts, real envelopes, screenshots with personal data, or financial backups in commits, issues, or PRs. Queue files and reports from runs with real data may also contain private information. Replace them with fictional examples and review the diff before publishing.

Keep `ENVIRONMENT=test` and maintain separate workbooks and deployments. A PR does not authorize activating production, running test operations in real workbooks, reinstalling Apps Script, or changing Google or PWA permissions. Pages deployment only publishes resources from `web/`; it does not manage the private Google project. Installation procedures remain in the [installer](https://manuuelmarin.github.io/finances/install.html).

For a vulnerability, follow [SECURITY.md](SECURITY.md) and avoid public issues containing sensitive data.
