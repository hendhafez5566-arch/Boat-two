# Continue here — ELHAFEZ BOAT

## Checkout and instruction hierarchy

Use `/workspace/Boat-two`, branch `feat/complete-premium-saas`. The owner authorized actual product code changes, commits, push and one Draft PR in the pasted product-completion request. The earlier onboarding-only restriction on changing tracked source does not apply to this coding task. Do not create a separate implementation, worktree or another PR. Do not merge main or deploy to production without owner approval.

Start with `git status --short` and `git log -3 --oneline`, then read `PRODUCT_COMPLETION_MATRIX.md` and `REMAINING_WORK.md`. Preserve uncommitted user changes. Continue implementation rather than repeating the original inventory/planning. Full scope remains the user's four batches; current checkpoint is a substantive Batch 1 slice, not a declaration that all Batch 1 requirements are complete.

## Run

```bash
export PATH=/workspace/.boat-tools/node_modules/.bin:$PATH
cd /workspace/Boat-two
node --version # Node 22
pnpm --version # 9.12.0
# .env is ignored and retained locally; do not print it or replace its keys.
docker compose up -d
docker compose exec -T postgres pg_isready -U postgres -d chatbot
pnpm migrate
pnpm dev:api
# Separate session, same exported PATH:
pnpm dev:web
```

`pnpm dev:api` now uses `scripts/dev-api.mjs`: tsc watch and API restart after a clean compilation. Do not use the former tsx watch workaround or `--noCheck`; API typecheck now passes. Wait for “Nest application successfully started”, then require GET `/health` to return `{status:'ok',db:'up'}`. Widget assets resolve from the existing API assets directory. `.env` still holds local development keys; Meta, Stripe and AI/embeddings are unconfigured. Never use production or paid keys without permission.

Checks: `pnpm build`, `pnpm lint`, `pnpm --filter api test` (40 tests), then `node scripts/smoke-core.mjs` and `node --env-file=.env scripts/smoke-worker.mjs` against a running API. Smoke creates identified local test workspaces in the isolated development DB and makes no provider calls. Generated next-env and tsbuildinfo are ignored. Migrations require the separate admin database URL; app requests use RLS-restricted app_user.

## Last observed validation

- Full workspace build and lint passed.
- All 40 tests passed; targeted connected API/widget/roles/isolation smoke passed.
- New migrations applied/reapplied without errors; all eight migrations passed on a fresh database.
- The durable webhook worker integration passed the five-attempt failure/manual-retry/completion path with actual PostgreSQL state.
- Database `boat_core_validation` was created only for validating a fresh migration chain; it has no user production data.
- Full browser/visual/security/load acceptance deliberately not started. Use the separate final acceptance phase after implementation completion.

## GitHub delivery

Push and PR outcomes must be recorded below after actual commands; do not infer API permission from Git read/push permission. The existing HTTPS Git proxy is configured. `gh api repos/hendhafez5566-arch/Boat-two` and direct HTTPS CONNECT to `api.github.com` returned Forbidden at proxy. A saved environment network draft adds only that domain, preserving package-manager presets. Apply it in environment settings before retrying the blocked API operation. Do not request a raw GitHub token merely because `gh auth status` reports one unusable.

When API access works, use the existing branch and create one **draft** PR targeting main with the exact tested checkpoint scope, referencing the matrix and remaining work. Never claim the entire product is implemented. Keep extending that PR across batches.

## Next concrete work

Finish transactional message-to-flow outbox and distributed ownership, durable outbound dispatch, provider approved templates, core entitlements and departments/SLA. Then implement the CRM/consent foundation that campaigns and business automation require. Reuse the existing DatabaseService, messaging adapters, immutable flow versions and plans service. Keep all six continuity documents current. Detailed gaps and external activation prerequisites are in `REMAINING_WORK.md`.
