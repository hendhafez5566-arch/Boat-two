# CRM V2 preview release

Code SHA:02802aa17bb3ea869af514ba16f2a6662e93e64b. Only existing project a2751c62-5a61-4eb7-b3ca-0b98863e3069 / preview e3e456fd-2c13-457d-91db-6aa80755f502.

API deployment4c9f6f19-7433-496f-8569-9bce7a7def09:SUCCESS. Logs show Applying100_crm_task_priority.sql and101_crm_stage_history.sql; health statusok/dbup at2026-11-01T19:03:13.646Z. Existing oldWeb successfully loaded the prior syntheticQA contact with the newAPI beforeWeb release.

Web deployment27732997-a912-40dd-96be-8170c8b7b798:SUCCESS. Web /login HTTP200. Cloud Browser loaded the new daily workspace and CRM screens. Both sources manually pinned to the codeSHA; no automatic deploy on later pushes.

Pre-release Cloud Browser channel screen:WhatsApp Business active/connection verified, last stored check2026-11-01 11:33:12. No reauthorization/provider check or settings change was performed. This is stored connection evidence, not proof of a new live message or webhook receipt.

SeeROLLBACK.md for prior deployment artifacts. No new Railway project/service/environment/database/Redis, no ownerCRM writes, no active bot change, no Meta/token/webhook mutation, no customer messaging.

## Post-release checks

- API health statusok/dbup at2026-11-01T19:09:32.092Z.
- 138 API HTTP log entries reviewed after release; zero status>=500 in that bounded sample. No claim about all future traffic.
- Nine read-only Cloud Browser smoke groups passed:daily dashboard; syntheticQA customer search;Customer360 score10/100 with email+10 explanation;7-day report range and enabledexportbutton (no owner-data download);English view thenArabic restored;Pipeline loads;overdue taskfilter;channel statusunchanged;CRM awaitingreply1→Inbox list1 with correctURLfilter. No owner records saved or messages sent.
- The browser extension logged metadata errors; these originated from chrome-extension URLs, not BoatTwo. LocalChromium reported no pageerrors across23 journeys.
- Current project inventory still exactly4 services and1 previewenvironment. No Railway resources created.
- Production write acceptance was intentionally not performed on owner data; isolated local write evidence is inbrowser-results.json.

Application SHA on BOTH services:02802aa17bb3ea869af514ba16f2a6662e93e64b. Later documentation-only commits do not trigger deployment because both sources remain pinned.

Preview:https://boat-preview-web-preview.up.railway.app/dashboard/crm/overview
API:https://boat-preview-api-preview.up.railway.app

WhatsApp connection remains storedactive/verified with the same checktimestamp. No newliveWhatsApp reply or webhookdelivery was exercised/claimed. NoGoogleOAuthlive test.
