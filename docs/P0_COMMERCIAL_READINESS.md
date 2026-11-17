# P0 commercial readiness — 2026-11-17

Launch verdict: **NOT READY**. No requirement is fully accepted merely because code or an old test exists.

Starting PR #14 HEAD: d84844a3639b2b558fa25474d1dae05ba741717a. Preserve newer work; do not merge main.

|ID|Requirement|Status|Code Evidence|Test Evidence|Deployment|Blocker|
|---|---|---|---|---|---|---|
|P0-01|Channels|PARTIAL|apps/api/src/messaging/webhooks.controller.ts; adapters; channels service|CI44038297686 synthetic channel UI; live Preview Webchat bot/CRM/handoff/reply/dedupe/tenant rejection PASS|API4e058e0/Web2c67736 SUCCESS|Official WhatsApp/Facebook/Instagram/Telegram end-to-end test identities and provider approvals not supplied; real provider acceptance BLOCKED — EXTERNAL|
|P0-02|AI|PARTIAL|apps/api/src/ai/providers/embeddings.ts; knowledge/embedding-budget.ts; external-effect ledger|Fresh provider malformed/error/no-replay and complete local API239/239 PASS|API4e058e0 SUCCESS|Authorized paid model/embedding test credentials and budget, actual grounded Arabic/English answer/source/cost matrix pending. Existing tenant credentials not accessed|
|P0-03|Flow Builder|PARTIAL|Existing engine/component publish guard retained; Next route synchronization repaired; scripts/qa-p0-node-matrix.mjs; qa-p0-delay-restart.mjs|Real PostgreSQL CI44038297841; editor CI44038297701; responsive product/simulator CI44039908071 AR/EN×5sizes PASS; CI4414154005931nodes/publish concurrency/frozen delayed-version restart PASS|API4e058e0/Web2c67736 SUCCESS|31node API/DB draft contracts, concurrent publish/stale save/restore and actual delayed-version restart accepted; all-node UI/provider/error matrix remains|
|P0-04|Inbox|PARTIAL|Existing assignment, ownership, human takeover retained; conversation ownership409checks, durable SLA alerts and bounded catch-up|Actual PostgreSQL105queued conversations, bounded100+4drain, human ownership/capacity checks; live human reply/private notes PASS; CI44141540059staff/session/SLA/load/restart; live44143748624Inbox recovery PASS|API4e058e0/Web2c67736 SUCCESS|Concurrent staff claims/reply denial, durable SLA alerts and restart persistence accepted; full worker-crash/pending-assignment and all-role interaction matrix remains|
|P0-05|Webchat|PARTIAL|Existing widget runtime/settings preserved; sparse PATCH now retains allowed origins; truthful widget cursor paging and single-flight catch-up|Live published flow→CRM→human→visitor reply; dedupe/private notes/foreign company rejection PASS; browser44141540075105+history/PNG/offline/reload; live44143748624PASS|API4e058e0/Web2c67736 SUCCESS|Long-history/paging/PNG/offline/reload browser acceptance passed; all media variants, attachment access lifecycle and persistent production storage remain|
|P0-06|Billing|PARTIAL|Existing Stripe ledger/price registry/reconciliation retained; auth rate limit added|Independent PostgreSQL synthetic price/grace/reconciliation/no-proration fixture PASS; external HTTPS blocked|API4e058e0 SUCCESS|Official Stripe sandbox merchant keys/webhook and full subscription lifecycle, invoice/payment acceptance and market eligibility BLOCKED — EXTERNAL|
|P0-07|Security|PARTIAL|IPv6 SSRF hardening; embedding diagnostic redaction/validation; shared atomic auth counters; patched runtime dependencies; safe-event.ts SSE delimiter validation; qs/file-type/uuid compatible overrides|239local API tests; real PostgreSQL RLS/role/journey tests and24concurrent login attempts PASS; production dependency audit0critical/0high/1moderate after compatible patches; fresh241API tests and actual PG rotation/revocation/logout PASS|API4e058e0/Web2c67736 SUCCESS|Session revocation/rotation/logout, SSE injection and tenant regressions passed; complete endpoint/attachment/SSRF audit not finished; dependency audit is not security certification. One moderate Nest advisory remains visible with application SSE mitigation; seven dependency advisories patched|
|P0-08|Production|PARTIAL|deploy/production opt-in configs and runbook; CI dump/restore test|CI44038297841 actual restore compares rows/RLS/policies/owners PASS. Preview health db up; Sleep readback true on both services|Existing Preview only; no Production created|Approved independent architecture/cost, persistent attachments, real backup/offsite restore timing, monitoring and operational recovery acceptance required|


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

## Accepted API source — 3cdb26b11284e327fa17a1e3aecae4544f7630e6
- Independent PostgreSQL CI44038297841 SUCCESS: channel/flow/signature/parity/assignment journeys,105queued conversations,24concurrent login attempts, synthetic billing price/grace/reconciliation and actual dump/restore comparing data/RLS/ownership. Restore remains CI-only; productionBackupTested=false.
- Product core UI journeys PASS at this SHA. Responsive script advanced through scoped navigation after its fix, then found stale product form label selectors. Updated exact labels to current name/price/SKU labels; no assertions or journey steps removed. Full responsive result pending.
- API deployment e3b1a5e5-68cd-4fd7-97b4-e87fb477bdf8 started on existing Preview; terminal status not yet observed. Web remains prior version until responsive acceptance passes.

## Live API acceptance — 2026-11-17
- Existing Preview API deployment e3b1a5e5-68cd-4fd7-97b4-e87fb477bdf8 observed SUCCESS; /health status=ok,db=up.
- scripts/qa-live-p0-preview.mjs PASS on Railway: synthetic company registration/onboarding, sparse widget origins persistence, published question flow, CRM name save, human handoff, staff reply to visitor, internal note privacy, duplicate visitor delivery and foreign-tenant flow/conversation rejection. See p0-evidence/live-preview-api.json.
- Two explicitly synthetic workspaces remain; no real customer data changed/deleted, no provider messages, no financial charges, no plan changes. Credential values were never logged or saved.
- Current official-provider acceptance remains external-blocked; browser authenticated acceptance remains unavailable without secure test-account login.
- Responsive run44038832233 progressed through the first viewport and then hit an unstable test selector expecting category product count0 on a category reused across widths. Selector now uses the actual stable category ID, while retaining100category scale, option count, editing/deletion/price/reopen/simulator assertions. Complete ten-viewport result pending.

## Final release and acceptance checkpoint — 2026-11-17
- Application release3cdb26b11284e327fa17a1e3aecae4544f7630e6 is deployed on BOTH original services:
  - API e3b1a5e5-68cd-4fd7-97b4-e87fb477bdf8 SUCCESS.
  - Web1e6808de-ca7d-4065-ab4f-f3367a9642ec SUCCESS.
- Both service configurations read back pinned to that SHA with Sleep=true and no staged changes. All newer commits after3cdb26b modify acceptance scripts/evidence/docs only; application trees are identical.
- Final product acceptance44039908071 at404b16fc85f6b1c9e89b8d514b2d3dd085d4ea9a SUCCESS: core product/import journeys plus ten AR/EN×320/390/768/1366/1920category/price/edit/reopen/picker/simulator journeys. Artifact14307884689. All assertions retained. Stale empty-state create-action selection corrected to the persistent header action; scoped lint PASS.
- Current production dependency audit using declared pnpm9:0critical,0high,8moderate (437dependencies). This is advisory coverage only, not a claim of no application vulnerabilities.
- Live API acceptance PASS is persisted in p0-evidence/live-preview-api.json.
- Secure browser sign-in completed. Observed live dashboard, selected the explicitly labeled existing QA Webchat channel, inspected Products, then Import & sync→Back to bot manager. Actual Keyword Replies heading returned with channelId preserved. No real products/bots/channels were edited/published/deleted in that account.
- Reviewed CI Arabic/English commerce and Arabic Inbox screenshots. This is scoped visual review, not complete visual parity or all-page manual acceptance.
- No main merge, new Railway services/project/database, provider credential changes, paid transactions or Preview Sleep changes.

### Final owner verdict
**NOT READY** for commercial launch. The implemented and tested batch is released, but P0 as a whole is NOT closed. Do not advertise real provider/AI/payment or operational guarantees based on synthetic tests.

### Precise continuation
1. Obtain authorized official test identities: WhatsApp WABA/phone + required Meta app permissions/webhook approval; Facebook Page/Messenger and Instagram messaging permissions; Telegram bot token/verified HTTPS webhook. Complete each receive→bot→CRM→handoff→employee reply→reload→disconnect/reconnect/error matrix without real customers.
2. Supply a test AI provider/embedding account with an explicit spending ceiling through secure settings. Run the ten specified knowledge/source/unknown answer/Arabic/English/usage/failure/isolation scenarios; no paid calls authorized by this release.
3. Supply official Stripe Sandbox/test-mode merchant access and webhook secret through secure settings; validate merchant eligibility for the intended market and full plan/invoice/payment/failure/deduplication matrix. No live charge.
4. Finish supported-node/editor publish concurrency, Inbox multi-role/concurrent-reply/escalation/crash recovery and Webchat reconnect/media/long-history acceptance. Existing positive evidence must be retained; do not rebuild functioning code.
5. Finish all-sensitive-endpoint/attachment/session review and triage eight moderate dependency advisories with reachability evidence and compatible patches.
6. Review deploy/production/README.md: approve exact infrastructure/cost, persistent attachment storage, backups/retention, monitoring recipients and measured recovery. Do not create resources or disable Preview Sleep without that approval.
7. Update each table row only when the entire requirement's acceptance passes. Retain PARTIAL/BLOCKED states until then.

### Measured owner benefits supported now
Railway acceptance demonstrates automated collection of a visitor name into CRM, context-preserving human transfer, staff response through Webchat, internal-note privacy and duplicate-message suppression. Independent PostgreSQL tests demonstrate eligible/capacity-limited queue assignment and105conversation bounded recovery. No response-time saving percentage, staffing reduction or revenue claim has been measured.


## Continuation batch — ownership, backlog and durable SLA (2026-11-17)

Baseline retained: PR14 HEAD `48c476478579f20f0e928ec65d02161db1b67883`, verified Preview application `3cdb26b`. No previous accepted evidence superseded.

- Reproduced defect: simultaneous agent takeover returned two successes. Conversation-locked ownership checks now reject competing claims, replies, release and reassignment with HTTP409; owner/admin explicit reassignment remains available. Local HTTP regression PASS.
- Reproduced backlog defect: Inbox incremental endpoint incorrectly returned `hasMore:false`; fixed lookahead paging and bounded client catch-up. Widget now exposes truthful paging and drains bounded pages with single-flight polling and historical typing suppression. Local HTTP >200-message/private-note regression PASS.
- SLA worker now persists deduplicated internal notifications in the same transaction, emits UI refresh after commit, excludes disabled escalation targets, and isolates individual item failures. PostgreSQL notification/recovery acceptance is added to existing isolated CI; acceptance pending until actual run passes.
- Local API and Web production builds PASS. `scripts/qa-p0-reliability.mjs` four local HTTP checks PASS on PGlite; this does not constitute PostgreSQL or deployed acceptance.
- Existing PostgreSQL and Inbox AR/EN responsive workflows retained. New acceptance scripts added without replacing old tests. Real PostgreSQL / browser / Preview deployment acceptance PENDING; all P0 rows remain PARTIAL.
- Rollback: repin existing API/Web to verified `3cdb26b`; no migrations or schema changes in this batch. Preserve Preview Sleep and existing services.


### Dependency and SSE continuation

- Overrides patch `qs`6.16.1, `file-type`21.3.2 and `uuid`11.1.1. Fresh production audit: zero critical/high, **one moderate**, down from eight (`docs/p0-evidence/dependency-audit-continuation.json`). Remaining Nest10 SSE advisory GHSA-36xv-jgw5-4q75 is mitigated at our sole SSE emitter: decimal persisted IDs and bounded single-line event types; invalid types become generic `message`, data remains JSON. Regression includes CR/LF protocol injection. Advisory remains visible; no claim of package-level remediation or full security certification.
- Real PostgreSQL CI44047653153: all four reliability HTTP groups PASS. The new SLA recovery test FAILED because its synthetic tenant had no inbox_settings row; fixture corrected to upsert settings. No production acceptance claimed for that failed run.
- Existing complete local API suite239/239 PASS with isolated environment configuration. Browser additions cover actual PNG upload/render, >100 history, offline reconnect and reload in AR/EN390/1366; acceptance pending workflow result. Prior AR/EN five-width Inbox checks remain unchanged.
- Session acceptance extended with foreign session revocation denial, own session revocation, refresh rotation/replay and logout. This is additional acceptance, not replacement of previous tests.

### Accepted baseline batch and next acceptance — 2026-11-17

- `4db58a2`: all seven associated workflows PASS, including actual PostgreSQL enterprise CI44048029812 and platform500-case smoke CI44048029774. API deployment5ce949b1-6433-4e08-a472-7c60d6e4b2e9 SUCCESS; Web133125ea-f1d2-49db-b2e1-b99fd3e7ecd5 SUCCESS. These are deployment states; new live acceptance is tracked separately.
- `191122c`: dependency/session PostgreSQL CI44137798373 PASS. Inbox browser44137798268 FAILED on stale pre-refinement color expectations; preserved owner-requested newer canvas/activity styling, updated those exact expectations and raised undersized operational event labels to13px/time12px. No contrast, overflow, AR/EN or five-width assertions removed.
- Local patched API suite240/240 PASS. All31 supported node draft contracts survive API/database roundtrip; actual published variable→condition→random→attribute→tag→private note→split→business hours→message/end chain PASS locally with the real outbox worker enabled. Local SQL here is PGlite; PostgreSQL acceptance for this extended matrix remains pending.
- Added multi-tenant graded100/500/1000unique-message CI acceptance with concurrency8, actual API process replacement, replay dedupe after restart, retained histories and report inbound/conversation/new-contact counts. Test harness added to existing disposable PostgreSQL job; measurements pending. No stress on Railway.
- Program continuation: P1 and P2 tracked in their dedicated docs. No stage is marked DONE merely because a subset passes.

### PostgreSQL and browser acceptance update

- Independent PostgreSQL CI44139220828 SUCCESS at`3a7bede`:31node draft contracts and published runtime chain; five reliability groups including sessions; SLA alerts; graded1000message load; actual API restart and dedupe; report count integrity; backup restore data/RLS/ownership. Artifact14352888917.
- Inbox/Webchat browser CI44139718797 SUCCESS at`e3bdc74`: all ten AR/EN×5width Inbox journeys, plus four AR/EN390/1366Webchat history105+, actual uploaded PNG rendering, offline/reconnect, reload/no-duplicates/private-note journeys. Prior color-only harness failure and undersized contact-name regression retained in CI history; name fixed to15.5px rather than reducing its assertion.
- Local current patched API240/240 PASS before newly added report SQL fixture. Production audit remains0critical/0high/1moderate with application SSE mitigation, not full audit closure.
- P1 first-human-response reporting and P2 three-industry synthetic journeys implemented next; pending their own PostgreSQL/browser acceptance. No full P0/P1/P2 DONE claim.

## Continuation acceptance checkpoint

Application source`4e058e0a4082d311788c1df87ac2beb3fab8068f` accepted:
- Enterprise PostgreSQL44141540059 SUCCESS:241API tests, full retained HTTP suites,31node draft matrix, published runtime chain, frozen delayed-version recovery after actual restart, SLA alerts, graded1000messages, report accuracy, three industry journeys and restore data/RLS/owners.
- Browser44141540075 SUCCESS:10Inbox+4Webchat+4report AR/EN journeys. Artifact14355590349. Reviewed English desktop Inbox, Arabic mobile widget and Arabic mobile report screenshots; this is scoped visual review, not full-platform parity.
- API deployment`b0cd6a5a-450d-4614-a2ab-ddb0d57706eb` SUCCESS; Web`b47cc51d-96b3-47ba-9186-d2953a9dc2d5` SUCCESS. Sleep remainedtrue on both; original4services/2volumes, no staged changes and no new infrastructure.
- Live Railway API acceptance at2026-11-17T17:51:13Z PASS on preceding accepted application`e3bdc74`:synthetic registration, published name collection→CRM→human reply, private notes, dedupe, foreign tenant denial. Baseline live evidence retained; later UI/report release needs its scoped live browser acceptance.
- Visual review reproduced Arabic activity labels in English Inbox; corrected assignment/takeover/status/release/SLA/handoff/block/media states in`2c67736`. Added actual selected-language browser assertion. This follow-up is pending acceptance/deployment; no all-page localization claim.

Unfinished independent work: per-node UI/unsupported failure/media matrix; all-sensitive-endpoint and attachment lifecycle audit; full assignment worker crash/restart and notification recipient/role matrix; whole-platform interaction acceptance; full report dimensions; optional-feature execution readiness; support/help/legal operational package. External blocks remain official messaging identities/approvals, test AI credentials/budget, official merchant sandbox and independently approved production/persistent storage/costs. Nothing is marked DONE based on these scoped checks.

## Final accepted release — 2026-11-17

This checkpoint supersedes the pending localization/live-acceptance statements above; historical failures remain for traceability.

- API **4e058e0a4082d311788c1df87ac2beb3fab8068f**, deployment **b0cd6a5a-450d-4614-a2ab-ddb0d57706eb SUCCESS**.
- Web **2c67736d37a81ea98aedf89a2dc44e5a21c5d4ff**, deployment **66ec62ad-9a85-4d53-a2e7-537d044c0197 SUCCESS**. API compatibility retained; the later commit changes Web localization only.
- Both sources/configuration read back pinned to these commits with **Sleep=true**. Original4services/2volumes retained; no staged changes/resources/provider credentials/main merge.
- Localization commit's seven workflows SUCCESS, including platform500-case smoke44142442776 and18AR/EN browser journeys44142442945.
- **Live Railway browser44143748624 SUCCESS**, artifact14355163261:4AR/EN×390/1366 journeys on the actual deployed site. Synthetic company only: Inbox persisted staff replies, offline reconnect, reload/no duplicate bubbles, measured first-human-response report; widget API excludes private notes and repeated inbound delivery is deduplicated. Results persisted in`docs/p0-evidence/live-runtime-browser/results.json`. Reviewed live English desktop Inbox and Arabic mobile measured-report screenshots. This is real Preview acceptance, not official Meta/Telegram or full-platform business certification.
- First live run44143464316 failed because a text locator matched both sidebar preview and thread. Corrected by scoping to`.thread-msgs`, preserving the exact expected text/no-duplicate checks; retry44143748624 passed. No application assertions removed.
- Final evidence index:`docs/p0-evidence/ci-acceptance-continuation.json`; P1 and P2 documents retain accurate PARTIAL statuses.

**Verdict: NOT READY for broad commercial launch.** Scoped code/test/deployment batch is accepted. Whole P0/P1/P2 remains unclosed for the precise independent/external work listed above.

### Next execution point
1. Start from actual PR14 HEAD; application release pins above are accepted, with`3cdb26b` retained as the original rollback.
2. Do not repeat accepted ownership/paging/SLA/session/report/load/version-restart fixes. Extend per-node editor/UI/media/error acceptance and crash-mid-assignment recovery; investigate only new failures.
3. Audit remaining sensitive endpoints and attachment access/retention/persistent storage; one moderate Nest package advisory remains visible with SSE application mitigation.
4. Complete every-page interaction UX, remaining report dimensions and optional-feature failure/readiness gates; scoped500route smoke is not complete acceptance.
5. Continue tourism/store/services browser/role/failure journeys. Official messaging/AI/payment identities and independent production approval stay BLOCKED — EXTERNAL.
6. Rollback by repinning existing API and Web source to accepted`3cdb26b` if this batch needs full rollback; no schema migration was introduced by this continuation. Do not recreate databases, alter Sleep, erase records or accept staged infrastructure changes.

## New continuation — attachment lifecycle and assignment worker (2026-11-17)

Start from actual PR14 HEAD5d25e580c933e180a0f327d52274c06caab163ad. Accepted baseline CI44141540059/44142442945/44143748624 retained.

Proven gaps: public file serving ignored the database lifecycle and advertised a full-day cache; tenant-owned uploads could be re-sent from another company's conversation if their bearer URL was known. Added DB-authoritative sharing status, private metadata/content, owner/admin revoke/restore, recoverable unused-file deletion, linked-resource protection, upload orphan cleanup, tenant ownership validation inside outbound publication and no-store responses. Public unpredictable bearer links remain compatible for provider/visitor retrieval; already-downloaded copies cannot be recalled. New owner/admin attachment management UI covers upload/download/delete/revoke/restore and persistence. Additive migration109 changes no existing file names/bytes/rows.

Proven recovery gap: assignment queue retry was invoked only by availability changes. Added bounded30-second recovery scans with fair tenant cursor, tenant SKIP LOCKED, existing transactional assignment selection, and disabled-user exclusion. Additive migration110 installs a scoped scan function. No external delivery or new resource.

Local API/Web production builds PASS. Local real HTTP/PGlite attachment lifecycle, tenant/role denial, byte retrieval, linked deletion conflict and simultaneous send/delete regression PASS. Real PostgreSQL child SIGKILL/rollback/recovery/disabled-user and browser lifecycle acceptance added; PENDING CI. No new deployment accepted yet.

Rollback constraint: migrations are additive and preserve records/bytes. Once sharing is revoked or files soft-deleted, do not roll back to an API whose public file handler ignores the new lifecycle; retain the lifecycle gate in any rollback build. Old accepted images remain preserved for investigation, but a privacy-preserving rollback must keep this gate. No hard purge, automatic record deletion or retention policy is enabled. API storage still requires an approved persistent volume/object store before production; no new storage provisioned.

Nest remaining moderate advisory reviewed and disposition documented in docs/security/NEST_SSE_ADVISORY.md. Existing application mitigation remains; package advisory is not suppressed or declared patched.

### Additional URL security finding

Reproduced before patch:`contentSchema.safeParse({media:{kind:'file',url:'javascript:alert(1)'}})` returnedtrue. Tightened media/header/template/CTA URL contracts and constructed outbound validation to HTTP/HTTPS without embedded credentials. Added legacy Inbox rendering guard so previously persisted unsafe URLs do not become clickable links; no historical messages altered. API and web security regression cases cover executable/data/file schemes and credential URLs; HTTP/HTTPS including the isolated local test upload remain supported. Full PostgreSQL/browser acceptance pending this security follow-up. The controlled historical-message browser probe is a security rendering fixture, not provider acceptance.
