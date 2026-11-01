# Verified manual CRM Preview release — 2026-11-01

Application SHA for BOTH services: `803cc2945b3531e4ecd0fdec31b1b35d688565d6`.
PR: https://github.com/hendhafez5566-arch/Boat-two/pull/5
Branch: `feat/professional-crm-20261101`, based on PR4 head `31040082508d1976227d491fcec93390d37d4e7f`. No merge to main.

| Service | Verified deployment | State |
| --- | --- | --- |
| API | 93ee271c-1c38-418b-bb9d-d94f934c4835 | SUCCESS / Online |
| Web | dde16805-1650-4c5b-b075-af0e31226465 | SUCCESS / Online |
| PostgreSQL | existing pgvector service | Online |
| Redis | existing service | Online |

Preview: https://boat-preview-web-preview.up.railway.app
API: https://boat-preview-api-preview.up.railway.app

Both existing services were manually connected to the exact tested commit. Railway confirmed that the commit pin prevents subsequent pushes from auto-deploying. No new project/service, Railway AI Agent, Auto Deploy, variable update, WABA/token/webhook or owner bot change was performed. Non-source service configuration remained unchanged. Both terminal deployments were checked against their source SHA, with zero service issues/recent failures.

All isolated gates passed: production build, TypeScript, 209 API/engine/PostgreSQL tests, zero new ESLint findings, three CRM browser journeys including 9,006 synthetic contacts, and three complete application regression journeys. All 99 migrations applied under tenant RLS in the sandbox. Migration 099 is additive and completed in the successful API pre-deploy process.

After release, a NEW synthetic tenant on the existing Railway Preview passed real API checks: registration without an automatic bot or channel, customer creation, deal/owner/expected-close persistence, stage change with a version token, follow-up assignment/completion, AND/OR queries and saved-view persistence, isolation from legacy campaign segments, multipart CSV preview, actual report totals, archive and restore. No owner tenant or channel was used. See live-api-results.json and the explicitly gated scripts/qa-crm-preview.py.

Cloud Browser after release verified the login page and API /health showing status ok/db up. It could not verify authenticated owner CRM or Meta because the previous secure sign-in request was cancelled and the current session redirects to login. No live WhatsApp reply/new Meta webhook or live Google OAuth/Sheets sync was tested. These are documented external acceptance limits; commercial readiness is not claimed.

The final evidence commit only adds this release record and the repeatable Preview QA script/results. Railway intentionally remains pinned to the tested application SHA above. Rollback IDs and the new automation-action compatibility note are in ROLLBACK.md.
