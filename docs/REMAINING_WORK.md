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

## Batch 2 — remaining work (not declared complete)

### CRM

Implemented: validated contact profiles/custom fields, tags/lifecycle/owner, segments, notes/timeline linked to Inbox/events, pipeline/deals, tasks, bounded atomic CSV/JSON contact import/export, duplicate detection and consent ledger.

Next: contact merge with safe reparenting of conversations/consents/deals, richer duplicate resolution (phone normalization), pipeline/stage editing and ownership, contact archive/delete policy, bulk edits, complete timeline filtering/export and scalable asynchronous imports/exports. Current contact import is at most 500 rows; export is at most 10,000 and UI refuses silent truncation. Deals/tasks use pagination; some configuration lists are bounded to 100 and need paging at scale.

### AI agents

Implemented: tenant agents/default selection, encrypted Anthropic provider configuration, scoped knowledge sources, allowed tools (human escalation/follow-up/tag for the current contact), preserved conversation history, atomically serialized reply budget, durable external-result cache, token/run history and optional configured-rate cost estimates. Unknown pricing stays null. `AI_PROVIDER_CALLS_ENABLED=false` independently blocks paid calls.

Next: channel/flow-specific agent selection, multiple provider implementations and secure key rotation/removal UI, per-agent tool execution audit/approval policies, more authorized actions, durable/recoverable knowledge ingestion and embedding budget reservation. Embedding retrieval still uses existing environment provider settings; agent provider settings select generation, not embeddings. Record failed/refused AI calls as dedicated ai_runs and add price-source/version metadata. UI cost is an estimate, not a provider invoice.

### Campaigns

Implemented: draft builder, segments, actual consent-linked audience preview, scheduled audience snapshot, recipient ledger, shared event dispatch, delivery states, safe retries/cancellation, consent recheck and frequency caps, text/approved BODY templates. Actual external sending stays disabled unless the operator explicitly activates it.

Next: editing existing drafts, rich campaign template gallery/composer, opt-out UI on the website widget and official inbound keyword/provider opt-out handling, consent collection integrations, cross-campaign scheduling policy and cancellation acceptance under in-flight delivery. Add channel-specific campaign compliance beyond the WhatsApp window/template rules, full analytics/date filters/export and scalable recipient controls. No external campaigns were sent or live provider behavior claimed.

### Business automation

Implemented: CRM/scheduled triggers, stored filters, ordered tag/lifecycle/note/task/delay actions, delayed follow-up events, transactionally committed run history, bounded event retries and causal loop suppression. It uses the same outbox as messaging/campaigns.

Next: OR/branch conditions, graphical sequence editing, business webhook actions and verified HTTP integrations, richer cancellation/rescheduling/recovery controls and failed-rule run attribution. Scheduled follow-ups check current rule enablement and entitlement. Build on the existing event/action implementation instead of a second scheduler or automation engine.

## Batch 3 — next direct implementation point

Build reporting from existing real ledgers: date-scoped conversation/agent/channel response metrics, campaign recipients/delivery, ai_runs tokens/estimated costs, crm_deals pipeline and domain_events/automation_runs reliability. Add exports and dashboard filters. Then complete Stripe event dedupe/order/recovery and invoice workflow, separate platform-admin authorization and tenant/subscription/revenue screens, and verified custom-domain/white-label models with entitlement enforcement. Do not insert sample production statistics.

## Batch 4 — integration and premium completion

Finish legacy Arabic/English direction-aware controls, common dialogs/tables/forms and accessible mobile behavior. Extend the real wizard/template/component journeys, refine customer context/deal/task navigation and error recovery, and write operator activation/privacy/retention runbooks. Keep this matrix/handover current.

After product construction, start the separately authorized **FINAL PRODUCT ACCEPTANCE & COMMERCIAL RELEASE READINESS** phase for full browser, security, load, isolation, failure-recovery and visual acceptance. No main merge or production deployment is authorized.
