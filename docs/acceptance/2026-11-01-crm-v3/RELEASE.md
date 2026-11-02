# CRM V3 — verified preview release

Application SHA on BOTH services: `c6fd09f266f258928cf44b35eaf58fc8a45c371d`.
PR: https://github.com/hendhafez5566-arch/Boat-two/pull/8 (draft, unmerged, based on approved V2).

Project: boat-two-ui-preview / a2751c62-5a61-4eb7-b3ca-0b98863e3069.
Environment: preview / e3e456fd-2c13-457d-91db-6aa80755f502.

- API service cc08c76e-f631-4ce5-b3e3-92f8038dba53: deployment b1839d4e-d2df-4202-a93b-7f8550f4c0ef SUCCESS. Logs show Applying 102_crm_v3_internal.sql and Applying 103_crm_v3_automation.sql at 2026-11-02T05:41:54Z. Application started; public health returned status ok/db up at 2026-11-02T05:42:28.891Z.
- Web service ca9b7608-9010-4940-9a83-ceb430798542: deployment 087acdf0-7124-4f07-9fba-aa82661c00f3 SUCCESS, settled 2026-11-02T06:30:06Z. Railway /login healthcheck succeeded. Cloud Browser rendered the Arabic login page; authenticated screens require owner sign-in.
- Final inventory: exactly the existing Web, API, pgvector and Redis; one preview environment. All four Online, zero recent failures or unresolved warnings in the status snapshot. No pending changes.
- Sources remain pinned to the exact application SHA, so later pushes do not auto-deploy. No merge to main.
- Bounded API log review after release: one HTTP entry available, zero 5xx, and zero runtime error entries in the requested sample. This very small sample is not a traffic/load acceptance claim.

The initial direct source-connect action was rejected by automatic approval review because it was not environment-scoped. No direct deployment followed that rejection. Each service was instead staged explicitly in preview; its patch was reviewed and contained only that service's branch and pinned commit change, with destructive=false and no variable/resource changes. The owner-authorized deployment was then applied to that exact environment. API completed migrations and health before Web was staged/applied.

No new Railway project, environment, service, database, Redis or review app. No Meta/WABA/webhook/token or active bot configuration changes, and no real customer messages. WhatsApp's current provider connectivity was NOT retested and is not inferred from Webchat.

Local acceptance: 69 API V3 groups across 3 isolated synthetic businesses; 41 actual Chromium journeys including Owner/Admin/Agent mobile screens and bot→CRM→Inbox takeover; 210 regression tests; 45 V2 API groups; Web/API production builds pass. ESLint: 173 existing baseline errors + 1 warning, zero new. See JSON evidence, REPORT_AR.md and ROLLBACK.md.

Remaining acceptance limits: authenticated Cloud Browser smoke, live WhatsApp/OAuth, external native PostgreSQL/load testing, advanced score-band automation conditions and fully specialized custom-field condition controls. Reply averages are intentionally omitted. This is a monitored Preview release, not completion of every requested V3 item or general-sale approval.
