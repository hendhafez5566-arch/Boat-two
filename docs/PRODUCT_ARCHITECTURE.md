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

## Continuation: durable execution and business modules (009–021)

The earlier reliability-boundary section describes the initial checkpoint; the following is current:

- `domain_events` is the transactional outbox. Inbound message and dispatch record commit together. Workers claim only the first unresolved event per aggregate with SKIP LOCKED and a PostgreSQL advisory transaction lock. Failed heads block that aggregate without starving other tenants. Nest durable listeners propagate errors instead of swallowing them.
- DatabaseService transaction context reuses one tenant connection across nested flow/CRM/action/session calls and rejects cross-tenant nesting. Bot state, database effects and queued responses commit with event completion. Manual takeover/release/state/reply paths use the same conversation lock. Quota counters use the tenant row's NO KEY UPDATE lock.
- External HTTP/AI effects have independent `external_effects` records in a separate bounded connection pool. A completed result survives event rollback and is reused by effect key/request hash. Started/ambiguous results cannot be automatically replayed. This avoids asserting generic exactly-once guarantees for providers that cannot supply them.
- `outbound_jobs` owns provider delivery. A lease is recorded before network work; a lost worker becomes ambiguous. Explicit provider rejection is failed, rate-limit rejection can retry, and network/5xx uncertainty is not blindly replayed. Operator reconciliation records evidence/actor in audit logs before confirmed failed work is retryable. External dispatch is off by default.
- Source changes are persisted in `realtime_events` by triggers. A serialized materializer copies only committed rows into `stream_events`, allocating reliable public replay cursors after commit visibility. This handles lower source sequence IDs committing late. SSE polls the shared stream, resumes by cursor and checks current membership before each batch. PostgreSQL supplies the shared transport; Redis remains provisioned without introducing another event engine.
- CRM tables use FORCE RLS; new child relations carry tenant/contact/pipeline composite foreign keys. Contact/deal/task changes create domain events in the same transaction. Consents have channel scope, evidence and append history.
- Campaign scheduling snapshots eligible linked/consenting contacts, then creates per-recipient outbox work. Execution rechecks consent, plan and frequency caps before queueing through MessagingService. Recipient/message/job states remain distinct; completion of campaign dispatch is not proof of provider delivery.
- Business rules consume the same domain events. Action lists support tags/lifecycle/notes/tasks and delayed follow-ups. Root-event lineage and a unique rule/root/contact ledger prevent reentrant rule loops. Follow-ups recheck enablement/entitlement.
- Reusable bot components are existing flows with `is_component`. Publication recursively freezes published component graphs into the parent's immutable version; no second flow engine was created. Depth/cycles/expanded size and return semantics are validated.
- Tenant AI agents select encrypted Anthropic configuration and source filters. Tool execution is limited to explicitly allowed current-contact actions. Reply budgets are serialized, external responses cached and generation usage recorded. Optional stored per-million token rates yield cost estimates; unknown rates remain null. Embedding generation/ingestion still needs a durable work/budget layer.

Operator gates: `EXTERNAL_DELIVERY_ENABLED=false` blocks provider messaging/Meta connect/template operations; `AI_PROVIDER_CALLS_ENABLED=false` separately blocks generation. No live account, credential or paid service was used to validate this checkpoint. See REMAINING_WORK for the remaining reliability/activation/commercial scope.
