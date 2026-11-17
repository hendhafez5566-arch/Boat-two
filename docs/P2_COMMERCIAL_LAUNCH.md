# P2 commercial launch acceptance

|ID|Requirement|Status|Evidence|Remaining|
|---|---|---|---|---|
|P2-01|Optional business features|PARTIAL|Existing campaigns/appointments/social draft tests retained; production external delivery is disabled for acceptance|Explicit provider-approved execution/recovery and UI readiness gates for every advertised feature|
|P2-02|Real business acceptance|NOT STARTED|Existing synthetic commerce,CRM,Webchat journeys are narrow acceptance|Dedicated tourism/store/services synthetic complete journeys with measured timing and data correctness; real company accounts require explicit authorization|
|P2-03|Commercial launch package|PARTIAL|deploy/production/README.md independent production/backup/rollback plan; current billing code retained|Legal owner review of privacy/terms, support contacts and incident ownership; official payment sandbox; real provider acceptance; production cost/infrastructure approval|

Verdict: **NOT READY**. P0 remains PARTIAL and external official messaging, paid AI test identity/budget, official merchant sandbox and independent production approval remain BLOCKED — EXTERNAL. These do not block independent coding/tests. No real charges, external messages, new services/databases or main merge.

Rollback remains application `3cdb26b` on original Preview API/Web services with existing Sleep preserved. Commercial release must never be inferred from route coverage, fixtures or mocked provider transport.

## Synthetic business acceptance added

Added`qa-p2-business-journeys.mjs`: separate tourism/store/services companies, actual products and prices, published name-collection bot, CRM name/tag preservation, handoff, authorized human reply, private-note exclusion, human ownership and pairwise foreign-company denial. Local real HTTP/PGlite/outbox worker PASS (about4s per journey). Added to actual PostgreSQL acceptance; result pending. P2-02 remains PARTIAL until broader real-browser/role/failure/business-owner acceptance. No provider/paid AI/payment acceptance is inferred.
