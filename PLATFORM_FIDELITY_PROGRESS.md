# سجل استكمال مطابقة Boat Two

آخر تحديث: 2026-11-08. الفرع: `feat/flow-builder-fidelity-20261107`، PR #14 مسودة. نقطة البداية المتحققة: `d5116324ec4c92d18709b84230486c6a8d4df464`.

## حدود الحالة

DONE لتدفق إدخال المستخدم تعني إغلاق نطاقه وفق توجيه المالك، ولا تعني اعتماد تطابق المنصة كاملة. نتائج الاختبارات السابقة في WORK_PROGRESS.md تاريخية حتى إعادة تشغيلها. لا تُسجّل PASS على أساس البناء وحده.

| القسم | الحالة | الدليل والفجوة والخطوة التالية |
|---|---|---|
| User Input Flow | DONE | مغلق بتوجيه المالك؛ لا إعادة تصميم، تراجع فقط عند اعتماد مباشر |
| Flow Builder الأساسي | DONE | التحسينات السابقة محفوظة؛ تبقى إجراءات متقدمة مستقلة أدناه |
| Bot Manager Settings | IN PROGRESS | فحص BotSailor الحي: General يعرض البريد وثلاثة مفاتيح وتكرار البداية وزر Publish Changes. Boat يفصل المسودة والتفعيل؛ الخدمة تدعم no-match وget-started enablement وساعات العمل ومهلة إدخال فقط. التكرار محفوظ لكنه غير مطبق؛ عُطّل تعديله مع تفسير صريح، وحُفظت قيمه السابقة. ترجمة أسماء أيام حقول الوقت المسموعة. يلزم قبول تفاعلي محلي وعزل شركات وأدوار قبل النشر |
| Message Templates | NOT STARTED | توجد تقارير أقدم ودعم جزئي للقوالب؛ يجب فحص المرجع ودورة حفظ مستقلة قبل ادعاء المطابقة |
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
| Channels | NOT STARTED | تدقيق فقط؛ لا تعديل ربط Meta أو الأسرار أو رسائل حقيقية |
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
