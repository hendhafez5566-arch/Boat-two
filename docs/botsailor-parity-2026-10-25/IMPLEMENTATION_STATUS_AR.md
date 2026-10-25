# حالة تنفيذ الأمر الأول — 25 أكتوبر 2026

هذه **دفعة تنفيذ كبيرة، وليست إعلان إنهاء المرحلة أو مطابقة 100%**. الحالات أدناه تفصل بين الكود المكتمل محليًا وبين القبول النهائي. `DONE` يعني اكتمال النطاق البرمجي المذكور، ولا يلغي اختبار المرحلة الثانية. `IN PROGRESS` يعني وجود عمل برمجي/قبول متبقٍ؛ لا يُنسب إلى موافقات خارجية إذا كان السبب نقص تنفيذ. `BLOCKED` يوضح الاعتماد الخارجي أو الاختبار المؤجل بدقة.

- المستودع: `hendhafez5566-arch/Boat-two`
- الفرع: `fix/boat-ux-19-one-batch`
- PR: https://github.com/hendhafez5566-arch/Boat-two/pull/2
- HEAD برمجي عند إعداد هذا الملف: `bbdbf53ad655766d9b25588a435959a23abbd435`؛ يلي ذلك مخطط التسلسلات وحفظ حالة التسليم في Commit هذه الوثيقة.
- المصدر الأصلي المتحقق قبل البرمجة: `e6d04d0ccd40e559de7d4bac8ac7af65c34d7fb6`. لا AGENTS.md في شجرة الفرع.
- استُعيدت الملفات النصية من موصل GitHub وفُحصت SHA، لأن Git/network proxy في الطرفية لا يعملان. رُفعت الوحدات بإنشاء Git tree/commit ثم تحديث الفرع fast-forward مع expected SHA؛ لم تُستبدل الملفات الثنائية أو الملفات غير المعدلة.

## الوحدات المرفوعة

| Commit | الوحدة |
|---|---|
| d5dc06c | بطاقات الأزرار في التحرير |
| 3683bc7 | القنوات الموجهة ودليل حالة الاتصال |
| 737df72 | أفعال الضغط والقوائم وتحويل الموظف/القسم |
| cc3ff37 | استيراد/تصدير ومجلدات وأسئلة اختيارية |
| f097f48 | سياسات ساعات العمل والجلسة والساعة الوهمية |
| 25e2ca3 | Header/Footer وتأخير إرسال دائم ومعاينات |
| 2fd666d | مساحة البوت وسجل الأخطاء والتحرير المباشر ومصدر الإحصاءات |
| bbdbf53 | Telegram خاص عبر Adapter وطابور وارد موثوق |

## التحقق خلال البرمجة

- نجح بناء API عبر `tsc -p apps/api/tsconfig.json` وفحص Web عبر `tsc -p apps/web/tsconfig.json --noEmit` بعد استعادة 426 حزمة متاحة من cache محلي منفصل. لم تُغيّر ملفات اعتماد المشروع لتجاوز الشبكة.
- نجحت 36 حالة للمحرك، 5 أفعال/أسئلة، 3 سياسات وقت، 2 رسالة تفاعلية/تأخير، 3 Telegram، 3 بطاقات مصمم، 2 إيصالات/عزل شركات، 2 دليل اتصال، 1 انتقال ملف، 3 توسيع subflow، 4 Webhook أصلي: **64 حالة**. هذا فحص برمجي مركز، لا اختبار قبول نهائي.
- نجحت 6 مجموعات عقود `scripts/test-ux19.mjs` وفحص `node --check` للويدجت وwhitespace.
- Next production build **لم ينجح**: أبلغ webpack بالفشل دون تفاصيل إضافية في هذه البيئة. الحزمتان `@fontsource-variable/dm-sans` و`@fontsource-variable/noto-sans-arabic` غير موجودتين محليًا، وفشلت محاولة تنزيلهما بسبب proxy. لا ندّعي نجاح bundle أو معاينة بصرية.
- لا PostgreSQL تجريبي متاح لتطبيق/اختبار migrations هنا؛ لم تُنفذ أي migration على بيانات عميل. يجب اختبار migrations 082/083/084 في بيئة تجريبية مع RLS قبل أي نشر.
- لا صور BotSailor الأصلية محليًا، ولا مقارنة صور مُدعاة. لم يُشغل اختبار قناة حقيقية أو Webhook setup أو Meta authorization.

## مصفوفة البنود الـ52 بترتيب تقرير AUDIT_AR

الحالات: DONE=18، IN PROGRESS=28، BLOCKED=6.

| # | أولوية | البند | الحالة | المنجز/المتبقي والسبب | ملفات الدليل |
|---|---|---|---|---|---|
| 01 | P0 | مكتبة الربط المرجعية تقدم 6 قنوات/تكاملات مستقلة؛ Boat Two في ChannelType تدعم web/whatsapp/facebook/instagram فقط | DONE | ست بطاقات، Google تكامل مستقل، Telegram موصل فعلي مع قيد الاختبار الحي. | ChannelCatalog.tsx; channels/page.tsx |
| 02 | P0 | واجهة Boat Two تعرض اسم القناة وحقول معرفات/Token التقنية مباشرة بينما الصورة تقدم بطاقة اتصال موجهة | DONE | Meta الرسمي افتراضي، الحقول اليدوية تحت اختيار متقدم؛ Telegram له تعليمات BotFather. | MetaConnect.tsx; channels/page.tsx |
| 03 | P0 | الصورة تعرض حسابًا متصلاً وبجانبه حالة Active؛ Boat Two تحتاج فصل حالة محلية عن اتصال مزود مثبت | DONE | GET Meta/getMe Telegram، دليل اتصال مؤرخ ينتهي بعد 24 ساعة؛ تعطيل محلي منفصل وحماية سباق تغيير الرمز. | connection-health.ts; channels.service.ts |
| 04 | P0 | إعداد WhatsApp الرسمي موجود في Boat Two؛ مسار التعايش مع تطبيق واتساب Business لا يظهر كخيار مباشر أو مثبت | BLOCKED | واجهة Cloud/coexistence وميزة Embedded Signup جاهزة؛ أهلية الرقم واعتماد تطبيق Meta لم يُختبرا ولا يمكن إثباتهما دون تفويض حي. | MetaConnect.tsx |
| 05 | P1 | المرجع يجمع عدد القنوات ومتصلة وقاربت الانتهاء ومنقطعة أعلى الصفحة | DONE | مؤشرات قابلة للتصفية وبحث مشتقة من دليل الاتصال، لا من active وحده. | channels/page.tsx |
| 06 | P1 | أيقونات الهوية للقنوات وألوان زر الاتصال تختلف حسب المزود؛ الحالية أزرار عامة | DONE | SVG لكل مزود وألوانه، دون شعار BotSailor. | ChannelCatalog.tsx |
| 07 | P1 | الصورة تعرض Telegram مستقلًا؛ غير موجود ضمن أنواع القنوات في Boat Two | IN PROGRESS | موصل Telegram وارد/صادر، طابور دائم، تحقق سر، أزرار ومعرّفات ثابتة واختبارات Mock ناجحة. لم يُسجل أي Webhook فعلي. مجموعات وتنزيل الوسائط وcallback acknowledgement غير مدعومة بعد؛ يلزم اختبار خاص حي. | telegram.adapter.ts; telegram.test.ts; 084_telegram_channel.sql |
| 08 | P1 | Google يظهر كخيار Connect Google، بينما Sheet Fetch الحالي يعتمد رابط CSV عام | BLOCKED | قراءة Google Sheet العام موجودة، ولا يُدّعى وجود OAuth أو كتابة. يلزم تنفيذ OAuth/كتابة ثم إعداد Client ID وتفويض حساب؛ لم تُستدعَ خدمات Google. | engine/sheet.ts; Bot workspace |
| 09 | P0 | الأزرار المستقلة في الكود تُرسم في وضع analytics فقط، بينما المرجع يظهرها في وضع البناء العادي | DONE | بطاقات الأزرار والصفوف تظهر دائمًا في التحرير، والحفظ يبقي العقد/الوصلات والمعرّفات الأصلية. | flows/[id]/page.tsx; flow-cards.test.ts |
| 10 | P0 | الكروت في المرجع تظهر منفذ reply/next/button وحالاتها بشكل متسق وتوصيل مريح | IN PROGRESS | حافظنا على تخطيط 40 عقدة وRTL/LTR؛ يلزم قبول مرئي وتفاعل لمس في المرحلة الثانية. | flow-types.ts; test-ux19.mjs |
| 11 | P0 | الصورة تعرض أفعال ضغط متقدمة مستقلة داخل زر: وسوم، قوائم، تسلسل، تعيين فريق، Webhook، Calendar | IN PROGRESS | ستة أفعال مركبة محفوظة: حقل/وسوم/قوائم/تسلسل/إسناد/Webhook، إيصالات تنفيذ وعزل شركات؛ Calendar غير متاح دون موصل وتفويض. | flow-actions.service.ts; ButtonActionsEditor.tsx; button-actions.test.ts |
| 12 | P0 | صور المستخدم تبرز سحب العقد وتحريرها بلوحة جانبية دون إخفاء المخطط | DONE | النقر على بطاقة زر يفتح محرر أفعاله مباشرة في Inspector دون مغادرة المخطط. | Inspector.tsx; MessageEditor.tsx; flows/[id]/page.tsx |
| 13 | P1 | المرجع يحتوي خيارات إضافية ظاهرة مثل WhatsApp Flows وAppointment وProduct/Section/Row | IN PROGRESS | حالات عدم الإتاحة ظاهرة في مساحة البوت؛ لم تُنفذ عقد WhatsApp Flows/Appointment/Product كاملة. ليست ميزات منفذة لمجرد ظهور أسمائها. | flows/[id]/workspace/page.tsx |
| 14 | P1 | كروت المرجع تعرض إحصاءات Sent/Delivered/Subscribers/Errors باستمرار | DONE | مؤشرات العقد والأزرار ظاهرة أثناء التحرير؛ — عند تعذر المصدر، وصفر عند نجاح API دون أحداث. | stats-context.ts; FlowNodeView.tsx; FlowButtonNode.tsx |
| 15 | P1 | المرجع يحتوي نوع خاص Start Bot Flow مع إعدادات trigger keyword ومطابقة Exact/String | DONE | مطابقة trigger exact/contains وأول/أي رسالة موجودة ومحفوظة؛ حافظنا على المحرك واختباراته. | engine/triggers.ts; engine.test.ts |
| 16 | P1 | المرجع يعرض إعادة استخدام الحملات وحفظ مجلدات واستيراد Flow واختيارات الإدارة | DONE | استيراد/تصدير إصدار Boat Two موثق، مسودة جديدة دون قنوات/نشر؛ مجلد نصي قابل للنقل مع حماية تعارض الحفظ. | flow-transfer.test.ts; flows.service.ts; 083_flow_folders.sql |
| 17 | P1 | التخطيط المرجعي واضح في لقطة الهاتف مع تحريك وتكبير؛ لكنه ليس دليلًا على استجابة الهاتف | IN PROGRESS | واجهة الهاتف الحالية محفوظة؛ CSS القنوات متجاوب. لم يُنفذ قبول لمس/لقطات 390/768/1440. | globals.css; flows/[id]/page.tsx |
| 18 | P0 | زر BotSailor يسمح بتعيين Group وUser منفصلين؛ Boat Two handoff يدعم assignTo مستخدم لا فريقًا من العقدة | IN PROGRESS | إسناد مستخدم/قسم مع التحقق من العضوية وعزل الشركة وإيقاف البوت. SLA القسم الحالي يبقى؛ تصعيد جديد واختبار استلام موظف حي لم يُنجزا. | flow-actions.service.ts; flow-runtime.service.ts |
| 19 | P0 | User Input Flow بالمرجع يشمل اسم حملة ووسوم وقوائم وتصدير Webhook؛ نموذج Boat Two الحالي أسئلة/إجابة/رسالة ختام | DONE | أفعال نهاية User Input بعد جميع الإجابات الصحيحة، حفظ حقول وتخطي اختياري؛ المحاكي يعلن أفعال Mock ويحفظ حقوله بين الأدوار. | engine/engine.ts; flows.service.ts; Inspector.tsx |
| 20 | P1 | محرر الرسالة بالمرجع فيه نص واضح وعناصر متغيرات ورموز وعداد أحرف | DONE | منتقي المتغيرات محفوظ، عداد وحدود 4096/1024 وإيضاحات العنوان والتذييل. | MessageEditor.tsx |
| 21 | P1 | Delivery Options في المرجع تشمل typing indicator وSmart Delay بالساعات والدقائق والثواني | IN PROGRESS | Smart Delay دائم بالساعات/الدقائق/الثواني، استئناف العقدة نفسها دون تكرار. Typing غير مدعوم ومعلن كذلك؛ لا ادعاء بمحاكاة مؤشر مزود. | engine/engine.ts; interactive-message.test.ts |
| 22 | P1 | Interactive Message مقسمة Header Type (نص/وسائط)، Body وFooter وDelivery | DONE | عنوان نص/صورة، body/footer، محول WhatsApp أصلي، تحويل صريح على Meta، عرض في الويدجت والوارد والمحاكي؛ قيود قناة موثقة. | message-content.ts; whatsapp.adapter.ts; MessageEditor.tsx; interactive-message.test.ts |
| 23 | P1 | السؤال بالمرجع يدعم free keyboard وmultiple choice، تحقق، حفظ System/Custom، خيار Skip | IN PROGRESS | تحقق نص/رقم/بريد/هاتف والاختيارات والتخطي وحفظ Custom مكتملة؛ حفظ حقول النظام name/email/phone كوجهة مستقلة لم يُضف. | flow-schemas.ts; engine/engine.ts; button-actions.test.ts |
| 24 | P1 | إعدادات العقد في المرجع أقسام واضحة بعنوان ومساعدة واختيار مع Save Changes ثابت | DONE | Inspector الحالي وأقسامه والحفظ محفوظة مع محررات الأفعال وسياسات البوت. القبول المرئي النهائي للمرحلة الثانية. | Inspector.tsx; BotPolicyEditor.tsx |
| 25 | P2 | إجراءات اختيار نص Button Generation Method ونوع Pressed Action تظهر كبطاقات/قوائم مستقلة | DONE | منتقي أفعال واضح ومترجم، ترتيب وحذف، Calendar معطل بسبب غياب الموصل/التفويض. | ButtonActionsEditor.tsx |
| 26 | P0 | المرجع يختار Channel ثم Bot ثم Feature ويضع Tabs وظائف واضحة؛ في Boat Two وظائف موزعة على قائمة صفحات منفصلة | IN PROGRESS | مساحة بوت موحدة بتبويبات Automation/Data/Commerce/Integrations/Errors وملخص قنوات؛ اختيار القناة ثم البوت وتصفية كل الصفحات بالسياق لم يكتمل. | flows/[id]/workspace/page.tsx |
| 27 | P1 | إعدادات عامة للـNo-match/Get Started/تكرارها/إيقاف رد البوت أثناء استلام الموظف | IN PROGRESS | no-match لاختيار غير صالح ومدة الجلسة وسياسة توقف البوت أثناء الموظف؛ خيارات Get Started وتواتر البداية الشاملة لم تُضف. | engine/engine.ts; BotPolicyEditor.tsx |
| 28 | P1 | المرجع يعرض تفعيل Webhook حسب نوع حدث مستقل بما فيه حالة التسليم وCRM وReminder | IN PROGRESS | Webhook للضغط ونهاية جمع البيانات مع منع إعادة الإرسال الغامضة، وحماية SSRF؛ لوحة Webhook منفصلة لكل نوع حدث وتسليم/CRM/Reminder لم تُنفذ. | flow-actions.service.ts; events/external-effect.ts |
| 29 | P1 | ساعات العمل مرجعية على مستوى البوت وجدول أسبوعي وحالات تشغيل/إيقاف + بوت خاص خارج الدوام | IN PROGRESS | سياسات عمل أسبوعية وتوقيت/DST وتأجيل البداية/التأخير، رسالة خارج الدوام. مسار بوت بديل خارج الدوام لم يُضف. | engine/hours.ts; bot-policy.test.ts; BotPolicyEditor.tsx |
| 30 | P1 | إعداد Shared Inbox يحتوي توقيع تلقائي ومدة صلاحية جلسات ومعالجة أخطاء التسليم | IN PROGRESS | مدة جلسة جمع البيانات قابلة للضبط ويحترم المحرك استلام الموظف؛ توقيع تلقائي ووسم أخطاء التسليم ومدة جلسة موظف مخصصة لم تُضف. | flow-runtime.service.ts |
| 31 | P1 | المرجع يعرض Auto Responder Email lists وGoogle contacts/sheets | BLOCKED | تكاملات Auto Responder وGoogle الخاصة غير مفعلة؛ يلزم تنفيذ موصلات ثم تفويض مقدم الخدمة. عرضنا عدم الإتاحة بصراحة دون إرسال أو تكلفة. | Bot workspace integrations |
| 32 | P1 | Bot Options تتضمن إدارة متغيرات ومجلدات وسجل أخطاء واستيراد | IN PROGRESS | مجلدات واستيراد وسجل آخر 50 خطأ ومتغيرات مقروءة؛ إدارة/تحرير متغيرات مستقلة وReset Action Buttons لم تُنفذ. | flows/[id]/workspace/page.tsx; flows.controller.ts |
| 33 | P1 | Subscribers فيها فلاتر مركبة بالقنوات والوسوم والقوائم والتسلسلات والحالة مع شرائح أرقام | IN PROGRESS | CRM الأصلي محفوظ وأضيفت قوائم فعلية، لكن فلاتر مركبة للقناة والقائمة والتسلسل مع شرائح مستعادة لم تكتمل. | crm/page.tsx; crm/lists/page.tsx |
| 34 | P1 | المرجع يفصل Labels وLists وCustom Fields في إدارة المشتركين؛ Boat Two يدعم tags/fields/segments لكن ليس بالضرورة نفس مفهوم Lists | DONE | قوائم منفصلة عن tags وsegments: إنشاء/عضويات/إزالة/أفعال زر، FK مركب وRLS لكل شركة. لا تتحول العضوية لموافقة تسويق. | contact-lists.controller.ts; 082_flow_actions_lists.sql; crm/lists/page.tsx |
| 35 | P1 | واجهة الوارد المرجعية متعددة القنوات؛ Boat Two عنده Inbox فعلي ويحتاج مراجعة تصنيفات قنوية ورسائل القوالب | IN PROGRESS | الوارد الأصلي محفوظ ويدعم العنوان/التذييل الجديد؛ القبول متعدد القنوات واختبار موظف لم يُنفذا. | inbox/MessageBubble.tsx |
| 36 | P1 | Status Retained/Subscribed/In Sequences يظهر في المرجع بجانب جهات الاتصال | IN PROGRESS | حافظنا على موافقة التسويق المنفصلة وآليات sequence الحالية؛ شارات الحالات المقارنة المطلوبة لم تُضف كاملة. | sequences.service.ts; contact_consents الحالي |
| 37 | P1 | التسلسلات في المرجع مرئية كعقد مترابطة؛ Boat Two تستخدم مراحل متتالية في صفحة Sequences | DONE | مخطط مرئي مرتبط بخطوات التسلسل الحقيقية، ينتقل لمحرر الخطوة ومعرّفها؛ إعادة ترتيب/توقيت/حفظ المحرك الأصلي محفوظة. | sequences/page.tsx; schedule.test.ts الحالي |
| 38 | P1 | Social Posting يعرض Multimedia وCTA وCarousel/Video في المرجع؛ لا تظهر له صفحة مستقلة في Boat Two | IN PROGRESS | Social Posting لم يُنفذ كميزة مسودات/نشر كاملة؛ لا يوجد موصل نشر معتمد أو تفعيل، وعدم الإتاحة معلن. | Bot workspace integrations |
| 39 | P1 | خيارات Product/Section/Row تشير إلى تجارة داخل مصمم BotSailor، وليست مجرد صور منتج | IN PROGRESS | كتالوج/بطاقات منتج بمعرفات وأسعار لم تُنفذ؛ الوسائط/CTA الحالية محفوظة ولا تُسمى منتجات أصلية. | Bot workspace commerce |
| 40 | P1 | الحملات والرسائل تحتاج عرض إحصائيات موحّد وإظهار حالات Pending/Failed بدقة | IN PROGRESS | حملات ودفتر تسليم قائم محفوظ؛ لم تُستكمل إعادة التنظيم والقبول التجاري المطلوبان في هذه الدفعة. | campaigns/page.tsx الحالي |
| 41 | P2 | صورة الربط وإدارة الاشتراكات تظهر عناصر تسويقية خارج CRM الاعتيادي | BLOCKED | الموافقة وإلغاء الاشتراك الموجودان لم يتغيرا؛ تكاملات تسويق طرف ثالث تحتاج موصلات وتفويضًا منفصلًا ولم تُفعّل. | Bot workspace integrations |
| 42 | P1 | Dashboard تظهر اختصارات New Broadcast/Open Inbox/Create Flow/Connect Channel وأعداد الاستهلاك ورسائل تنبيه | IN PROGRESS | Dashboard ورحلة البداية القائمتان محفوظتان، ولم تُنجز إعادة تصميم كاملة وقبول الرحلة المرجعية. | dashboard/page.tsx; onboarding/page.tsx الحاليان |
| 43 | P1 | Security يعرض الأجهزة الحالية والسابق تسجيلها وسجلات Login/Data Delete/Media Delete؛ صفحة مماثلة غير مثبتة في واجهة Boat Two | IN PROGRESS | صفحة Sessions وإبطال الجلسات وسجل Audit موجودة مسبقًا؛ لم تُراجع رحلة الأجهزة/الحذف بصريًا أو حيًا في هذه الدفعة. | sessions/page.tsx; audit/page.tsx الحاليان |
| 44 | P1 | Settings & Integration في المرجع تصنيف Security / API Integration ثم أنواع تكاملات كثيرة | IN PROGRESS | فصلنا الربط الرسمي عن المتقدم وأضفنا مساحة التكاملات؛ إعادة بناء Settings/Security/API Integration كلها لم تكتمل. | ChannelCatalog.tsx; MetaConnect.tsx |
| 45 | P1 | Package Manager يعرض صلاحيات وحزم ومؤشرات؛ Boat Two فيها Billing/Plans لكن مفهوم package-manager للمستأجر ليس مماثلًا | IN PROGRESS | الباقات/حدود الاستخدام الحالية محفوظة؛ مقارنة Package Manager وصلاحيات إدارة المنصة لم تُستكمل. | billing/page.tsx الحالي |
| 46 | P2 | Account menu موحدة: Account / Billing / Security / Support / API Developer | IN PROGRESS | تنقل الحساب الحالي محفوظ؛ قائمة موحدة جديدة تتضمن Support وAPI Developer لم تُنفذ. | dashboard/layout.tsx الحالي |
| 47 | P1 | مؤشرات الشريط العلوي Subscriber/Message/AI Token في المرجع واضحة بصريًا | IN PROGRESS | مؤشرات الاستخدام الموجودة لم تتغير؛ إعادة تنظيم شريط Subscriber/Message/AI Token لم تكتمل. | dashboard/layout.tsx الحالي |
| 48 | P1 | الصورة تعرض API Integration لأنواع Email/SMS وسلة تجارة؛ ربط مزودين خارجيين قد يسبب تكلفة | BLOCKED | Email/SMS/Salla ومزودون تجاريون غير مفعّلين. لا حسابات/أذونات موفرة لهذه التكاملات؛ الموصلات المطلوبة لم تُستكمل ولم تُستهلك أرصدة. | Bot workspace integrations |
| 49 | P0 | الكود واللقطات لا يكفيان للحكم أن الوظائف شغالة أو تطابق 100% | BLOCKED | القبول النهائي واللقطات وE2E مؤجلة بتوجيه المالك للمرحلة الثانية؛ الصور الأصلية ليست منشورة. Next production build فشل محليًا وحزمتا الخطوط غير متاحتين في cache/network. | راجع قسم التحقق |
| 50 | P0 | البيانات والرقم الحقيقيين في الحساب لا يجوز استخدامها لاختبارات حية غير مطلوبة | DONE | العمل كله على الفرع المحدد عبر API دون force؛ لا دمج أو Railway أو تسجيل/فصل قناة حية أو تشغيل AI مدفوع. الاختبارات تستخدم بيانات وهمية. | PR #2; سجل الوحدات |
| 51 | P0 | شاشات المرجع مصورة على هاتف مع واجهة Desktop مضغوطة؛ لا يمكن استنتاج جودة الهاتف منها | IN PROGRESS | RTL/LTR وتخطيط 40 عقدة ناجحان؛ التحقق الفعلي 320/390/768/1440 وتكبير النص 200% للمرحلة الثانية. | test-ux19.mjs; globals.css |
| 52 | P1 | محركات الواجهة لا بد أن تعطي مستخدمًا جديدًا طريقة البدء بدون دورة تدريبية | IN PROGRESS | القوالب والمعالج والمحاكي محفوظة ومحسنة؛ رحلة تسجيل إلى نشر تجريبي كاملة لم تُنفذ في متصفح/DB تجريبي بعد. | onboarding/page.tsx; flows/new/page.tsx; TestPanel.tsx |

## تسليم المرحلة الثانية

ابدأ ببناء Next مع الاعتمادات الكاملة ثم DB تجريبية وتطبيق المهاجرات الجديدة، واختبر حفظ/إعادة فتح المسودات والـimports وtenant isolation. بعد ذلك نفذ رحلة شركة السياحة بالعربية والإنجليزية على المقاسات المطلوبة. لا تُفعّل تكاملًا خارجيًا أو webhook registration أو نشرًا حيًا لمجرد وجود الإعداد في المنتج. لا تُعد الحالات IN PROGRESS منجزة قبل تنفيذ ما بقي؛ ولا تُعد قائمة المتبقي مجرد موافقات خارجية.
