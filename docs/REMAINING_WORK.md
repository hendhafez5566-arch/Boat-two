# Remaining implementation — continue on PR #1

## Verified acceptance continuation — 2026-10-23 (latest)

Continued from verified local/remote `260f719cbea9143993d01d9a41fb9102259c7e9a` on `feat/complete-premium-saas`, existing Draft PR #1. Seven independently pushed/verified feature checkpoints: `7a10e70`, `ffb2365`, `b833dff`, `64c4603`, `9fbcd36`, `6d2d20d`, `224e56e`. This final checkpoint also fixes desktop/mobile navigation dismissal styling and live language updates of campaign success feedback, and adds real provider-editor Chromium acceptance. Current Git/remote HEAD identifies this final checkpoint.

Delivered: provider editing/retirement/tool capability checks; frozen request-time CRM exports; explicit audited pipeline/deal ownership; guided text/BODY campaign composer and preview; handled AI failure audit/handoff; exact Inbox tuple cursors; canonical-contact recovery for delayed automation. Migrations 062–064 are additive. No external provider calls/email/financial writes, new branch/PR, force push, main merge or production deployment.

Current-source validation: API TypeScript build; Next production build (31 routes)/web TypeScript; ESLint; **55 unit tests passed**, zero skipped/failed; clean PostgreSQL migrations **001–064** and no-op repeat; **19 distinct PostgreSQL/API/worker suites** passed. Following Inbox/automation changes, 11 relevant suites reran against the latest compiled runtime. Four Chromium suites passed on a production Next server: premium bot creation/preview/publication/undo/redo/team preview, populated Inbox/private note/mobile dialog, campaign audience/gallery/editable preview/persisted draft/Arabic-English/390px, and provider edit/capability/retirement with actual API verification. Screenshots use local test fixtures only. Campaign/browser failures led to source fixes; no assertions were removed. This remains bounded acceptance, not the full requested fifteen-journey/security/load/visual acceptance.

Exact remaining scope: arbitrary historical/as-of reconstruction before an export request and retention/large-data scaling; provider model catalog/cost caps/process-crash accounting; full rich campaign/media/button/template variants and recipient tools; advanced automation authentication/debugging; multi-item/provider-native subscription schedules and broader financial recovery; transactional email receipts/bounces/ambiguous evidence reconciliation; remaining global legacy UI/i18n/accessibility and complete browser/owner design acceptance. Existing working functions must not be rebuilt. Product is **not complete or certified ready for sale**.

Continue first with model capability catalog and explicit provider usage/cost reservations (unknown outcomes must retain reservations; no automatic paid retry), then historical CRM/retention and rich campaign variants. Keep all external/AI/email and financial/domain activation gates disabled. Test fixtures live in local `chatbot`; clean schema verification used `boat_acceptance_20261023`. Dependency/browser tools and validation logs are in `/workspace/work`; never commit `.env` or those databases. See the latest section of SPRINT_FULL_PRODUCT_2026-10-23.md for commands and bounds.


## Acceptance continuation — delayed automation after CRM merge (2026-10-23)

Existing follow-up executor now resolves the tenant-scoped canonical merge chain and runs saved actions under the same tenant lock as CRM merge. Original event/effect identities are preserved. Retargeted work writes an audit entry; archived/missing targets or disabled rules are suppressed; cyclic/excessive chains fail for operator review. No consent is changed and no parallel engine or external replay path is added.

Verified: API TypeScript, ESLint, PostgreSQL smoke-automation-merge (target/source preservation, task/tag execution, audit, archived/cross-tenant suppression and cycle denial) and existing nested-automations smoke (real delayed branch/replay/version isolation). Next: latest-runtime/browser regressions and full handover. Advanced integration authentication/debugger, billing/email lifecycle and broad visual acceptance remain open.


## Acceptance continuation — Inbox tuple pagination (2026-10-23)

Inbox API/UI now page by descending (last_message_at,id), encoding the exact PostgreSQL microsecond timestamp and ID into a validated cursor. Equal timestamps cannot skip conversations; tenant/search filters remain authoritative. Legacy before clients remain supported with their prior semantics. Migration 064 indexes the tuple. Pagination remains a live view: conversations receiving new messages can move ahead of an existing cursor.

Verified: API/web TypeScript, ESLint, migration 064 and PostgreSQL smoke-inbox-cursors: nine conversations with timestamp ties and adjacent microseconds, all pages complete/unique, search, malformed cursors, cross-tenant access and legacy before. Seventeen broader PostgreSQL/worker suites and existing premium Chromium smoke also passed before this change. Next: rebuilt runtime and Inbox/browser regression, remaining automation recovery/integration and billing/email work. Product is not fully accepted.


## Acceptance continuation — AI failure auditing (2026-10-23)

Generation now creates a run before provider execution, updates its immutable provider/model/rate snapshot with actual usage on success, and records a sanitized failure code on provider/execution failure. Unknown failure cost stays null. Failures honor handoff_enabled and do not automatically replay a provider call. Bilingual run history gives recovery guidance. This is handled-failure auditing; process-crash durability/reservations and cost caps remain open.

Verified: API/web TypeScript, ESLint, mocked PostgreSQL smoke-ai-failures (failed run, sanitized data, unknown costs, no automatic retry, enabled/disabled human handoff, subsequent recovery) and existing smoke-ai-tool-audit (permission/idempotency/cost snapshot isolation). All real provider gates remain false. Next: regression/current-source build and expanded browser acceptance; product scope remains incomplete.


## Acceptance continuation — campaign composer and mobile navigation (2026-10-23)

Replaced the single campaign form with a connected three-step bilingual composer: channel/segment/frequency and real audience count, six starter-copy choices or supported approved WhatsApp BODY templates, parameter substitution/content preview, and explicit draft save. Rechecks eligibility before save; scheduling/delivery retain authoritative consent/window/policy checks. Back navigation retains values; obsolete template/audience responses are discarded. This composer still supports text/BODY only, not rich template/media/button variants. Preview is content, not provider-app rendering.

Chromium exposed missing mobile navigation dismissal; added an inside close button, Escape, expanded/control semantics and auto-close on language change. Verified API/web TypeScript, ESLint, Next production build (before final navigation adjustment), all 55 unit tests and smoke-campaign-browser: actual audience, gallery, preview/edit/back/save persisted via API, 390px overflow, English/Arabic RTL, zero page errors. Screenshots inspected locally. Next: current-source build/regression and AI failure audit; comprehensive acceptance remains incomplete.


## Acceptance continuation — pipeline ownership (2026-10-23)

Migration 063 adds pipeline owner and ownership revision. Owner/admin can reassign through the connected bilingual pipeline form with membership/revision checks and audit. Optional explicit transfer changes only open deals belonging to the previous pipeline owner; separately assigned and closed deals are retained. Contacts/consent are untouched. No automatic reassignment follows a pipeline ownership edit.

Verified: API/web TypeScript, ESLint, migration 063 and PostgreSQL smoke-pipeline-ownership (explicit transfer, preservation, default no-transfer, invalid member, stale revision, cross-tenant denial and audit). Next: campaign creation/preview and broader browser acceptance; remaining historical CRM/retention scope stays open.


## Acceptance continuation — frozen CRM exports (2026-10-23)

New export jobs freeze all selected profile values in a single PostgreSQL statement at request time, then use the existing chunked worker. Later edits/archive/merge cannot mix different profile moments into one export. Job/result API and bilingual UI expose snapshot time. Legacy jobs retain prior semantics. No new historical profile store or arbitrary pre-request as-of reconstruction is claimed; job snapshots remain subject to existing retention/scaling work.

Verified: API/web TypeScript, ESLint and PostgreSQL smoke-crm-snapshots: 251 records over two chunks, intervening mutation/archive, stable values/unique IDs/timestamp, empty export and tenant isolation. Next: pipeline ownership/reassignment and campaign composition. Product remains partial.


## Acceptance continuation — AI provider lifecycle (2026-10-23)

Migration 062 adds revisions, retirement and administrator-declared tool capability to existing providers. Connected bilingual provider cards edit name/model/rates/capability with revision conflicts; enable/disable remains compatible. Permanent retirement erases the encrypted key, preserves agents/run history and refuses later edits/key rotation/reassignment. Tenant lock serializes configuration with generation; enabled agents requiring tools cannot use a declared incompatible model. Existing capability defaults remain compatible, not provider-certified. No provider network calls enabled.

Verified: API/web TypeScript, ESLint, targeted AI unit files, clean PostgreSQL migration chain 001–062 and HTTP smoke-provider-lifecycle (edit/conflict/compatibility/retirement/tenant isolation). Next: CRM export snapshot semantics and pipeline ownership, then campaign composer and remaining closure. AI cost caps/catalog/fallback and full browser acceptance remain open; this checkpoint is not complete product acceptance.


## Final full-product sprint handover — 2026-10-23

Implemented and continuously pushed eight checkpoints from verified `386b6b3` through feature HEAD `8a8b77a` on the same branch/Draft PR #1. Delivered audited billing evidence review and future requests, domain-bound branded authentication, premium foundation and seven-step bot builder, nested/versioned automation, gated encrypted invitation mail and inbox refinement. See [the full sprint report](SPRINT_FULL_PRODUCT_2026-10-23.md) for files, commits and exact limitations.

Validation passed: full API/Next production build and TypeScript, ESLint, **55 unit tests**, **28 PostgreSQL/API smoke suites** (18 direct + 10 worker), clean/repeated migrations **001–061**, and two local Chromium flows including actual bot publication and persisted private inbox notes. This is limited browser smoke, not full visual/accessibility/owner acceptance. No paid provider, real email/DNS/TLS, deployment or main merge. All external/AI/email gates remain false.

Product scope is still incomplete: provider-native/multi-item billing schedules, broader customer portal/email lifecycle, AI provider/model lifecycle/capabilities, historical CRM/export scaling and campaign composer gaps, richer automation recovery/integrations and full legacy i18n/premium/accessibility acceptance. Next: AI/provider capability lifecycle and remaining CRM/campaign business functions; continue UI completion alongside them. Historical sections below describe earlier checkpoints and are superseded by this report. Final documentation HEAD is current Git/PR HEAD, following the feature checkpoint.


## Full product sprint checkpoint — premium inbox and browser regression

Inbox now uses shared surfaces/tokens, named channel labels instead of colored emoji, keyboard-openable conversation rows, bilingual primary filters/actions, IME-safe reply entry and a native focus-managed customer-profile dialog on mobile. Search and pagination discard results that belong to an obsolete filter. Existing message, assignment, department, SLA, note, media, CRM-tag and policy paths remain connected. Advanced message/system labels still require translation.

Full API/Next production build, web TypeScript, ESLint, 55 unit tests and a clean database applying migrations 001–061 twice pass. Expanded Chromium smoke passed the seven-step real bot preview/publication, editor add/undo/redo/save/version-dialog dismissal, branded invitation preview/queue and inbox search at 390px, with zero application page errors and no horizontal overflow. This is limited smoke coverage, not full owner visual/accessibility acceptance. A sandboxed email preview correctly denies storage; the browser fixture initializer now targets the top frame only. PostgreSQL regression is ongoing; final report will record the result.


## Full product sprint checkpoint — branded invitation mail

Migration 061 adds encrypted invitation mail jobs using the existing outbox and external effect ledger. Owner/admin invitation forms opt into email; preview and status screens distinguish provider acceptance from delivery. Brand entitlement/domain eligibility is rechecked at processing, and revoked/expired invitations cancel safely. An operator-configured HTTPS gateway requires both external delivery and EMAIL_DELIVERY_ENABLED (default false), with provider idempotency keys. Ambiguous outcomes are quarantined without automatic retry. The invitation acceptance screen now shares the bilingual premium authentication experience and host binding.

API build, web TypeScript, ESLint and PostgreSQL smoke-invitation-mail pass: encryption, disabled gates, mocked acceptance, duplicate suppression, ambiguous timeout, revoked invitations, escaping and tenant isolation. No external email was sent. Gateway delivery receipts, bounce handling and reconciliation of ambiguous email remain incomplete. Next: current-source full regression and browser checks, plus remaining business workspace improvements.


## Full product sprint checkpoint — scheduled subscription requests

Migration 060 adds execution timestamps to the existing durable owner requests. Owners can choose a future local date/time (validated and stored as UTC, one minute to 366 days ahead), see the saved execution time and withdraw before execution. The outbox schedules the existing worker; ownership, provider link, price availability and gates are rechecked at execution. Early handler calls cannot mutate a future request. This is application scheduling, not an independently running Stripe subscription schedule; worker availability still matters around renewal deadlines.

API build, web TypeScript, ESLint and subscription-request/evidence PostgreSQL smokes pass, including saved due time, early-execution denial, withdrawal and invalid dates. All financial/external gates remain false. Next: branded invitation email lifecycle and remaining product controls, then full development/browser regression.

## Full product sprint checkpoint — nested automations and visual editing

Migration 059 and the existing automation engine now support nested AND/OR condition groups and nested branch/delay/HTTP actions, bounded before recursive parsing (depth four, bounded lists/node counts). No parallel executor was introduced. Workflow updates optionally check revisions for legacy compatibility; the upgraded editor always sends its revision. Immutable snapshots, saved canvas positions and execution rule revisions are persisted.

The saved-workflow editor includes a draggable structured workflow canvas with zoom/minimap, click-to-inspect steps, nested conditions/actions, trigger editing, undo/redo and version load-as-disabled-draft. Existing sequence creation, secrets, schedules and recovery remain available. Canvas connections reflect structured execution; arbitrary cyclic graph rewiring is intentionally unsupported.

API/web TypeScript, ESLint, all 55 unit tests and actual PostgreSQL nested-branch/delayed-branch/replay/version/layout/isolation smoke pass. Next: scheduled subscription requests, provider lifecycle and remaining CRM/Inbox refinements, then current-HEAD full regression and local browser readiness checks. Product remains partial.

## Full product sprint checkpoint — premium bot canvas and seven-step creation

The existing React Flow editor now has original SVG node icons, directional ports, colored action cards, searchable draggable palette, clearer edges, minimap/zoom controls, responsive inspector and native focus-trapped version dialog. Existing save/autosave/conflict/version/publish/reusable-component behavior is preserved; added keyboard save and bilingual primary controls/preview. Legacy advanced inspector strings still need completion rather than a false full-translation claim.

Beginner creation now runs seven steps: goal, real template, welcome, optional three reply buttons, real channel, actual engine preview, then server-validated publication. Generated welcome/reply nodes precede the original template without deleting its workflow. Draft retries reuse the saved flow ID.

Web production build/TypeScript/ESLint pass. Chromium smoke actually created a fixture workspace/web channel, completed all seven steps, clicked a reply in the real preview, published, opened the builder, filtered/added a node and saved; zero page errors and no overflow at 390px. Desktop/mobile artifacts were inspected locally. Added configurable `scripts/smoke-premium-browser.mjs`; this is not comprehensive visual/accessibility/owner acceptance. Next: nested automation/version controls, followed by remaining CRM/provider and communications work.

## Full product sprint checkpoint — premium foundation and branded sign-in

Migration 058 binds branded sign-in to a currently eligible verified domain and actual membership. Branded joining is invitation-only and validates the invitation workspace. The root brand context reaches login/register and the workspace shell; a mismatched saved workspace cannot render tenant pages. Added a real membership-backed workspace switcher (restricted to the host workspace on custom domains).

Shared design tokens, self-hosted DM Sans/Noto Sans Arabic, unified forms/cards/tables/buttons, SVG navigation, responsive public authentication and reusable native accessible Dialog/Feedback/EmptyState/Button components are implemented. Canonical registration still creates a workspace; branded registration accepts a company invitation. This covers member sign-in/portal surfaces, not a separate public customer account product or live email sending.

Full API/Next build, TypeScript, ESLint, migrations and PostgreSQL branded-auth smoke pass (gate, membership, invitation isolation and domain revocation). Existing paid/external/ingress gates remain false. Next: premium flow canvas, beginner creation and advanced automation improvements in this same sprint. Owner visual approval remains open.

## Full product sprint checkpoint — provider-evidence review

Continued from verified local/remote `386b6b3c872ca78793c899b8f55ccc48bd388136`, same branch/PR #1. Migration 057 adds restricted operator review of ambiguous subscription requests: step-up-protected evidence requests, durable read-only provider inspection through the existing effect ledger/outbox, provider request IDs, mismatch quarantine and explicit approval of fresh matching evidence. Confirmation closes the local request only; it never repeats a financial write or clears an unknown effect. Bilingual platform review UI is connected.

API build, web TypeScript, ESLint and PostgreSQL `smoke-billing-review.mjs` pass with mocked Stripe reads only. New owner instructions authorize premium UI/UX work during this same sprint; earlier design deferral is superseded. Next: shared design system/branded authentication and builder improvements alongside remaining functional modules. Full product scope remains incomplete.

## Verified sprint delivery — 2026-10-23 (latest; supersedes historical checkpoints)

Continued from exact verified remote `fc78c7c6baed4619619ae1a4e4631248f0b1658e` on `feat/complete-premium-saas`, same Draft PR #1. Eleven implementation/hardening checkpoints were committed, pushed immediately and remotely verified: `21c55bc`, `616b64a`, `a5d9490`, `e59949f`, `825502d`, `e47869b`, `c323dd4`, `468c08f`, `2cc4861`, `744ac66`, `4753b84`. Source HEAD `4753b840e2d99c4284fe70a0797786b8310c5ddf` matched both the remote branch and PR #1 head before this final documentation checkpoint. Use current Git HEAD for the documentation commit. No new repository/branch/PR, main merge, force push or production deployment.

Delivered connected API/database/permission/UI slices: periodic reconciliation and paged invoice backfill; durable cancel/resume/single-item price changes; immutable local price catalog and delinquency grace/free-limit recovery; segmented operator read/write scopes, request-bound one-use TOTP step-up and backup-factor MFA recovery; explicit fresh-TXT domain transfer and own-domain reclaim; currency-separated ledger-backed platform reports; in-place knowledge file replacement/extraction snapshots, explicit bounded retention, AI tool decisions and historical cost-rate snapshots. Migration range 046–056. See `docs/SPRINT_2026-10-23_CONTINUATION.md` for details and exact limitations.

Final current-source validation passed: full API/Next production build and TypeScript, ESLint, all 53 unit tests (zero skips), **24** PostgreSQL/API smoke suites on restarted current-source test/worker servers, incremental/repeated migrations, and a new clean database `boat_final_clean_20261023` applying 001–056. Smoke coverage includes real local worker/outbox execution, concurrency, uncertainty suppression, role separation, tenant isolation and old module regressions. External Stripe/AI calls were mocked only. External delivery, paid AI, automatic Stripe work, subscription mutations, custom ingress and real platform-admin activation remain disabled. No real DNS/TLS/ACME, paid-account activation or comprehensive browser/security/load/visual acceptance ran.

**Product remains incomplete.** Resume first with audited operator resolution of ambiguous subscription requests using fresh provider evidence and step-up; then remaining subscription scheduling/multi-item/catalog-provider consistency, white-label authentication/branded email journeys and domain recovery/ingress acceptance. Batch 2 still needs advanced automation graphs/integration policies, CRM historical/large-export improvements, model/price catalog and provider lifecycle, full channel/Inbox/session refinement. Batch 4 premium design/mobile/accessibility/onboarding and owner visual approval remain open; do not start final visual approval before functional closure. Continue stable-unit commit + push immediately.

## Concurrency hardening checkpoint (2026-10-23)

Migration 056 prevents password-only sign-in from replacing an already-authorized MFA recovery enrollment challenge. Losing/expiring that recovery challenge after backup codes are consumed requires externally reviewed recovery, rather than a password bypass. Domain acceptance locks domain before transfer state to match revocation. Reconciliation reads overlapping an already-applied event second are deferred to a later snapshot instead of overwriting potentially newer provider state.

API build, migrations and expanded MFA/catalog/domain PostgreSQL/API smokes pass, including recovery challenge preservation and equal-second read rejection. Next: final full production build/unit/lint and clean migration verification through 056, then save exact current remote HEAD and remaining scope.

## Continuation — AI tool decisions and historical cost inputs (2026-10-23)

Migration 055 adds tenant-scoped append-only tool decision records, stable run/tool indexes and hashed inputs. Shared execution rechecks current agent/tool/provider permissions and local active contact scope, validates inputs, enforces the three-tool action bound, records applied/no-op/denied/invalid/limit/failed decisions and prevents duplicate CRM effects on replay. Changed replay inputs are refused. Handoff is an audited request consumed by the existing conversation workflow. The connected agents screen filters/pages audit records without customer payloads. AI runs now snapshot provider ID/model and input/output cost rates, visible alongside the estimate; this is not a provider invoice or complete model-price catalog.

Validation: API build, web TypeScript, ESLint, incremental migration 055, all 53 unit tests and PostgreSQL mocked-generation/tool-audit smoke pass, including actual CRM effects, replay safety, current permission revocation, private input hashing, cost-rate snapshots and tenant isolation. Before this unit, full API/Next build, migrations 001–054 on a clean database and 23 targeted/core/business/worker regression suites passed. Next: final current-HEAD build/regression and handover; substantial remaining automation/CRM/Inbox/provider/catalog and white-label auth/email/Batch 4 scope stays open.

## Continuation — bounded knowledge retention (2026-10-23)

Migration 054 connects owner-only preview/confirmed durable retention runs to the existing outbox and bilingual knowledge UI. A frozen cutoff (minimum 30 days) clears old completed/canceled job raw/chunk/vector payloads in 100-record batches and removes eligible historical extraction text, retaining hash/character-count tombstones. Current source content, published chunks, revisions, latest snapshot and external accounting/effect ledgers remain. Active/blocked/failed jobs remain recoverable; workers recheck owner authority and skip locked sources. Cleanup is explicit, not an automatic production deletion policy.

Validation: API build, web TypeScript, migration 054, ESLint and PostgreSQL retention smoke pass (120-job paging, frozen cutoff, active/failed protection, latest snapshot preservation, no source deletion and tenant isolation). File replacement regression also passes. Next: broad current-HEAD build/unit/smoke/migration regression; then remaining AI tool/pricing/provider lifecycle, automation graph/CRM/Inbox and white-label auth/email work. Product remains incomplete.

## Continuation — in-place knowledge file replacement (2026-10-23)

Migration 053 and bilingual editor/API replace a file in the existing source, preserving agent assignments and prior published chunks until replacement publication. Mandatory revision checks/source lock refuse stale, concurrent, archived or active-job replacements. File revisions retain SHA-256/size/MIME metadata; durable file/URL extraction snapshots include source revision/job/text hash and can be reviewed through tenant-scoped endpoints/UI. Upload remains bounded to 5MB and supported extensions. Original raw binaries are not an immutable download archive.

Validation: API build, web TypeScript, ESLint, migration 053, all 53 unit tests and PostgreSQL file-replacement smoke pass using mocked embeddings. Coverage includes stable links, revision/hash metadata, concurrent replacement, old-index preservation, paid-call gate, persisted extraction, final mock publication and cross-tenant denial. Next: bounded explicit knowledge-job/extraction retention, then broader sprint regression and remaining AI/automation/CRM/Inbox scope. No product completion claimed.

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
