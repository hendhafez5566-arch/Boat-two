# Maximum completion sprint — 2026-10-23

Same branch `feat/complete-premium-saas`, same Draft PR #1. Started from verified `877d311`. No merge, deploy, force push or real external activation. This is a substantial development checkpoint, **not product completion or production acceptance**.

## Delivered and individually pushed

| Commit  | Connected behavior                                                                                                                      |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| ca2488a | Anthropic paid requests never blindly retry ambiguous failures.                                                                         |
| b5b84de | Immutable tenant model capability/pricing versions, catalog API and editor.                                                             |
| 25e4b30 | Durable monthly generation call/token/cost reservations; unknown outcomes stay reserved; reviewed evidence release; replay audit reuse. |
| 9e29891 | Bilingual AI settings, persisted budgets and usage attempts.                                                                            |
| d442b19 | Committed-observation CRM history and retained historical exports with coverage checks.                                                 |
| 3c53619 | Owner-previewed history/job retention preserving predecessor records and active work.                                                   |
| cdeebdb | Rich campaign image/video/file/buttons/lists, stable option IDs, editable audience/preview and BODY template parameter validation.      |
| 9dba89a | Host-bound encrypted Basic/API-key/HMAC integration credentials and allowlisted static headers.                                         |
| 8aa94bf | Signed normalized mail delivery/bounce receipts and owner evidence-only ambiguity reconciliation.                                       |
| 504159b | Bounded paginated CRM result downloads.                                                                                                 |
| e899b79 | Licensed subscription quantity preserved and provider response validated.                                                               |

Final UI checkpoint adds translated lifecycle/job states, management-route permission feedback, actual workspace switching acceptance, CRM error recovery/export download, Inbox public reply and billing/branding browser journeys. Tailwind now resolves content relative to its config when building from the repository root. Historical CRM helper copy now matches retained-history support.

## Validation and evidence

- API TypeScript, web TypeScript, ESLint and Next production build passed.
- 57 unit tests passed; zero failures/skips.
- Fresh PostgreSQL database `boat_maximum_20261023`: migrations 001–070 and no-op repeat passed.
- 43 distinct PostgreSQL/API/worker regression scripts passed against compiled current backend; see committed `docs/acceptance/2026-10-23-maximum/regression-results.json`.
- Nine Chromium suites passed: premium builder; Inbox private/public messages; campaign review; provider editor; AI settings/budgets; rich campaign persistence; CRM contact/pipeline/deal/task/export/download/recovery; cross-workspace roles/isolation/live translation; invoice/failure/cancellation request/branding. Desktop/mobile local-fixture images are in the same acceptance folder.
- First browser attempts exposed a CRM export response race and a missing Inbox contact-channel fixture. Harnesses now await the actual response and create the required local identity; original functional assertions remain. Billing fixture selector was narrowed to its status element to disambiguate a filter option. All affected suites reran successfully.
- Browser acceptance uses production Next and local PostgreSQL/API, synthetic provider fixtures, and mocked external adapters. It does not certify provider accounts, gateway delivery, production DNS/TLS, full load/security testing or all requested journeys.

## Remaining work — explicitly incomplete

1. Arbitrary multi-item billing additions/removals, provider-native schedules, broader refunds and payment-method recovery UI.
2. WhatsApp template HEADER/media/button/auth component variants and external provider acceptance. Current supported BODY parameter validation is bounded.
3. Provider-certified tokenization/model discovery and reconciliation of historical unpriced usage. Current conservative estimates and immutable administrator-declared catalog are explicit; unknown calls retain reservations. Crash-state recovery tests do not constitute an operating-system kill campaign.
4. Streaming very-large CRM imports/export storage. Existing row/file limits remain; HTTP pagination does not remove worker JSON storage limits. History reflects observation after commit, not original database commit timestamps; precoverage history cannot be recovered.
5. Complete legacy screen translation/accessibility and owner visual acceptance. These nine browser suites do not equal every requested end-to-end journey.
6. Broader transactional mail beyond invitations, live signed gateway receipt integration, customer portal breadth and production custom-domain activation.

Next concrete development slice: expand supported WhatsApp template component validation/editor through existing campaign adapters, with mocked exact payload acceptance before any real activation. Continue same PR and preserve all gates.
