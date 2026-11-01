# Cloud audit fixes — 2026-11-01

The live cloud browser reproduced six interface defects: tools menu remains open after outside canvas clicks; import job progress remains pending until manual refresh; internal simulator diagnostics appear in the customer transcript; scrolled page content shows through the transparent sticky header; malformed XLSX feedback is technical and English in Arabic mode; terminal previews show the initial-start input hint.

Changes are frontend only, based on CRM HEAD `90e33d9c6a245d2ac7414b1df79aeb4322e5318b`. No migrations, external messages, billing changes, main merge or Railway deployment.

Live acceptance executed with the owner role and synthetic QA records in the existing workspace: draft creation/edit/copy/save/reload; full question and handoff conversation; dynamic XLSX/CSV catalog upload, hidden row filtering, stable-key update and product selection; independent test Webchat channel with a channel-scoped test bot published through UI; actual visitor inbound, Inbox staff reply delivered back to visitor, takeover suppression, private note isolation and return-to-bot controls; customer profile creation and bot name capture; deal assignment/stage/value/won status; task assignment; report value reconciliation; CSV duplicate rejection on first and repeated imports; AND/OR views; marketing eligibility review and draft campaign; English LTR; two-editor save conflict rejection.

Evidence is delivered privately in the audit package. Existing WhatsApp bot remained active. Provider connection check completed through UI; external WhatsApp delivery and webhook roundtrip were not tested.

Validation: 209 API/engine/PostgreSQL tests passed (0 skipped); two localized-feedback regression tests passed; production Next build and type validation passed. The cloud browser exercised the deployed baseline, not the unpublished fixes. No post-fix cloud-browser or visual acceptance is claimed. Menu/polling/CSS changes still need browser regression on an explicitly approved review deployment.

Not completed: fresh authenticated registration/three independent tenants, employee/admin sessions, invitation, cross-tenant live attack tests, cloud mobile/tablet coverage, all-page bilingual coverage, real Google OAuth/Sheets sync, Meta delivery, thousands-contact cloud performance, controlled network interruption/forced API errors, runtime bot AND/OR branches, automation replay through UI, drag-based Kanban, all node types, undo/redo/copy/paste and safe delete. These are not marked passed. Prior acceptance reports were not used as evidence for this run.

Readiness: useful for controlled owner-led QA; complete customer pilot acceptance and public-sale readiness remain unapproved because the above gates are open. Source fixes in this PR are proposals pending browser verification.
