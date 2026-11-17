# P0 commercial readiness — 2026-11-17

Launch verdict: **NOT READY**. No requirement is fully accepted merely because code or an old test exists.

Starting PR #14 HEAD: d84844a3639b2b558fa25474d1dae05ba741717a. Preserve newer work; do not merge main.

|ID|Requirement|Status|Code Evidence|Test Evidence|Deployment|Blocker|
|---|---|---|---|---|---|---|
|P0-01|Channels|PARTIAL|messaging/webhooks.controller.ts; adapters; channels service|Existing channel CI 43952711632 success at starting HEAD; synthetic provider coverage only|Starting Web d84844a; API c38293f|No authorized provider test accounts supplied for end-to-end Meta/Telegram acceptance|
|P0-02|AI|PARTIAL|ai/providers; knowledge/embedding-budget.ts; external-effect ledger|Fresh embedding failure/order/corruption checks; full local API 237/237|This batch pending deployment|Real model/embedding test keys absent from API variable names; actual answer/cost acceptance pending|
|P0-03|Flow Builder|PARTIAL|flows engine, publish component guard already present|Fresh engine regression passes; independent PostgreSQL retest pending|Existing implementation retained|Full supported-node UI/runtime matrix, concurrent publish and live authenticated acceptance remain|
|P0-04|Inbox|PARTIAL|Existing assignment, ownership and human takeover retained|Fresh local regression; independent PostgreSQL assignment retest pending|Existing implementation retained|100+ queue, restart/recovery/concurrent staff end-to-end matrix not yet freshly accepted|
|P0-05|Webchat|PARTIAL|Existing widget settings/runtime; unsupported upload/help controls absent per prior work|Channel setup CI at starting HEAD; fresh complete widget journey pending|Existing implementation retained|Live isolated visitor/staff/reconnect/attachments acceptance pending|
|P0-06|Billing|PARTIAL|Existing Stripe event ledger, invoices, plan limits and reconciliation retained|Local suite passes; no official provider sandbox transaction performed|Existing implementation retained|STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET absent from API variable names; merchant eligibility and sandbox account required|
|P0-07|Security|PARTIAL|Existing tenant/RLS/roles/encryption; this batch hardens IPv6 SSRF checks and embedding diagnostics|237 local API tests pass; engine internal/mapped/tunnel IPv6 regression passes|This batch pending deployment|Full endpoint/attachment/session audit and current independent PostgreSQL tests still required|
|P0-08|Production|PARTIAL|CI-only dump/restore acceptance added; existing preview healthcheck retained|Restore script syntax checked, CI execution pending|No Production created; Preview Sleep preserved|Independent production architecture/cost approval, actual backup schedule/offsite restore and alert acceptance required|

## Current observations
- PR #14 is open/draft. Last known SHA in owner prompt is older than actual HEAD.
- Railway existing Web deployment a3fba68a-0c34-4bb9-9e1c-f20b8bd4d4b0 SUCCESS at d84844a; API 9227ee69-1513-48d2-8781-4194d1e937f8 SUCCESS at c38293f.
- API config read confirms Sleep=true and /health. No variables or infrastructure changed.
- Current source CI was not all green: platform 43952711522 found commerce overflow at 768px in both languages; product 43952711754 passed core product journey but responsive script waited for renamed Data sources control.
- Live cloud browser opened the current Preview successfully at /login. No authenticated session was present. No live functional acceptance claimed.

## Implemented batch
1. Embedding provider errors no longer persist upstream diagnostic bodies that may contain credentials/customer input. Failed calls are explicitly non-replayable.
2. Validate embedding response shape, unique in-range integer indexes, finite numeric values and dimensions before caching/indexing. Preserve input order.
3. Canonicalize IPv6 before SSRF prefix checks; reject expanded loopback/mapped private addresses and tunnel/translation ranges. Ordinary public IPv4/IPv6 retained.
4. Commerce toolbar switches to its compact grid at 900px to include tablet widths with dashboard sidebar. Responsive acceptance pending.
5. Responsive product test uses the current Import & sync label while retaining actual channel-scoped navigation assertions.
6. CI-only dump/restore check rejects non-loopback/non-disposable URLs and existing restore targets, compares all public row counts, RLS policies, RLS flags and owners. No production database access.

## Fresh local evidence
- API build PASS; Web production build PASS.
- 237 API tests PASS, 0 failed/skipped; see p0-evidence/local-api-tests-20261117.txt. Database-backed local tests use PGlite; do not label them independent PostgreSQL.
- Focused AI/engine checks 54 PASS.
- Restore Python compilation PASS; actual restore requires CI PostgreSQL and is pending.
- An initial test-file creation used the wrong working directory and failed; corrected before running/passing tests. No application change was lost.

## Next acceptance and external dependencies
- Run current CI for independent PostgreSQL, channel, product, platform, editor and Inbox; inspect failures and artifacts, never infer PASS from queued builds.
- Release only accepted SHA to existing Preview API then Web; preserve Sleep and four services. Record terminal deployment IDs and /health.
- Authorized isolated login needed for deployed UI acceptance. Never test against owner/customer data.
- Official Meta/Telegram test identities; model test key with approved budget; Stripe test-mode merchant keys. Do not turn delivery/payment flags on for live customers.
- Complete eight acceptance matrices, including 100+ queued conversations and interrupted jobs, before changing verdict.

## Rollback
No migration added in this batch. Revert only this batch's source changes in a new commit if tests expose regression. For deployed application rollback use the prior accepted API/Web builds above after checking source compatibility; never reset the shared branch, delete data, or roll back schema blindly. Preview database was not modified by this work. Production activation and destructive migrations remain unauthorized.
