# P0 commercial readiness — 2026-11-17

Launch verdict: **NOT READY**. No requirement is fully accepted merely because code or an old test exists.

Starting PR #14 HEAD: d84844a3639b2b558fa25474d1dae05ba741717a. Preserve newer work; do not merge main.

|ID|Requirement|Status|Code Evidence|Test Evidence|Deployment|Blocker|
|---|---|---|---|---|---|---|
|P0-01|Channels|PARTIAL|apps/api/src/messaging/webhooks.controller.ts; adapters; channels service|CI44038297686 synthetic channel UI; live Preview Webchat bot/CRM/handoff/reply/dedupe/tenant rejection PASS|API/Web69c57c8 SUCCESS; final deployment IDs below|Official WhatsApp/Facebook/Instagram/Telegram end-to-end test identities and provider approvals not supplied; real provider acceptance BLOCKED — EXTERNAL|
|P0-02|AI|PARTIAL|apps/api/src/ai/providers/embeddings.ts; knowledge/embedding-budget.ts; external-effect ledger|Fresh provider malformed/error/no-replay and complete local API239/239 PASS|API69c57c8 SUCCESS; final deployment ID below|Authorized paid model/embedding test credentials and budget, actual grounded Arabic/English answer/source/cost matrix pending. Existing tenant credentials not accessed|
|P0-03|Flow Builder|PARTIAL|Existing engine/component publish guard retained; Next route synchronization repaired; scripts/qa-p0-node-matrix.mjs; qa-p0-delay-restart.mjs|Real PostgreSQL CI44038297841; editor CI44038297701; responsive product/simulator CI44039908071 AR/EN×5sizes PASS; CI4414154005931nodes/publish concurrency/frozen delayed-version restart PASS|API/Web69c57c8 SUCCESS; final deployment IDs below|31node API/DB draft contracts, concurrent publish/stale save/restore and actual delayed-version restart accepted; 31 inspector/routing UI roundtrips accepted CI44154027850; advanced property/provider/error runtime matrix remains|
|P0-04|Inbox|PARTIAL|Existing assignment, ownership, human takeover retained; conversation ownership409checks, durable SLA alerts and bounded catch-up|Actual PostgreSQL105queued conversations, bounded100+4drain, human ownership/capacity checks; live human reply/private notes PASS; CI44141540059staff/session/SLA/load/restart; live44143748624Inbox recovery PASS|API/Web69c57c8 SUCCESS; final deployment IDs below|Concurrent staff claims/reply denial, durable SLA alerts and restart persistence accepted; worker crash/rollback/fresh-process recovery accepted CI44150302692 and44154027940; all-role interaction and multi-tenant fairness acceptance remains|
|P0-05|Webchat|PARTIAL|Existing widget runtime/settings preserved; sparse PATCH now retains allowed origins; truthful widget cursor paging and single-flight catch-up|Live published flow→CRM→human→visitor reply; dedupe/private notes/foreign company rejection PASS; browser44141540075105+history/PNG/offline/reload; live44143748624PASS|API/Web69c57c8 SUCCESS; final deployment IDs below|Long-history/paging/PNG/offline/reload browser acceptance passed; attachment lifecycle/ownership/send-delete race accepted CI44154027940 and AR/EN UI44154028003; all media variants and persistent production storage remain|
|P0-06|Billing|PARTIAL|Existing Stripe ledger/price registry/reconciliation retained; auth rate limit added|Independent PostgreSQL synthetic price/grace/reconciliation/no-proration fixture PASS; external HTTPS blocked|API69c57c8 SUCCESS; final deployment ID below|Official Stripe sandbox merchant keys/webhook and full subscription lifecycle, invoice/payment acceptance and market eligibility BLOCKED — EXTERNAL|
|P0-07|Security|PARTIAL|IPv6 SSRF hardening; embedding diagnostic redaction/validation; shared atomic auth counters; patched runtime dependencies; safe-event.ts SSE delimiter validation; qs/file-type/uuid compatible overrides|239local API tests; real PostgreSQL RLS/role/journey tests and24concurrent login attempts PASS; production dependency audit0critical/0high/1moderate after compatible patches; fresh241API tests and actual PG rotation/revocation/logout PASS|API/Web69c57c8 SUCCESS; final deployment IDs below|Session revocation/rotation/logout, SSE injection and tenant regressions passed; new executable URL rejection and legacy Inbox guard accepted CI44154027940/44154028003; complete endpoint/SSRF audit not finished; dependency audit is not security certification. One moderate Nest advisory remains visible with application SSE mitigation; seven dependency advisories patched|
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

## Security and recovery release — 2026-11-17

Application commit69c57c8e9faf99723e05ff2a782c2cd2905e5300 accepted by all eight applicable workflows. Actual PostgreSQL44154027940 passed243/243 API tests, additive migrations109/110, attachment tenant/role/lifecycle/send-delete race and worker SIGKILL/rollback/recovery suites, plus disposable DB backup/restore/RLS checks. This does not restore attachment file bytes or establish persistent media storage.

Editor44154027850 accepted all31 inspector/routing save/reopen configurations in AR/EN390/1366. Inbox/browser44154028003 accepted22 scoped contexts including four attachment owner/agent/help journeys and the controlled legacy executable-link rendering probe. Earlier recovery44150302692 and editor44150302652 remain valid in their scopes. Three-business browser44152172456 accepted12 seeded tourism/store/services visitor→data collection→handoff→employee UI reply/private note→CRM journeys; full company signup/invite/bot-authoring browser acceptance remains separate.

Deployed existing Preview API first:db67a55a-70be-4677-aa8f-4e6e6884dcd2 SUCCESS, then Web0011f966-d6e2-4aba-b34a-6132a18623f8 SUCCESS, both pinned69c57c8, both Sleep=true. Health returned200/db up. Live functional acceptance is tracked separately below. No main merge/new resource/real-customer mutation/provider send/paid call.

Security rollback is mandatory: retain migrations109/110 and file records, and retain the DB-authoritative public-file lifecycle gate plus message URL validation/rendering guards in any rollback build. Do not repin the old3cdb26b/4e058e0 API unchanged after revocation. Keep accepted images/history for investigation, but prefer a forward fix or a compatibility rollback build preserving these boundaries. No migration-down/drop or file purge is authorized.

Remaining independent work: advanced node property/runtime/provider-error combinations; multi-tenant assignment fairness and all-role UI interactions; every media variant and sensitive endpoint audit; complete registration/invitation/authoring UI journey; full reports attribution and every-section interaction UX. External requirements are enumerated in docs/launch/EXTERNAL_ACCEPTANCE.md. Persistent storage, provider identities/permissions, authorized AI budget, official payment sandbox, Production architecture/cost, and legal/support owner approvals stay BLOCKED — EXTERNAL. Overall P0/P1/P2 remain PARTIAL; verdict NOT READY for broad commercial launch.

### Live deployed acceptance and exact continuation

Live Preview CI44165829215 SUCCESS at test commitfd409936ce29427e176964fcb616de100b0ab4e5, artifact14365137911. Four AR/EN390/1366 real deployed browser journeys passed Inbox offline catch-up/reload without duplicates, measured first-response report, real upload→revoke→public404→reload still revoked→restore/public200 with no-store→authorized download, and help search/navigation. Evidence:docs/p0-evidence/live-runtime-browser/results.json. Synthetic company only; no external provider or financial delivery. Reviewed live Arabic390 attachment screenshot; no horizontal overflow. This certifies the scoped deployed operations, not durable attachment storage across application replacement.

Application pin remains69c57c8 on API/Web deployments recorded above; later commits contain tests/evidence only. Preserve accepted baseline tests and existing resources/Sleep. Next independent execution point: advanced node property/invalid/runtime/error matrix, multi-company recovery fairness/all-role interactions, full signup/invitation/authoring UI, reports attribution and remaining endpoint/media audit. Read actual PR14 HEAD before editing. Whole requirements retain PARTIAL; no outside-session continuation promised.


## 2026-11-18 — granular closure of independent gaps

Baseline accepted application69c57c8 and live44165829215 are retained without repeating them as new acceptance. New application changes are committed through510979c011d837cc360dfdb3f06176308ac017eb; later commits refine acceptance only. **New changes are not deployed or live accepted.** Original API/Web remain69c57c8, deploymentdb67a55a-70be-4677-aa8f-4e6e6884dcd2 /0011f966-d6e2-4aba-b34a-6132a18623f8, Sleep=true.

|Requirement|Actual Gap|Fix|CI Evidence|Live Evidence|Status|Remaining|
|---|---|---|---|---|---|---|
|P0-03 media property/runtime CI acceptance|Old31-node inspector test did not prove real media property editing/publication/playback|Localized accessible URL field, real MP3/MP4/PNG/document fixtures, property edit/save/reopen/publish/runtime and revoked-audio recovery|44254216010;4 AR/EN390/1366 journeys, widget resized320/390/768/1366/1920; real PG execution in final PG checkpoint below|Not run for new code|DONE — VERIFIED|CI scope only; new release blocked on byte preservation|
|P0-03 static input rejection CI acceptance|Credential URLs could publish and fail later; literal invalid coordinates passed preflight|Reject static unsafe URL schemes/credentials and invalid literal coordinate ranges before publishing; variables preserved and runtime boundaries retained|Focused tests +248-test API checkpoint; PG invalid publish leaves versions unchanged|Not run for new code|DONE — VERIFIED|Advanced property/error matrix for the other supported nodes remains separate|
|P0-03 location runtime CI acceptance|Missing/blank coordinate variable became numerical zero|Skip location output when expanded coordinate is missing; explicit0/0 still sends correctly|49engine tests; final PG/widget structural absence check below|Not run for new code|DONE — VERIFIED|No provider-location acceptance claimed|
|P0-03 isolated dependency-error CI acceptance|Published media/HTTP/sheet chain lacked actual runtime failure evidence|Use existing actual SSRF boundary for loopback denial, missing private Sheets dependency error route, preserve previous published runtime after invalid publication|Real PG final checkpoint below;4 real-browser UI/runtime contexts|Not run for new code|DONE — VERIFIED|Successful real HTTP/provider/Sheets account transport is not inferred|
|P0-04 cross-company recovery CI acceptance|Single-company crash tests did not establish fair keyset traversal across scanner pages|12company unequal queues, busy tenant lock,100-drain bound, two concurrent workers, exact-once assignment events and retained human mode|Final PG checkpoint below;128 queued conversations (105 in the largest queue); fixed timing-sensitive assertion to await persisted progress under actual periodic worker contention|Existing published recovery baseline remains; new fairness tests are CI-only|DONE — VERIFIED|Weighted business priority/SLA guarantees and complete role interactions are not certified|
|P0-05/P0-07 declared upload format CI acceptance|Audio/video/Office/text declared types could accept arbitrary bytes|Require audio/video/ZIP signatures, reject binary/invalid UTF-8 text; retain10MiB limit and lifecycle/tenant gates|Final PG checkpoint:13 remaining real encoded formats upload/kind/MIME/charset/byte equality/no-store and forged-content denial; existing PNG evidence retained|Old PNG lifecycle live only|DONE — VERIFIED|Signature checks are not antivirus or exhaustive codec/document validation; persistent file replacement recovery blocked|
|P0 release and durable attachment operation|Existing API has no mounted volume and no verified complete attachment-byte backup/migration path|Preserve current deployment; prepare storage-safe release/restore sequence and explicitly gated post-deploy browser workflow|docs/launch/STORAGE_SAFE_RELEASE.md; runtime inventory readback|No new deployment; no false live acceptance|BLOCKED — EXTERNAL|Owner-approved persistent storage/cost and authorized complete byte backup/restore/migration before replacing API|
|P0-03/P0-04/P0-07 remaining launch-scope acceptance|Other advanced node property/provider/error combinations, all-role UI/SLA recipient matrix and full sensitive-route audit remain|No duplicate implementation added|Retain original accepted scopes plus new granular scopes above|Original published baseline only|PARTIAL|Next: advanced subflow/sequence/booking/interactive failure paths; remaining sensitive endpoint/role review. Real provider dependencies listed once in OWNER_ACTION_REQUIRED.md|

A DONE row above is an explicitly named **CI acceptance subtask**, not whole-feature live/commercial readiness. Whole P0 requirements remain PARTIAL. The final PG checkpoint below determines whether the new CI evidence is accepted; never infer durability from its DB metadata restore.


### Final CI checkpoint — 2026-11-18

Source application changes through510979c011d837cc360dfdb3f06176308ac017eb; final targeted acceptance headfb31965a343096ce42fe29f86147585339362bc8. PostgreSQL44254906612 **SUCCESS**, artifact14406255485:248/248 API tests,12companies/128queued conversations (largest105; observed drain100then5), exact-once recovery events, real media/failure/failed-publish preservation, missing-location structural check,13remaining valid upload formats/forged MIME denial,2tenant report dimensions, retained old suites and disposable DB restore/RLS checks. This is CI acceptance, not new Preview or Production acceptance.

Advanced-media browser44254216010 **SUCCESS**, artifact14404907496:4AR/EN390/1366property-edit/save/reopen/UI-publish/actual-widget runtime contexts, decoded MP3/MP4 metadata/PNG/document, HTTP/sheet error continuation, five widget widths and revoked audio failing visibly then decoding after restoration/reload. Registration/team UI44251452816 **SUCCESS**, artifact14403439408:4AR/ENcontexts. Report/Inbox/attachment browser44253425469 **SUCCESS**, artifact14404324964 includes exact localized report header/accessibility checks and retained22 scoped contexts. All relevant application workflows at510979c were checked; final strict fairness correction was a test timing fix, not a changed assignment algorithm.

Failures retained: first publication validation produced duplicate CTA errors (corrected39b4f4); media browser44250508219 exposed missing accessible media URL name (corrected69ca33f); stale post-publication fixture revision caused409 (corrected0633854, preserving conflict protection); report browser44252067174/44252837865 failed header accessibility query (explicit column semantics corrected e35ee9a, then44253425469 passed). A fairness rerun44254216011 assumed three immediate SKIP LOCKED scans must acquire a lock; fb31965 now awaits committed state under the actual background worker, records real bounded drain results, rejects hidden transaction errors, and still requires every assignment/audit exactly once. Text MIME test now checks media type and UTF-8 charset separately, preserving the actual content contract.

**No new deployment or live acceptance is claimed.** Readback retained original API69c57c8 deploymentdb67a55a-70be-4677-aa8f-4e6e6884dcd2 and Web69c57c8 deployment0011f966-d6e2-4aba-b34a-6132a18623f8; Sleep=true. API has no mounted volumes. Replacing its container without a complete protected attachment-byte backup/verified restore/migration could lose existing bytes; no such operation was performed. Follow docs/launch/STORAGE_SAFE_RELEASE.md and OWNER_ACTION_REQUIRED.md. The explicitly gated live-enterprise-release-acceptance.yml and qa-live-enterprise-release-browser.mjs are prepared for AFTER a safe deployment; the old live44165829215 remains unchanged and valid only for69c57c8's scope.

Next independent code/acceptance work: advanced non-media subflow/sequence/interactive/booking/provider-node paths; complete sensitive-route and all-role/SLA recipient matrix; uninterrupted UI company/channel/bot/customer/follow-up/report journeys; remaining report event attribution; every-page interaction audit and optional-feature readiness gates. Do not repeat accepted media/format/identity/fairness/report subcases unless affected. Next deployment work is BLOCKED — EXTERNAL on byte-preserving storage/migration access, not on missing Meta/AI/payment alone. Do not merge main, create resources, change Sleep, use customers, enable provider traffic/costs, or roll back away file/URL/upload security. P0/P1/P2 remain PARTIAL; customer pilot and full launch remain NOT READY. No background continuation is promised.

## Protected-storage and advanced-runtime batch — 2026-11-18

Read latest PR14 HEAD80d3726 before changes; retained every previous accepted scope. Application fixes atdbd5f21889705e2e1cf2c5004a3e824ccb119bfa: appointment cancellation now returns404 for absent/foreign IDs instead of a misleading201 with no row; RLS already prevented the foreign write. Owner/admin success and agent403 remain. Inspector sequence guidance now states actual linked-channel eligibility and safe continuation; Webchat sequence creation remains rejected. Accessible appointment-service name fixed at8c2cdd5d0b6464f07dd6c97fed52b53bacee816f.

|Requirement|Actual gap|Fix/acceptance|CI evidence|Live evidence|Status|Remaining|
|---|---|---|---|---|---|---|
|P0-05/08 protected preservation tool|No verified byte backup/restore tool independent of API deployment|Read-only whole-record inventory; AES-256-GCM archive; authenticated separate-process restore; exact SHA256/full metadata; orphan/missing/size distinction; unsafe path/overwrite/drift rejection; bypass-RLS scope check|44310490967 at81ec8cb;8 unit tests plus actual PostgreSQL2companies/4records; artifact14429937375 and docs/p0-evidence/storage-flow-postgres|No current customer bytes acquired|DONE — VERIFIED|Tool/synthetic acceptance only; cutoverReady=false; actual freeze not implemented by a caller flag|
|P0-03 component/interactive/appointment/sequence runtime|Inspector persistence alone did not prove advanced execution|Published child v1/v2 frozen by parent version, explicit parent republish, variable/contact-attribute propagation, invalid interactive fallback/retry/tag effects, concurrent same-slot one-success/one-unavailable, duplicate message suppression, human handoff|44310490967; component-booking-runtime.json|Not deployed|DONE — VERIFIED|Scoped real PG synthetic execution; linked-channel identity/consent fixture is not provider acceptance; full node/property matrix remains|
|P0-07 appointment isolation outcome|Foreign cancellation could report success despite no authorized row|404 with original foreign appointment unchanged; own admin cancellation succeeds; agent publish/cancel403; foreign component publish400 leaves versions unchanged|44310490967; broad affected API regression44309714558 SUCCESS248tests|Not deployed|DONE — VERIFIED|This closes specified route outcomes, not complete sensitive-endpoint/all-role/SLA audit|
|P0-05/08 live inventory and safe release|API has no mounted volume; connector has no authorized SQL/SSH and redacts values|Kept current API/Web and prepared STORAGE_OPTIONS_APPROVAL.md with measured-capacity-first approval sequence and official unit prices|Synthetic preservation tooling above; no live totals inferred|Current API69c57c8 deploymentdb67a55a-70be-4677-aa8f-4e6e6884dcd2; Web69c57c8 deployment0011f966-d6e2-4aba-b34a-6132a18623f8 retained|BLOCKED — EXTERNAL|Secure existing-runtime access; global metadata/byte inventory; protected copy/restore approval; actual upload freeze; exact durable-store cost/mount/path/replacement approval; post-deploy live acceptance|

8c2cdd5 is a candidate source, not an accepted deployed release. No new Deployment ID exists for this batch. Current absolute UPLOAD_DIR, record count, total bytes, lifecycle-state totals and already-missing files remain NOT VERIFIED, not zero. No mount, restart, runtime variable, new resource, customer file copy/deletion, provider traffic, paid call, main merge or Sleep change was performed. Migrations109/110 and all lifecycle/URL/upload protections remain unchanged and mandatory for any forward fix/compatible rollback. An old image alone does not recover ephemeral bytes.

Failures preserved:44308221855 correctly rejected unsupported Webchat sequence creation; fixture corrected to an explicitly linked eligible synthetic channel without enabling Webchat sequences.44309049873 exposed false foreign-cancel success; production fix above.44310122247 exposed the missing exact accessible Service label; explicit localized aria-label added rather than relaxing the UI assertion. Ten applicable workflows atdbd5 passed after the commerce change; the stricter exact v1/v2/contact-tag assertions passed44310490967.

Independent work still remains: complete per-node advanced invalid/property/runtime matrix beyond accepted scopes; all-role/SLA-recipient and remaining sensitive-route audit; uninterrupted browser signup→invite→channel→authoring→customer→followup→reports for each business; report-event attribution and every-section interaction/optional-feature readiness. Previously accepted media, queue fairness/recovery, identity/team entry, reports and seeded industry journeys are retained, not reclassified as new work. External provider/AI/payment/storage/Production/operations/legal gates remain in OWNER_ACTION_REQUIRED.md. P0/P1/P2 remain PARTIAL; Webchat-first customer pilot and full commercial launch remain NOT READY.
