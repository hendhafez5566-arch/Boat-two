# Local Chromium acceptance evidence — 2026-10-23

Captured against the local production Next server and compiled API, after source checkpoint `ce4d9ff`. These are actual Chromium screenshots of synthetic local fixtures, not mockups or owner-approved brand assets. No production users, credentials or provider responses are shown.

| Screenshot | Scope |
| --- | --- |
| boat-builder-desktop.png | Published bot created through the seven-step wizard and actual engine preview. |
| boat-builder-mobile.png | Existing editor at mobile width. |
| boat-inbox-mobile.png | Empty/search mobile Inbox state. |
| boat-inbox-conversation-mobile.png | Local conversation and persisted private note. |
| campaign-review-desktop.png | Three-step composer preview before draft save. |
| campaign-review-mobile.png | Same content preview at 390px. |
| campaign-arabic-mobile.png | Arabic/RTL campaign UI and translated success feedback after draft save. |
| provider-settings-desktop.png | Revisioned provider model/capability changes saved through the UI. |

Executed browser harnesses: smoke-premium-browser, smoke-inbox-browser, smoke-campaign-browser and smoke-provider-browser. Assertions include persisted API values, publication, native dialogs, zero application page errors and supported mobile overflow checks. Latest premium screenshots were regenerated after the desktop navigation dismissal fix. The campaign test checks both English and Arabic; the provider test also permanently retires the local fixture after capturing settings.

These bounded journeys do not prove complete product, visual, accessibility, load or security acceptance. See ../../SPRINT_FULL_PRODUCT_2026-10-23.md and ../../REMAINING_WORK.md for exact delivered/remaining scope. All real external/paid/email/financial/domain gates remain disabled.
