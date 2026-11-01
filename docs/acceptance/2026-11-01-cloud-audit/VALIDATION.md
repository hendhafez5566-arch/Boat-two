# Cloud audit fixes — 2026-11-01

The live cloud browser reproduced six interface defects: tools menu remains open after outside canvas clicks; import job progress remains pending until manual refresh; internal simulator diagnostics appear in the customer transcript; scrolled page content shows through the transparent sticky header; malformed XLSX feedback is technical and English in Arabic mode; terminal previews show the initial-start input hint.

Changes are frontend only, based on CRM HEAD `90e33d9c6a245d2ac7414b1df79aeb4322e5318b`. No migrations, external messages, billing changes, main merge or Railway deployment.

Live acceptance executed with the owner role and synthetic QA records in the existing workspace: draft creation/edit/copy/save/reload; full question and handoff conversation; dynamic XLSX/CSV catalog upload, hidden row filtering, stable-key update and product selection; independent test Webchat channel with a channel-scoped test bot published through UI; actual visitor inbound, Inbox staff reply delivered back to visitor, takeover suppression, private note isolation and return-to-bot controls; customer profile creation and bot name capture; deal assignment/stage/value/won status; task assignment; report value reconciliation; CSV duplicate rejection on first and repeated imports; AND/OR views; marketing eligibility review and draft campaign; English LTR; two-editor save conflict rejection.

Evidence is delivered privately in the audit package. Existing WhatsApp bot remained active. Provider connection check completed through UI; external WhatsApp delivery and webhook roundtrip were not tested.

Validation: 209 API/engine/PostgreSQL tests passed (0 skipped); two localized-feedback regression tests passed; production Next build and type validation passed. The cloud browser exercised the deployed baseline, not the unpublished fixes. No post-fix cloud-browser or visual acceptance is claimed. Menu/polling/CSS changes still need browser regression on an explicitly approved review deployment.

Not completed: fresh authenticated registration/three independent tenants, employee/admin sessions, invitation, cross-tenant live attack tests, cloud mobile/tablet coverage, all-page bilingual coverage, real Google OAuth/Sheets sync, Meta delivery, thousands-contact cloud performance, controlled network interruption/forced API errors, runtime bot AND/OR branches, automation replay through UI, drag-based Kanban, all node types, undo/redo/copy/paste and safe delete. These are not marked passed. Prior acceptance reports were not used as evidence for this run.

Readiness: useful for controlled owner-led QA; complete customer pilot acceptance and public-sale readiness remain unapproved because the above gates are open. Source fixes in this PR are proposals pending browser verification.


## Continuation checkpoint — isolated review preparation

Continuation starts from verified PR6 HEAD e076fa9; the existing Web/API remain pinned at 1508308 / 803cc29 and were not changed. A separate `boat-cloud-qa-review` service (54948f68-14be-43e9-b6e5-67a89c3c2135) was prepared inside the EXISTING project, with no owner database, provider credentials or persistent volume. Its source is not deployed at this checkpoint. The review gateway starts the complete application and all 99 migrations against ephemeral PostgreSQL, strips inherited secrets from child environments, creates fresh cryptographic keys, and disables external delivery. Production Web/API startup commands are untouched.

Four targeted local Chromium checks passed on the current fixed code: real registration API/onboarding UI through the review helper; tools-menu dismissal on canvas click; simulator terminal restart hint and separated internal diagnostics; opaque sticky header. Build and targeted ESLint pass. These are supplementary LOCAL browser checks, not post-fix Cloud Browser acceptance. Polling and Excel feedback remain pending browser checks. See review/local-smoke.json and CONTINUATION_AR.md. The existing 209-test run is retained as prior evidence and was not rerun without cause.

### Follow-up checkpoint: review live, cloud upload tooling blocked

The isolated review deployment `2c926253-f319-42e3-814d-68148589e9f8` reached terminal SUCCESS on source `19890ffe337dc52db1481f02ff5dd7e4eb9c7238`. Its startup now applies all 99 migrations before starting Web. The prior attempt never became healthy and was superseded; owner services remained Online. Six targeted LOCAL browser groups now pass, including a real 200-row import completing without manual refresh and malformed XLSX feedback in both English and Arabic. See updated review/local-smoke.json.

Cloud Browser executed fresh synthetic tenant bootstrap via the review helper, verified the actual onboarding UI with zero contacts, and opened the CRM import dialog. Screenshot: review/cloud-01-onboarding.jpg. The filechooser tool then timed out before returning an upload result; this is BLOCKED tooling, not a passed import or a confirmed application defect. The Cloud Browser runtime subsequently reset and tabs were gone. No post-fix cloud acceptance of the six defects is claimed at this checkpoint. The existing owner Web/API still use 1508308 / 803cc29, unchanged.

### متابعة G07 وأدلة المتصفح

اقرأ CONTINUATION_AR.md لنتائج المتابعة المحدثة. أُعيد قبول4/6 إصلاحات سحابيًا؛ إصلاحا الاستيراد وExcel محجوبان بأداة رفع الملفات، ونجحا محليًا. أُصلح G07/P3 لعدّاد العملاء ونجحت7 مجموعات محلية؛ القبول السحابي لهذا الإصلاح معلق حتى نشر دفعة المراجعة. أضيفت7 صور متصفح فعلية ونتيجة lint المقارنة (صفر أخطاء جديدة على الملفات المتأثرة). لا اعتماد نشر نسخة المالك أو جاهزية البيع.

G07: قبول سحابي بعد النشر4444aa1 ناجح لإنشاء عميل إنجليزي بالمكتب وآخر عربي بالموبايل، دون إعادة تحميل. أضيفت صور08–12 للسحب وTablet والعداد والسؤال. تحديث تجهيز المراجعة للويدجت محليًا8 مجموعات ناجحة؛ يحتاج نشر خدمة المراجعة فقط، لا خدمات المالك.

متابعة محفوظة:10 مجموعات محلية ناجحة، وBuild/TypeScript ناجح، ومقارنة lintالكاملة173خطأ/1تحذير قديم في الأصل والحالي بلا إضافات. اختُبرت محادثةWebchatوInboxورد الموظف وعزل الملاحظة الداخلية وإنشاء متابعة مرتبطة بCRM بالمتصفح. إضافة تحديث العدّاد عند التنقل بعدinbound تنتظر قبولًا سحابيًا بعد نشر المراجعة. خدمات المالك لم تُستبدل، ولا اختبارWhatsAppحي أوGoogleOAuth.
