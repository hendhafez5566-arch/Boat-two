# سجل استكمال مطابقة Boat Two

آخر تحديث: 2026-11-08. الفرع: `feat/flow-builder-fidelity-20261107`، PR #14 مسودة. نقطة البداية المتحققة: `d5116324ec4c92d18709b84230486c6a8d4df464`.

## حدود الحالة

DONE لتدفق إدخال المستخدم تعني إغلاق نطاقه وفق توجيه المالك، ولا تعني اعتماد تطابق المنصة كاملة. نتائج الاختبارات السابقة في WORK_PROGRESS.md تاريخية حتى إعادة تشغيلها. لا تُسجّل PASS على أساس البناء وحده.

| القسم | الحالة | الدليل والفجوة والخطوة التالية |
|---|---|---|
| User Input Flow | DONE | مغلق بتوجيه المالك؛ لا إعادة تصميم، تراجع فقط عند اعتماد مباشر |
| Flow Builder الأساسي | DONE | التحسينات السابقة محفوظة؛ تبقى إجراءات متقدمة مستقلة أدناه |
| Bot Manager Settings | IN PROGRESS | فحص BotSailor الحي: General يعرض البريد وثلاثة مفاتيح وتكرار البداية وزر Publish Changes. Boat يفصل المسودة والتفعيل؛ الخدمة تدعم no-match وget-started enablement وساعات العمل ومهلة إدخال فقط. التكرار محفوظ لكنه غير مطبق؛ عُطّل تعديله مع تفسير صريح، وحُفظت قيمه السابقة. ترجمة أسماء أيام حقول الوقت المسموعة. يلزم قبول تفاعلي محلي وعزل شركات وأدوار قبل النشر |
| Message Templates | IN PROGRESS | توجد تقارير أقدم ودعم جزئي للقوالب؛ يجب فحص المرجع ودورة حفظ مستقلة قبل ادعاء المطابقة |
| Quick Actions | NOT STARTED | يلزم فحص التكوين وربط الإجراءات بالمحرك |
| Keyword Auto Reply / Triggers | NOT STARTED | توجد قائمة وتدفقات عاملة؛ يلزم مقارنة الإعداد والتشغيل دون إعادة المحرر |
| Sequences / Follow-up | NOT STARTED | تكوين الحملة الكامل فجوة سابقة |
| Webhook Workflows | NOT STARTED | ليس بديلًا عنها عرض إعدادات تكامل عامة؛ يلزم فحص نموذج التشغيل |
| Advanced Flow Actions | NOT STARTED | Notify Contact وRow وSection ودلالات مولد الحروف ومنتجات مرجعية ما زالت فجوات محفوظة |
| AI Agent Configuration / Agents | NOT STARTED | تدقيق المرجع وعقود التشغيل والصلاحيات؛ لا اتصالات مدفوعة |
| Knowledge Base / AI Responses | NOT STARTED | الاحتفاظ بالمحرك الموجود؛ مزود حقيقي وقبول خارجي غير معتمد |
| Chat Widget / Chat Entry Points | NOT STARTED | تدقيق الإعداد والحفظ والتشغيل عبر Webchat |
| Auto Responder | BLOCKED | قوائم المزود غير متصلة؛ لا نجاح وهمي |
| WhatsApp Flows | NOT STARTED | فحص المرجع والعقود فقط قبل تحديد اعتماد المزود؛ ممنوع إرسال حقيقي |
| Appointment Booking | NOT STARTED | يحتاج فحص رحلة مرجعية كاملة |
| Product Catalog / Sections / Messages | NOT STARTED | وظائف جزئية موجودة؛ قبول المزود/التكوين لم يكتمل |
| Google / Email / SMS | BLOCKED | إعدادات ظاهرية ومزودون غير معتمدين؛ يجب إثبات عقد فعلي لكل إعداد |
| Webhook Integrations | NOT STARTED | إبقاء قيود SSRF والأسرار وعزل الشركات |
| Shared Inbox / CRM | NOT STARTED | تدقيق المطابقة فقط، الاحتفاظ بالوظائف والبيانات الحالية؛ Regression قبل أي نشر |
| Smart Assignment / Human Handoff | DONE | الاحتفاظ بالمنطق العامل وفق المالك؛ اختبارات تراجع مطلوبة عند تغييرات التشغيل |
| Team / Users / Permissions | NOT STARTED | تدقيق الواجهة وحفظ الأدوار على الخادم |
| Channels | IN PROGRESS | تدقيق فقط؛ لا تعديل ربط Meta أو الأسرار أو رسائل حقيقية |
| Dashboard / Analytics / Reports | NOT STARTED | تدقيق البيانات والتصفية والواجهات بلغتين |
| Onboarding / Account Settings | NOT STARTED | تدقيق النماذج والحفظ والعزل |
| Subscription / Plan UI | NOT STARTED | تدقيق الواجهة فقط؛ لا تجاوز PLAN_LIMIT أو تعديل Billing |

## الدفعة الحالية

- المنتج: ManagerSettings.tsx فقط؛ لا تغيير محرك أو مخطط بيانات أو User Input Flow.
- مصدر إثبات عدم دعم التكرار: `activateBotSettings` في channels.service.ts وActiveBotSettings في bot-runtime-settings.ts. لا يُضاف تنفيذ للتكرار بتخمين قواعد المرجع.
- صور المقارنة الجديدة: لم تُحفظ بعد؛ المرجع يعرض بيانات حساب خاصة، لا ترفع لقطة كاملة للمستودع العام.
- اختبارات الدفعة: Web TypeScript PASS وESLint للمكوّن PASS؛ قبول المتصفح للتعديل الجديد لم ينفذ؛ فشل تشغيل pnpm قبل TypeScript بسبب فحص اعتمادات يتطلب TTY، وأُعيد باستخدام ملف TypeScript المثبت مباشرة دون تنزيل أو تغيير اعتماد.
- النشر: لا نشر لهذه الدفعة. Web السابق ناجح `097613d0-a898-4f92-8590-cbb3eb56ee6c`؛ API السابق فشل `56c37b89-9d7f-4244-a997-5033d19ac8ce` بسبب تنزيل mise HTTP 503/504. لا تكرر البناء قبل تحقق جديد.
- الخطوة التالية: إكمال قبول إعدادات General وBusiness Hour وShared Inbox في حساب Webchat المعزول، ثم باقي الإعدادات؛ بعد ذلك Message Templates.
- آخر commit لهذه الدفعة: يُعرّف بواسطة GitHub commit الذي أضاف هذا الملف مع تعديل المكوّن؛ يمنع إدراج SHA تخميني ذاتي.

## دفعة توقيع الموظف للقناة — تنفيذ محلي محفوظ

- BotSailor: فُتح Shared Inbox حيًا، ورُصد مفتاح التوقيع وحقلا انتهاء الجلسة ووسم فشل التسليم. لم يضغط Publish Changes ولم تُحفظ إعدادات المرجع.
- Boat Two: رُبط signatureEnabled بمحرك إرسال الموظف الفعلي كتجاوز اختياري خاص بالقناة في botManagerActive. تستخدم القناة قالب التوقيع الحالي في Inbox، أو القالب الافتراضي الموجود عند غيابه. المسودة لا تؤثر، والقنوات القديمة تستمر بسياسة مساحة العمل. لا تعديل لإعداد Inbox العام أو CRM أو مخطط قاعدة البيانات.
- 7/7 اختبارات HTTP حقيقية على Nest/PGlite: حفظ/استرجاع، تفعيل/تعطيل، منع تفعيل نسخة قديمة، استمرار الإعداد النشط أثناء تعديل المسودة، رسائل Inbox المحفوظة، الحفاظ على عميل CRM وحالة الموظف، قناة ثانية، عزل شركتين، Owner/Admin/Agent.
- 225/225 اختبارات API من المصدر PASS، وWeb production build وAPI build وWeb TypeScript وESLint المحدد PASS. هذا ليس إثبات مطابقة بصرية.
- حالات فشل البنية الاختبارية المحفوظة: تشغيل dist من مجلد خاطئ فقد fixtures (174/182)، ثم tsx CLI رفض IPC محلي؛ أعيد التشغيل من apps/api بواسطة node --import tsx ونجحت الاختبارات كلها. فشل أول HTTP لأن onboarding سبق إنشاء القناة، وصُحح ترتيب fixture دون إضعاف assertions.
- الأدلة: docs/platform-fidelity-20261108/channel-signature-http.json وapi-source-tests.txt وapi-unit.txt (الفشل السابق محفوظ)، scripts/qa-channel-signature.mjs، channel-signature.test.ts.
- BM-064: IN PROGRESS؛ التوقيع مرتبط بالتشغيل، لكن human session expiry وfailed delivery label ما زالا فجوتين. لا PASS للبند كاملًا.
- قبول المتصفح للتعديل الجديد، صور قبل/بعد، RTL/LTR والمقاسات الخمسة: BLOCKED حتى تتاح معاينة النسخة المعدلة عبر المتصفح المصرح؛ لم تُنشأ موارد/روابط إضافية ولم تُنشر دفعة غير معتمدة.
- Message Templates: فحص حي إضافي لقائمة Create أظهر Mixed/WP/Carousel Media/Carousel Product؛ Mixed يفتح نموذجًا داخل القسم يتضمن Basic Information، Locale، Category، Header، Message، Footer، Buttons، Live Preview، Save Draft وSave/Submit. تنفيذ Boat الحالي يفتح Dialog ويختلف في ترتيب الحقول؛ لا تطابق معلن. لا استدعاء Meta أو مزامنة أو حفظ في المرجع.
- النشر لهذه الدفعة: لم يحدث. PR14 يبقى Draft. الخطوة التالية: قبول مرئي للدفعة، ثم ربط بقية Shared Inbox من خلال عقود Inbox القائمة؛ لا محرك موازٍ.

## دفعة مهلة الموظف للقناة — 2026-11-08

- أُضيف humanSessionExpiryMinutes إلى الإعداد المفعّل، وربط بعامل InboxPolicyService الحالي واستعلام inbox_policy_due عبر migration 104. هذه توسعة للعامل القائم وليست محركًا موازيًا. تعيين الموظف يُزال ويعود التحكم للبوت عند انتهاء المهلة كما في سلوك Inbox الحالي؛ تُسجّل رسالة حدث داخلية مرة واحدة.
- absent/null يرجع لسياسة مساحة العمل، والقيمة الموجبة تتجاوزها للقناة فقط؛ تفعيل صفر يُرفض لأن معنى الصفر في المرجع لم يُثبت بتجربة تشغيل. لا يُخمن تعطيل المهلة بالصفر.
- اختبار PostgreSQL حقيقي: شركتان، أربع قنوات لكل شركة، إعداد نشط/قديم/مسودة/غير صالح، RLS، استعلام المرشحين والعامل الفعلي، إعادة التشغيل دون تكرار الحدث، وتطبيق migration 104 مرتين. PASS.
- API source227/227 PASS؛ اختبار HTTP بعد schema104:7/7 PASS ويتحقق أيضًا من وصول المهلة الصحيحة في رد التفعيل. API build وWeb TypeScript وESLint المحدد PASS. Web production build السابق نجح قبل تعديل نص الملخص الأخير؛ لا يُدعى بناء جديد لذلك النص.
- فحص المتصفح الحالي على قناة QA Webchat: تغيير الحساب وفتح General وتعديل بريد اصطناعي دون حفظ ثم Cancel أعاد القيمة المحفوظة وعاد زر التفعيل متاحًا. هذا baseline على Web d511 وليس قبولًا للكود الجديد. لم يُضغط Save أو Activate على الحساب الحي.
- BM-064 يبقى IN PROGRESS: التوقيع ومهلة الموظف مرتبطان بالتشغيل محليًا؛ وسم فشل التسليم والمقارنة البصرية ما زالا غير معتمدين.
- محاولة نشر API f24379f2 فقط ألغتها أداة Railway: Cancelled — the user did not approve this action / INVALID_ARGUMENT. لم يبدأ بناء جديد. أُعيدت قيمة المصدر المرحلية إلى d5116324 (القيمة الحية الأصلية). الأداة ما زالت تعرض patch ae600b07-b326-42c8-9aaf-d5e0efdca76d بأربعة حقول source ذات قيم مطابقة للأصل؛ لا يوجد أمر discard في الأدوات المتاحة. لا تعتمد هذه patch، ولا تُعلن أنها أُزيلت أو نُشرت.
- الدفعة الحالية غير منشورة، ولا موارد أو متغيرات أو Sleep أو main تغيرت. أي نشر لاحق لهذه الدفعة يحتاج اعتماد schema104 وAPI معًا ثم قبول النسخة الحية. آخر الدفعة يُعرف بـcommit الذي يحفظ هذه الإضافة؛ لا SHA ذاتي مختلق.

## Message Templates — دفعة محرر Mixed داخل الصفحة

- نقطة البداية9812afbe، المرجع الحي أعيد فحصه وقِيس DOM على1363×936. mode خاص لمدير البوت في نفس TemplateDraftForm، معاينة جانبية وبطاقات بالقياسات، Utility/Marketing وخمسة أنواع ترويسة،71 لغة متوافقة مع العقد، حفظ مسودة حقيقي وحفظ ثم فتح تأكيد التقديم القائم.
- HTTP7/7 PASS على Nest/PGlite وschema104 مع قناة اصطناعية،20 حالات populated-render PASS للاستعمال الافتراضي والجديد،71 locale-contract PASS، ESLint وTypeScript PASS؛ بناء Web في template-studio-build.txt. لا Backend أو migration جديدة لهذه الدفعة.
- القبول المرئي والتفاعلي للنسخة المعدلة والمقاسات الخمسة والتقديم الحقيقي للمزود غير معتمدين. WP/Carousel/Variables/Custom Fields وتفاصيل القوائم والرموز ما زالت فجوات؛ القسم IN PROGRESS.
- تقرير وأدلة: docs/platform-fidelity-20261108/MESSAGE_TEMPLATES_AR.md وtemplate-reference-metrics.json وtemplate-studio-http.json وtemplate-studio-render.txt.
- لا نشر أو موارد أو تغييرات Railway جديدة. إبقاء PR14 مسودة. الخطوة التالية: قبول النموذج المعدل ثم إغلاق فجوات متغيرات القوالب بالمرجع.

## قنوات الاتصال — دفعة الجدول والربط

- استكمال2cdcb945؛ فحص Connect Account المرجعي حيًا وقياس الإحصاءات والفلاتر والجدول وبطاقات الربط على1363×936، دون فحص مزود أو تعديل حساب حقيقي.
- عرض الحسابات كجدول مع إحصاءات وفلاتر؛ تفاصيل التشغيل الحالية تحت Manage؛ الدليل الكبير قابل للفتح؛ كتالوج الربط بنمط scoped يحافظ على استعماله الافتراضي. مؤشرات الاتصال من API الحقيقي بما فيه authorization_expiring، دون مساواة active باتصال حقيقي. MM/Google table/Last Sync وDisconnect تبقى فجوات موثقة، ولا نجاح وهمي.
-6/6 HTTP لإدارة القنوات و9/9 HTTP regression للتدفقات وWebchat/CRM/Handoff وعزل الشركات والأدوار PASS. فحص الحالات والفلاتر وكتالوجي المنصات PASS، TypeScript/ESLint وبناء Web PASS. لا يدعي ذلك قبول المتصفح أو المطابقة البكسلية للكود الجديد.
- الأدلة CHANNELS_AR.md وchannels-reference-metrics.json وchannels-http.json وchannels-regression-http.json وchannels-overview-tests.txt وchannels-build.txt داخل docs/platform-fidelity-20261108/.
- النشر في هذا checkpoint لم يبدأ؛ سيتم توثيق نتيجة الاعتماد والنشر بمعرفاته بعد حدوثهما. إصدار Web الجديد يحتاج توافق API/migration104 المحفوظين من الدفعات السابقة. لا main أو موارد جديدة.

### نتيجة محاولة نشر قنوات الاتصال
- المنتج محفوظ ومتحقق على GitHub:1f249b6b263ab93f1f8680749d6fcd0f47600390.
- جُهّز مصدر API الحالي فقط على هذا commit. مرحلة pre-deploy الموجودة تطبق migrations ومنها104، دون تعديل أمر البناء أو المتغيرات أو Sleep.
- أداة accept-deploy أعادت INVALID_ARGUMENT، ثم عند الاكتفاء بـenvironmentId أعادت صراحة: Cancelled — the user did not approve this action. No changes were made. لم يبدأ deployment جديد. لا تجاوز لهذه الموافقة عبر CLI أو مورد آخر.
- بقي patch ae600b07-b326-42c8-9aaf-d5e0efdca76d مرحليًا لخدمة API فقط: تغيير commitSha منd511 إلى1f249b6b؛ باقي حقول المصدر مطابقة. Web ما زال علىd511 ولم يُجهز أو يُنشر رأس الفرع له. API الملتزم أيضًا لم يتغير بعد.
- الحالة الحالية: code/tests محفوظة، release BLOCKED عند اعتماد عملية Railway. القبول البصري/التفاعلي للنسخة المعدلة ما زال BLOCKED، لا مطابقة كاملة معلنة.
