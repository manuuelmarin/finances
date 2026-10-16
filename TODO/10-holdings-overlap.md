# 10. Company concentration and fund overlap

Status: **Proposed — awaiting owner selection.** This document authorizes no implementation or financial write.

Priority: **Medium** · Relative effort: **High**. Estimates describe the current Sheets/Apps Script/PWA architecture, not delivery dates.

## Purpose and expected value

Identify hidden concentration when multiple funds hold the same underlying companies.

## User experience

Investments → Analysis → Holdings. Rank consolidated issuer exposures and show a fund-pair overlap matrix. Selecting a company explains each fund’s contribution. Clearly label lower-bound results from partial holdings.

## Data and calculation contract

Resolve underlying security IDs to issuers while preserving security classes and cash/derivative treatment. Compute portfolio exposure by multiplying fund and holding weights. A weighted pair overlap can sum minimum weights only over the documented coverage.

## Scope, prerequisites and exclusions

Depends on proposal 09 and adequate holdings files with reuse rights. Full portfolio overlap needs substantially more than top-ten lists. No automatic security matching by name alone.

## Risks and critical tradeoff

Different share classes, subsidiaries, derivatives and report dates can produce false matches. Separate confirmed IDs, reviewed aliases and unresolved securities.

## Acceptance criteria

1. Two funds holding the same issuer aggregate correctly without duplicate issuer rows.
2. Incomplete holdings show coverage and a lower-bound label.
3. A top-ten-only matrix is never presented as complete diversification.
4. Source updates are reviewable and preserve previous report versions.

## Rollout

Implement only after the owner selects this numbered proposal. Add focused synthetic calculation and browser checks, run the existing financial-flow regressions, and demonstrate the result on the test book. Identify any required Google files and schema migration before publication. Preserve the private review/confirmation, book binding and retry protections.

## Primary reference

[Methodology or source documentation](https://www.cnmv.es/DocPortal/Publicaciones/Guias/Los_fondos_de_inversion.pdf). A reference is not a production data-feed license; access, coverage and reuse must be checked before implementation.

[Back to the numbered backlog](../TODO.md)
