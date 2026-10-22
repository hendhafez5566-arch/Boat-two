# Chatbot SaaS — المراحل 0 إلى 5

المتطلبات: Node 22، pnpm 9 (`npm i -g pnpm`)، Docker.

## التشغيل

1. `cp .env.example .env` ثم ولّد قيمتين عشوائيتين بـ `openssl rand -hex 32` وضعهما في `JWT_SECRET` و`ENCRYPTION_KEY`
2. `pnpm install`
3. `docker compose up -d` (انتظر حتى يصبح postgres healthy)
4. `pnpm migrate` (يطبّق كل ملفات الـ migrations)
5. `pnpm dev:api` و `pnpm dev:web` في نافذتين

الصفحات: http://localhost:3000/register ثم /login ثم /dashboard

## اختبار الـ API بـ curl

```
curl localhost:4000/health
curl localhost:4000/plans
curl -X POST localhost:4000/auth/register -H 'Content-Type: application/json' \
  -d '{"email":"a@test.com","password":"12345678","fullName":"Ali","workspaceName":"Shop A"}'
```

خذ `accessToken` من الرد وجرّب:

```
curl localhost:4000/workspace -H "Authorization: Bearer TOKEN"
curl localhost:4000/team -H "Authorization: Bearer TOKEN"
curl -X POST localhost:4000/team/invitations -H "Authorization: Bearer TOKEN" \
  -H 'Content-Type: application/json' -d '{"email":"b@test.com","role":"agent"}'
```

اختبار عزل الشركات: سجّل شركتين (حسابين) وتأكد إن `/team` لكل واحد يعرض أعضاء شركته فقط.

## الدفع (Stripe) — اختياري الآن

1. أنشئ منتجات وأسعار شهرية في Stripe، وضع المفاتيح في `.env`.
2. اربط كل خطة بسعرها:
   `UPDATE plans SET stripe_price_id = 'price_xxx' WHERE code = 'pro';`
3. أضف webhook في Stripe على `POST /billing/webhook` للأحداث:
   checkout.session.completed، customer.subscription.updated، customer.subscription.deleted، invoice.payment_failed.
4. للتجربة محلياً: `stripe listen --forward-to localhost:4000/billing/webhook`.

## ملاحظات

- التجربة المجانية: 14 يوم على خطة Pro، وبعدها تُعامل الشركة كخطة Free تلقائياً.
- الأسعار والحدود في جدول `plans` تجريبية، عدّلها بـ SQL.
- إرسال إيميل الدعوات يُضاف لاحقاً؛ حالياً الـ API يرجع رابط الدعوة.
- التوكنات في المتصفح محفوظة في localStorage مؤقتاً، وسننقلها لـ cookies آمنة في مرحلة الأمان.

---

# المرحلة 2 — القنوات

## 1) ويدجت الموقع (الأسهل للتجربة، لا يحتاج Meta)

1. سجّل دخول، وافتح http://localhost:3000/dashboard/channels
2. أضف قناة من نوع "ويدجت الموقع"، وانسخ مفتاحها.
3. افتح `http://localhost:3000/widget-demo.html?key=المفتاح` (أو الصق الكود في أي صفحة HTML).
4. اكتب رسالة من الويدجت، ثم من لوحة الموظف:

```
curl localhost:4000/conversations -H "Authorization: Bearer TOKEN"
curl localhost:4000/conversations/ID/messages -H "Authorization: Bearer TOKEN"
curl -X POST localhost:4000/conversations/ID/messages -H "Authorization: Bearer TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"text":"اختر:","buttons":[{"id":"a","title":"نعم"},{"id":"b","title":"لا"}]}'
```

الرد يظهر في الويدجت خلال ثواني (polling كل 3 ثواني)، والأزرار تظهر كأزرار قابلة للضغط.

## 2) واتساب / فيسبوك / إنستجرام

تطبيق Meta واحد يخص **المنصة** (ليس لكل عميل). تعمله مرة واحدة:

1. أنشئ تطبيق في developers.facebook.com وفعّل منتجات WhatsApp وMessenger وInstagram.
2. ضع `META_APP_SECRET` (من إعدادات التطبيق) و`META_VERIFY_TOKEN` (أي نص تختاره) في `.env`.
3. اضبط الـ Webhooks (يلزم رابط HTTPS عام، مثل ngrok أثناء التطوير):
   - واتساب: `https://رابطك/webhooks/whatsapp`، والحقل `messages`
   - ماسنجر وإنستجرام: `https://رابطك/webhooks/meta`، والحقول `messages` و`messaging_postbacks`
4. من لوحة التحكم أضف القناة بإدخال المعرّف والتوكن (Phone Number ID + Access Token لواتساب، إلخ).
   التوكنات تُخزَّن مشفّرة (AES-256-GCM).

قيود يجب معرفتها:

- واتساب: الرد النصي الحر مسموح خلال 24 ساعة من آخر رسالة للعميل فقط؛ بعدها يلزم قالب (Template) وهو مرحلة لاحقة. النظام يرفض الإرسال برمز `WINDOW_EXPIRED`.
- ماسنجر وإنستجرام: الأزرار والقوائم تُرسل كـ Quick Replies (حد أقصى 13 خيار).
- واتساب: حد الأزرار 3، والقائمة 10 صفوف.
- استقبال الصور من واتساب يُحفظ كمعرّف وسائط؛ تنزيلها وتخزينها في مرحلة لاحقة.
- الربط الحالي يدوي (نسخ التوكن). الربط بزر "Connect with Facebook" (Embedded Signup) يحتاج Meta App Review ونضيفه لاحقاً.

## حدث message.received

كل رسالة واردة من أي قناة تُطلق الحدث `message.received` داخل السيرفر. محرك الـ Flows والـ AI في المراحل 3 و4 يشتركان فيه.

---

# المرحلة 3 — محرك السيناريوهات (Flows) والمحرر المرئي

## التجربة

1. شغّل `pnpm migrate` ثم `pnpm install` (أُضيفت مكتبة reactflow).
2. افتح http://localhost:3000/dashboard/flows وأنشئ سيناريو.
3. في المحرر: أضف عقد من القائمة اليمنى، واسحب من دائرة الخروج (يسار العقدة) إلى عقدة أخرى لربطهما.
4. تبويب **تجربة** يشغّل السيناريو كمحادثة تجريبية بدون إرسال حقيقي (يحفظ المسودة تلقائياً قبل التجربة).
5. تبويب **الإعدادات**: حدّد متى يبدأ السيناريو (كلمات مفتاحية، أول رسالة، أي رسالة، زر محدد) والقنوات.
6. اضغط **نشر**. بعدها أي رسالة تصل من الويدجت/واتساب/ماسنجر/إنستجرام تشغّل السيناريو.

## العقد المتاحة

رسالة (نص/مرفق/أزرار/قائمة) · سؤال (يتحقق من رقم/إيميل/هاتف/Regex ويعيد المحاولة) · شرط (مجموعات AND/OR) · متغيّر · بيانات العميل · انتظار زمني · طلب API · ساعات العمل · تقسيم عشوائي (A/B) · تحويل لموظف · نهاية.

## كيف يعمل

- النشر ينشئ **نسخة ثابتة (version)**؛ تعديل المسودة بعده لا يؤثر على المحادثات الجارية.
- عند وصول رسالة: لو المحادثة بيد البوت وفيها جلسة منتظِرة يُكمَل السيناريو، وإلا يُبحث عن سيناريو منشور مناسب.
- ترتيب الاختيار: كلمة مفتاحية/زر ← أول رسالة ← أي رسالة، ثم الأولوية الأعلى. "أول رسالة" و"أي رسالة" تعملان مرة لكل محادثة.
- لما يرد موظف أو يحدث تحويل، يتوقف البوت في هذه المحادثة (`handled_by = human`).
- جلسة تنتظر ردّ العميل تنتهي بعد 24 ساعة.
- مطابقة النصوص تتجاهل التشكيل وتوحّد الهمزات والأرقام العربية/الهندية (٣ = 3).
- المتغيرات في النصوص: `{{name}}` و`{{contact.name}}` و`{{contact.phone}}` و`{{contact.attr.city}}` و`{{last_message.text}}`.

## الأمان

- عقدة طلب API تحجب الاتصال بالعناوين الداخلية (127.x، 10.x، 192.168.x، 169.254.x…) وتفحص العنوان لحظة الاتصال، ولا تتبع الـ redirects، بمهلة وحد 1MB للرد.
- حد أقصى 100 خطوة في التشغيل الواحد (حماية من الحلقات)، و10 طلبات API.

## اختبار المحرك

`pnpm --filter api test` يشغّل اختبارات المحرك والذكاء الاصطناعي (36 اختبار) (الأرقام العربية، الأزرار، الإعادة، الشروط، ساعات العمل، SSRF، سيناريو متجر كامل…).

## حدود حالية

- المعالجة المتسلسلة لكل محادثة تتم داخل ذاكرة السيرفر (نسخة واحدة). عند تشغيل أكثر من نسخة نضيف قفل Redis.
- المُجدوِل (للانتظار الزمني) يعمل كل 5 ثواني من نفس العملية؛ سننقله لطوابير BullMQ في مرحلة الأداء.
- عقدة الذكاء الاصطناعي تأتي في المرحلة 4، والقوالب (Templates) لواتساب بعد الـ 24 ساعة لاحقاً.

---

# المرحلة 4 — الذكاء الاصطناعي وقاعدة المعرفة

## الإعداد

1. ضع في `.env`:
   - `ANTHROPIC_API_KEY` (لردود المساعد، والنموذج الافتراضي `claude-haiku-5-5` ويُغيَّر من `AI_MODEL`)
   - `EMBEDDING_API_KEY` (للبحث في قاعدة المعرفة؛ أي مزوّد متوافق مع واجهة OpenAI `/v1/embeddings`، وأبعاد المتجه **1536**)
2. `pnpm install` ثم `pnpm migrate`.
3. من لوحة التحكم:
   - `/dashboard/knowledge` أضف نصوصاً أو أسئلة وأجوبة أو رابط موقع أو ملفاً (TXT/MD/CSV/PDF/DOCX). الحالة تتحول من "جارٍ المعالجة" إلى "جاهز".
   - `/dashboard/ai` فعّل الذكاء الاصطناعي، واضبط اسم النشاط والأسلوب، وجرّب المساعد في "جرّب المساعد".

## طريقتان لاستخدامه

1. **عقدة "ذكاء اصطناعي" داخل سيناريو**: تستمر في محادثة العميل حتى كلمة خروج أو حد أقصى للردود أو طلب تحويل. اربط مخرجَي "تحويل لموظف" و"فشل" بعقدة تحويل.
2. **رد تلقائي**: لو فعّلت "رد تلقائي لأي رسالة لا يلتقطها سيناريو"، يجيب المساعد مباشرة من قاعدة المعرفة بدون أي سيناريو.

## كيف يعمل

- **بحث هجين**: تشابه دلالي (embeddings) + كلمات مفتاحية (مع توحيد العربية)، ثم دمج النتيجتين بـ RRF.
- **التأريض**: يجيب فقط من المقاطع المسترجعة؛ وإن لم يجد الإجابة يستدعي أداة التحويل لموظف (لو مفعّلة) بدل التخمين.
- **الحماية**: نصوص قاعدة المعرفة ورسائل العميل تُعامل كبيانات غير موثوقة (حماية من prompt injection)، ويُحيَّد أي وسم يحاول الخروج من قسم المستندات.
- **الرصيد**: كل رد = 1 من رصيد الباقة الشهري (`ai_credits`). عند النفاد يرسل رسالة الاعتذار ويحوّل لموظف (لو التحويل مفعّل) بدون استدعاء النموذج.
- **الاستهلاك** يظهر في `/dashboard/ai` ويُحسب لكل شهر (UTC).
- عدد مصادر المعرفة محدود بالباقة (`knowledge_sources`).
- استيراد الروابط محمي من SSRF (نفس حماية عقدة API)، ويتبع حتى 3 إعادات توجيه مع فحص كل خطوة.

## حدود يجب معرفتها

- تغيير نموذج الـ embeddings إلى نموذج بأبعاد مختلفة يتطلب تعديل `vector(1536)` في migration جديد وإعادة معالجة المصادر.
- مع آلاف الشركات والملايين من المقاطع نحتاج تقسيم جدول المقاطع حسب الشركة أو فهرساً لكل شركة؛ الحل الحالي (HNSW + فلترة RLS) يناسب البداية.
- PDF الممسوح ضوئياً (صور بدون نص) غير مدعوم؛ يلزم OCR لاحقاً.
- ردود الذكاء الاصطناعي نصية فقط (بدون أزرار)؛ لاستخدام أزرار اجعل السيناريو يعرض قائمة ثم يمرّر للمساعد.
- عقدة الذكاء الاصطناعي داخل "تجربة" المحرر تستخدم المساعد الحقيقي (وتستهلك رصيداً) لكن بدون تاريخ المحادثة.

---

# المرحلة 5 — صندوق الوارد المشترك

## الاستخدام

1. `pnpm install` ثم `pnpm migrate` (migration رقم 006)، وأضف `UPLOAD_DIR` في `.env` (افتراضي `./uploads`، ويجب أن يكون على قرص دائم في الإنتاج).
2. افتح http://localhost:3000/dashboard/inbox
3. أرسل رسالة من الويدجت: تظهر لحظياً بدون تحديث الصفحة.

## المميزات

- **تحديثات لحظية (SSE)**: رسائل جديدة، حالات التسليم والقراءة (✓ ✓✓)، وتغيّر المحادثات. الاتصال يعيد نفسه تلقائياً عند الانقطاع. تذكرة الاتصال عمرها 60 ثانية ولا تصلح كتوكن دخول.
- **قوائم وفلاتر**: الكل، لي، غير معيّنة، غير مقروءة، عند البوت، مغلقة، مع عدّادات، وبحث بالاسم/الرقم/نص الرسالة، وفلتر القناة.
- **التعيين**: يدوي، أو توزيع تلقائي لأقل موظف متاح انشغالاً (يُفعَّل من الإعدادات، ويعمل عند تحويل البوت لمحادثة). الموظف يضع نفسه "غير متاح" فيخرج من التوزيع.
- **استلام المحادثة من البوت وإعادتها له**: عند الاستلام يتوقف البوت وتُلغى جلسة السيناريو المنتظِرة. وإرسال رد من موظف يستلم المحادثة تلقائياً.
- **ملاحظات داخلية 🔒**: لا تُرسل للعميل ولا يقرؤها المساعد الذكي أو الويدجت.
- **سجل نشاط في الخيط**: التعيين، تغيير الحالة، الاستلام، إعادة للبوت، تحويل البوت.
- **ردود جاهزة**: اكتب `/` ثم الاختصار. تُدار من صفحة الإعدادات، ويدعم `{{name}}`.
- **المرفقات**: رفع صور/PDF/فيديو/صوت/مستندات حتى 10MB (يُفحص توقيع الملف الحقيقي، وتُخزَّن بأسماء عشوائية). وسائط واتساب الواردة تُعرض عبر وسيط آمن.
- **تنبيه نافذة واتساب**: يظهر تحذير ويُعطَّل الرد الحر بعد 24 ساعة من آخر رسالة للعميل.
- **إشعارات المتصفح** للرسائل الواردة.

## حدود يجب معرفتها

- الأحداث اللحظية تعمل داخل ذاكرة نسخة واحدة من السيرفر. عند التوسّع لأكثر من نسخة نستبدل `TenantBus` بـ Redis pub/sub (الواجهة جاهزة لذلك).
- المرفقات تُخزَّن على قرص السيرفر. للإنتاج الكبير يُفضَّل نقلها إلى S3/R2 (ملف `files.controller.ts` هو المكان الوحيد المعني).
- روابط المرفقات عامة لكن غير قابلة للتخمين (48 حرف عشوائي)، وهذا لازم حتى تستطيع Meta تنزيلها.
- لا يوجد مؤشر "يكتب الآن" ولا كشف تعارض لموظفين يردّان معاً.
- قوالب واتساب (Templates) بعد 24 ساعة لم تُبنَ بعد.

## ELHAFEZ BOAT — Product completion branch

The connected core workspace now includes company/team settings, onboarding, activity logs,
plan usage and billing controls, executable bot templates, version restoration, editor autosave
and undo/redo, channel settings, durable webhook receipt/retries and Inbox bulk close.
This is an ongoing construction checkpoint, not a commercial release.

Use **Node 22 / pnpm 9.12.0**. `pnpm dev:api` uses TypeScript watch compilation to preserve Nest
injection metadata. After `docker compose up -d` and `pnpm migrate`, start `pnpm dev:api` and
`pnpm dev:web` in separate sessions. Require API `/health` to return `db: up`.

Development checks: `pnpm build`, `pnpm lint`, `pnpm --filter api test`, and, with the API running,
`node scripts/smoke-core.mjs`. The smoke creates local test tenants and makes no provider calls.
See [completion matrix](docs/PRODUCT_COMPLETION_MATRIX.md), [remaining work](docs/REMAINING_WORK.md)
and [continuation instructions](docs/CODEX_HANDOVER.md). Meta/Stripe/AI activation remains external
and is not represented as a live connection.
