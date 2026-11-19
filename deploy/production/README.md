# Production configuration prepared, NOT applied

These opt-in files are not the Preview Railway configuration. No new paid resources are authorized or created. Do not point existing Preview services at these files.

Proposed independent production: Web/API, pgvector/PostgreSQL and Redis in a separate approved environment/project with independent volumes, credentials, keys and provider webhook URLs. Keep real-time API/workers and databases awake; leave existing Preview Sleep untouched. Start with one API replica until all background-worker/lease/recovery tests pass; then measure and review replicas/cost. Existing /health proves SQL connectivity, not Redis/provider/worker health.

## Before owner approval
- Obtain Railway quote for region, RAM/CPU/storage, backups, log retention and traffic. Also identify provider/AI/payment costs and merchant-country eligibility. No guessed monthly total.
- Choose launch channel subset based on actual official-provider acceptance. Do not advertise unaccepted channels.
- Separate DATABASE_URL (NOSUPERUSER/NOBYPASSRLS app_user) from DATABASE_ADMIN_URL (deployment-only migration role). Never reuse Preview data or JWT/encryption secrets.
- Prepare independent HTTPS APP_URL/PUBLIC_API_URL/INTERNAL_API_URL; JWT_SECRET random >=32 chars and ENCRYPTION_KEY random 32 bytes. Set delivery/AI/billing flags false until corresponding sandbox acceptance and launch approval. Secrets belong in the platform secret store, never source.
- Persistent attachment storage is mandatory: current UPLOAD_DIR is filesystem based. Production must have an approved persistent/shared attachment strategy before enabling uploads or multiple replicas. CI database dump does not back up attachments.

## Backup, restore and recovery gates
1. Define RPO<=24h and RTO<=4h as proposed targets, not measured promises. Obtain business approval and select paid backup/PITR/offsite policy with cost approval.
2. Backup database (encrypted custom pg_dump plus managed recovery policy), attachment objects and a protected credential/key recovery procedure. Keep encryption keys separate from encrypted backups. Proposed daily 30-day retention; customer/legal retention policy remains to be approved.
3. Restore into disposable infrastructure; verify row counts, RLS flags/policies/owners, login, bot/inbox continuity and attachment readability. Record elapsed restore time and actual recovered timestamp. Current CI test covers synthetic SQL data/RLS only.
4. Apply migrations to restored data before release. Review destructive changes separately with approved backup/rollback. Migration108 is additive operational metadata; retain it on application rollback.
5. Release API first then compatible Web at accepted SHA; observe terminal SUCCESS, health, queue recovery, webhook and UI tests. Roll back application images to recorded accepted builds when necessary; never blindly reverse schema or delete data.
6. Validate failed worker leases, outbound ambiguity reconciliation, payment event dedupe and webhook backlog after process restart. A green /health is insufficient.

## Monitoring required before commercial activation
External /health and /login checks, error-rate/latency alerts, failed/ambiguous webhook/outbox/AI/payment jobs, oldest queue age, DB storage/connections, backup freshness/restore drill and attachment volume alerts. Choose operator recipients and an approved monitoring provider; none are subscribed or messaged by this work.

## Approval boundary
Owner must approve exact architecture, cost, backups/retention and launch scope before creation or activation. Prepared JSON is inert until explicitly selected on a new approved service. Preview remains unchanged.
