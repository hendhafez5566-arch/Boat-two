> Follow-on batch: [advanced flow continuation](ADVANCED_FLOW_20261119.md), accepted source 30ad961, supersedes the source checkpoint below for new sequence/condition/appointment repairs. Deployment/file safety boundary remains unchanged.

# Implementation checkpoint — 19 November 2026

## Verified scope and release boundary

Started from actual PR #14 HEAD `648ce04f48af0b1ad4dbbd4f50b015eb6ac96abb`, rather than handover SHA c6fb9fb. Latest tested application source: `ac48bf68d8594eb1bc82982fc3c3b8ac42ca958d`. The subsequent checkpoint changes documentation only. PR remains open; main was not merged.

Read-only Railway verification: same boat-two-ui-preview / preview; Web `648ce04`, API `f344ad6`, PostgreSQL and Redis present; no API persistent volume. No deployment, container replacement, storage configuration or paid infrastructure change was made in this batch. Existing file bytes are **unverified**, neither presumed preserved nor presumed lost. Metadata and isolated recovery tests do not prove the current customer-file inventory or backup. Before API deployment: obtain current authenticated inventory, verify encrypted backup bytes and restore, then establish compatible release/storage plan. Preserve existing file guards and do not delete or relocate customer bytes.

## Real defects repaired

| Source commit | Repair and acceptance |
| --- | --- |
| `8ee26a2` | Failed/queued/internal/inbound messages no longer suppress first-response SLA escalation. Only sent/delivered/read agent outbound replies satisfy it. Additive migration 111 updates SQL scanner as well as service logic. Disabled users excluded from notification recipients and new Inbox/escalation assignments. Existing stale settings do not prevent unrelated saves. |
| `4fdd12` | Flow HTTP response interruption and stream errors reject safely; oversized body cannot resolve on a later end event. Runtime also rejects credentials embedded in dynamic URLs before connecting. Actual engine error branch reaches fallback once; no automatic external-effect replay added. |
| `826a6cc`, `7802d52` | Disabled/foreign CRM owners and task/deal assignees rejected across direct, bulk, pipeline and Inbox overview writes. Agent direct contact PATCH could bypass ownership rules: now forbidden, including clearing ownership. Omitted owner preserves existing owner. Tenant-first locking and historic disabled-owner profile edits preserved. |
| `8405b2c`, `ac48bf6` | Actual PostgreSQL run exposed worker-versus-outbound tenant/conversation lock inversion causing HTTP 500. Conversation transaction now locks tenant before advisory/conversation locks. Deterministic contention test holds tenant, observes real outbound request waiting, then locks conversation and verifies exactly one sent row. Fixture includes visitor channel identity. |
| `4cabbc9` | Added opt-in live catalog acceptance restricted to the existing Preview origins, fresh synthetic company, 23 products and no uploads/deletes/provider sends. |

An obsolete simulator acceptance assertion expected a giant desktop modal despite the owner's already accepted compact 640×680 preview. Test now asserts the accepted responsive dimensions, input/question visibility and usable chat area. Product CSS was not reverted.

## Completed verification

- [Enterprise PostgreSQL run 44483881374](https://github.com/hendhafez5566-arch/Boat-two/actions/runs/44483881374), source ac48bf6: SUCCESS. 263 API regression tests and 8 scoped WhatsApp handoff tests pass. Real unprivileged PostgreSQL role, actual migrations, new SLA/CRM ownership matrix and deterministic send contention pass. Existing assignment recovery/fairness, attachment lifecycle/races, published flow execution/versioning, reports, billing authorization, bounded 100/500/1000-message stages, process restart/backlog integrity, synthetic sector API journeys and disposable dump restore also pass. This is isolated CI evidence, not Production capacity or a current Railway customer backup.
- [Product UI run 44483786691](https://github.com/hendhafez5566-arch/Boat-two/actions/runs/44483786691), source 8405b2c: SUCCESS, actual product journeys, responsive simulator and catalog pagination/timed feedback.
- [Portable storage run 44483786645](https://github.com/hendhafez5566-arch/Boat-two/actions/runs/44483786645), source 8405b2c: SUCCESS for both isolated storage backends, actual files/replacement/restore. Latest ac48bf6 changes only the new contention fixture.
- [Live catalog run 44483269371](https://github.com/hendhafez5566-arch/Boat-two/actions/runs/44483269371): SUCCESS against deployed Web 648ce04/API f344ad6. AR/EN × 320/390/1366, 6/6 journeys: 10/10/3 products, next/previous/bounds, actual price edit/save/reload, green feedback appearing then disappearing, empty-category/page reset, no overflow or page errors. Screenshots inspected. Synthetic company/records remain; no existing customer data changed or deleted. This accepts deployed catalog behavior only, not the new API repairs above.
- Responsive inventory [44483786583](https://github.com/hendhafez5566-arch/Boat-two/actions/runs/44483786583), follow-up/opportunity [44483786509](https://github.com/hendhafez5566-arch/Boat-two/actions/runs/44483786509), channels [44483786587](https://github.com/hendhafez5566-arch/Boat-two/actions/runs/44483786587), contact editor [44483786832](https://github.com/hendhafez5566-arch/Boat-two/actions/runs/44483786832) and editor recovery [44483786580](https://github.com/hendhafez5566-arch/Boat-two/actions/runs/44483786580): SUCCESS at 8405b2c.
- Local HTTP regression cases reproduced three failures before repair, then 6/6 passed including actual FlowEngine fallback. Local SLA scanner regression applies migration 111 twice and checks successful statuses/dedupe; 3/3 tests including expiry regression passed; API type-check passed.
- Keep failed runs as diagnosis: 44483041252 exposed real outbound deadlock (new SLA/CRM matrix itself passed); 44483041152 exposed obsolete simulator dimensions. They are superseded by accepted runs above, not relabeled successful.

## Readiness and remaining implementation

**DEMO READY remains scoped to accepted synthetic journeys. SOFTWARE COMPLETE / PILOT READY / COMMERCIAL LAUNCH READY: not established.** This batch closes specific defects; it is not blanket platform or security certification.

1. P0: finish advanced-node add/edit/reopen/publish/actual execution and failure matrix (subflows, sequences, interactive messages, bookings, variables/conditions, API retries/fallbacks/provider failures/versioning). Existing API runtime evidence is retained; it does not replace every authoring UI journey.
2. P0: complete endpoint/role matrix and UI behavior for actual owner/admin/agent roles, session/team/billing/Inbox/CRM/file/SLA scope. No manager role was invented. Retain new negative ownership tests and tenant isolation.
3. P1: finish remaining page-specific AR/EN mobile/desktop interaction acceptance and report provenance; isolated load/restart evidence does not establish production performance, monitoring or backup operations.
4. P2: execute all three complete business journeys **through authoring UI**, including appointments, opportunity follow-up and reports. Passing synthetic sector API journeys do not close this UI requirement. Finish remaining campaigns/automations/social/AI/billing software gaps as documented in original launch checklists.
5. External gates remain: approved provider accounts/budget/payment sandbox; persistent storage with verified current bytes; production operations/monitoring/support; privacy/terms. Continue independent software work while these remain pending. Do not create resources, merge main or deploy API across an unproven file boundary.

The older work log and readiness documents remain historical evidence; use this checkpoint for this batch and live GitHub/Railway queries for future source/deployment truth.
