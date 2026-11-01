# Verified CRM release baseline — 2026-11-01

Project `boat-two-ui-preview`: a2751c62-5a61-4eb7-b3ca-0b98863e3069
Environment `preview`: e3e456fd-2c13-457d-91db-6aa80755f502

| Service | Existing successful deployment | Source SHA |
| --- | --- | --- |
| API | 4ef07a6f-5f89-4768-be68-8b56772cf2fb | a363f72a3f70d99165b1c4fbf85065d1a35156c4 |
| Web | d8650a49-b4fc-49b3-ae07-239582e73e97 | a363f72a3f70d99165b1c4fbf85065d1a35156c4 |

Verified using Railway describe-service; both live/SUCCESS, no staged changes, source pinned to the exact SHA, no Auto Deploy.

Migration 099 adds an optional loss_reason field, two contact work indexes and a tenant-isolated saved-view table. No existing data or applied migration is rewritten. Keep these additive objects on rollback; do not run destructive down migrations. The old app ignores them. Nested smart views are separate from legacy campaign audiences so rollback cannot widen a campaign segment.

Before reverting the API in a future rollback, disable any CRM automation rules containing the NEW `deal` action via Automations. The old API does not understand that action. No such rules are created automatically on Preview by this change. Revert Web and API to the corresponding deployment IDs above, preserving all environment variables, channels and Meta credentials. Recheck /health and login, then authenticated CRM/Inbox. No WABA, webhook, active bot or credential reset is part of rollback.
