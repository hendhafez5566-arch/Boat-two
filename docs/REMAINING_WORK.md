# Remaining implementation — continue on PR #1

Branch `feat/complete-premium-saas`; existing Draft PR https://github.com/hendhafez5566-arch/Boat-two/pull/1. The current checkpoint adds connected core reliability and major Batch 2 modules. Do not rebuild their models or repeat the original inventory.

## Batch 1 — remaining specific gaps

1. External-effect reconciliation: provider-message ambiguity has an audited UI, but arbitrary HTTP/AI effect records marked started/ambiguous still need operator review tools. Never replay them automatically. Add retention/archival and bounded stream/event storage policies; monitor backlog and long-running transactions. Realtime replay and distributed conversation locks are implemented, not a substitute for final load/failure acceptance.
2. Meta activation: code/UI includes Facebook Login, Instagram via Facebook Login and WhatsApp Embedded Signup with short-lived hashed one-use state and encrypted discovered tokens. Verify scopes, asset subscriptions, Graph version, permissions/app review and complete real provider SDK acceptance with explicitly authorized accounts. Page/WABA webhook subscription automation and account revocation/reconnect life cycle remain.
3. WhatsApp templates currently implement text BODY drafts/examples, submit, paginated sync, approval gating and BODY parameter sends. Add full HEADER/media/button/authentication schemas, previews and send composition; do not promise these variants work merely because sync lists them. Prevent unsupported variants from being selected until implemented.
4. Departments currently support creation/membership/SLA values, Inbox assignment to department, tags and an unread-age target indicator. Add editing/removal, automatic skill/department routing, first-response/resolution clocks, business calendars, escalation and SLA reports.
5. Finish tuple-based Inbox pagination, finer-grained bulk actions and full mobile/accessibility acceptance. The editor now has mobile panel switching and a real three-step wizard; remaining legacy controls need English translation.
6. Enforce mandatory revision preconditions for older save/publish/restore clients if required; add source-version dependency display. Current API checks optimistic timestamps when supplied and transactionally freezes reusable components.
7. Complete account recovery/verification, existing-user workspace creation/switching UI and secure cookie/session migration. Custom roles/permission editor, tenant integration API keys and complete downgrade/usage lifecycle remain.

## Batch 2 — current implemented slices and exact remaining gaps

### CRM

Connected: profiles/custom fields/tags/ownership/segments/notes/deals/tasks; normalized phone matching (international prefix removal, Arabic/Persian digits, punctuation); email/phone duplicate groups; audited transactional merge without deleting source records; conversation/channel/deal/task/note/flow-session reparenting; conservative consent combination (opt-out wins); original campaign recipient IDs retained alongside canonical IDs for dedupe/frequency checks; archive/restore; bulk lifecycle/owner/tag/custom-field patches with validation; pipeline/stage remapping and safe empty-pipeline removal. Inbox/customer links continue to work.

Durable import/export now uses `crm_jobs` and the existing outbox. Imports process 100 rows per transaction with row savepoints, up to 10,000 rows; export snapshots up to 50,000 IDs and reads 250 at a time. Jobs have progress, cancel and results/errors in UI. The HTTP payload limit is 1MB; UI file limit is 900KB. Import cancellation retains already committed rows. Export values are read when each chunk runs, not a database-wide historical snapshot. Errors display the first 100 row failures. Existing small synchronous endpoints remain compatible.

Remaining: automatic resolution of conflicting identities on the same channel is intentionally refused; overlapping open conversations must be closed in Inbox before merging. Add a richer conflict-resolution/merge-preview UI, owner reassignment for pipelines, filtered task/deal editing, full consent/timeline export, streaming/object-storage exports and larger upload sessions with retention/cleanup. Pending follow-ups addressed to merged source IDs are suppressed rather than automatically reassigned; historical events retain original IDs. CRM is substantially extended, not declared wholly complete.

### Campaigns

Connected: editable drafts with optimistic revisions, editable text/template parameters, starter-copy library, consent-linked audience preview, scheduling/rescheduling with versioned events (stale schedules cannot dispatch), cancellation, recipient ledger, retries, canonical-contact dedupe/frequency locks, real reporting and exports. Website widget has authenticated opt-out; outbound workers recheck current campaign consent/archive state before starting external delivery. In-flight requests cannot be recalled. Provider delivery remains disabled.

Remaining: full rich template gallery and media/composer variants, changing saved audience/channel through a complete campaign wizard, official inbound opt-out keyword/provider subscription handling, pacing shared across channels/campaigns, provider-specific Facebook/Instagram marketing policies and activation acceptance. No real campaigns were sent.

### AI agents

Connected: Anthropic and OpenAI implement the shared provider interface; encrypted provider creation and key rotation (version/date metadata, never returning keys); current-contact tools; flow > channel > default routing, including delayed/resumed flows; disabled explicit assignments do not silently select another provider. Configuration/routing/key forms are connected. Existing run/token/cost estimates and source restrictions remain. OpenAI contract tests mock fetch and make no provider calls.

Remaining: durable knowledge ingestion/embedding jobs, reserved embedding budgets and per-source recovery; per-action audit/approval; richer failed/refused run reporting and pricing versions; provider retirement/removal and model capability policies. Embeddings still use the existing embedding settings, independently of the agent generation provider. Live provider/tool acceptance requires explicit activation. `AI_PROVIDER_CALLS_ENABLED=false` remains mandatory.

### Business automation

Connected: existing event engine now supports bounded AND/OR condition groups and conditional then/otherwise branches; ordered actions, delayed follow-ups and HTTPS POST actions using the existing SSRF-protected HTTP helper and durable external-effect cache. No parallel scheduler was added. New visual step cards provide condition groups, ordering, branches, delays and webhook composition; new rules save disabled for review. Stored pending schedules/follow-ups can be listed, canceled and rescheduled before any attempt; operator changes are audited. Existing rule lists/history/toggles remain.

Remaining: full graph canvas and editing/reopening arbitrary saved graphs, nested recursive branches beyond the bounded schema, secret-reference/header management for authenticated integrations, per-rule failed-attempt attribution, and complete follow-up migration/recovery after contact merges. HTTP actions are gated by `EXTERNAL_DELIVERY_ENABLED`; ambiguous outcomes are not blindly replayed. Do not enable a webhook rule expecting external delivery while the environment gate is disabled.

## Batch 3 — implemented slices and remaining work

Connected reports: `/reports` and dashboard Reports page aggregate real tenant-scoped daily messages, channels, staff outbound activity, conversation states, CRM lifecycle/pipelines/currency-separated sales, due follow-ups, campaign dispatch/delivery, AI tokens/estimated costs, bot sessions and automation runs. UTC date ranges are bounded to 366 days, with CSV per dataset and full JSON export. Sales reflect deals last updated in the range; campaign metrics cover campaigns created in the range; these are not historical accounting snapshots. Unknown AI prices remain null.

Connected branding: plan-gated company name/logo/primary color applied to dashboard navigation and widget title/color, with downgrade fallback. Domain registration, TXT ownership verification and revocation are connected; a verified domain is **not** live routing. TLS, ingress/host routing, periodic ownership revalidation and domain transfer/reclaim policy still require implementation/operator activation. No production domains were connected.

Connected Stripe reliability: verified events and subscription changes commit in one transaction; provider-event IDs dedupe; older events and obsolete subscription IDs are ignored; cancellation wins equal-timestamp ambiguity. Tenant billing history UI records processed/ignored events, including invoice failure notices. Local signed fixtures validate this without calling Stripe. Failed transactions are not acknowledged as applied and rely on provider redelivery.

Remaining: full Super Admin with a separate privilege boundary (no platform-admin API/UI implemented), company/user/plan administration and platform-wide audit/revenue reporting; invoice/payment workflows beyond the existing Stripe portal; periodic Stripe reconciliation and equal-timestamp state reconciliation; complete downgrade/past-due lifecycle and customizable entitlements; response-time/SLA/business-calendar metrics; report retention/scaling; full custom-domain serving and white-label emails/public authentication journeys.

## Batch 4 — integration and premium completion

Finish legacy Arabic/English direction-aware controls, common dialogs/tables/forms and accessible mobile behavior. Extend the real wizard/template/component journeys, refine customer context/deal/task navigation and error recovery, and write operator activation/privacy/retention runbooks. Keep this matrix/handover current.

After product construction, start the separately authorized **FINAL PRODUCT ACCEPTANCE & COMMERCIAL RELEASE READINESS** phase for full browser, security, load, isolation, failure-recovery and visual acceptance. No main merge or production deployment is authorized.
