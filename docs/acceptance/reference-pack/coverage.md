# سجل قبول حزمة Bot Two المرجعية

نقطة البداية على GitHub هي `f78848661f9e08698798915e23e8463dc6ecbd66`. جرى تنفيذ الفحص، وتطبيق القالب المشترك، وتسليم جزء من تطوير الكتالوج على فرع `feat/crm-product-rebuild-20261121`.

## دليل التنفيذ والاختبار

| الدفعة | الملفات الأساسية | الدليل |
|---|---|---|
| 0 · الجرد والتصوير | [inventory.md](inventory.md)، وملفّا HTML المرجعيان | Chromium على 390 و1440 لمشاهد المرجع، ولقطات التطبيق الأساسي قبل التعديل. راجعنا الصفحات والتبويبات الست للمساعد كمحاكاة محلية. |
| 1 · الهوية المشتركة | `apps/web/app/design-system.css`، `app/layout.tsx`، `app/dashboard/layout.tsx`، لوحة التحكم و`NavIcon.tsx` | `scripts/qa-reference-shell.mjs` سجّل 96 زيارة لصفحات مسجلة الدخول في RTL وLTR. العروض 360 و390 و750 و768 و1024 و1440؛ 16 مسارًا عند 390 و1440. لا تجاوز أفقي في العينات. فتح القائمة السفلية وإغلاقها بـEscape وعودة التركيز لزر الفتح والتحقق من طلب تصفية لوحة التحكم ووضوح عنوانها. |
| 2 · محرر وكتالوج | `ProductCatalog.tsx` وCSS الخاص به، `commerce.controller.ts` و`commerce.service.ts` و`contracts.ts`، وMigration 115 | `scripts/qa-catalog-editor-modes.mjs` على 390 عربي و1440 إنجليزي. اختبار للحقول المخفية، الحفاظ على ID وSKU والسعر والعملة والمواصفات والإضافات والربط، منع إخفاء حقل غير صالح، حفظ تفضيل الوضع، إنشاء فرع ونقل منتج ونسخ الشجرة. تشغيل منفصل بالميزات معطّلة اختبر واجهة التحرير القديمة والحفظ. |
| 2 · تصفح كامل | `/commerce/products/page`، `/commerce/products/scope`، ومسار الكتالوج خلف مفتاح الإصدار | Chromium على 390 إنجليزي، 510 منتجات، الصفحة 51، بحث بالـSKU حتى المنتج 510. قياس واحد لزمن ظهور النتيجة 325ms محليًا. دليل PGlite مع 1,005 منتجات، عدّ صحيح، البحث من قسم أب للمنتجات الفرعية، الانتقال لصفحة صالحة بعد تضييق النتائج، وعزل شركة ثانية. |
| البناء | بناء API بـTypeScript وNext.js للويب | بناء محلي ناجح، مع تحذير تهيئة إضافة ESLint لـNext.js. ستة اختبارات commerce ناجحة، تشمل شروط الفئات وRLS والمبالغ والكتالوج وإخراج مزوّد مُحاكى. شُغلت أيضًا أربع رحلات CRM باستخدام `scripts/qa-crm-design.mjs` (390 و1366، بالعربية والإنجليزية)، بحسابَي مالك وموظف، على بناء Next.js المحلي. نجحت العمليات الأساسية للعملاء والمتابعات والصفقات والملاحظات والانتقال للمحادثة وبعض وظائف CSV والقوائم. |

## استكمال من `73b4a92`

- إعداد طلب المنتج، والباقات، وشروط الأسئلة، والكمية والأسعار والمخزون تُحفظ مع سجل الكتالوج الحالي. مفتاح الواجهة `NEXT_PUBLIC_COMMERCE_CHECKOUT=true` افتراضيًا مغلق. الترحيلات 116–118 إضافية، وتُجرّب هذه الدفعة على قاعدة محلية معزولة فقط.
- طلب الموظف له معرّف تكرار، ولقطة سعر ثابتة، وربط مباشر بعميل CRM، وسجل حالات، ومتابعة قابلة للإسناد عبر واجهة مهام CRM. يتم الحجز وإرجاع المخزون عند الإلغاء داخل المعاملة. مستندات الطلب PDF/JPG/PNG حتى 2 MiB لكل حقل تحفظ داخل PostgreSQL مع RLS ولا تمر عبر خدمة الملفات العامة.
- مساعد الإعداد يقرأ الكتالوج الحالي، ويولد مسودة جديدة بلا مشغلات نشطة ويتيح تشغيل محاكي Flow Builder. نفس المسار يدعم قوائم متدرجة حتى 1,000 عنصرًا بحد عشرة عناصر لكل قائمة. عملية الإصدار التجريبي تحفَظ كنسخة مستقلة؛ الاسترجاع ينسخ النسخة المحفوظة ولا يحدث المسار الحي.
- `scripts/qa-commerce-checkout.mjs` يختبر NestJS وPostgreSQL المضمن، والمستندات، والأسعار والتنافس والإعادة، ومجموعة كتالوج تتجاوز 100 عنصر، ورفض الصلاحيات، والشركات المعزولة، وفحص الجاهزية والإصدارات، ومسارات واجهة Chromium. شُغّلت مجموعة انحدار منتقاة للكتالوج والاستيراد ومحرك البوت (74 اختبارًا).
- حدود التنفيذ: الطلب القابل للحفظ متاح للموظف المسجّل. محاكاة رحلة البوت تعرض المنتج المختار والباقات والأسئلة الشرطية وتحسب السعر بالخدمة نفسها. دورة إرسال العميل للطلب من WhatsApp أو Webhook وإدارة بيانات الاتصال تلقائيًا ما زالت مفتوحة. نوع الموعد يشير لمسار الحجز الحالي دون تحويل الحجز إلى طلب تجاري. اختبارات مزوّد Meta الحقيقي والنشر الحي تحتاج إذنًا مستقلًا.

## الطلب من المحادثة

أُضيف زر للمالك والمدير في صندوق الوارد يفتح شاشة طلب مرتبطة بالمحادثة، خلف مفتاح واجهة الكتالوج نفسه. يحفظ الخادم مصدر الطلب ومعرّفَي القناة والمحادثة ويربط العميل من السجل الفعلي. اختبر `qa-commerce-checkout.mjs` منع الوصول لمحادثة شركة أخرى، ورفض دور الموظف والقناة غير المطابقة ومعرّف العميل المرسل من الخارج، والإعادة بالتوازي مع حفظ طلب واحد. التحقق الجديد شمل API وTypeScript، ولم يشمل تشغيل المتصفح.

## تأكيد الطلب داخل محرك المحادثات

- إعداد اختياري في مساعد البوت يربط الكتالوج المحلي بجمع الباقة والإضافات والكمية والأسئلة الشرطية، ثم يعرض السعر من الخادم قبل تأكيد العميل. إعداد مستقل ينشئ متابعة CRM عند الحفظ. المواعيد تستمر في مسار الحجز.
- تستخدم الطلبات اليدوية والآلية قفل مساحة العمل ثم قفل المحادثة، وتتحقق من المحادثة والقناة وتستخرج العميل داخل المعاملة نفسها. الحفظ يحجز المخزون ويدوّن الطلب وسجله وملاحظة العميل والمتابعة. يبقى معرّف الطلب في جلسة البوت، ويُعاد التحقق من السعر وقت التأكيد.
- اختبر `qa-conversation-checkout-runtime.mjs` تدفقًا منشورًا محليًا عبر Web Chat وعبر أحداث WhatsApp اصطناعية موقّعة دخلت Webhook الحقيقي وعامل الطابور المحلي (الإرسال الخارجي معطّل)، بما فيه سؤال تاريخ غير صالح، ومنع الحفظ قبل التأكيد وتكرار التأكيد وخفض المخزون وربط CRM والمتابعة. اجتازت 52 حالة انحدار لمحرك التدفقات والكتالوج. اختبار زر صندوق الوارد على 390 و1440 موجود في `qa-commerce-checkout.mjs`، لكن Chromium تعذّر تشغيله (منع socket محلية)، فلا توجد لقطات أو نتيجة بصرية جديدة.

## اختيارات المحادثة والحجز

- يستخدم Web Chat ومسار WhatsApp المدعومان أزرارًا أو قائمة لاختيار الباقة والإضافة المفردة وإجابة القائمة وتأكيد الطلب. تبقى الإجابة الرقمية متاحة، وكذلك إدخال عدة إضافات دفعة واحدة. مفاتيح الاختيار مرتبطة بمعرّف الطلب وخطوة الجلسة؛ الرد من زر قديم لا يجيب عن الخطوة الحالية.
- اختبر `qa-conversation-checkout-runtime.mjs` محليًا اختيارات WhatsApp موقعة عبر Webhook والطابور الحقيقيين، وتكرار التأكيد. اختبارات Web Chat غيّرت سعر الباقة أو المخزون بعد وصول السعر إلى العميل، ونجح رفض التأكيد دون إنشاء طلب أو خصم كمية إضافية. الإرسال الخارجي معطّل.
- اختبر `qa-commerce-checkout.mjs` الحجز ضمن توقيت القاهرة ورفض خارج الساعات، والمعاينة دون كتابة، وعزل الشركات، والتنافس على نفس الموعد، وإعادة المحاولة والإلغاء وإعادة الحجز. يسبق قفل معرّف عملية الحجز قفل الخدمة، بحيث تُرفض إعادة استخدام المعرّف لخدمة مختلفة حتى في الطلبين المتزامنين. اختبر أيضًا حفظ طلب عرض سعر بلا إجمالي ورفض تمرير الموعد عبر إنشاء الطلب التجاري.
- أُعيدت محاولة Chromium لاختبار Inbox على الهاتف والكمبيوتر، فتوقف قبل فتح الصفحة بسبب منع `socket()`. جُرّب Chrome السحابي أيضًا ورفض الاتصال بعنوان خادم الاختبار المحلي. لا توجد نتيجة متصفح أو لقطات جديدة لهذه الدفعة. اجتازت 52 حالة انحدار للمحرك والكتالوج.

## مصفوفة القبول

`OPEN` تعني أن الدليل جزئي وأن البند الكامل ما زال مفتوحًا. `NOT_RUN` تعني أن السيناريو المطلوب لم يُختبر في هذه الدفعة. `PASS` يخص البند المذكور فقط.

| ID | النتيجة | دليل أو عمل متبقٍ |
|---|---|---|
| V01 | OPEN | لقطات 390 و1440 تثبت القالب والألوان والتنقل. اختلافات في تكوين صفحات الكتالوج ولوحة التحكم لأن وظائف المنتج القائمة ما زالت معروضة. المطابقة الكاملة لم تُقبل بعد. |
| V02 | OPEN | الرئيسية والكتالوج ومدير البوت وCRM وInbox فُتحت بالهوية المشتركة. شاشة الطلبات موجودة ومختبرة سابقًا؛ لم تكتمل المقارنة البصرية لكل الأقسام. |
| V03 | OPEN | القنوات والحملات والإعدادات والفريق والفوترة فُتحت. اختبارات إجراءات كل شاشة والأدوار ما زالت مطلوبة. |
| V04 | OPEN | 96 زيارة بلا تجاوز أفقي في المقاسات المشمولة. يلزم فحص بقية الشاشات وكل حالات النوافذ والبيانات الممتلئة. |
| V05 | OPEN | RTL/LTR في 96 زيارة، ومحرر الكتالوج في اللغتين. بقية التفاعلات واتجاه الأيقونات تحتاج قبولًا. |
| V06 | OPEN | اختبار Escape، الحقول غير الصالحة، والتباين المرئي في عنوان لوحة التحكم. لم يكتمل تدقيق الوصول الشامل. |
| V07 | NOT_RUN | التخصيص محفوظ في الكود؛ يلزم اختبار حساب White Label قائم على خطة تدعمه. |
| C01 | OPEN | سجّل الاختبار ثبات ID وSKU والسعر والعملة لعينة محفوظة؛ يلزم فحص الصور وعينة الترحيل الموسّعة. |
| C02 | OPEN | اختبار DB أثبت حماية الحذف والأرشفة من مراجع البوت والنسخ والجلسات. يلزم E2E كامل لبقية إجراءات المنتج. |
| C03 | PASS | DB وChromium اختبرا الفروع والنقل ونسخ شجرة بمنتجاتها. DB اختبر منع الدورات، وحماية حذف الأب، وعزل الشركة. |
| C04 | OPEN | البحث والتصفح على 510 في المتصفح و1,005 في DB. يلزم اختبار مصادر الاستيراد بكل صيغها. |
| C05 | PASS | الوضعان يغيران السجل نفسه ويحفظان الحقول المتقدمة؛ ثبتت استمرارية البيانات وإعادة التحميل في اللغتين. |
| C06 | OPEN | حُفظت الأنواع الأربعة وتغيّرت حقول المحرر. الموعد يبقى في مسار حجز مستقل؛ لم تُختبر الأنواع الأربعة من المتصفح إلى النهاية. |
| C07 | OPEN | الباقات تضبط السعر وتقبل الإضافة والنسخ والحذف في المحرر. اختبر الخادم سعر باقتين وإضافة مدفوعة؛ دورة تحرير باقة كاملة في المتصفح لم تُختبر. |
| C08 | OPEN | المواصفات والإضافات والرابط ومعرّفات Meta محفوظة في DB عبر التحرير؛ يلزم اختبار الصور ومعاينة Meta الكاملة. |
| C09 | OPEN | يدعم المحرر الأنواع الخمسة وشرط الباقة؛ اختبر الخادم ظهور السؤال والتحقق من حقل التاريخ الإلزامي. اختبر Web Chat نموذجًا شرطيًا فعليًا يشمل الباقة والتاريخ؛ باقي أنواع الحقول والمواعيد تحتاج تغطية شاملة. |
| C10 | PASS | API: رفع مستند فعلي واقتران خاناته بالطلب، تنزيله مصادقًا، رفض زائر وشركة أخرى، ومنع إكمال الطلب حتى رفع المطلوب. |
| C11 | PASS | API: تحقق الخادم من الكمية والأسعار والخصم والضريبة والمخزون، ورفض تأكيد السعر والمخزون المتغيرين. حجز المواعيد رفض التوقيت خارج التوافر والتنافس على الموعد. |
| C12 | NOT_RUN | المسارات القديمة ما زالت متاحة؛ لم يُنفذ سيناريو إعادة اختبار الاستيراد والمزامنة والمواعيد كاملًا. |
| A01 | PASS | API+Browser: المساعد يستعمل صفوف الكتالوج نفسها؛ معرّفات العقد مطابقة. |
| A02 | PASS | API+Browser: اختيار يدوي من البحث وتجهيز جميع المنتجات النشطة تلقائيًا. |
| A03 | OPEN | الترحيب والرد البديل والقوائم ومسؤول التحويل تُحفظ في Graph المسودة. يتحقق الخادم من العضوية النشطة ويختبر التحويل داخل المحاكي. لم يُعَد اختبار اختيار المسؤول في المتصفح. |
| A04 | PASS | API+Browser: توليد Graph صالح محفوظ في Flow Builder، ومعاينته من المحرك نفسه. |
| A05 | OPEN | API: لم تتغير التدفقات الموجودة في الاختبار، والمسودة بلا مشغلات. مقارنة جلسات ورسائل حية غير مجراة. |
| A06 | PASS | API: أكثر من 100 منتج في Tree صالح، وعشر منتجات كحد أقصى في كل قائمة مع حفظ كل معرّفات المنتجات. |
| A07 | PASS | Browser+API: اختيار المنتج من قائمة محاكي المحرك أظهر نموذج الباقة والإضافات والسؤال الشرطي بالسعر المحسوب من خدمة الطلب نفسها. |
| R01 | OPEN | API: رفض قناة غير موجودة أو غير نشطة والمنتجات غير المتاحة والمخزون الصفر. قواعد المواعيد وربط المزود غير مكتملة. |
| R02 | PASS | API+Browser: فصل التحذيرات (مثل غياب التصنيف) عن العوائق. |
| R03 | OPEN | ترجع الجاهزية معرّف المنتج والحقل، والرابط يفتح المحرر في تبويب مستقل ويطلب التركيز على التصنيف أو المخزون أو إعداد البيع. اختبر API هدف الإصلاح وعزل الشركة. اختبار المتصفح الجديد تعذّر في هذه البيئة لأن Chromium مُنع من إنشاء socket محلية. |
| R04 | PASS | API: تغيير سعر المنتج بعد الفحص أبطل الإصدار. تغيير إعدادات المساعد يصفّر الفحص في الواجهة. |
| P01 | PASS | API: إصدار معزول في جدول مستقل، والاستجابة sent=false؛ لا استدعاء لمزود أو تحديث للنسخة الحية. |
| P02 | PASS | API: تأكيد صريح وفحص حديث ومسودة مطابقة على القناة نفسها. |
| P03 | PASS | API: نسخة ثابتة واسترجاعها كإصدار تجريبي جديد دون تعديل التاريخ. |
| P04 | PASS | HTTP: حساب الموظف مُنع من النشر التجريبي وقراءة نسخه. |
| O01 | PASS | Chromium على 390 RTL و1440 LTR: اختيار المنتج والباقة والإضافة وتعبئة السؤال الشرطي في المحاكاة، ثم إظهار إجمالي 30.24 EGP من الخادم. |
| O02 | PASS | API: الحساب على الخادم ولقطة مثبتة في الطلب. |
| O03 | PASS | إعادة التأكيد بالتوازي في Web Chat وWebhook واتساب اصطناعي موقّع سجّلت طلبًا واحدًا لكل محادثة. اختبارات API تحققت من رفض تغيير المحتوى لنفس معرّف الطلب. |
| O04 | PASS | تنافس مخزون موثّق في اختبارات الطلب السابق، واختبار طلبَي حجز لموعد واحد بمعرّفين مختلفين أعاد نجاحًا واحدًا ورفضًا واحدًا. |
| O05 | PASS | API+Browser: الطلبات محفوظة، تظهر حالاتها وسجلها، ويمكن إنشاء مهمة متابعة وإسنادها عبر CRM. |
| O06 | PASS | API+Browser: ربط العميل الصحيح، تسجيل ملاحظة CRM، والتحقق من الرابط وعزل الشركة. |
| O07 | OPEN | مسار طلبات المحادثة يستخرج العميل من المحادثة والقناة داخل نفس مساحة العمل، ويرفض معرّف عميل يرسله المستدعي. تحقق ذلك باختبار API باستخدام محادثة Web Chat محلية. أثبت الاختبار المحلي عبر Web Chat وWebhook واتساب اصطناعي موقّع ربط المحرك بالعميل والقناة وحفظ الطلب وتحديث المخزون وإنشاء المتابعة. اعتماد مزود WhatsApp الحقيقي متوقف على موافقة وبيئة اختبار منفصلة. |
| O08 | OPEN | اختبارات انحدار منتقاة اجتازت. يلزم اختبار القنوات الحية وWhatsApp Flows بموافقة. |
| S01 | PASS | اختبارات HTTP وDB لعزل المنتجات والطلبات والمستندات والإصدارات. |
| S02 | OPEN | حُميت مراجع المنتج وفروع الفئات في DB، وتحقق رفض وصول موظف للكتالوج على HTTP. أدوار نشر البوت تحتاج اختبارًا بعدما يكتمل المسار. |
| S03 | NOT_RUN | لم يُجر تدقيق قابلية تسريب الأسرار أو المرفقات الجديدة. |
| S04 | OPEN | 1,005 منتجات في DB و510 في Chromium. اختبار 1,000 طلب متزامن وعدة شركات وRedis وأداء هاتف فعلي مفتوح. |
| D01 | OPEN | API TypeScript وNext.js و6 اختبارات commerce نجحت؛ لم تُشغّل كل حزم الانحدار. |
| D02 | PASS | تشغيل محلي بالميزة الجديدة لاختبارات الطلبات والمساعد، ثم تشغيل بالميزات مسوّرة ومغلقة أكد عمل المحرر السابق وحفظ المنتج نفسه بالعربية والإنجليزية. |
| D03 | NOT_RUN | لم يحدث نشر Railway Preview أو Production. |
| D04 | OPEN | صور للطلبات والمساعد ومعاينة المحرك عند 390 RTL و1440 LTR؛ لا مقارنة شاملة لكل الأقسام. |
| D05 | PASS | هذا السجل يميّز التنفيذ والاختبار والنشر والقبول المفتوح. |

## تفعيل وإرجاع

مفتاحا إصدار الواجهة في بناء Next.js هما `NEXT_PUBLIC_CATALOG_EDITOR_MODES=true` و`NEXT_PUBLIC_CATALOG_CATEGORY_TREE=true`. المفتاح الثاني يتحكم في عرض شجرة الأقسام والتصفح من الخادم. عند الإيقاف يعود مسار الواجهة القديم، وتبقى البيانات الجديدة محفوظة. نشر نسخة API الجديدة يحتاج تطبيق Migration 115 الذي يحافظ على معرّفات الفئات والمنتجات القديمة ويترك أقسامها الحالية بلا أب. للإرجاع التشغيلي، أوقف المفتاحين وأعد بناء الويب مع ترك أعمدة وعلاقات الشجرة في قاعدة البيانات. لا تعكس Migration على قاعدة فيها فروع لأن ذلك يزيل معلومات الربط. لم تُطبّق Migration على أي قاعدة بيانات مستضافة في هذه الدفعة.

الاختبارات خليط من Chromium محلي وNestJS وPGlite ببيانات اصطناعية. لم يُختبر جهاز هاتف فعلي، أو حساب مستقل لاختبار قابلية الفهم، أو إرسال واتساب أو الدفع لدى مزوّد حقيقي.

### Products and Orders follow-up baseline

- Railway Preview browser check reached the authenticated Commerce page and its Orders tab. The existing page puts the manual order form before the list. The reference groups order status and commercial summary above expandable order details. This check used read-only navigation.
- O05 remains open for this follow-up. The order list now exposes saved answers under their question labels, add-ons, and the price breakdown from the persisted order snapshot. Existing document, status, history and follow-up actions retain their entry points. Browser interaction with a populated order and matched RTL/LTR screenshots of the changed UI are still required.
- The deployment branch is three commits ahead of the development branch at the baseline. The only differing paths are the outbound WhatsApp service and its Preview delivery helper and test. Use the deployment-branch ancestry for the release candidate so it retains those fixes.

### Commerce review continuation (2026-11-24)

Branch: `feat/reference-commerce-orders-20261124`, continued from `e60ce3d`. Its ancestry includes Preview fix `d57b434`. This review did not update the deployment branch or send messages.

| Acceptance | Change and evidence | Remaining verification |
|---|---|---|
| O05 | Tenant-wide status totals, server-side search and status filters before pagination, collapsible manual creation, and an order card with saved checkout details. Added review, documents-required and processing transitions, retained confirmed for old orders, and added owner/admin assignment to active tenant members. PostgreSQL fixture checks 56 in-tenant orders, foreign isolation, both pages, literal search, Arabic customer search, assignment, migration of legacy rows, and transition history. | Browser operations with populated data, including Inbox, file upload, and the new assignment and status controls. |
| C05, C07, C09 | Editor sections for basics, packages, order form, stock, media, options, specifications and channels/settings. Sections share the existing React form and checkout state. Package currency input uses the existing exact decimal helper. Checked zero-loss conversion of 1500.05 and rejection of excess fractional digits. | Browser persistence and mode switching on a live form. Full visual match and new catalog editor parity remain open. |
| V01, V04, V05, D04 | Reviewed the source HTML and stored browser captures. Updated the React component layout and mobile editor styles. | Fresh baseline and after captures at 390 RTL and 1440 LTR. Local Chromium aborted at startup with a denied ProcessSingleton socket. |
| D01 | 27 commerce tests passed via Node with the TSX loader, including the new PostgreSQL test. API and web TypeScript checks passed. | Repeat full functional browser journey with the release candidate. |
| D03 | No deployment in this review. | Build and browser acceptance on the final candidate before Preview deployment. |

O05 and the visual/mobile acceptance rows remain open. CRM follow-up assignment is separate from order assignment. Completion still requires the saved document slots to be filled, and cancellation continues to use the existing stock restoration logic.

**Final automated check for this continuation.** Next.js production build passed. The isolated API suite passed 288/288 after restoring the three unchanged WhatsApp files from `d57b434` into the verification worktree and matching their Git blob IDs. The first full run exposed a pre-existing Inbox test fixture missing `conversations.crm_initiated`, reproduced on the starting source and corrected only in the fixture. The full run includes the Preview all-conversation guard and the order workflow database test. The two required browser sizes, full automatic checkout to CRM in a real browser, and Railway Preview release remain unverified.

### Reference review after 542978f

- Verified the reference pack SHA-256 manifest and reviewed both original HTML implementations with the stored browser captures. The editor now follows the reference's three core sections in simple mode and keeps advanced fields mounted. Mobile tabs scroll in one row, and package actions sit together in the nested package card.
- Order cards now put status and assignment before the order total. The expanded section groups answers, add-ons, documents, conversation and CRM links. The document request runs on expansion.
- Re-ran the Migration 119 PostgreSQL fixture, including legacy confirmed orders, status history, tenant isolation and assignment. It passed. No migration or messaging files were changed in this pass.
- Work Cloud Browser opened the current Railway Preview catalog. It could not reach the local reference server, so that check is evidence for the existing Preview only. The changed build still needs interactive 390px RTL and 1440px LTR verification, live test journeys and matched before/after captures. Those checks and deployment remain open.
