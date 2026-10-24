const messages: Record<string, string> = {
  "Duplicate node id": "توجد خطوة مكررة. احذف النسخة المكررة ثم أضف خطوة جديدة.",
  "Flow has no nodes": "البوت فارغ. أضف رسالة بداية قبل النشر.",
  "Start node does not exist": "خطوة البداية غير موجودة. حدد خطوة موجودة واجعلها بداية البوت.",
  "Interactive message needs at least one button or list option": "أضف زرًا أو خيارًا واحدًا على الأقل للرسالة التفاعلية.",
  "Message is empty": "الرسالة فارغة. أدخل نصًا أو أضف مرفقًا صالحًا.",
  "Buttons/list require message text": "أضف نص الرسالة الذي يظهر قبل الأزرار أو القائمة.",
  "Use either buttons or a list, not both": "اختر أزرارًا أو قائمة في هذه الرسالة، ثم احذف النوع الآخر.",
  "Too many options (max 10)": "قلّل خيارات القائمة إلى ١٠ خيارات بحد أقصى.",
  "At most 3 buttons": "قلّل أزرار الرسالة إلى ٣ أزرار بحد أقصى.",
  "Option ids must be unique": "توجد خيارات مكررة. احذف الخيار المكرر وأضفه مجددًا.",
  "Question text is required": "أدخل نص السؤال الموجّه للعميل.",
  "saveAs must be a valid variable name": "حدد اسم حقل حفظ الإجابة بحروف إنجليزية، يبدأ بحرف أو شرطة سفلية، ولا يتجاوز ٤١ حرفًا.",
  "Regex pattern is required": "أدخل نمط التحقق المطلوب للإجابة أو اختر نوع تحقق آخر.",
  "Latitude and longitude are required": "حدد خط العرض وخط الطول للموقع.",
  "CTA message text is required": "أدخل نص الرسالة التي تحتوي على زر الرابط.",
  "Button label is required": "أدخل اسمًا واضحًا للزر.",
  "URL must start with http:// or https://": "أدخل رابطًا كاملاً يبدأ بـ https:// أو http://.",
  "Choose a sequence": "اختر التسلسل المطلوب تشغيله في هذه الخطوة.",
  "Template name is invalid": "اختر قالبًا صالحًا؛ اسم القالب يستخدم حروفًا إنجليزية صغيرة وأرقامًا وشرطة سفلية.",
  "Add at least one rule": "أضف شرطًا واحدًا على الأقل لهذه الخطوة.",
  "Delay amount must be positive": "أدخل مدة انتظار أكبر من صفر.",
  "Use a public Google Sheet link (docs.google.com/spreadsheets/...)": "أدخل رابط Google Sheets عامًا ومسموحًا بقراءته.",
  "Lookup value is required when a lookup column is set": "أدخل قيمة البحث بعد اختيار عمود البحث.",
  "No column is saved to a variable": "لن تُحفظ نتائج الجدول. اربط عمودًا واحدًا على الأقل بحقل حفظ.",
  "Invalid timezone": "اختر منطقة زمنية صحيحة مثل Africa/Cairo.",
  "Split needs at least 2 branches": "أضف مسارين على الأقل لتوزيع العملاء.",
  "Split weights must be positive": "اجعل مجموع أوزان توزيع المسارات أكبر من صفر.",
  "Min and max must be whole numbers": "أدخل الحد الأدنى والأقصى كأعداد صحيحة.",
  "Min must not exceed max": "اجعل الحد الأدنى أقل من أو مساويًا للحد الأقصى.",
  "Max turns must be between 1 and 50": "حدد عدد جولات الحوار بين ١ و٥٠.",
  "Connect \"handoff\" and \"error\" outputs to a handoff node so customers are never stuck": "صل مخرجي التحويل والخطأ بخطوة تحويل لموظف ليتمكن العميل من المتابعة.",
  "Add or remove at least one tag": "حدد وسمًا واحدًا على الأقل للإضافة أو الإزالة.",
  "A valid media URL (https://…) is required": "أدخل رابط مرفق صالحًا يبدأ بـ https://.",
  "User input flow needs at least one question": "أضف سؤالًا واحدًا على الأقل لجمع بيانات العميل.",
  "Custom field key is invalid": "حدد مفتاح حفظ صالحًا يبدأ بحرف إنجليزي أو شرطة سفلية.",
  "Custom field keys must be unique": "استخدم حقل حفظ مختلفًا لكل سؤال حتى لا تضيع إجابة سابقة.",
  "Multiple choice needs at least 2 options": "أضف خيارين على الأقل لسؤال الاختيار المتعدد.",
  "Note text is empty": "أدخل نص الملاحظة الداخلية.",
  "Attribute key is invalid": "حدد مفتاح خاصية صالحًا يبدأ بحرف إنجليزي أو شرطة سفلية.",
  "Node is not reachable from the start": "هذه الخطوة غير متصلة بالبداية. صلها بمسار يبدأ من خطوة البداية."
};
export function validationMessage(message: string, language: string): string {
  if (language !== 'ar') return message;
  if (messages[message]) return messages[message];
  if (/^Unknown output/.test(message)) return 'يوجد مخرج غير متاح في هذه الخطوة. احذف التوصيل وأعد ربط المخرج الصحيح.';
  if (/points to a missing node/.test(message)) return 'أحد التوصيلات يشير إلى خطوة محذوفة. أعد توصيله بخطوة موجودة.';
  return /[\u0600-\u06ff]/.test(message) ? message : 'راجع إعدادات هذه الخطوة والتوصيلات المطلوبة، ثم أعد الفحص.';
}
