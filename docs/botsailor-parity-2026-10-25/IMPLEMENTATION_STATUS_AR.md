# حالة تنفيذ الأمر الأول — متابعة 25 أكتوبر 2026

هذه متابعة للمرحلة الأولى على المشروع والفرع القائمين. **ليست إعلان اكتمال البنود الـ52 أو مطابقة BotSailor أو اجتياز المرحلة الثانية.** `DONE` يخص النطاق المحلي الموصوف والمتحقق منه؛ `IN PROGRESS` يحدد النقص المحلي أو مسار DB/واجهة لم يختبر؛ `BLOCKED` يحدد التفويض الخارجي أو القبول المؤجل صراحة. تُذكر القيود المختلطة داخل الصف ولا تُخفى خلف التفويض.

- المستودع: `hendhafez5566-arch/Boat-two`
- الفرع: `fix/boat-ux-19-one-batch`
- PR: https://github.com/hendhafez5566-arch/Boat-two/pull/2
- HEAD عند استئناف هذه المتابعة، المتحقق من origin: `afd954354a7346a24dc701d1442f7c552d89b97a`.
- HEAD البرمجي لهذه المتابعة قبل commit التقرير: `d04acbc`؛ SHA وثيقة التقرير نفسها في سجل git.
- لا AGENTS.md في شجرة الفرع. استُنْسخ الفرع نفسه إلى بيئة نظيفة؛ لم يُنشأ مشروع أو فرع جديد ولم يُدمج main.
- كان التقرير السابق عند `bbdbf53`؛ روجعت التغييرات اللاحقة قبل البرمجة، ولم تُكرر الوحدات التالية.

## وحدات كانت منفذة بعد التقرير السابق

| Commit | التنفيذ الذي أعيد احتسابه من الكود |
|---|---|
| 505eaeb | مخطط مرئي للتسلسلات وتقرير الحالة القديم |
| 320ecaa | إزالة اعتماد بناء Next على حزمتَي خطوط غير متاحتين |
| 429a61a | Google OAuth وSheets/Calendar وموصلات مزودين وWebhooks أحداث موقعة |
| 6b64b37 | كتالوج وعقد تجارة ونماذج ومواعيد ومسودات نشر اجتماعي |
| a79ff29 | فلاتر CRM مركبة وDashboard وقياسات الاستخدام وروابط الحساب |
| afd9543 | حقول النظام وسياسات البداية والبوت البديل والأمان وSLA وتصفير أفعال الأزرار |

## وحدات هذه المتابعة — commit وpush بعد كل وحدة

| Commit | الوحدة والتحقق المركز |
|---|---|
| 992c99c | اكتشاف كل اختبارات API، وفصل بناء طلبات المزود عن تشغيل الخادم؛ عالج فشل اختبار كان يتطلب DATABASE_URL |
| cdca9dd | تأكيد Telegram callback بعد الحفظ الدائم، وعزل مشارك المحادثة وقيود callback؛ 9 اختبارات مركزة ناجحة |
| 36f577a | تحقق عقد التجارة قبل النشر ورمز نموذج فريد للجلسة وانتظار الرد المطابق بعد إعادة الفتح |
| 2f0267a | سياق القناة في مدير البوت ومساحة البوت وCRM والوارد؛ اختبار سياق و3 اختبارات بطاقات و6 مجموعات UX وبناء Next ناجحة |
| c140b95 | مؤشر كتابة حقيقي محدود على Telegram/Meta في عامل الإرسال؛ اختباران Mock وبناء API/Next ناجحان |
| d04acbc | كتالوج اختياري ينتظر اختيار المنتج ويحفظ معرفه للتفرع؛ اختبار المحرك والخدمة وترتيب المنتجات والأسعار الدقيقة ناجح |

## التحقق المحلي خلال البرمجة

- استُخدم `corepack pnpm install --frozen-lockfile` دون تغيير lockfile؛ تنزيل 444 حزمة تم بنجاح.
- `corepack pnpm -r build`: نجح API TypeScript وNext production، بما فيه فحص الأنواع وتوليد 38 صفحة. عائق البناء المذكور في التقرير القديم **لم يعد قائمًا**.
- اختبار API أصبح `NODE_ENV=test corepack pnpm --filter api test` ويكتشف `src/**/*.test.ts`؛ نجح آخر تشغيل: **115 اختبارًا، صفر فشل أو تخطٍ**.
- `apps/api/node_modules/.bin/tsx --test apps/web/lib/channel-context.test.ts apps/web/lib/flow-cards.test.ts`: **4 اختبارات ناجحة**.
- `node scripts/test-ux19.mjs`: **6 مجموعات عقود ناجحة**، منها 40 عقدة RTL/LTR وحفظ المعالج وعزله وتحويل خطواته ذهابًا وإيابًا؛ يستخدم المحقق الحقيقي مع tsx بدل نسخ شيفرته.
- `git diff --check` و`node --check apps/api/assets/widget.js` ناجحان. فحص TypeScript للواجهة ناجح كذلك.
- لا PostgreSQL أو بيانات اعتماد DB تجريبية جاهزة في البيئة. لم تُطبق المهاجرات 082–087 ولم يُدّع اختبار RLS/التزامن على DB. المحاكاة واختبارات الخدمات تستخدم بدائل محلية معلنة.
- لا مقارنة صور أو اختبار قبول متصفح/E2E نهائي. لا تسجيل Webhook خارجي أو تفويض Google/Meta أو اتصال بقناة حقيقية أو إرسال مدفوع.
- أداة pnpm الافتراضية في PATH تستخدم إصدارًا مختلفًا وتطلب إعادة تثبيت دون TTY عند `pnpm build` المتداخل؛ استُخدم إصدار المشروع الصريح عبر `corepack pnpm -r build` ونجح، دون تعديل اعتماد المشروع للتحايل على الخطأ.

## مصفوفة البنود الـ52 بترتيب AUDIT_AR

الحالات: DONE=21، BLOCKED=6، IN PROGRESS=25.

| # | أولوية | البند | الحالة | المنجز/المتبقي والسبب | ملفات الدليل |
|---|---|---|---|---|---|
| 01 | P0 | مكتبة الربط المرجعية تقدم 6 قنوات/تكاملات مستقلة؛ Boat Two في ChannelType تدعم web/whatsapp/facebook/instagram فقط | DONE | ست بطاقات، Google تكامل مستقل، Telegram موصل فعلي مع قيد الاختبار الحي. | ChannelCatalog.tsx; channels/page.tsx |
| 02 | P0 | واجهة Boat Two تعرض اسم القناة وحقول معرفات/Token التقنية مباشرة بينما الصورة تقدم بطاقة اتصال موجهة | DONE | Meta الرسمي افتراضي، الحقول اليدوية تحت اختيار متقدم؛ Telegram له تعليمات BotFather. | MetaConnect.tsx; channels/page.tsx |
| 03 | P0 | الصورة تعرض حسابًا متصلاً وبجانبه حالة Active؛ Boat Two تحتاج فصل حالة محلية عن اتصال مزود مثبت | DONE | GET Meta/getMe Telegram، دليل اتصال مؤرخ ينتهي بعد 24 ساعة؛ تعطيل محلي منفصل وحماية سباق تغيير الرمز. | connection-health.ts; channels.service.ts |
| 04 | P0 | إعداد WhatsApp الرسمي موجود في Boat Two؛ مسار التعايش مع تطبيق واتساب Business لا يظهر كخيار مباشر أو مثبت | BLOCKED | واجهة Cloud/coexistence وميزة Embedded Signup جاهزة؛ أهلية الرقم واعتماد تطبيق Meta لم يُختبرا ولا يمكن إثباتهما دون تفويض حي. | MetaConnect.tsx |
| 05 | P1 | المرجع يجمع عدد القنوات ومتصلة وقاربت الانتهاء ومنقطعة أعلى الصفحة | DONE | مؤشرات قابلة للتصفية وبحث مشتقة من دليل الاتصال، لا من active وحده. | channels/page.tsx |
| 06 | P1 | أيقونات الهوية للقنوات وألوان زر الاتصال تختلف حسب المزود؛ الحالية أزرار عامة | DONE | SVG لكل مزود وألوانه، دون شعار BotSailor. | ChannelCatalog.tsx |
| 07 | P1 | الصورة تعرض Telegram مستقلًا؛ غير موجود ضمن أنواع القنوات في Boat Two | IN PROGRESS | Telegram خاص وارد/صادر وطابور دائم وتحقق السر؛ أضيف answerCallbackQuery بعد الحفظ الدائم، مع رفض callback لمستخدم مختلف أو قيمة غير صالحة. نجحت 9 اختبارات Telegram/Webhook المركزة. المتبقي المحلي: تنزيل الوسائط ومجموعات Telegram؛ تسجيل Webhook والاختبار الحي لم ينفذا. | telegram.adapter.ts; webhook-parsers.ts; webhooks.controller.ts; telegram.test.ts; webhooks.test.ts |
| 08 | P1 | Google يظهر كخيار Connect Google، بينما Sheet Fetch الحالي يعتمد رابط CSV عام | BLOCKED | OAuth محدد الغرض مع state أحادي الاستخدام وتجديد الرموز المشفرة، وقراءة/كتابة Sheets وCalendar موجودة منذ 429a61a. عقود الطلبات اختبرت محليًا؛ لم يُفوض Google ولم تختبر دورة OAuth أو DB حيًا. يلزم Client ID/Secret واعتماد الحساب واختبار التكامل. | integrations/google.service.ts; integrations/contracts.test.ts; integrations/page.tsx; 085_integrations.sql |
| 09 | P0 | الأزرار المستقلة في الكود تُرسم في وضع analytics فقط، بينما المرجع يظهرها في وضع البناء العادي | DONE | بطاقات الأزرار والصفوف تظهر دائمًا في التحرير، والحفظ يبقي العقد/الوصلات والمعرّفات الأصلية. | flows/[id]/page.tsx; flow-cards.test.ts |
| 10 | P0 | الكروت في المرجع تظهر منفذ reply/next/button وحالاتها بشكل متسق وتوصيل مريح | IN PROGRESS | حافظنا على تخطيط 40 عقدة وRTL/LTR؛ يلزم قبول مرئي وتفاعل لمس في المرحلة الثانية. | flow-types.ts; test-ux19.mjs |
| 11 | P0 | الصورة تعرض أفعال ضغط متقدمة مستقلة داخل زر: وسوم، قوائم، تسلسل، تعيين فريق، Webhook، Calendar | IN PROGRESS | أفعال الحقول والوسوم والقوائم والتسلسلات والإسناد وWebhook موجودة، وأضيف فعل integration لـGoogle Calendar/Sheets والمزودات منذ 429a61a. اختبارات إيصالات التنفيذ والعقود ناجحة؛ المسار الكامل للـDB والتفويض الحي لم يختبرا. | flow-actions.service.ts; ButtonActionsEditor.tsx; flow-actions.test.ts; integrations/contracts.test.ts |
| 12 | P0 | صور المستخدم تبرز سحب العقد وتحريرها بلوحة جانبية دون إخفاء المخطط | DONE | النقر على بطاقة زر يفتح محرر أفعاله مباشرة في Inspector دون مغادرة المخطط. | Inspector.tsx; MessageEditor.tsx; flows/[id]/page.tsx |
| 13 | P1 | المرجع يحتوي خيارات إضافية ظاهرة مثل WhatsApp Flows وAppointment وProduct/Section/Row | IN PROGRESS | عقد Product/Catalog/Appointment/WhatsApp Flow أصبحت موجودة منذ 6b64b37، وأضيف التحقق قبل النشر ورمز نموذج مستقل لكل جلسة. اختبارات payload ورفض الردود المتقاطعة وإعادة فتح الجلسة ناجحة. يلزم قبول DB للمواعيد وتفويض Meta للكتالوج والنموذج الأصلي. | commerce/; engine/engine.ts; engine/validate.ts; Inspector.tsx; commerce/contracts.test.ts; engine/engine.test.ts |
| 14 | P1 | كروت المرجع تعرض إحصاءات Sent/Delivered/Subscribers/Errors باستمرار | DONE | مؤشرات العقد والأزرار ظاهرة أثناء التحرير؛ — عند تعذر المصدر، وصفر عند نجاح API دون أحداث. | stats-context.ts; FlowNodeView.tsx; FlowButtonNode.tsx |
| 15 | P1 | المرجع يحتوي نوع خاص Start Bot Flow مع إعدادات trigger keyword ومطابقة Exact/String | DONE | مطابقة trigger exact/contains وأول/أي رسالة موجودة ومحفوظة؛ حافظنا على المحرك واختباراته. | engine/triggers.ts; engine.test.ts |
| 16 | P1 | المرجع يعرض إعادة استخدام الحملات وحفظ مجلدات واستيراد Flow واختيارات الإدارة | DONE | استيراد/تصدير إصدار Boat Two موثق، مسودة جديدة دون قنوات/نشر؛ مجلد نصي قابل للنقل مع حماية تعارض الحفظ. | flow-transfer.test.ts; flows.service.ts; 083_flow_folders.sql |
| 17 | P1 | التخطيط المرجعي واضح في لقطة الهاتف مع تحريك وتكبير؛ لكنه ليس دليلًا على استجابة الهاتف | IN PROGRESS | واجهة الهاتف الحالية محفوظة؛ CSS القنوات متجاوب. لم يُنفذ قبول لمس/لقطات 390/768/1440. | globals.css; flows/[id]/page.tsx |
| 18 | P0 | زر BotSailor يسمح بتعيين Group وUser منفصلين؛ Boat Two handoff يدعم assignTo مستخدم لا فريقًا من العقدة | IN PROGRESS | الإسناد لموظف/قسم وعزل الشركة موجودان؛ أضاف afd9543 تصعيد SLA وانتهاء جلسة الموظف. اختبارات أفعال الإسناد ناجحة، لكن عامل SLA ومهاجرة 087 واستلام موظف فعلي لم تختبر على PostgreSQL. | flow-actions.service.ts; inbox-policy.service.ts; 087_inbox_security_policies.sql; flow-actions.test.ts |
| 19 | P0 | User Input Flow بالمرجع يشمل اسم حملة ووسوم وقوائم وتصدير Webhook؛ نموذج Boat Two الحالي أسئلة/إجابة/رسالة ختام | DONE | أفعال نهاية User Input بعد جميع الإجابات الصحيحة، حفظ حقول وتخطي اختياري؛ المحاكي يعلن أفعال Mock ويحفظ حقوله بين الأدوار. | engine/engine.ts; flows.service.ts; Inspector.tsx |
| 20 | P1 | محرر الرسالة بالمرجع فيه نص واضح وعناصر متغيرات ورموز وعداد أحرف | DONE | منتقي المتغيرات محفوظ، عداد وحدود 4096/1024 وإيضاحات العنوان والتذييل. | MessageEditor.tsx |
| 21 | P1 | Delivery Options في المرجع تشمل typing indicator وSmart Delay بالساعات والدقائق والثواني | IN PROGRESS | Smart Delay دائم بالساعات/الدقائق/الثواني. أضيف مؤشر كتابة حقيقي لـMessenger/Instagram/Telegram قبل الإرسال من العامل وبعد فحص السياسات، بحد 5 ثوانٍ؛ فشله لا يعيد الرسالة. نجح اختباران Mock. لا دعم لمؤشر WhatsApp/Webchat حاليًا، والتخطي موضح في المحرر. | MessageEditor.tsx; adapters/adapter.ts; outbound.service.ts; typing.test.ts; interactive-message.test.ts |
| 22 | P1 | Interactive Message مقسمة Header Type (نص/وسائط)، Body وFooter وDelivery | DONE | عنوان نص/صورة، body/footer، محول WhatsApp أصلي، تحويل صريح على Meta، عرض في الويدجت والوارد والمحاكي؛ قيود قناة موثقة. | message-content.ts; whatsapp.adapter.ts; MessageEditor.tsx; interactive-message.test.ts |
| 23 | P1 | السؤال بالمرجع يدعم free keyboard وmultiple choice، تحقق، حفظ System/Custom، خيار Skip | DONE | الاختيارات والتحقق والتخطي والحفظ Custom محفوظة؛ أضاف afd9543 وجهة system مستقلة name/email/phone مع تحقق الكتابة. نجحت اختبارات المحرك والأسئلة وحقول النظام. حفظ DB والتعامل مع تعارض جهة اتصال أخرى يحتاجان تحقق المرحلة الثانية. | flow-schemas.ts; engine/engine.ts; flow-actions.service.ts; Inspector.tsx; button-actions.test.ts; bot-policy.test.ts |
| 24 | P1 | إعدادات العقد في المرجع أقسام واضحة بعنوان ومساعدة واختيار مع Save Changes ثابت | DONE | Inspector الحالي وأقسامه والحفظ محفوظة مع محررات الأفعال وسياسات البوت. القبول المرئي النهائي للمرحلة الثانية. | Inspector.tsx; BotPolicyEditor.tsx |
| 25 | P2 | إجراءات اختيار نص Button Generation Method ونوع Pressed Action تظهر كبطاقات/قوائم مستقلة | DONE | منتقي الأفعال وترتيبها وحذفها موجود؛ أصبح تكامل Google/Calendar قابلًا للاختيار عبر فعل integration. لم يعد Calendar مجرد اختيار معطل. التفعيل الخارجي مشروط بالتفويض ولا يوجد اتصال حي مُدعى. | ButtonActionsEditor.tsx; integrations/contracts.test.ts |
| 26 | P0 | المرجع يختار Channel ثم Bot ثم Feature ويضع Tabs وظائف واضحة؛ في Boat Two وظائف موزعة على قائمة صفحات منفصلة | IN PROGRESS | أضيف اختيار القناة في مدير البوت، وحفظ سياق URL بين مساحة البوت وCRM والوارد؛ البوتات غير المقيدة بالقناة تبقى ظاهرة وفق المحرك. نجح اختبار السياق وبناء الصفحات. لم يمتد السياق بعد إلى الحملات والتسلسلات والتجارة والتكاملات؛ القبول في المتصفح للمرحلة الثانية. | flows/page.tsx; flows/[id]/workspace/page.tsx; useChannelContext.ts; channel-context.test.ts |
| 27 | P1 | إعدادات عامة للـNo-match/Get Started/تكرارها/إيقاف رد البوت أثناء استلام الموظف | DONE | Get Started ورسالة البداية وتواتر once/always/daily أضيفت في afd9543 مع المحافظة على السلوك القديم؛ اختبار start-frequency ناجح. no-match وتوقف البوت أثناء استلام الموظف محفوظان. رحلة القبول الكاملة في المرحلة الثانية. | engine/triggers.ts; engine/engine.ts; start-frequency.test.ts; BotPolicyEditor.tsx |
| 28 | P1 | المرجع يعرض تفعيل Webhook حسب نوع حدث مستقل بما فيه حالة التسليم وCRM وReminder | IN PROGRESS | لوحة Webhook لكل نوع حدث، توقيع HMAC، طابور دائم وحالات failed/ambiguous ومراجعة قبل retry موجودة منذ 429a61a. ليست لوحة فارغة. لم يختبر مسار الأحداث→DB→العامل كاملًا؛ يجب التحقق من تغطية كل أحداث CRM/Reminder المطلوبة. | integrations.service.ts; integrations/contracts.ts; integrations/page.tsx; 085_integrations.sql |
| 29 | P1 | ساعات العمل مرجعية على مستوى البوت وجدول أسبوعي وحالات تشغيل/إيقاف + بوت خاص خارج الدوام | DONE | جدول أسبوعي وتوقيت ورسالة خارج الدوام، وبوت بديل مثبت بنسخة النشر أضيف في afd9543؛ نجحت اختبارات أوقات العمل وDST واستئناف الرسم البديل. اختبار نشر النسخة المجمدة عبر DB مطلوب في المرحلة الثانية. | engine/hours.ts; engine/engine.ts; flows.service.ts; bot-policy.test.ts; BotPolicyEditor.tsx |
| 30 | P1 | إعداد Shared Inbox يحتوي توقيع تلقائي ومدة صلاحية جلسات ومعالجة أخطاء التسليم | IN PROGRESS | أضيف التوقيع وتسمية أخطاء التسليم وانتهاء جلسة الموظف وتصعيد SLA وإعداداتها منذ afd9543. الشيفرة تبني، لكن تشغيل السياسة على DB وتفاعل التوقيع مع حدود الرسائل لم يختبرا وظيفيًا؛ لا ادعاء اكتمال. | messaging.service.ts; inbox-policy.service.ts; assignment.service.ts; inbox/settings/page.tsx; 087_inbox_security_policies.sql |
| 31 | P1 | المرجع يعرض Auto Responder Email lists وGoogle contacts/sheets | BLOCKED | موصلات Mailchimp/Brevo/ActiveCampaign/Mautic وSheets أضيفت منذ 429a61a مع Mock وموافقة تسويق موثقة وتفعيل خارجي منفصل. عقود الطلبات ناجحة؛ لم توفر حسابات أو مفاتيح ولم يجر إرسال. Google Contacts كمزامنة مستقلة غير منفذ محليًا؛ لا يندرج ضمن مانع التفويض وحده. | integrations/provider-request.ts; integrations.service.ts; contracts.test.ts; integrations/page.tsx |
| 32 | P1 | Bot Options تتضمن إدارة متغيرات ومجلدات وسجل أخطاء واستيراد | IN PROGRESS | إدارة initialVars وتصفير أفعال أزرار المسودة مع حفظ IDs والوصلات والتحقق من expectedUpdatedAt أضيفت في afd9543، إلى جانب المجلدات والاستيراد وسجل الأخطاء. initialVars اختبرت بالمحرك؛ reset-actions لم يختبر حفظه عبر DB بعد. | flows.service.ts; flows.controller.ts; BotPolicyEditor.tsx; flows/[id]/workspace/page.tsx; bot-policy.test.ts |
| 33 | P1 | Subscribers فيها فلاتر مركبة بالقنوات والوسوم والقوائم والتسلسلات والحالة مع شرائح أرقام | IN PROGRESS | فلاتر channel/list/sequence/status/consent المركبة واستعادة الشرائح وشرائح العرض أضيفت في a79ff29. نجح اختبار SQL للربط والمعاملات، وأضيف استقبال سياق القناة من مدير البوت. العدادات والفلترة على DB التجريبية لم تختبر بعد. | business/schemas.ts; crm.service.ts; relational-filters.test.ts; crm/page.tsx |
| 34 | P1 | المرجع يفصل Labels وLists وCustom Fields في إدارة المشتركين؛ Boat Two يدعم tags/fields/segments لكن ليس بالضرورة نفس مفهوم Lists | DONE | قوائم منفصلة عن tags وsegments: إنشاء/عضويات/إزالة/أفعال زر، FK مركب وRLS لكل شركة. لا تتحول العضوية لموافقة تسويق. | contact-lists.controller.ts; 082_flow_actions_lists.sql; crm/lists/page.tsx |
| 35 | P1 | واجهة الوارد المرجعية متعددة القنوات؛ Boat Two عنده Inbox فعلي ويحتاج مراجعة تصنيفات قنوية ورسائل القوالب | IN PROGRESS | الوارد الأصلي محفوظ ويدعم العنوان/التذييل الجديد؛ القبول متعدد القنوات واختبار موظف لم يُنفذا. | inbox/MessageBubble.tsx |
| 36 | P1 | Status Retained/Subscribed/In Sequences يظهر في المرجع بجانب جهات الاتصال | IN PROGRESS | أضيف عرض قوائم جهة الاتصال وتسلسلاتها وحالاتها وموافقاتها لكل قناة من API منذ a79ff29، مع تمييز غياب الموافقة صراحة. لم يختبر عرض البيانات الحقيقية في متصفح/DB تجريبي؛ لا مساواة بين الاشتراك وموافقة التسويق. | crm.service.ts; crm/page.tsx; business/schemas.ts |
| 37 | P1 | التسلسلات في المرجع مرئية كعقد مترابطة؛ Boat Two تستخدم مراحل متتالية في صفحة Sequences | DONE | مخطط مرئي مرتبط بخطوات التسلسل الحقيقية، ينتقل لمحرر الخطوة ومعرّفها؛ إعادة ترتيب/توقيت/حفظ المحرك الأصلي محفوظة. | sequences/page.tsx; schedule.test.ts الحالي |
| 38 | P1 | Social Posting يعرض Multimedia وCTA وCarousel/Video في المرجع؛ لا تظهر له صفحة مستقلة في Boat Two | IN PROGRESS | مسودات text/image/video/carousel/CTA ومعاينة Mock وجدولة منفصلة وعامل Meta مع حالات ambiguous موجودة منذ 6b64b37؛ اختبرت عقود الوسائط. يلزم اختبار حفظ DB والعامل واستئناف جاهزية وسائط Instagram؛ صلاحيات النشر الحية غير مفوضة. | commerce/social.service.ts; commerce/contracts.test.ts; commerce/page.tsx; 086_commerce.sql |
| 39 | P1 | خيارات Product/Section/Row تشير إلى تجارة داخل مصمم BotSailor، وليست مجرد صور منتج | IN PROGRESS | كتالوج بأسعار دقيقة ومعرفات ثابتة ورسائل أصلية ومحتوى بديل موجود. أضيف اختيار منتج بقائمة حتى 10 صفوف، حفظ productId والاسم ثم التفرع بشرط، مع استمرار الجلسة بعد إعادة الفتح. نجحت اختبارات المحرك والخدمة Mock وترتيب المنتجات. المتبقي اعتماد/اختبار كتالوج Meta وطلبات الشراء والقبول عبر DB. | commerce.service.ts; catalog.test.ts; engine/engine.test.ts; Inspector.tsx; whatsapp.adapter.ts |
| 40 | P1 | الحملات والرسائل تحتاج عرض إحصائيات موحّد وإظهار حالات Pending/Failed بدقة | IN PROGRESS | توجد مراجعة الجمهور قبل الجدولة ودفتر مستلمين قابل للتصفية بمصدر حالة الرسالة/job والخطأ والمحاولات، وتصدير الصفحة المحملة فقط. لم يختبر دفتر التسليم على DB تجريبي؛ يلزم قبول الحالات Pending/Failed/Delivered والتحديث. | campaigns/page.tsx; CampaignDraftEditor.tsx; campaigns.service.ts |
| 41 | P2 | صورة الربط وإدارة الاشتراكات تظهر عناصر تسويقية خارج CRM الاعتيادي | BLOCKED | موافقة التسويق وإلغاء الاشتراك والجمهور القائم على consent موجودة، وتكاملات التسويق لها طلبات فعلية وMock. لا مفاتيح أو تفويض للربط الحي؛ لم ينفذ اختبار مزود خارجي ولم يستهلك رصيد. | campaigns.service.ts; integrations.service.ts; provider-request.ts; integrations/contracts.test.ts |
| 42 | P1 | Dashboard تظهر اختصارات New Broadcast/Open Inbox/Create Flow/Connect Channel وأعداد الاستهلاك ورسائل تنبيه | IN PROGRESS | a79ff29 أضاف اختصارات Dashboard الأربعة وقياسات القنوات/البوتات/المشتركين/الوارد وبيانات API دون أرقام وهمية. بناء Next ناجح؛ لم تختبر رحلة المستخدم والعدادات على DB. | dashboard/page.tsx; workspace.controller.ts; onboarding/page.tsx |
| 43 | P1 | Security يعرض الأجهزة الحالية والسابق تسجيلها وسجلات Login/Data Delete/Media Delete؛ صفحة مماثلة غير مثبتة في واجهة Boat Two | IN PROGRESS | afd9543 أضاف device_label وlast_seen_at وis_current وإبطال الجلسة الحالية. لا عرض IP علني. نجح اختبار قطع realtime عند إبطال الجلسة، لكن رحلة الأجهزة وسجل الحذف وكتابة مهاجرة 087 لم تختبر على DB/متصفح. | auth.guard.ts; sessions.controller.ts; sessions/page.tsx; realtime.test.ts; audit/page.tsx |
| 44 | P1 | Settings & Integration في المرجع تصنيف Security / API Integration ثم أنواع تكاملات كثيرة | IN PROGRESS | صفحة integrations تجمع Google/Mailing/Email/SMS/Salla/Webhooks مع توضيح التفويض وMock وسجل التسليم، والربط الرسمي منفصل عن المتقدم. Settings/Security العامتان ليستا مطابقَتين بصريًا بعد؛ اختبار الرحلة للمرحلة الثانية. | integrations/page.tsx; integrations.controller.ts; MetaConnect.tsx; settings/page.tsx |
| 45 | P1 | Package Manager يعرض صلاحيات وحزم ومؤشرات؛ Boat Two فيها Billing/Plans لكن مفهوم package-manager للمستأجر ليس مماثلًا | IN PROGRESS | Billing/Plans وحدود الاستخدام والفصل بين دور المشترك وإدارة المنصة موجودة، واختبارات أمان أدوار المنصة ناجحة. لم تختبر مقارنة Package Manager وصلاحيات الباقات كاملة في DB/واجهة. | billing/page.tsx; plans.service.ts; platform/permissions.test.ts; workspace.controller.ts |
| 46 | P2 | Account menu موحدة: Account / Billing / Security / Support / API Developer | IN PROGRESS | قائمة الحساب الموحدة وروابط Billing/Security/Support/Developer وصفحات الدعم والمطور أضيفت في a79ff29 وتبني بنجاح. التحقق التفاعلي والتنقل حسب الدور في المتصفح لم ينفذا بعد. | dashboard/layout.tsx; support/page.tsx; developer/page.tsx |
| 47 | P1 | مؤشرات الشريط العلوي Subscriber/Message/AI Token في المرجع واضحة بصريًا | IN PROGRESS | a79ff29 أضاف بيانات استخدام الشريط من workspace API؛ AI Token مخفي حين لا تتوفر الميزة. البناء وفحص الأنواع ناجحان؛ حالات صفر/حدود فعلية تحتاج DB واختبار واجهة. | dashboard/layout.tsx; workspace.controller.ts |
| 48 | P1 | الصورة تعرض API Integration لأنواع Email/SMS وسلة تجارة؛ ربط مزودين خارجيين قد يسبب تكلفة | BLOCKED | واجهات اتصال مشفرة وMock وطلبات مزود لـEmail/SMS/Salla والمزودات البريدية موجودة؛ لا تفعيل تلقائي، والتشغيل يتطلب enabled وEXTERNAL_DELIVERY_ENABLED. Email/SMS بوابة HTTPS عامة وليسا اعتماد مزود بعينه، وSalla قراءة منتجات فقط. الاعتماد والتكامل التجاري الكامل غير مختبرين. | integrations.service.ts; provider-request.ts; contracts.test.ts; integrations/page.tsx |
| 49 | P0 | الكود واللقطات لا يكفيان للحكم أن الوظائف شغالة أو تطابق 100% | BLOCKED | بناء API وNext production نجح محليًا بعد استكمال الاعتمادات؛ عائق الخطوط القديم أزيل سابقًا في 320ecaa. القبول النهائي E2E واللقطات وبيانات DB ومرجع الصور مؤجلة صراحة للمرحلة الثانية؛ ليست فشل بناء حاليًا. | راجع التحقق أدناه؛ scripts/test-ux19.mjs |
| 50 | P0 | البيانات والرقم الحقيقيين في الحساب لا يجوز استخدامها لاختبارات حية غير مطلوبة | DONE | استمرار من afd9543 على نفس الفرع مع commits وpush عادي بعد كل وحدة؛ لا force أو دمج main أو Railway أو تشغيل قنوات/نشر/مزودات حية أو AI مدفوع. الاختبارات محلية وMock فقط. | PR #2; سجل git |
| 51 | P0 | شاشات المرجع مصورة على هاتف مع واجهة Desktop مضغوطة؛ لا يمكن استنتاج جودة الهاتف منها | IN PROGRESS | RTL/LTR وتخطيط 40 عقدة ناجحان؛ التحقق الفعلي 320/390/768/1440 وتكبير النص 200% للمرحلة الثانية. | test-ux19.mjs; globals.css |
| 52 | P1 | محركات الواجهة لا بد أن تعطي مستخدمًا جديدًا طريقة البدء بدون دورة تدريبية | IN PROGRESS | القوالب والمعالج والمحاكي والعقود وحفظ المسودة موجودة، ونجحت 6 مجموعات عقود UX. المسار من التسجيل إلى المحاكاة/نشر تجريبي عبر حساب وDB لم يختبر في المتصفح؛ هذا قبول المرحلة الثانية. | onboarding/page.tsx; flows/new/page.tsx; TestPanel.tsx; scripts/test-ux19.mjs |

## العمل المحلي والقبول المتبقي — لا يُعد تفويضًا خارجيًا

- Telegram: المجموعات وتنزيل الوسائط ليستا منفذتين، ولو تم توفير token.
- سياق القناة وصل إلى مدير البوت ومساحة البوت وCRM والوارد؛ لم يُعمم على الحملات والتسلسلات والتجارة والتكاملات.
- مؤشر الكتابة متاح لثلاث قنوات فقط؛ WhatsApp/Webchat لا يقدمان مؤشرًا فعليًا بهذا التنفيذ.
- Google Contacts كميزة مزامنة مستقلة غير منفذة؛ Salla قراءة منتجات فقط، وEmail/SMS بوابات عامة لا اعتماد مزود محدد.
- تشغيل Webhooks لكل أحداث CRM/Reminder، عامل النشر الاجتماعي، سياسات SLA والتوقيع، reset-actions، عدادات Dashboard، وحدود الباقة يحتاج تحققًا عبر PostgreSQL/المتصفح. النجاح في build أو اختبار payload لا يثبت نجاح هذه المسارات كاملة.

## تسليم المرحلة الثانية

تبدأ المرحلة الثانية من HEAD الحقيقي للفرع. جهّز PostgreSQL تجريبيًا، طبّق المهاجرات 082–087 واختبر RLS والحفظ وإعادة الفتح والتزامن، ثم رحلة شركة السياحة بالعربية والإنجليزية ومقاسات 320/390/768/1440 وتكبير النص 200%. اختبر Webhooks/الجدولة/التوقيع/SLA والجمهور وموافقات التسويق بموصلات Mock. التفويض الحي لأي مزود منفصل، ولا تفعيل أو نشر أو دمج لمجرد وجود الشيفرة. البنود IN PROGRESS أعلاه لم تُحوّل إلى اكتمال لمجرد تأجيل القبول.
