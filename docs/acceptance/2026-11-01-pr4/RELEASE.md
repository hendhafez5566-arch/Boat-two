# Preview release verified — 1 November 2026

**Result: deployed and verified, not a commercial-readiness certification.**

- Preview Web: https://boat-preview-web-preview.up.railway.app
- API: https://boat-preview-api-preview.up.railway.app
- PR: https://github.com/hendhafez5566-arch/Boat-two/pull/4
- Released application commit: `a363f72a3f70d99165b1c4fbf85065d1a35156c4`.
- Both services manually connected to that exact SHA. Source remains pinned, so subsequent pushes do not automatically deploy. No AI Agent, new Railway project, merge to main, variable/credential change, or database migration was introduced.

| Service | Deployment | Status | Application SHA |
| --- | --- | --- | --- |
| boat-preview-api | 4ef07a6f-5f89-4768-be68-8b56772cf2fb | SUCCESS / Online | a363f72a3f70d99165b1c4fbf85065d1a35156c4 |
| boat-preview-web | d8650a49-b4fc-49b3-ae07-239582e73e97 | SUCCESS / Online | a363f72a3f70d99165b1c4fbf85065d1a35156c4 |

All four services were Online, zero current issues and no pending deployments on final environment inspection. API `/health` returned `{"status":"ok","db":"up","time":"2026-10-31T22:31:17.509Z"}`. Web passed Railway health checks and owner navigation after the release.

## Cloud Browser verification after deployment

- Reloaded the deployed site in the authorized owner session. Bot manager shows real draft, published and active-channel states. The original active WhatsApp bot remained unchanged (`e0fd067e-c546-4684-9289-4611e208735e`).
- Uploaded a real `.xlsx` workbook containing two synthetic products to a NEW source named **PR4 QA — اختبار الإصدار فقط**. No existing source was edited. Automatic ID/name/category/visibility suggestions worked, price was explicitly selected, customer preview and apply succeeded.
- Uploaded an updated `.xlsx` to the SAME QA source; the displayed price changed from **100 to 125**, with the other product retaining 200. The same source identity and catalog were retained. No active bot points to this QA source.
- Created a new unpublished draft, renamed and manually saved it as **PR4 QA — تم اختبار الحفظ — مسودة**, then returned to the manager and verified the saved name and draft state. Its ID is `a7565be3-74b4-451d-a478-8312b6f24cfc`. It was NOT published or activated. These clearly named QA records remain available for owner review.
- Rechecked Meta provider connectivity using the read-only verification action. It still reports **نشط · اتصال متحقق** with the new post-release check at 00:33 on 1 November (Cairo). Verification includes provider identity/subscription checks; it never subscribes, changes tokens or rewrites a webhook.
- No live WhatsApp message/reply was sent, no fresh inbound Meta webhook was generated or proved. Do not infer a live reply test from connectivity verification.
- No Google account OAuth or scheduled live Sheets refresh was tested. Local synchronization and failure tests use mocked Google responses. This does not prevent supervised Preview use.
- The site's post-release console had no application-origin error entries in the inspected session; metadata-extension errors belong to the Cloud Browser extension.

## Evidence and remaining limits

- `before-manager.jpg` / `after-manager.jpg`: same deployed bot-manager screen before and after release.
- `before-channels.jpg` / `after-channels.jpg`: connected accounts and progressive disclosure before and after.
- `after-live-excel.jpg`: live Excel source with updated price.
- `after-draft-save.jpg`: actual deployed editor with saved QA draft and visible publish button.
- `full-*.jpg`, `full-results.json`, `validation.json`, `eslint-comparison.json`: isolated full-app acceptance evidence.

No critical deployment blocker remains from this execution. Legacy ESLint debt remains 173 errors and 1 warning, with zero new findings against the PR base. Google OAuth/live synchronization and a live WhatsApp reply are unverified limits, not reported as passing. Full pixel-for-pixel competitor parity and readiness for public sale are not claimed.

Rollback points remain the exact previous API and Web deployments in `../2026-10-31-ux/ROLLBACK.md` and `REPORT_AR.md`. No SQL file or external connection credential was changed.

This release evidence is added in a documentation-only follow-up commit; the services intentionally stay pinned to the tested application SHA above.
