# Remaining implementation — continue on PR #1

## Continuation — platform financial and operational reporting (2026-10-23)

Migration 052 persists provider invoice payment dates and exposes a restricted, bounded-date aggregate report to `reports.read`. Connected bilingual console shows gross paid invoice totals by payment date/currency, invoice creation cohorts, failed/open balances, current monthly-equivalent mapped active/past-due contracts, unpriced/missing-date counts and operational queue/domain/company/subscription states. Currencies are never mixed; totals do not claim net revenue/refund/tax or bank settlement. Legacy paid invoices without provider payment timestamps remain explicitly excluded from dated paid totals until backfill.

Validation: API build, web TypeScript, migration 052, PostgreSQL report privilege/range/date/currency smoke and signed invoice/backfill/catalog regression smokes pass; no provider calls. Next: complete broad build/lint/unit/integration regression across saved units, then Batch 2 AI source replacement/retention and remaining automations/CRM/Inbox; white-label auth/email and Batch 4 remain open. Do not declare product complete.

## Continuation — explicit domain transfer/reclaim (2026-10-23)

Migration 051 adds current-owner initiated transfers to a specific workspace, 24-hour expiry, one-time secret (hash stored), fresh target TXT proof and atomic acceptance. Hosting stops at initiation and remains off after transfer until the receiver requests it. Pending transfers prevent source hosting; revocation cancels them. Source/target audits remain, unrelated tenants cannot see transfers, and stale source recheck events cannot serve the new owner. The owner UI includes outgoing/incoming transfers and own-domain reclaim with rotated TXT and fresh verification. Revoked names remain reserved; DNS alone never permits another tenant to reclaim a hostname. Expired requests must be canceled explicitly before restarting; involuntary/operator takeover remains deliberately unsupported pending policy review.

Validation: API build, web TypeScript, ESLint, migration 051, new PostgreSQL domain-transfer smoke and existing hosting smoke pass with mocked DNS only. Tests cover secret/tenant checks, failed proof, concurrent acceptance, hosting gates, revocation cancellation, reclaim rotation and retained audits. No DNS/ingress/certificate was activated. Next: ledger-backed platform reports; then remaining Batch 2 AI/CRM/automation and white-label auth/email journeys, followed by Batch 4. Product remains incomplete.

## Continuation — secure operator MFA recovery (2026-10-23)

Migration 050 adds eight high-entropy single-use backup codes, generated only after operation step-up and displayed once in the bilingual console. Only SHA-256 hashes are persisted in the restricted platform database. Public recovery requires allowlisted account + correct password + saved code, is rate limited, consumes the code atomically, revokes all user sessions, invalidates all remaining backup codes and grants enrollment only for a new encrypted authenticator. Password alone never bypasses MFA. Codes clear from the console on sign-out.

Validation: API build, web TypeScript, migration 050, ESLint, all 53 unit tests and expanded isolated API/PostgreSQL MFA smoke pass, including wrong password, concurrent one-code recovery, hash-only storage, app-role denial, old-token revocation, new enrollment and remaining-code invalidation. No live operator account activated. Next: domain transfer/reclaim and platform ledger-backed financial/operations reports; Batches 2/4 and full acceptance remain incomplete.

## Continuation — platform read scopes and operation step-up (2026-10-23)

Migration 049 and platform guards enforce segmented company/user/subscription/catalog/audit/report read permissions from immutable operator roles. Snapshot and directory responses respect these scopes; console loads authorized data only. Every privileged write additionally requires a fresh TOTP and a two-minute signed approval bound to actor/session version, method, target and complete body. PostgreSQL consumes each approval once across replicas, including rejected SQL operations. Tokens remain in memory and are redacted from HTTP logs. Bilingual console includes fresh-code input.

Validation: API build, web TypeScript, incremental migration 049, isolated PostgreSQL/API MFA smoke (scope denial, legacy tokens, tampered body, missing step-up and replay rejection), ESLint and 52 existing unit tests passed. Added a canonical operation-binding unit test for the next regression. Production operator activation remains disabled. Recovery factors and platform financial/operations reports, domain transfer, remaining Batches 2/4 are still open.

## Continuation — price catalog and past-due lifecycle (2026-10-23)

Migration 048 adds an immutable local provider-price registry, restricted operator publish/retire APIs and bilingual console. Publishing selects a default without rewriting existing subscription prices; retiring blocks new selection but retains historical mappings. Subscription events use provider item price rather than conflicting plan metadata; unsupported/multi-item prices are held for review. Equal-second webhook updates are conservatively ignored and make reconciliation due. Past-due timestamps persist across failed retries, clear on recovery, and a configurable seven-day default grace period applies free entitlements without deleting tenant data. Custom-host eligibility follows the same grace policy. Billing UI explains overdue status and month/year intervals.

Validation: API build, web TypeScript, ESLint, incremental migration 048 and PostgreSQL catalog/delinquency, subscription requests and signed invoice smokes pass. Coverage includes restricted DB privileges, immutable/retired price mapping, tie-time safety, grace expiry/recovery and a mocked single-item plan change with no proration. No real Stripe call. Remaining: live catalog/provider consistency acceptance, multi-item/scheduled changes, operator uncertainty resolution, platform advanced security/reports, domain transfers/auth and remaining Batches 2/4. Not product complete.

## Continuation — durable subscription requests (2026-10-23)

Migration 047 adds owner-only audited cancel-at-period-end, renewal resume and single-item price-change requests, connected to bilingual billing UI/API and the existing outbox. Separate `BILLING_SUBSCRIPTION_CHANGES_ENABLED=false` plus the external gate block provider activity. Pending requests can be withdrawn; workers recheck owner/company/link/price state. Stable request effect keys and Stripe idempotency keys prevent replay; uncertain outcomes quarantine the request and block further changes. No immediate proration is requested; plan changes affect subsequent invoices. Multi-item/scheduled changes and operator uncertainty resolution remain open.

Validation: API build, web TypeScript, incremental migration 047, PostgreSQL subscription-request smoke (blocked/withdraw, concurrent cancel/resume, idempotency key, revoked owner, ambiguous suppression and tenant isolation) pass using mocked SDK only. Next: authoritative price mapping/catalog lifecycle and past-due entitlement policy, then finer platform scopes/step-up/recovery and domain transfer. Full product completion remains open.

## Continuation — periodic billing reconciliation and invoice backfill (2026-10-23)

Continued from verified `fc78c7c6baed4619619ae1a4e4631248f0b1658e`, same branch and Draft PR #1. Migration 046 adds a bounded, replica-safe due scheduler feeding the existing outbox. A separate disabled-by-default `BILLING_AUTOMATIC_RECONCILIATION_ENABLED` gate also requires Stripe configuration and external activation. Owner/periodic jobs now persist paged invoice backfill progress, validate customer/subscription ownership, and reuse the durable effect ledger. Uncertain effects cannot replay automatically. Provider reads use their start timestamp to avoid overwriting newer concurrent events. UI displays source and invoice progress.

Validation: API build/TypeScript, web TypeScript, ESLint, all 52 existing unit tests, clean migrations 001–046, health check and new PostgreSQL `smoke-billing-backfill.mjs` pass (mocked SDK only; concurrency, blocked mode, pagination, durable replay and tenant isolation). No Stripe account/network call or production activation. Remaining: durable subscription change/cancel requests, catalog and delinquency policy; subsequent platform/domain/Batch 2/4 scope remains unfinished. Product is not complete.

## Current continuation delivery — 2026-10-23

Newest status supersedes the historical checkpoints below. Continued from verified local/remote `c6b85ba` with six connected units, each pushed independently: audit filters/cursors/export (`94d8f5f`), immutable operator scopes (`52d3df9`), mandatory TOTP MFA (`129ac0b`, test lint fix `3d156be`), invoice ledger/external billing gates (`c575f50`), gated domain ingress/ownership rechecks (`35ad618`), and knowledge revisions/archive/bilingual editor (`ad81ab2`). Follow-up `2af9713` avoids query embedding charges when no available matching source index exists and updates the integration harness for mandatory MFA/source locking. No new branch/PR, merge, deployment or screenshots.

Verification: full API/Next production build and TypeScript, latest API rebuild, ESLint, all 52 API tests; five new audit/MFA/invoice/domain/knowledge smoke suites and seven existing core/business/sprint/worker/reliability/major/billing-branding suites passed. Clean database `boat_completion_validation_1792766470825` applied migrations 001–045; incremental migrations also passed. All provider generation/embeddings in tests were mocked and Stripe fixtures were locally signed. External delivery, paid AI, custom ingress and live platform-admin configuration remain disabled. Actual Caddy/ACME issuance, production DNS/provider activation and comprehensive browser/security/load/visual acceptance have NOT run.

Exact next implementation: automatic periodic Stripe reconciliation/backfill and durable subscription-change/cancellation requests through the existing outbox/effect ledger, with ownership validation, uncertainty handling and a connected owner UI. Continue afterwards with price/catalog/payment delinquency policy, richer platform read scopes/backup factors/operation step-up, domain transfer and white-label auth journeys; advanced automation graphs/auth policies; CRM historical/large export refinements; AI tool/pricing audit/file replacement/extraction retention; remaining Inbox/session/channel and Batch 4 editor/mobile/bilingual work. Read activation runbooks before external integration. The product is not PRODUCT BUILD COMPLETE. Maintain stable-unit commit/push and 10–15-minute recoverable checkpoints.


## Knowledge lifecycle checkpoint — 2026-10-23

Migration 045 adds immutable input revisions, source archive state and per-job source revisions. Text/FAQ/URL edits require the current revision and cancellation of active indexing first; prior published chunks survive replacement processing. One source advisory lock coordinates edit/archive/reindex/process/resume/cancel. Obsolete jobs cannot resume or publish. Archived sources retain content/history/index but are excluded from vector/keyword retrieval; restore makes the retained index available again. The connected knowledge page now uses shared bilingual forms/cards, search, archive filtering and version review/load-as-new-save. File replacement remains a new upload; extracted URL/file snapshots are not an immutable crawler archive. History is bounded to 50 revisions per source and refuses further edits instead of deleting records; retained archived sources still count toward source quota.

Full API/Next build/TypeScript, ESLint and the new knowledge revision smoke pass with mocked embeddings only. Source retention/cleanup, historical extraction snapshots, larger file replacement and AI tool/pricing audit remain open. Continue with basic cross-module regression/migration verification and save the final handover; do not start screenshots or comprehensive acceptance.


## Custom-domain integration checkpoint — 2026-10-23

Migration 044 connects hosting requests, minimal public brand resolution/TLS eligibility, web Host enforcement/branded entry, and versioned twelve-hour ownership rechecks through the existing outbox. Recent ownership, tenant status and white-label entitlement are checked; disable/revoke/expiry/downgrade deny serving. API/web gates stay false. An optional Caddy ask + per-request forward-auth example and activation runbook are provided, but actual Caddy/ACME/DNS configuration and certificate issuance were not performed or tested.

API/web TypeScript, full production build, ESLint and mocked DNS/outbox/tenant-hosting smoke passed. No screenshots or comprehensive acceptance were run. Domain transfer/reclaim, white-label authentication emails and live ingress/ACME acceptance remain open. Continue with remaining billing automation, AI source lifecycle and product UX using immediate stable commit/push checkpoints.


## Invoice lifecycle checkpoint — 2026-10-23

Migration 043 and connected billing UI/API persist verified Stripe invoice snapshots: due/paid/remaining amounts, currency, attempts, failed-payment state, due dates and sanitized Stripe document links. Independent invoice event ordering/deduplication prevents stale/equal-priority updates from erasing paid/failure transitions; invoice events do not override authoritative subscription status. Customer-routed subscription events now apply without tenant metadata, cancellation-at-period-end is visible, and existing active subscriptions use the portal rather than duplicate checkout. Checkout/portal now also require the explicit external-delivery gate.

API build, web TypeScript, ESLint, 52 unit tests, invoice smoke and existing signed billing/branding smoke pass without Stripe calls. This is a webhook-backed ledger, not historical invoice backfill or a payment processor. Automatic reconciliation/backfill, price catalog lifecycle, provider mutations/cancellation workflows and comprehensive delinquency policy remain open. Next: custom-host routing/TLS code and gated activation.


## Platform MFA checkpoint — 2026-10-23

Migration 042 and connected bilingual sign-in/enrollment UI enforce authenticator MFA for every platform session. Secrets use the existing authenticated encryption; limited enrollment challenges grant no console access; database time-step consumption prevents replay across replicas. Old password-only platform tokens are rejected. API/web TypeScript, ESLint and 50 API tests pass, including RFC TOTP vectors. An isolated API/DB smoke validates enrollment, encrypted storage, replay/concurrency, role guards and revocation without activating a real operator. Recovery remains an externally reviewed operator process; hardware factors, backup codes and additional operation step-up remain open. Next: invoice/payment lifecycle, then domain-host/TLS integration.


## Operator authorization checkpoint — 2026-10-23

Explicit operator-managed role mappings now enforce independent company/user/session/subscription/plan write permissions on every request. Missing or invalid configuration is read-only; workspace ownership never grants writes. The platform UI displays effective scopes and disables unauthorized actions. No new schema is required for immutable operator configuration. API/web TypeScript, ESLint and 48 API tests pass. MFA is the immediate next unit; external delivery/AI remain disabled.


## Platform audit checkpoint — 2026-10-23

Migration 041, restricted API and bilingual console provide exact actor/company/action filters, bounded UTC date ranges, stable ID cursor pagination and explicitly loaded-record JSON export. Direct table/application-role access remains denied. API build, web TypeScript, lint and dedicated SQL smoke passed. Continue with granular operator permissions and MFA; product remains partial. No screenshots or visual acceptance are requested in this sprint.


## Continuous sprint verification — 2026-10-23

Four functional checkpoints were committed and pushed separately on the existing branch/PR: `2a67d3f` (CRM work management), `5d6b768` (shared delivery-account budgets), `3c3f07f` (department lifecycle/response reporting), and `00a0a55` (platform directory search/pagination). Each received targeted checks before push; remote HEAD was verified. No new branch/PR, merge or deployment.

Final development verification passed: full API/Next production build and TypeScript, ESLint, all 47 API unit tests; four new CRM-work/delivery-account/department/platform-directory smoke suites and seven existing core/business/sprint/worker/reliability/major/billing-branding suites. Incremental migrations 037–040 and the clean-schema validation chain through 040 passed. External delivery, paid AI calls and live platform-administrator activation remain disabled. Comprehensive browser, security, performance and visual acceptance remain deferred.

Continue directly with platform audit pagination and granular operator authorization/MFA, then remaining billing/catalog/invoice lifecycle and custom-domain host routing/TLS. Batch 2 still needs advanced automation graphs/integration policies, AI audit/pricing/source lifecycle, provider-policy activation acceptance and CRM historical/large-export refinements. Department metrics use current assignment/target and message creation timestamps; provider quotas are operator-configured limits, not automatic discovery. Batch 4 and final visual previews/owner approval remain open. Do not declare PRODUCT BUILD COMPLETE. Maintain immediate commit/push after each stable unit and 10–15-minute recoverable checkpoints.


## Major product implementation checkpoint — 2026-10-23

Started from verified local/remote `1f338897cceb119577d9093c2b95d43e91cb8f35`, same branch and Draft PR #1. New migrations 028–036 build on the existing outbox and tenant RLS; no parallel scheduler or production deployment.

- Knowledge: durable text/FAQ/URL/file jobs, persisted file extraction, prepared chunks/vector batches, blocked/failed/canceled states, resume/progress UI, atomic conservative monthly embedding reservations, durable cached effects and audited uncertainty reconciliation. Paid generation/query/ingestion calls remain disabled. Index replacement is atomic after complete processing; the prior index survives failures.
- Campaigns: explicit per-channel marketing policy, shared external-send pacing across replicas/campaigns, paced web campaign events, Meta response-window checks, inbound opt-out keywords and existing consent checks. Operator-defined shared provider account caps are now connected; automatic quota discovery and complete external Meta policy acceptance remain open.
- CRM: real searchable merge-impact preview with profile differences, dependency counts, consent result, identity conflicts and Inbox links. Unsafe identity merges still require manual review; deal/task filtering/editing is now connected via `/dashboard/crm/work`; pipeline ownership and richer historical exports remain.
- Automation: reopen/edit existing sequences and bounded branch/condition groups; encrypted, rotatable host-bound Bearer secret references; durable per-rule failure attribution and safe event retry UI. Nested arbitrary graphs and extended integration policies remain open.
- Platform administration: separately signed/purposed short-lived platform sessions, immutable operator allowlist, separate least-privilege database connection/role, database-backed sign-in limits and audited company/subscription/user/plan operations. Console is disabled until external operator configuration; tenant roles cannot activate it. See PLATFORM_ADMIN_ACTIVATION.md. Company/user search and paging are now connected; audit pagination/MFA/granular operator roles remain open.
- Sessions: backing session IDs/user versions for new access tokens, self-service session list/revoke, global operator revoke, account/tenant suspension enforcement, and live SSE revocation checks. Legacy access tokens without IDs retain their short access lifetime unless globally revoked; cookie migration/recovery remain open.
- Billing: durable owner-requested Stripe reconciliation jobs, disabled-by-default activation gate, linked customer/subscription ownership checks, cached retrieval and existing event dedupe/order application. No Stripe calls or real account setup occurred.
- UX: original SVG navigation icons, connected bilingual job/policy/merge/sequence/platform/session screens. Final identity/design approval and standalone visual previews remain deferred to completed-product review.

Validation: production API/Next build and TypeScript, ESLint, 47 unit tests (including active SSE revocation), migrations through 036 on a fresh validation database, core/business/sprint/billing development smokes and `smoke-major.mjs`. Major smoke covers gated jobs and durable file extraction, a real vector index built from mocked embeddings, cached replay/concurrent quota reservation, opt-out/policy isolation, merge preview, encrypted secrets/saved branches, platform token/SQL-role boundaries, suspension, session revocation and blocked/mocked Stripe reconciliation. No paid/provider network calls, live admin credentials or comprehensive final acceptance were used.

Next: finish automatic provider quota discovery/activation acceptance, CRM deal/task workflows and operator roles/MFA, complete billing/catalog/invoice lifecycle and custom-domain host/TLS integration, then remaining UX/unified bilingual controls and final visual previews. Product build remains incomplete.

Branch `feat/complete-premium-saas`; existing Draft PR https://github.com/hendhafez5566-arch/Boat-two/pull/1. The current checkpoint adds connected core reliability and major Batch 2 modules. Do not rebuild their models or repeat the original inventory.

## Batch 1 — remaining specific gaps

1. External-effect reconciliation: provider-message ambiguity has an audited UI, but arbitrary HTTP/AI effect records marked started/ambiguous still need operator review tools. Never replay them automatically. Add retention/archival and bounded stream/event storage policies; monitor backlog and long-running transactions. Realtime replay and distributed conversation locks are implemented, not a substitute for final load/failure acceptance.
2. Meta activation: code/UI includes Facebook Login, Instagram via Facebook Login and WhatsApp Embedded Signup with short-lived hashed one-use state and encrypted discovered tokens. Verify scopes, asset subscriptions, Graph version, permissions/app review and complete real provider SDK acceptance with explicitly authorized accounts. Page/WABA webhook subscription automation and account revocation/reconnect life cycle remain.
3. WhatsApp templates currently implement text BODY drafts/examples, submit, paginated sync, approval gating and BODY parameter sends. Add full HEADER/media/button/authentication schemas, previews and send composition; do not promise these variants work merely because sync lists them. Prevent unsupported variants from being selected until implemented.
4. Departments currently support creation/membership/SLA values, Inbox assignment to department, tags and an unread-age target indicator. Editing and archive/restore are now connected, with current-target wall-clock staff response aggregates. Remaining: automatic skill/department routing, historical target snapshots, provider-ack response/resolution clocks, business calendars, escalations and full SLA reports.
5. Finish tuple-based Inbox pagination, finer-grained bulk actions and full mobile/accessibility acceptance. The editor now has mobile panel switching and a real three-step wizard; remaining legacy controls need English translation.
6. Enforce mandatory revision preconditions for older save/publish/restore clients if required; add source-version dependency display. Current API checks optimistic timestamps when supplied and transactionally freezes reusable components.
7. Complete account recovery/verification, existing-user workspace creation/switching UI and secure cookie/session migration. Custom roles/permission editor, tenant integration API keys and complete downgrade/usage lifecycle remain.

## Batch 2 — current implemented slices and exact remaining gaps

### CRM

Connected: profiles/custom fields/tags/ownership/segments/notes/deals/tasks; normalized phone matching (international prefix removal, Arabic/Persian digits, punctuation); email/phone duplicate groups; audited transactional merge without deleting source records; conversation/channel/deal/task/note/flow-session reparenting; conservative consent combination (opt-out wins); original campaign recipient IDs retained alongside canonical IDs for dedupe/frequency checks; archive/restore; bulk lifecycle/owner/tag/custom-field patches with validation; pipeline/stage remapping and safe empty-pipeline removal. Inbox/customer links continue to work.

Durable import/export now uses `crm_jobs` and the existing outbox. Imports process 100 rows per transaction with row savepoints, up to 10,000 rows; export snapshots up to 50,000 IDs and reads 250 at a time. Jobs have progress, cancel and results/errors in UI. The HTTP payload limit is 1MB; UI file limit is 900KB. Import cancellation retains already committed rows. Export values are read when each chunk runs, not a database-wide historical snapshot. Errors display the first 100 row failures. Existing small synchronous endpoints remain compatible.

Remaining: automatic resolution of conflicting identities on the same channel is intentionally refused; overlapping open conversations must be closed in Inbox before merging. Extend the existing merge preview with explicit same-channel identity resolution, owner reassignment for pipelines, pipeline ownership and historical activity export, full consent/timeline export, streaming/object-storage exports and larger upload sessions with retention/cleanup. Pending follow-ups addressed to merged source IDs are suppressed rather than automatically reassigned; historical events retain original IDs. CRM is substantially extended, not declared wholly complete.

### Campaigns

Connected: editable drafts with optimistic revisions, editable text/template parameters, starter-copy library, consent-linked audience preview, scheduling/rescheduling with versioned events (stale schedules cannot dispatch), cancellation, recipient ledger, retries, canonical-contact dedupe/frequency locks, real reporting and exports. Website widget has authenticated opt-out; outbound workers recheck current campaign consent/archive state before starting external delivery. In-flight requests cannot be recalled. Provider delivery remains disabled.

Remaining: full rich template gallery and media/composer variants, changing saved audience/channel through a complete campaign wizard, official inbound opt-out keyword/provider subscription handling, automatic discovery of provider quotas, provider-specific Facebook/Instagram marketing policies and activation acceptance. No real campaigns were sent.

### AI agents

Connected: Anthropic and OpenAI implement the shared provider interface; encrypted provider creation and key rotation (version/date metadata, never returning keys); current-contact tools; flow > channel > default routing, including delayed/resumed flows; disabled explicit assignments do not silently select another provider. Configuration/routing/key forms are connected. Existing run/token/cost estimates and source restrictions remain. OpenAI contract tests mock fetch and make no provider calls.

Implemented in the newest checkpoint: durable ingestion/file extraction/vector batching and atomic conservative embedding budgets/recovery UI. Remaining: retention cleanup, file replacement and immutable extraction snapshots; text/FAQ/URL revision editing is connected; per-action audit/approval; richer failed/refused run reporting and pricing versions; provider retirement/removal and model capability policies. Embeddings still use the existing embedding settings, independently of the agent generation provider. Live provider/tool acceptance requires explicit activation. `AI_PROVIDER_CALLS_ENABLED=false` remains mandatory.

### Business automation

Connected: existing event engine now supports bounded AND/OR condition groups and conditional then/otherwise branches; ordered actions, delayed follow-ups and HTTPS POST actions using the existing SSRF-protected HTTP helper and durable external-effect cache. No parallel scheduler was added. New visual step cards provide condition groups, ordering, branches, delays and webhook composition; new rules save disabled for review. Stored pending schedules/follow-ups can be listed, canceled and rescheduled before any attempt; operator changes are audited. Existing rule lists/history/toggles remain.

Implemented in the newest checkpoint: saved-sequence/branch editing, host-bound encrypted Bearer secrets and durable per-rule failure attribution/retry. Remaining: arbitrary graph canvas/nested recursive branches, richer integration header/auth policies, and complete follow-up migration/recovery after contact merges. HTTP actions are gated by `EXTERNAL_DELIVERY_ENABLED`; ambiguous outcomes are not blindly replayed. Do not enable a webhook rule expecting external delivery while the environment gate is disabled.

## Batch 3 — implemented slices and remaining work

Connected reports: `/reports` and dashboard Reports page aggregate real tenant-scoped daily messages, channels, staff outbound activity, conversation states, CRM lifecycle/pipelines/currency-separated sales, due follow-ups, campaign dispatch/delivery, AI tokens/estimated costs, bot sessions and automation runs. UTC date ranges are bounded to 366 days, with CSV per dataset and full JSON export. Sales reflect deals last updated in the range; campaign metrics cover campaigns created in the range; these are not historical accounting snapshots. Unknown AI prices remain null.

Connected branding: plan-gated company name/logo/primary color applied to dashboard navigation and widget title/color, with downgrade fallback. Domain registration, TXT ownership verification and revocation are connected; a verified domain is **not** live routing. Gated Host routing, ownership revalidation and a Caddy ask/forward-auth integration example are implemented. Actual ingress/ACME activation/acceptance and domain transfer/reclaim remain open. No production domains were connected.

Connected Stripe reliability: verified events and subscription changes commit in one transaction; provider-event IDs dedupe; older events and obsolete subscription IDs are ignored; cancellation wins equal-timestamp ambiguity. Tenant billing history UI records processed/ignored events, including invoice failure notices. Local signed fixtures validate this without calling Stripe. Failed transactions are not acknowledged as applied and rely on provider redelivery.

Implemented in the newest checkpoint: operator-configured platform console with a separate token/key/DB role and company/user/subscription/existing-plan operations, and platform audit. Implemented: paged audit, operator role scopes and mandatory TOTP MFA. Remaining: backup factors and additional operation step-up, advanced platform revenue reports; invoice/payment workflows beyond the existing Stripe portal; automatic periodic Stripe reconciliation and complete equal-timestamp policy (owner-requested reconciliation is implemented); complete downgrade/past-due lifecycle and customizable entitlements; response-time/SLA/business-calendar metrics; report retention/scaling; full custom-domain serving and white-label emails/public authentication journeys.

## Batch 4 — integration and premium completion

Finish legacy Arabic/English direction-aware controls, common dialogs/tables/forms and accessible mobile behavior. Extend the real wizard/template/component journeys, refine customer context/deal/task navigation and error recovery, and write operator activation/privacy/retention runbooks. Keep this matrix/handover current.

After product construction, start the separately authorized **FINAL PRODUCT ACCEPTANCE & COMMERCIAL RELEASE READINESS** phase for full browser, security, load, isolation, failure-recovery and visual acceptance. No main merge or production deployment is authorized.
