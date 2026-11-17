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

## Batch 1 checkpoint — 927a43fbf1641ff7a9cd12f3f6874d856b9a8d98
- Platform CI44034877616 PASS:500 route/language/viewport cases, tablet commerce overflow closed.
- Channel44034877519, editor44034877577, contact44034877732, work44034877575 and seven-action44034877611 PASS.
- PostgreSQL44034877571 passed production migrations and actual HTTP channel/flow/CRM/assignment acceptance. New restore step failed at pg_restore; no restore acceptance claimed. Improved sanitized error reporting and selected PostgreSQL16 client when installed; retest pending.
- Product44034877698 exposed a test race: API asserted category deletion before its async request completed. Added explicit successful deletion observation. Responsive script updated for current searchable category dropdown and disabled nonempty deletion controls, preserving scale/search/empty deletion/persistence assertions.

## Security dependency batch — pending acceptance
- Initial registry audit:3 critical,20 high,22 moderate,4 low advisory records. These are dependency alerts, not proof every path is exploitable.
- Upgraded Next.js to15.5.28, Zod to4.6.6, and locked transitive Multer2.5.0/body-parser1.20.9/PostCSS8.5.33. Fresh production dependency audit now0 critical,0 high,8 moderate,0 low. Remaining moderate alerts: file-type, Nest core, uuid and qs; full security certification is not claimed.
- Migrated asynchronous Next headers/route parameters; retained React18 supported peer range. Existing editor lint errors exposed by Next15 were repaired with explicit field types/comments, rather than disabling build checks.
- Migrated Zod record calls, optional enum-key record behavior and generic parser output inference. Input defaults for filters/conditions use prefault to retain prior parsing/default semantics.
- Local API237/237 PASS after dependency migration; API build PASS. Next15 Web build and CI acceptance are required before deployment. pnpm9 frozen-lockfile install PASS, matching the declared packageManager and Railway builder.
- Source references: https://github.com/advisories/GHSA-2464-fhr4-w9xw ; https://github.com/expressjs/multer/releases/tag/v2.5.0 ; https://nextjs.org/docs/app/guides/upgrading/version-15 .

## Batch 2 checkpoint — 497748ae06c75718661e7f706327d7dbcb2b2e34
- Next15 build and API build succeeded locally; frozen pnpm9 CI-mode install completed (initial invocation only showed an interactive reinstall prompt, so the actual verification used CI=true).
- CI caught a Zod4 compatibility regression before deployment: PATCH widget settings inserted defaults for omitted fields, resetting allowedOrigins. Corrected with sparsePatch validation for widget settings, CRM contact profile and integration configuration (canned reply patches use the same explicit contract). Unknown keys remain stripped; supplied invalid values remain rejected. Fresh regression verifies omitted keys and explicit false/empty values.
- Product responsive acceptance also exposed missing channel-context return navigation; restored the existing Back to bot manager action for channel-scoped catalog and assert its current accessible label.
- No failed dependency build was released. Prior accepted Preview deployments remain unchanged.

## Authentication and queue acceptance batch — pending CI
- Added additive migration108_auth_rate_limits.sql. Shared atomic PostgreSQL counters apply to login, registration, refresh and invitation acceptance; transport counter ignores untrusted forwarding headers. Stores only hashes and bounded counts; expires after5minutes; application role cannot read/reset counters directly. Login password input bounded to128characters before hashing.
- Local database test covers30 parallel counter calls, exactly15allowed, separate identities, expiry recovery, capped counters and denied direct-table access. Added real HTTP test for24concurrent invalid logins:15authentication checks and9HTTP429, plus independent identity. No actual user accounts used.
- Expanded independent assignment acceptance to105queued conversations, paginated persistence, unavailable staff, capacity1, human ownership retention, repeated availability safety, then two bounded drains100+4 and per-conversation eligible owner verification. No load on Railway.
- Fresh local suite239/239 PASS, API build PASS, Web Next15 build PASS. Current independent PostgreSQL, restore and responsive acceptance must still pass.
- Rollback for migration108: additive operational counters only, no customer rows changed. Roll back application to previous compatible release and retain counters/schema; do not drop tables or reverse customer data.

## Independent PostgreSQL batch3 result
- CI44037571907 passed actual migrations and every HTTP script, including105queued conversations and24concurrent login attempts. Sparse settings regression no longer reproduces.
- Restore failure now diagnosed precisely: host pg_restore emitted SET transaction_timeout, unsupported by PostgreSQL16. Matching tools now run inside the existing ephemeral CI database container (not Railway); same source/restore row counts and RLS assertions remain mandatory. Retest pending.
- No application failure/failed release was deployed.

## Navigation defect discovered during responsive product acceptance
- CI44037571876 clicked Back to bot manager but stayed in the product section: Next client navigation changed URL parameters without dispatching popstate. Both manager section state and shared channel context now observe Next search parameters as well as explicit history/context events. The existing acceptance still requires the real Keyword Replies heading and original channelId after clicking; no destination assertion weakened.
- Production code configuration prepared under deploy/production with separate always-on opt-in service configs and explicit backup, persistent attachment, monitoring/cost/activation gates. These files are not applied to Preview.

- Extended real PostgreSQL runner with the existing billing price/delinquency/reconciliation fixture. Added loopback guard and hard-blocked HTTPS so this remains a synthetic provider test, never official Stripe sandbox acceptance or a real charge. Pending execution.
