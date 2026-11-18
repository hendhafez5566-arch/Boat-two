# Portable Boat Two demo

This is a separate, synthetic-only stack; it never connects to Railway. Requires Docker with Compose v2, Node22 and sufficient local disk/RAM. No cloud account or paid resource is created. Defaults bind API/Web to loopback only. This is an internal demo, not a publicly secured Production deployment.

```bash
node deploy/portable/configure.mjs
docker compose --env-file deploy/portable/.env -f deploy/portable/compose.yml up -d --build
```

Open http://localhost:3000/register and create a synthetic company. Configuration is generated once,0600, and never overwritten; keep it private and retain it across restarts. Application connections use app_user NOBYPASSRLS; only the one-shot migration container receives the admin DB URL. PostgreSQL, Redis AOF and filesystem attachments use separate persistent named volumes. Never run `down -v` if data must be retained. Never mount current Railway/customer directories into this stack.

## Storage selection

Filesystem remains the backward-compatible default: ATTACHMENT_STORAGE=filesystem and an absolute UPLOAD_DIR on persistent storage. Private S3-compatible storage uses ATTACHMENT_STORAGE=s3, S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY and optional S3_PREFIX ending in `/`. HTTPS is required unless S3_ALLOW_HTTP=true is deliberately set for an isolated/private transport. Secrets are environment-only. The application does not create buckets or publish ACLs. Provision least-privilege private access separately. API URLs remain unchanged; DB tenant/lifecycle authorization and no-store delivery still apply. No presigned/public bucket URLs bypass revocation.

For isolated object-store acceptance only, add `-f deploy/portable/compose.s3-test.yml`; initialize the private local bucket using the acceptance workflow. This profile is not an approved production storage recommendation. Switching a driver does not migrate bytes. Existing live uploads must be inventoried, copied, verified and approved using STORAGE_SAFE_RELEASE.md before any driver/path/container change.

Public demo hosting needs owner-selected TLS/domain, secure secret provision and access policy. External messaging, email, AI and subscription changes are disabled here. Real accounts/payments and operational guarantees are not advertised by this demo.

## Repeatable synthetic demo account

After starting this independent stack, the continuous browser script `scripts/qa-connected-company-browser.mjs` creates synthetic AR/EN companies, invited staff, a Webchat/bot/customer/follow-up/report through UI only. It requires Playwright1.56.1 and Chromium (set BOAT_PLAYWRIGHT_MODULE and BOAT_CHROMIUM), and explicit BOAT_PORTABLE_ACCEPTANCE=true. Successful credentials are written0600 to the OS temporary directory as boat-demo-credentials.json; never commit, publish or upload that file. Accounts persist only while this separate stack's DB volume is retained. CI intentionally destroys its own disposable stack, so CI credentials are not a hosted public demo. See workflow evidence for accepted steps; an unfinished run is not a working full demo.
