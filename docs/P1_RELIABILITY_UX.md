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
