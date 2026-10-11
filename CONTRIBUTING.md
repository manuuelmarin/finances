# Contributing

Work from a branch based on `main`. Keep each PR focused and describe the change, validation and any manual Google steps. Use fictional data in examples, fixtures and reports.

## Checks

Follow [Development](docs/DEVELOPMENT.md) for Node 24 setup, formatting and generated files. Edit sources, regenerate installation/CSP/cache assets, and review the diff.

```sh
npm run check
npm run audit
```

`check` includes the build, Prettier, ESLint and both test suites; audit and commit checks are separate. CI checks all of them before publication. Simulated tests do not verify a private Google deployment or a physical phone.

## Commits

Use `type(scope): description`, with an optional scope and `!` before the colon for breaking changes. Descriptions contain 5–100 characters; scopes use lowercase letters, digits, `.`, `/`, `_` or `-`.

Types: `feat`, `fix`, `chore`, `refactor`, `test`, `docs`, `build`, `ci`, `perf`, `style`, `revert`.

Example: `docs: simplify the development guide`. Validate with `node tools/check-commits.cjs BASE_SHA HEAD`, replacing `BASE_SHA` with the branch base's full 40-character lowercase SHA.

## Boundaries

Keep `ENVIRONMENT=test`. Repository maintenance does not authorize production activation, real-workbook tests, direct Sheets writes, Google reinstallation or permission changes. Preserve existing API and recovery contracts. Price-source changes must follow [Prices](apps-script/PRICES.md).

Keep private IDs, deployment URLs, credentials, owner details, receipts, envelopes and financial data out of the repository. For vulnerabilities and private reporting, follow [Security](SECURITY.md).
