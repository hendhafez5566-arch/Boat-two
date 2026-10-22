# Product architecture

## Existing system and boundaries

pnpm workspace: `apps/web` (Next.js 14/React 18/Tailwind), `apps/api` (NestJS 10), `packages/shared`. PostgreSQL 16 + pgvector holds tenants, membership, subscriptions, messaging, flow versions/sessions and knowledge vectors. Redis is provisioned but the current runtime does not yet use it for coordination. Preserve these technologies and existing modules.

Public operations are explicitly marked `@Public`. Authenticated requests verify JWT purpose/signature and then read the current membership under RLS. Token claims alone do not authorize a former member. Fixed owner/admin/agent roles remain the authoritative role model. Platform-admin must be a separate privilege boundary, not a tenant role.

`DatabaseService.withTenant` wraps BEGIN/SET LOCAL tenant context/callback/COMMIT, rolling back on failure. The application uses `app_user` (NOSUPERUSER/NOBYPASSRLS); the migration connection is separate. New tenant tables must FORCE RLS. Request AsyncLocalStorage supplies audit actor metadata only when the actor's tenant matches the transaction. Cross-tenant system jobs carry no invented user identity.

## Core construction additions

- Migration 007 adds company settings, preferred plan, onboarding completion and core configuration audit logs. Triggers record operation/resource identifiers, never credentials or message bodies. App role can SELECT/INSERT audit records, not UPDATE/DELETE.
- Migration 008 adds tenant-scoped webhook jobs. Signed provider requests are parsed and inserted before HTTP acknowledgement. Unique channel/event digest avoids duplicate jobs. A security-definer function claims up to 50 jobs using SKIP LOCKED; its EXECUTE grant is restricted to the app role. Processing uses tenant transactions, a 90-second lease, five attempts and exponential backoff. Failed jobs can be requeued through authorized channel endpoints.
- Inbound message processing serializes channel contact/conversation creation with a channel row lock, checks existing provider message ID before side effects, then uses the existing uniqueness constraints.
- Flow templates are typed executable graphs, instantiated through existing create logic and plan limits. Version history uses the existing immutable version table. Restoring a version changes only the draft. Existing live sessions keep their version.
- Editor autosave sends the last observed `updated_at`. A row lock and conflict response prevent stale writes. Undo/redo stores up to 60 serialized editor snapshots; published status is not rewritten by undo.
- Bulk Inbox operations invoke the same update method as individual edits and report success/failure per item. This is intentionally not an all-or-nothing transaction; cross-tenant records remain inaccessible.
- Dashboard and plan usage counts are database-derived. `preferred_plan` is a preference; only the billing provider may activate a paid subscription.

## Development runtime

Nest requires emitted decorator metadata. `scripts/dev-api.mjs` runs the repository TypeScript compiler in watch mode and launches/restarts the API after a clean compilation. It loads the local `.env` using Node 22. The former tsx API startup omitted metadata and produced undefined injected dependencies. Migration and pure-function tests can continue using tsx.

## Known reliability boundaries to complete

Webhook receipt is durable, but message persistence and flow event execution are not yet a transactional outbox. A crash after message persistence can still lose automation dispatch. Outbound provider calls are inline; ambiguous acknowledgements require an idempotency/reconciliation design before automatic retries. Flow conversation serialization, scheduler leases and SSE are not a complete multi-replica execution design. Knowledge ingestion is still in-process. Do not describe the current product as exactly-once or horizontally safe.

Next steps: transactional domain-event outbox/inbox and worker ownership; durable outbound dispatcher; shared event delivery/replay; contact+consent+CRM models; campaign recipient ledger and compliant send policies; then analytics, admin and white-label boundaries. Avoid adding second messaging or flow engines.
