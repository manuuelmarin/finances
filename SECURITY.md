# Security

This policy describes the repository code's boundaries for release 3.8.1, API 3.3.0, and model 3. Review and tests do not guarantee the absence of unknown vulnerabilities or automatically verify the code installed in a private Google deployment.

## Report a vulnerability

If GitHub has enabled private reporting under **Security → Report a vulnerability**, use it to submit your finding to the repository. This documentation does not assume that the option is enabled. If it is unavailable, ask the repository maintainer for a private channel through an issue that only requests that channel, without publishing exploitation details or sensitive data. This document does not configure a security email address.

Include the affected version or commit, component, expected impact, and reproducible steps using fictional data. Describe whether the issue occurs in local tests or a private deployment, without sharing its URL, workbook IDs, owner identity, credentials, receipts, envelopes, or financial backups. Do not test against other people's accounts or workbooks.

## Threat model and controls

The public GitHub Pages app does not contain the workbook or offer a public HTTP write API. Financial access depends on an authorized Google session and the private Apps Script backend. Relevant code controls include:

- **Access and writes:** the server checks the owner account before accessing Sheets, both in the API and in public editor functions. The server selects the configured workbook; it accepts specific processes and fields, not arbitrary cell instructions. Text is written as `stringValue`, not as a formula.
- **Communication between windows:** Bridge validates the origin, window, and session reference. The client accepts responses from the exact frame and origin established by the authenticated handshake. Changing the deployment invalidates the previous connection.
- **Content and external sources:** the interface uses `textContent` for workbook data and does not execute provider HTML. The public CSP restricts scripts and resources to those allowed; inline installation and preview styles are authorized by hash. Internal errors are not returned to the browser. Price requests use fixed HTTPS routes with a validated ISIN and do not follow redirects.
- **Operation integrity:** revision, workbook binding, UUID, and journal enable conflict detection and receipt recovery. A write without a confirmed response remains uncertain and requires checking its receipt before retrying the same envelope.
- **Dependencies and publication:** CI checks formatting, lint, tests, and known high or critical vulnerabilities. Dependencies are pinned in the lockfile and actions to full commits. Passing these checks does not establish that a dependency is free from unknown flaws.

Price identity, share class, currency, effective date, and historical coverage rules are documented in [PRICES.md](apps-script/PRICES.md). A failed source must not be replaced with invented, interpolated, or retrospectively applied data.

## Local data and hosting boundaries

IndexedDB retains snapshots and pending operations for local recovery. The app does not encrypt these data. The agent queue stores financial information in user files with atomic writes and disk synchronization; it is not a credential store. The service worker caches public app resources, not financial snapshots or private Google responses.

Use a trusted device, browser profile, and Google account. Resolve pending operations before deleting the local copy through **Ajustes → Almacenamiento local** (Settings → Local storage); the app blocks deletion while operations remain pending. Preserve queues and the journal when investigating an uncertain response.

Projects hosted under `manuuelmarin.github.io` share the same origin's trust boundary. Do not publish third-party or unreviewed code under that origin. A CSP in a meta tag cannot configure `frame-ancestors` or replace HTTP headers available on hosting you control. The embedded app restricts configuration and operations; open it in its own window to operate.

Repository controls do not protect against a compromised device, Google account, GitHub account, or code on the same origin. Before real use, verify the exact installed deployment, **Solo yo** (Only me) access, and rejection of a different account. Local tests use simulated services and data; they do not replace those checks.

## Changes and incidents

Keep `ENVIRONMENT=test` until an explicit cutover instruction is given. Publishing Pages does not change workbooks, private properties, permissions, or Apps Script triggers. Changes to authentication, CSP, Bridge, PWA, and permissions require reviewing their effect on this trust boundary, without disabling controls to resolve a connection problem.

If you suspect an incident, stop submissions and preserve the files, queues, and receipts needed for a private investigation. Review the affected accounts and deployment before continuing. A restore must reconcile operations using their journal and receipts; do not deduplicate solely by description and amount. Native Sheets copies do not back up Apps Script properties or deployments.
