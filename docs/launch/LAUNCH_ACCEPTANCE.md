# Launch acceptance gates — scope before sale

No rows below grant deployment/resource/cost authorization. Use OWNER_ACTION_REQUIRED.md for the single owner input list. Legal documents remain unpublished drafts.

|Gate|Webchat-first pilot|Full multi-channel SaaS|Evidence needed to close|
|---|---|---|---|
|Advertised feature scope|Webchat, explicitly accepted bot nodes, Inbox/assignment, CRM, basic measured reports and actual roles only|Every advertised channel, node, AI/payment and optional feature|Scoped code/DB/browser/live acceptance, with unsupported provider features excluded from offer|
|Tenant/session/file security|Required|Required|Current scoped regression evidence plus remaining sensitive endpoint/role review; no unaddressed known launch-scope critical/high issue|
|Persistent attachments|Required if attachments are included; current ephemeral API disk is insufficient|Required|Approved storage and actual byte preservation/recovery after container replacement, not DB metadata alone|
|Hosting and recovery|Required; sleeping shared Preview is not an operational commitment|Required independent Production|Approved topology/cost, isolation, health, backups, rollback preserving migrations109/110/file gates/URL and upload checks, recovery rehearsal|
|Operations ownership|Required|Required|Named alert recipients/support/incident owners, retention and approved recovery targets, actual alert/restore rehearsal|
|Legal and support|Required|Required|Owner/counsel-approved entity/contact/terms/privacy/retention and staffed support; no invented SLA|
|External providers|Not needed for an offer that explicitly excludes them|Required for every advertised provider|Official authorized test account and actual transport acceptance, no mock promotion|
|AI costs|Not needed if excluded|Required if advertised|Authorized test credentials/model/budget and grounded answer/source/quota/actual-cost acceptance|
|Payments|Official payment acceptance required if automated paid checkout is offered|Required for advertised automated subscriptions|Official sandbox lifecycle/invoices/idempotence and market eligibility before commercial enablement|
|Capacity claims|No production guarantee inferred from CI|Measured against approved deployment|Declared bounded load, failure/recovery and observed limits on relevant approved infrastructure|

Decision remains **NOT READY** for both a customer-facing controlled pilot and broad commercial launch until the applicable technical and operational gates above pass. Synthetic QA can run without calling it a customer pilot. No CI success changes an external gate to DONE. Do not infer bot-resolution rates, handling duration or time savings from current bot/conversation status counters.
