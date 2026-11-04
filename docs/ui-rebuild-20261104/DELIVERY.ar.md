# Boat Two — إعادة بناء الواجهة: تسليم مرحلي موثّق

تاريخ الفحص: 4 نوفمبر 2026. **نُفذت إصلاحات واجهة فعلية واختُبرت، لكن طلب المطابقة الشاملة لكل صفحة وحالة في BotSailor لم يكتمل. لا تُعتمد هذه المرحلة وحدها كقبول تجاري نهائي.**

## المرجع وخريطة الصفحات

استُخدمت الواجهة الحالية داخل حساب المالك في BotSailor. لم يظهر اختيار Beta/Legacy أو رقم إصدار مؤكد. لم يُستخدم الموقع التسويقي كأساس للتصميم. التفاصيل وخريطة الصفحات والفروق قبل التعديل في [REFERENCE-MAP.ar.md](REFERENCE-MAP.ar.md).

القياسات المرصودة تشمل قائمة 260px، شريطًا مصغرًا 90px، Topbar بارتفاع 70px، وdock مصمم يقارب 56px. في ربط الحسابات: عنوان 20.48px/700، عنوان بطاقة 14.8px/600، حقول وفلاتر 52px بحد دائري 8px، ورأس جدول يقارب 35px. تختلف أبعاد صفوف البيانات حسب محتواها، ولا يصح فرض ارتفاع واحد على جميع الصفحات.

## ما تغير فعليًا

- مكوّن DisclosureSummary مشترك في 41 موضعًا عبر CRM، الأتمتة، التقارير، الأقسام، الكتالوج، مصادر البيانات، الرسائل، الدعوات، والإعدادات. عنوان كامل قابل للنقر، أيقونة SVG واحدة، تدوير عند الفتح، وحدود ومسافات وحالات hover/focus موحدة. احتُفظ بـdetails/open/onToggle وسلوك Enter/Space الأصلي، بدل إخفاء العلامة فقط. المكونات السبعة المصممة بالفعل في Inbox/Account/Audience بقيت بمؤشراتها الموجودة حتى لا يظهر سهمان.
- قائمة مدير البوت وCRM تبدأ بشريط 90px، ويمكن توسيعها إلى 260px. لم تُحذف روابط المنتج أو صلاحياتها.
- إزالة قائمة التنقل المكررة بجوار أدوات مصمم التدفق. يبقى الرجوع لمدير البوت متاحًا في الشريط العائم.
- إحصاءات العقد تظهر فقط عند تشغيل عرض الأداء. تبقى بيانات الإحصاءات ووظيفتها كما هي.
- إظهار حذف العقد والوصلات عند الاختيار/hover/focus؛ تبقى الأزرار ظاهرة لأجهزة اللمس. لم يتغير منطق الحذف أو الربط.
- تخفيف شبكة canvas وتثبيت إجراءات جدول التدفقات أثناء التمرير، ومنع الشارة العربية للحالة من الانقسام إلى عمود طويل.
- إعادة ترتيب مساحات CRM: إزالة إطارات العنوان والفلاتر المتداخلة، تقليل padding المكرر، توحيد التسلسل الطباعي، وتخفيف زخرفة ملف العميل مع الحفاظ على قائمة العملاء والبروفايل والوظائف الإضافية.
- إصلاح تصنيف صفحة إعدادات Inbox داخل shell حتى تحصل على الهوامش الصحيحة.
- إصلاح امتداد اختصارات Dashboard عند 320px، وتجاوز تبويبات Settings عند 320/360px.
- تحسين تباين النصوص الثانوية، وشارات حالة المشترك، وأسماء التبويبات، والأجهزة المتصلة. أضيف Escape لقائمة الحساب مع إعادة التركيز لزرها.
- حقول select تحتفظ بسلوكها الأصلي للبحث ولوحة المفاتيح، مع مؤشر واحد موحد وموقع صحيح في RTL/LTR، واستعادة المظهر الأصلي في وضع forced colors.

لا تعديل في API أو migrations أو قاعدة البيانات أو تنسيق التدفقات المحفوظة. لا تغييرات على WhatsApp الحقيقي أو Meta أو Webhooks أو بيانات العملاء. لم يُستخدم Railway AI Agent.

## الصفحات التي اختُبرت فعليًا

الاختبار الآلي استخدم Next production build وNest AppModule الكامل، مع قاعدة PGlite معزولة وتفعيل RLS وبيانات اصطناعية، وليس mocks للواجهات أو حساب العميل الحقيقي.

| الصفحة | المسار | مصفوفة العرض |
|---|---|---|
| Dashboard | /dashboard | 6 مقاسات × لغتين |
| Channels | /dashboard/channels | 6 × 2 |
| Bot Manager | /dashboard/flows | 6 × 2 |
| Flow Builder | /dashboard/flows/[id] | 6 × 2 |
| Inbox | /dashboard/inbox | 6 × 2 |
| Inbox Settings / Assignment | /dashboard/inbox/settings | 6 × 2 |
| Customers | /dashboard/crm | 6 × 2 |
| CRM Overview | /dashboard/crm/overview | 6 × 2 |
| Pipeline | /dashboard/crm/pipeline | 6 × 2 |
| Tasks | /dashboard/crm/tasks | 6 × 2 |
| Smart Sales | /dashboard/crm/sales | 6 × 2 |
| Team | /dashboard/team | 6 × 2 |
| Departments | /dashboard/departments | 6 × 2 |
| Campaigns | /dashboard/campaigns | 6 × 2 |
| Reports | /dashboard/reports | 6 × 2 |
| Automations | /dashboard/automations | 6 × 2 |
| Settings | /dashboard/settings | 6 × 2 |
| Billing | /dashboard/billing | 6 × 2 |
| Onboarding | /dashboard/onboarding | 6 × 2 |
| Commerce | /dashboard/commerce | 6 × 2 |
| Sequences | /dashboard/sequences | 6 × 2 |
| Knowledge | /dashboard/knowledge | 6 × 2 |
| Account | /dashboard/account | 6 × 2 |

المقاسات: 320، 360، 390، 768، 1366، 1920px؛ الارتفاع 936px. **نجحت 276/276 حالة** في اتجاه النص واحتواء عرض المستند دون scroll أفقي غير مقصود. التمرير داخل الجداول والـcanvas والتبويبات مقصود. هذه نتيجة هندسية لاحتواء التخطيط، وليست إقرارًا بأن كل حالة بصرية تطابق المرجع. التقطت صور عند 390 و1366px وفُحصت عينات بصريًا، لا كل بكسل في كل صورة.

## الاختبارات والوظائف

| الفحص | النتيجة | الحد العملي |
|---|---|---|
| TypeScript / Production Build | ناجح | جميع مسارات Next تُبنى |
| API regression | 210/210 | اختبارات المستودع، قاعدة معزولة |
| Frontend lib tests | 15/15 | حقول العميل، قنوات وMeta signup؛ لا اتصال Meta فعلي |
| Smart Assignment | 29/29 | التخصص والسعة والتوافر والتأهيل والانتظار واستئناف الطابور وعزل الشركات |
| Assignment HTTP | 9 مجموعات ناجحة | Nest HTTP guards وRLS، على PGlite؛ ليست تجربة تحميل PostgreSQL منشور |
| Layout / RTL / LTR | 276/276 | الصفحات والمقاسات أعلاه |
| Accessibility | 8 فحوص دون مخالفات آلية | WCAG 2 A/AA و2.1 AA؛ مدير البوت وCRM وإعدادات Inbox وSettings، باللغتين فقط |
| Disclosure interactions | ناجحة باللغتين | Enter وSpace والماوس وسهم واحد، ثم فحص لمس منفصل |
| Flow interactions | ناجحة باللغتين | فتح المحرر وEscape، سحب العقدة وحفظها، الاحتفاظ بالوصلة، Zoom والنشر لقناة Webchat محلية معزولة |

ملفات النتائج: [local-evidence/results.json](local-evidence/results.json)، [deep-interaction-evidence/results.json](deep-interaction-evidence/results.json)، [assignment-resume-results.json](assignment-resume-results.json)، [assignment-http-results.json](assignment-http-results.json)، [api-tests.txt](api-tests.txt)، [web-tests.txt](web-tests.txt).

## الصور قبل/بعد

التُقطت صور المرجع داخل الحساب، ومنها Dashboard وChannels وBot Manager وFlow Builder ونافذة Configure Reference وSubscribers وCampaigns وSequences وTeam وBilling وTemplates وCatalog وWorkflow Reports وSocial Posting. صور تحوي أسماء أو معلومات حسابات لا تُضاف إلى المستودع العام. حزمة الصور الخاصة بالتسليم تحتوي الصور المناسبة للمشاركة وصور الاختبار الاصطناعية.

صور الاختبار المحلية الناتجة توثّق حالتي البيانات الفارغة والبيانات الاصطناعية حسب الصفحة. لم يُنفذ فرق صور آلي محسوب بين المنصتين، ولم توضع نسبة تطابق مصطنعة. لم تُنسخ أكواد أو أصول BotSailor إلى التطبيق.

## الفروق والعمل المتبقي

- لم تُنجز إعادة بناء مستقلة لكل صفحة وكل modal/dropdown وحالات loading/empty/error. بعض الصفحات استفادت من النظام المشترك فقط.
- لم تُفتح محادثة عميل في المرجع؛ تصميم Inbox المملوء وتفاصيل التحويل والاستلام يحتاجان مقارنة مرجعية أعمق مع حساب اختبار مناسب.
- Customer 360 وAssignment Queue وPipeline وSmart Sales ووظائف Boat الإضافية لا تملك مقابلًا مباشرًا مؤكدًا في الصفحات المرجعية المفتوحة؛ لم تُحذف لمحاكاة تشابه ظاهري.
- بقيت أدوات إضافية في Flow Builder مثل الاسم والمعاينة والنشر المنفصل؛ ليست أزرارًا مطابقة حرفيًا للمرجع، وتلزم مواءمة بصرية أدق دون تعطيل الوظائف.
- لا توجد مقارنة بكسل شاملة أو قبول بصري لكل صورة، ولا اختبار وصول شامل لكل تبويب وكل قارئ شاشة، ولا إعادة قبول تجاري لمدير وموظفين على الموقع المنشور ضمن هذه المرحلة.
- لم يُعاد اختبار حمل مستقل على PostgreSQL الحقيقي. النتائج الحالية للتوزيع محلية معزولة؛ لا تُنسب إلى قاعدة Preview.

## النشر والرجوع

يُستكمل هذا القسم بعد نشر commit المختبر والتحقق من الموقع المنشور. فرع العمل `feat/botsailor-fidelity-20261104` مبني على رأس PR #10. لا دمج إلى main.

خطة الرجوع للويب: إعادة pin مصدر خدمة `boat-preview-web` إلى commit ‏`504b4323cc7e601f1a6d35be98e8e9f7aa8668e3` على فرع `feat/smart-assignment-20261102`، أو إعادة deployment ‏`44a3dd4a-758c-4db7-bfaa-c2e67e7d9e30`، ثم فحص /login وDashboard وFlow Builder. لا تراجع schema مطلوب. تبقى API على ‏`572344fcab868a0542ff92ae125638e81cc573dd`.

**جاهزية هذه المرحلة: تحسينات واجهة مختبرة، وليست اكتمال High-Fidelity Rebuild أو تصريحًا بجاهزية البيع.**
