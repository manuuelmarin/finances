## Change

Describe the problem and the observable result of this PR.

## Scope

Identify the components that change. For documentation or formatting work, state whether the app files remain byte-for-byte identical.

## Validation

- [ ] `npm run check` and `npm run audit` pass, or any checks that could not run are documented with the reason.
- [ ] Generated files match their sources after `npm run build`.
- [ ] `ENVIRONMENT=test` is preserved; switching environments requires an explicit decision outside this PR.
- [ ] The diff contains no financial data, credentials, workbook identifiers, or private links.
- [ ] Relevant limitations and any manual steps in Google are documented.

GitHub Pages publishes after quality checks pass. Merging does not install Apps Script or activate its routines.
