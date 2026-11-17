# P1 reliability and professional UX

Continuation baseline: PR14 `4db58a233afb29734546a8cff3259d58983ebc17`. Verified deployed rollback `3cdb26b`. No launch claim.

|ID|Requirement|Status|Evidence|Remaining|
|---|---|---|---|---|
|P1-01|Performance and load|PARTIAL|Previously accepted real PostgreSQL105queue recovery; new205-message concurrent ownership/backlog acceptance CI44048029812|Multi-tenant graded load metrics and actual process crash recovery at measured limits|
|P1-02|Monitoring and reliability|PARTIAL|Durable SLA alerts and fresh-worker deduplication on actual PostgreSQL CI44048029812; deploy/production/README.md restore/rollback runbook|End-to-end crash/restart with pending work, operational alert recipients and retention approval|
|P1-03|Complete UI/UX|PARTIAL|CI44048029774 platform500 AR/EN route/width smoke; CI44048029692 products; CI44048029683 contacts; CI44048029649 followups; CI44048029867 editor|All controls on every actual page are not accepted by route smoke; scoped Webchat media/offline/reload acceptance added, pending|
|P1-04|Company onboarding|PARTIAL|Baseline published Preview synthetic registration→Webchat bot→CRM→human reply; PostgreSQL enterprise acceptance retained|Complete browser onboarding/invitations across company journeys, official provider signup remains external|
|P1-05|Business reports|PARTIAL|Actual PostgreSQL report counts and known120s/30s first-human-response metrics; empty averages remain null; AR/EN browser acceptance|All sales/employee/followup/bot-resolution dimensions and measured time-saving attribution remain unaccepted|

No new paid infrastructure, database or provider account is authorized. Acceptance scripts must target disposable loopback CI services. Any new build is evidence of compilation only. Next: finish pending P0 reliability/session/browser tests, deploy accepted source, run graded synthetic PostgreSQL load and verify report definitions against persisted events.

Added graded2-company/4-conversation100→500→1000message acceptance, concurrency8, p50/p95 and throughput recording. Existing PostgreSQL runner now actually terminates/restarts the API before verifying histories, deduplication and report counts. Pending CI; never present CI capacity as a Railway SLA. Existing owner-requested Inbox colors retained; operational event typography increased to13px/time12px while preserving AA/AAA contrast/overflow assertions and all AR/EN width journeys.

## PostgreSQL accepted batch

CI44139220828 at`3a7bede` SUCCESS; artifact14352888917. Two companies/four conversations,1004unique inbound including fixtures; concurrency8. Stages100/400/500additional messages measured307/1090/1203ms, p95=68/36/34ms. These are disposable CI hardware results, not a production capacity promise. Actual process replacement preserved every message and duplicate suppression; report inbound/conversation/new-contact counts matched fixture counts. Existing restore data/ownership/RLS acceptance also PASS. Node31-contract roundtrip and published execution chain PASS. Whole P1-01 remains PARTIAL: no thousands-of-concurrent-users or Railway sustained-load claim.

Added missing first-human-response metric with one sample per conversation and explicit measurement definition. Internal notes, bot replies, failed sends and unanswered conversations cannot manufacture zero response times. No samples yields null. API report SQL, localized UI, known120s/30s real-PostgreSQL fixture and four AR/EN browser journeys added; new acceptance pending before deployment. Bot-resolution attribution, all report dimensions and time-saving metrics are not yet certified.

Checkpoint`4e058e0`: real PostgreSQL44141540059 and18browser journeys44141540075 SUCCESS, including actual delayed immutable-version recovery and measured first-response reporting. Application API/Web deployments are recorded in P0. Visual review found Arabic system activity labels in English UI; corrected in`2c67736` with selected-language browser assertion, acceptance pending. Remaining P1 items keep their PARTIAL statuses.

## Final live checkpoint

API4e058e0/Web2c67736 deployed SUCCESS on original Preview; exact deployment IDs and rollback are in P0. All localization-related workflows passed. Live Railway browser44143748624 accepted four AR/EN390/1366Inbox/reconnect/reload/report journeys; artifact14355163261, persisted results in`docs/p0-evidence/live-runtime-browser/results.json`. First duplicate-locator harness failure retained and repaired without weakening thread checks. CI response120s/30s fixture is measurement correctness, not a real employee performance claim. All broad P1 rows remain PARTIAL.

## New accepted recovery and attachment batch

Actual PostgreSQL CI44150302692 PASS at3b841c5, including worker SIGKILL after an uncommitted assignment, transaction rollback, fresh-process queue recovery, disabled-user exclusion and no duplicate assignment events. New attachment lifecycle/ownership/send-delete race assertions PASS. All241retained API tests plus new missing-tenant-scope regression are included. Original broad reruns are justified here by changes to shared DatabaseService and outbound publication, not by report-only changes.

All31node inspector/routing UI save/reopen journeys also passed in editor CI44150302652 (four AR/EN390/1366contexts). This certifies inspector opening, route editing and roundtrip, not every property/provider/error combination. Attachment settings and help are receiving explicit owner/agent and search/navigation browser acceptance.

## Security and recovery release — 2026-11-17

Application commit69c57c8e9faf99723e05ff2a782c2cd2905e5300 accepted by all eight applicable workflows. Actual PostgreSQL44154027940 passed243/243 API tests, additive migrations109/110, attachment tenant/role/lifecycle/send-delete race and worker SIGKILL/rollback/recovery suites, plus disposable DB backup/restore/RLS checks. This does not restore attachment file bytes or establish persistent media storage.

Editor44154027850 accepted all31 inspector/routing save/reopen configurations in AR/EN390/1366. Inbox/browser44154028003 accepted22 scoped contexts including four attachment owner/agent/help journeys and the controlled legacy executable-link rendering probe. Earlier recovery44150302692 and editor44150302652 remain valid in their scopes. Three-business browser44152172456 accepted12 seeded tourism/store/services visitor→data collection→handoff→employee UI reply/private note→CRM journeys; full company signup/invite/bot-authoring browser acceptance remains separate.

Deployed existing Preview API first:db67a55a-70be-4677-aa8f-4e6e6884dcd2 SUCCESS, then Web0011f966-d6e2-4aba-b34a-6132a18623f8 SUCCESS, both pinned69c57c8, both Sleep=true. Health returned200/db up. Live functional acceptance is tracked separately below. No main merge/new resource/real-customer mutation/provider send/paid call.

Security rollback is mandatory: retain migrations109/110 and file records, and retain the DB-authoritative public-file lifecycle gate plus message URL validation/rendering guards in any rollback build. Do not repin the old3cdb26b/4e058e0 API unchanged after revocation. Keep accepted images/history for investigation, but prefer a forward fix or a compatibility rollback build preserving these boundaries. No migration-down/drop or file purge is authorized.

Remaining independent work: advanced node property/runtime/provider-error combinations; multi-tenant assignment fairness and all-role UI interactions; every media variant and sensitive endpoint audit; complete registration/invitation/authoring UI journey; full reports attribution and every-section interaction UX. External requirements are enumerated in docs/launch/EXTERNAL_ACCEPTANCE.md. Persistent storage, provider identities/permissions, authorized AI budget, official payment sandbox, Production architecture/cost, and legal/support owner approvals stay BLOCKED — EXTERNAL. Overall P0/P1/P2 remain PARTIAL; verdict NOT READY for broad commercial launch.

### Live deployed acceptance and exact continuation

Live Preview CI44165829215 SUCCESS at test commitfd409936ce29427e176964fcb616de100b0ab4e5, artifact14365137911. Four AR/EN390/1366 real deployed browser journeys passed Inbox offline catch-up/reload without duplicates, measured first-response report, real upload→revoke→public404→reload still revoked→restore/public200 with no-store→authorized download, and help search/navigation. Evidence:docs/p0-evidence/live-runtime-browser/results.json. Synthetic company only; no external provider or financial delivery. Reviewed live Arabic390 attachment screenshot; no horizontal overflow. This certifies the scoped deployed operations, not durable attachment storage across application replacement.

Application pin remains69c57c8 on API/Web deployments recorded above; later commits contain tests/evidence only. Preserve accepted baseline tests and existing resources/Sleep. Next independent execution point: advanced node property/invalid/runtime/error matrix, multi-company recovery fairness/all-role interactions, full signup/invitation/authoring UI, reports attribution and remaining endpoint/media audit. Read actual PR14 HEAD before editing. Whole requirements retain PARTIAL; no outside-session continuation promised.
