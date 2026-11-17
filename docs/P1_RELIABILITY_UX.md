# P1 reliability and professional UX

Continuation baseline: PR14 `4db58a233afb29734546a8cff3259d58983ebc17`. Verified deployed rollback `3cdb26b`. No launch claim.

|ID|Requirement|Status|Evidence|Remaining|
|---|---|---|---|---|
|P1-01|Performance and load|PARTIAL|Previously accepted real PostgreSQL105queue recovery; new205-message concurrent ownership/backlog acceptance CI44048029812|Multi-tenant graded load metrics and actual process crash recovery at measured limits|
|P1-02|Monitoring and reliability|PARTIAL|Durable SLA alerts and fresh-worker deduplication on actual PostgreSQL CI44048029812; deploy/production/README.md restore/rollback runbook|End-to-end crash/restart with pending work, operational alert recipients and retention approval|
|P1-03|Complete UI/UX|PARTIAL|CI44048029774 platform500 AR/EN route/width smoke; CI44048029692 products; CI44048029683 contacts; CI44048029649 followups; CI44048029867 editor|All controls on every actual page are not accepted by route smoke; scoped Webchat media/offline/reload acceptance added, pending|
|P1-04|Company onboarding|PARTIAL|Baseline published Preview synthetic registration→Webchat bot→CRM→human reply; PostgreSQL enterprise acceptance retained|Complete browser onboarding/invitations across company journeys, official provider signup remains external|
|P1-05|Business reports|NOT STARTED|No new report accuracy certification|Audit actual SQL metrics against known timestamped synthetic conversations; never estimate time/revenue savings|

No new paid infrastructure, database or provider account is authorized. Acceptance scripts must target disposable loopback CI services. Any new build is evidence of compilation only. Next: finish pending P0 reliability/session/browser tests, deploy accepted source, run graded synthetic PostgreSQL load and verify report definitions against persisted events.

Added graded2-company/4-conversation100→500→1000message acceptance, concurrency8, p50/p95 and throughput recording. Existing PostgreSQL runner now actually terminates/restarts the API before verifying histories, deduplication and report counts. Pending CI; never present CI capacity as a Railway SLA. Existing owner-requested Inbox colors retained; operational event typography increased to13px/time12px while preserving AA/AAA contrast/overflow assertions and all AR/EN width journeys.
