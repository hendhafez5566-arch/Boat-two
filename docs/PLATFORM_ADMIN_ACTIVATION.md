# Platform administration activation and development boundary

The `/platform` console is separate from tenant dashboards. It requires all of:

- `PLATFORM_ADMIN_USER_IDS`: a comma-separated allowlist of immutable existing user UUIDs, provisioned by the operator outside tenant APIs. Tenant owners cannot change this list.
- `PLATFORM_JWT_SECRET`: at least 32 characters, different from `JWT_SECRET`. Platform tokens have purpose `platform`, expire after ten minutes and remain in page memory.
- `PLATFORM_DATABASE_URL`: a separate least-privilege database login authorized to assume/inherit the `boat_platform` role. Do not use the application role or a database administrator account in production. Migration 031 creates `boat_platform` as NOLOGIN/NOINHERIT and grants only enumerated security-definer functions; migration 032 adds the database-backed sign-in limiter. Provision a separate login and membership through the operator's secret-management process. No real login/password was provisioned by this sprint.

The application role cannot execute platform functions or read platform audit tables. Platform SQL functions validate input, bound returned lists and append audit entries with actor/reason. The API checks the allowlist, token purpose/signature and current user session version on every request. Password sign-in is throttled by hashed login identity (ten attempts per 15 minutes). Membership/owner/admin roles do not grant platform access. Local development smoke assumes the platform role through a separate test-only connection and creates isolated fixture users; it does not activate a real operator account.

Implemented console slices: recent companies/subscriptions, rename/suspend/restore company, explicit local entitlement overrides, recent users with disable/enable/name updates and global session revocation, existing plan limits/features/name/availability, and platform audit history. The console uses paged/searchable company and user directories (up to 100 per request, 50 by default). The compatibility snapshot remains bounded to 500 and audit to 100. Plan overrides are local entitlement operations, **not** Stripe subscription changes, refunds or invoice edits. Stripe reconciliation uses the provider as authoritative when explicitly activated.

Remaining: audit pagination, granular platform operator roles, MFA/step-up authentication, account provisioning/recovery workflows, price/catalog lifecycle and broad platform revenue/operations reports. These are not a claim of final platform-security acceptance. Dedicated adversarial/security/browser/load acceptance is deferred.

## Session migration

New access tokens carry a backing refresh-session ID and user session version. Revoking the session or disabling the account invalidates new access/refresh tokens on subsequent requests. Active SSE streams recheck session/version/account/tenant state on each poll. Existing tokens without session IDs retain their legacy access-token lifetime; global session-version revocation rejects them immediately, and legacy SSE tickets are bounded by ticket expiry. Cookie-based browser sessions and account recovery/verification remain separate open work.

## Knowledge budgets and provider activation

`AI_PROVIDER_CALLS_ENABLED=false` prevents generation, embedding ingestion and query embeddings. Text/file preparation persists while jobs block before paid embedding calls; URL ingestion additionally requires `EXTERNAL_DELIVERY_ENABLED=true`. Files are staged durably in the job until extraction succeeds; text/chunks remain persisted after staging bytes are cleared. Index replacement commits only after all batches finish, preserving the previous index on failure. Jobs, reservation accounting and external-result caches are durable.

Embedding limits reserve one conservative unit per UTF-8 input byte. This is a budget bound, not measured tokens or provider invoice cost. Reservations survive worker/outer transaction rollback. Completed effects are reused; started/ambiguous effects are never automatically replayed. Reconciliation requires evidence and affects accounting only; it does not reset an ambiguous external effect. Active reservations cannot be reconciled until uncertain or at least ten minutes old. Canceling work does not refund already executed/uncertain provider usage. Failed jobs can be resumed; a definitively released reservation requires a new indexing job.

## Campaign and billing activation

Each channel has an explicit marketing-policy switch and a shared send interval across worker replicas/campaigns. External channels enforce a conservative minimum interval of one second. Website campaign dispatch is paced through the outbox; direct web chat replies remain immediate. WhatsApp template/window checks and Facebook/Instagram 24-hour campaign-window checks apply in addition to consent. Provider-wide account caps, provider-specific nonstandard messaging permissions and full Meta policy acceptance remain open. Do not enable external marketing merely because the local policy is enabled.

Stripe reconciliation is a durable owner-requested job and stays blocked until credentials and explicit external activation exist. It retrieves the already linked subscription, verifies customer/subscription identity and applies the snapshot through the existing dedupe/order guard. It does not create payments. Complete invoice/payment-method/price changes, cancellation requests, provider-wide automatic reconciliation scheduling and tie-time reconciliation policy remain open.

Domain ownership verification remains separate from live host routing, TLS provisioning and domain transfer/reclaim. No production infrastructure or domain was configured.
