# Support and incident operations

Owner decisions still required: named incident owner/backup, authorized support address, coverage hours, notification recipients and approved severity/response commitments. No email/Slack/webhook destination has been activated.

1. Record timestamp/timezone, affected feature, environment and sanitized request/error identifiers. Use synthetic reproduction. Never copy access tokens, passwords or full customer messages into tickets.
2. Distinguish Preview Sleep wake-up from a verified outage. Check API health/database connectivity and current service deployment state. Do not change Sleep or provision infrastructure to conceal a Preview limitation.
3. Review bounded errors, failed delivery states, persisted domain events and assignment queues. One uncertain provider/payment operation must not be blindly replayed; inspect its durable receipt/provider result first.
4. Assignment recovery: persisted unassigned queues are scanned in bounded tenant batches every30seconds. Existing eligibility/capacity rules still decide. A busy tenant lock is skipped; queue records remain for a later pass. No30second customer SLA is implied.
5. Attachments: inspect tenant-scoped metadata and authenticated content. Revoke sharing only through an explicit authorized manager action. Deleted attachments retain bytes for recovery. Missing bytes require restoring approved storage, not merely clearing database flags.
6. Rollback: preserve accepted images. After lifecycle revocations/deletions, retain the new database-aware public-file gate in any rollback API; older handlers would ignore those states. Migrations109/110 are additive; do not drop columns, functions or data to roll back application code.
7. Recovery validation: synthetic send→Inbox→CRM/private note/attachment lifecycle and appropriate tenant/role checks. For a worker crash, verify transaction rollback, queue retention, eligible reassignment and no duplicate audit effects.
8. Notify customers only through owner-approved channels and wording after confirming facts. Record impact, containment, recovery evidence and follow-up owner. Any legal notification deadline comes from legal review, not this runbook.
