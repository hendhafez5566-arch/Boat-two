# Remaining implementation

Do not restart discovery from scratch: continue from this branch and the matrix. Keep one Draft PR and append coherent commits.

## Batch 1 — finish core gaps

1. Transactional domain-event outbox between inbound persistence and flow execution; effect idempotency, distributed per-conversation ownership, durable outbound dispatch with timeout/ambiguous-delivery reconciliation. The new webhook queue does not by itself close these gaps.
2. Provider OAuth/embedded signup, connection health verification, Messenger/Instagram receipts, WhatsApp approved-template synchronization/send/UI and documented scopes/webhook subscription flows. Operator Meta credentials/app review remain external prerequisites.
3. Contact/message/AI quotas with atomic reservation and exact entitlement checks. Fixed roles work; granular permission definitions remain. Audit subscription changes and operational actions beyond core configuration.
4. Teams/departments, customer tags, SLA, richer bulk assignment/status UI, stable tuple pagination, shared realtime transport/status replay and membership-aware SSE stream revocation.
5. Builder reusable components/subflows, event triggers and guided beginner wizard; improve small-screen editing and translate remaining controls. Add optimistic conflicts to version restoration and coordinate publish with pending autosave; editor currently detects stale PATCH saves.
6. Complete company creation/switching for existing users, authentication recovery/verification, secure cookie/session design and invitation delivery integration as separate connected slices.

## Batch 2 — business capabilities

- CRM contact CRUD/profile UI, indexed search, custom fields, tags, segment queries, lifecycle/ownership, notes/timeline linked to messages/flows. Deals/pipelines/tasks, validated import/export and duplicate handling.
- Tenant AI agents/provider configuration, authorized tool actions, durable knowledge ingestion, atomic budgets, cost accounting with real pricing metadata. Retain current hybrid retrieval and prompt protections.
- Campaign drafts/templates, segment preview, consent ledger, frequency caps, schedule/recipient ledger, compliant channel delivery, retries/failures and analytics. No sending without explicit configured/authorized provider capability.
- Business automation rules (typed triggers/actions/conditions), schedules/sequences, execution history and bounded retries, reusing the domain outbox and existing flow primitives where appropriate.

## Batch 3 — commercial SaaS

- Analytics date filters/aggregations, conversions, channels/agents/AI/CRM/campaign reporting and real exports.
- Stripe event idempotency/order handling, payment recovery and fully enforced entitlements; real billing requires keys, prices and webhook setup. Portal already handles invoices/payment methods when configured.
- Separate platform-admin authentication/authorization boundary and tenant/subscription/revenue administration with audit.
- Tenant logo/colors, verified custom domains and routing, branded widget/portal, entitlement-based brand removal. Current widget color/title settings are not full white-label support.

## Batch 4 — integrated premium completion

- Full bilingual coverage and direction-aware builder/Inbox internals, common form/table/dialog components, consistent states and meaningful tooltips.
- End-to-end guided onboarding, richer executable template gallery and all requested journey steps from actual UI.
- Provider activation/runbooks, permissions/plan documentation, continuity docs updated with each commit.

## External actions

- GitHub delivery is complete for this checkpoint: Draft PR #1 is open at https://github.com/hendhafez5566-arch/Boat-two/pull/1. The initial API proxy denial was resolved; reuse this PR and branch.
- Meta, AI/embedding, Stripe and custom-domain credentials/approvals have not been requested or activated. Do not use paid services without explicit permission.

## Separate acceptance phase

No claim of commercial completeness. Defer the full browser, security, performance, isolation, reliability and visual acceptance suite until product construction is complete. Targeted build/type checks and development regression checks must continue throughout construction.
