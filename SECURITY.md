# Security

Applies to API 3.3.0 and workbook model 3. Tests use simulated services and fictional data; they do not establish that a private installation is correct or free of unknown vulnerabilities.

## Reporting

Use **Security → Report a vulnerability** if private reporting is enabled. Otherwise, ask the maintainer for a private channel through an issue containing only that request. Do not publish exploitation details or sensitive data.

Include the affected version, component, impact and reproduction with fictional data. Never include private Google URLs, workbook IDs, credentials, owner details, receipts, envelopes or financial backups. Do not test other people's accounts or workbooks.

## Trust boundaries

- **Google access:** the backend verifies the owner before reads and writes, including editor entry points. It chooses the configured workbook, accepts defined operations and writes text as `stringValue` rather than formulas. The public site has no public HTTP write API.
- **Browser channel:** Bridge checks origin, window and session; the client accepts only the authenticated frame/origin. Changing deployment invalidates the previous connection.
- **Content:** workbook data uses `textContent`; provider HTML is never executed. CSP restricts resources, and installation/preview styles use hashes. Source requests use fixed HTTPS routes and validated ISINs without following redirects. Internal errors are not exposed.
- **Writes:** revision, workbook binding, UUID and journal detect conflicts and recover receipts. Preserve an uncertain request and check its receipt before retrying the same envelope; do not edit or discard it. See [recovery instructions](README.md#recovery).
- **Publication:** dependencies are locked, actions are pinned by SHA, and CI checks formatting, lint, tests and known high/critical vulnerabilities. See [development instructions](README.md#development).

## Local data and hosting

IndexedDB snapshots and the agent's queue files contain financial data without app-level encryption. Use a trusted device/profile. Resolve pending requests before deleting the local copy; preserve queues and the journal when investigating uncertain writes. The service worker caches public assets only.

All projects under `manuuelmarin.github.io` share an origin. Do not publish unreviewed code there. A meta CSP cannot set `frame-ancestors` or replace hosting headers; embedded operation is restricted. Account/device compromise remains outside these code controls.

## Changes and recovery

Validate an isolated test installation before an authorized production cutover; retain separate test and production projects and workbooks. Verify the installed Google version, **Solo yo** access and rejection of another account. Pages does not change private workbooks, properties, deployments or triggers.

Review authentication, Bridge, CSP, PWA and permission changes without disabling controls. On an incident, stop submissions, preserve evidence and reconcile restored operations through receipts/journal, never description/amount alone. Native Sheets backups exclude Apps Script properties and deployments. [Prices](docs/WORKBOOK.md#prices) documents source validation and historical limits.
