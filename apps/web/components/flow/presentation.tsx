import { NavIcon } from '../product/NavIcon';
import { NodeType, NODE_META } from '../../lib/flow-types';
export const NODE_EN: Record<NodeType, string> = {
  product: 'Product',
  catalog: 'Catalog / product sections',
  appointment: 'Book appointment',
  whatsapp_flow: 'WhatsApp Flow',
  message: 'Text',
  interactive: 'Interactive Message',
  location: 'Location',
  cta_url: 'CTA URL Button',
  template: 'Template Message',
  sequence: 'New Sequence Campaign',
  user_input: 'User Input Flow',
  image: 'Image',
  audio: 'Audio',
  video: 'Video',
  file: 'File',
  question: 'Ask a question',
  condition: 'Condition',
  set_variable: 'Set variable',
  set_attribute: 'Customer attribute',
  delay: 'Wait',
  http_request: 'HTTP request',
  sheet_fetch: 'Google Sheet Data Fetch',
  business_hours: 'Business hours',
  split: 'Random split',
  random_number: 'Random Number Generator',
  ai_reply: 'AI Reply',
  handoff: 'Human handoff',
  tag: 'Label Assign',
  note: 'Internal note',
  end: 'End conversation',
  subflow: 'Reusable component',
};
export function nodeLabel(type: NodeType, language: string) {
  return language === 'en' ? NODE_EN[type] : NODE_META[type].label;
}
export const nodeIcon: Record<NodeType, string> = {
  product: 'crm',
  catalog: 'crm',
  appointment: 'sessions',
  whatsapp_flow: 'inbox',
  message: 'inbox',
  interactive: 'inbox',
  location: 'globe',
  cta_url: 'globe',
  template: 'inbox',
  sequence: 'sessions',
  user_input: 'question',
  image: 'inbox',
  audio: 'inbox',
  video: 'inbox',
  file: 'inbox',
  question: 'question',
  condition: 'automations',
  set_variable: 'variable',
  set_attribute: 'crm',
  delay: 'sessions',
  http_request: 'globe',
  sheet_fetch: 'reports',
  business_hours: 'sessions',
  split: 'flows',
  random_number: 'variable',
  ai_reply: 'agents',
  handoff: 'team',
  tag: 'crm',
  note: 'inbox',
  end: 'check',
  subflow: 'flows',
};
// Independent SVG primitives; no third-party icon/font assets copied.
const blockPaths: Partial<Record<NodeType, string>> = {
  message: 'M5 4h14M5 8h14M5 12h14M5 16h14M5 20h10',
  image: 'M3 4h18v16H3V4ZM3 16l5-5 4 4 4-5 5 6M9 8h.01',
  audio: 'M9 5a3 3 0 0 1 6 0v8a3 3 0 0 1-6 0V5ZM5 11v2a7 7 0 0 0 14 0v-2M12 20v3M8 23h8',
  video: 'M3 5h18v14H3V5ZM10 8l6 4-6 4V8Z',
  file: 'm8 12 7-7a4 4 0 0 1 6 6L10 22a6 6 0 0 1-8-8L13 3M5 17 16 6',
  location: 'M3 5l6-3 6 3 6-3v17l-6 3-6-3-6 3V5ZM9 2v17M15 5v17',
  ai_reply: 'M5 6h14v14H5V6ZM12 6V2M10 2h4M8 11h1M15 11h1M8 16h8M2 10v7M22 10v7',
  user_input: 'M4 3h16v18H4V3ZM8 7h8M8 12h8M8 17h5',
  whatsapp_flow: 'M3 4h18v16H3V4ZM7 8h4v4H7V8ZM14 8h3M7 16h10',
  appointment: 'M3 5h18v17H3V5ZM7 2v6M17 2v6M3 10h18M8 15l3 3 6-6',
  interactive: 'M3 4h18v14h-8l-5 4v-4H3V4ZM7 8h10M7 12h6',
  template:
    'M12 3a9 9 0 1 0 0 18h2a2 2 0 0 0 0-4h-1a2 2 0 0 1 0-4h5a3 3 0 0 0 3-3c0-4-4-7-9-7ZM7 9h.01M12 6h.01M6 14h.01',
  cta_url:
    'M8 13V4a2 2 0 0 1 4 0v8-3a2 2 0 0 1 4 0v4-1a2 2 0 0 1 4 0v5c0 5-3 7-7 7l-8-8c-2-2 0-4 2-2l1 1',
  condition: 'M4 4l15 8-15 8M4 22h16',
  sequence: 'M12 2S5 10 5 15a7 7 0 0 0 14 0c0-5-7-13-7-13Z',
  tag: 'M3 3h9l10 10-9 9L3 12V3ZM7 7h.01',
  random_number: 'M9 2 5 22M19 2l-4 20M3 8h20M1 16h20',
};
export function NodeIcon({ type }: { type: NodeType }) {
  const path = blockPaths[type];
  return path ? (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  ) : (
    <NavIcon name={nodeIcon[type]} />
  );
}
const labels: Record<string, string> = {
  الأحد: 'Sunday',
  الإثنين: 'Monday',
  الثلاثاء: 'Tuesday',
  الأربعاء: 'Wednesday',
  الخميس: 'Thursday',
  الجمعة: 'Friday',
  السبت: 'Saturday',
  'تُثبت نسخة المكوّن عند نشر البوت الرئيسي.':
    'The component version is frozen when the main bot is published.',
  'اختر مكوّنًا': 'Choose a component',
  بدون: 'None',
  صورة: 'Image',
  فيديو: 'Video',
  صوت: 'Audio',
  ملف: 'File',
  تعليق: 'Caption',
  'بدون (يكمل مباشرة)': 'None (continue immediately)',
  'أزرار (حتى 3)': 'Buttons (up to 3)',
  'قائمة (حتى 10)': 'List (up to 10)',
  'حفظ اختيار العميل في متغيّر': 'Save customer selection as variable',
  'يُحفظ العنوان، ويُحفظ المعرّف في {اسم}_id': 'Stores the title and the identifier in {name}_id',
  'نص حر': 'Free text',
  رقم: 'Number',
  إيميل: 'Email',
  'رقم هاتف': 'Phone number',
  'نمط مخصص (Regex)': 'Custom pattern (Regex)',
  النمط: 'Pattern',
  'احفظ الإجابة في متغيّر': 'Save answer as variable',
  'عدد المحاولات عند الإجابة الخاطئة': 'Attempts for invalid answers',
  'رسالة الخطأ (اختياري)': 'Error message (optional)',
  'لو تُركت فارغة يُعاد السؤال نفسه': 'Leave empty to repeat the question',
  'كل الشروط': 'All conditions',
  'أي شرط': 'Any condition',
  متغيّر: 'Variable',
  'آخر رسالة': 'Last message',
  'حقل العميل (name/phone/email)': 'Contact field (name/phone/email)',
  'بيان مخصص للعميل': 'Custom contact attribute',
  القناة: 'Channel',
  الاسم: 'Name',
  يساوي: 'Equals',
  'لا يساوي': 'Does not equal',
  يحتوي: 'Contains',
  'لا يحتوي': 'Does not contain',
  'يبدأ بـ': 'Starts with',
  'ينتهي بـ': 'Ends with',
  'أكبر من': 'Greater than',
  'أصغر من': 'Less than',
  موجود: 'Is set',
  'يطابق Regex': 'Matches Regex',
  'حذف الشرط': 'Remove condition',
  '+ شرط داخل المجموعة': '+ Condition in group',
  '+ مجموعة شروط': '+ Condition group',
  'اسم المتغيّر': 'Variable name',
  تعيين: 'Set',
  زيادة: 'Increment',
  مسح: 'Clear',
  'المقدار (افتراضي 1)': 'Amount (default 1)',
  '+ إضافة': '+ Add',
  'اسم البيان': 'Attribute name',
  'يُحفظ على جهة الاتصال ويبقى بعد انتهاء المحادثة':
    'Stored on the contact after the conversation ends',
  ثواني: 'Seconds',
  دقائق: 'Minutes',
  ساعات: 'Hours',
  أيام: 'Days',
  الطريقة: 'Method',
  الرابط: 'URL',
  'العناوين الداخلية/المحلية محظورة لأسباب أمنية':
    'Internal and local addresses are blocked for security',
  'حفظ من الرد': 'Save from response',
  'مثال: المسار data.price ← المتغيّر price': 'Example: response path data.price to variable price',
  '+ حقل': '+ Field',
  'مثل Africa/Cairo أو Asia/Riyadh': 'For example Africa/Cairo or Asia/Riyadh',
  'الصيغة: 09:00-17:00, 19:00-22:00 (اتركها فارغة للإجازة)':
    'Format: 09:00-17:00, 19:00-22:00 (leave empty for a day off)',
  '+ فرع': '+ Branch',
  'رسالة ترحيب (اختياري)': 'Greeting (optional)',
  'تعليمات إضافية لهذه العقدة': 'Additional instructions for this step',
  'مثال: ركّز على أسئلة الحجز فقط': 'Example: focus on booking questions only',
  'كلمات تنهي المحادثة مع المساعد': 'Keywords that end the assistant conversation',
  'مفصولة بفاصلة، مثل: شكرا، تمام، bye': 'Comma-separated, for example: thanks, done, bye',
  'أقصى عدد ردود قبل الخروج': 'Maximum replies before exiting',
  'احفظ آخر رد في متغيّر (اختياري)': 'Save last reply as variable (optional)',
  'رسالة للعميل قبل التحويل': 'Message before human handoff',
  'تعيين لموظف (معرّف المستخدم، اختياري)': 'Assign agent (user ID, optional)',
  'رسالة ختامية (اختياري)': 'Closing message (optional)',
  '+ زر': '+ Button',
  '+ صف': '+ Row',
  التالي: 'Next',
  'رد آخر': 'Other reply',
  'إجابة صحيحة': 'Valid answer',
  فشل: 'Failure',
  'غير ذلك': 'Otherwise',
  نجاح: 'Success',
  خطأ: 'Error',
  مفتوح: 'Open',
  مغلق: 'Closed',
  'انتهت المحادثة': 'Conversation ended',
  'تحويل لموظف': 'Human handoff',
  'نص الرسالة': 'Message text',
  'مرفق (اختياري)': 'Attachment (optional)',
  'خيارات الرد': 'Reply options',
  'نص زر فتح القائمة': 'List button text',
  'نص السؤال': 'Question text',
  'نوع الإجابة المقبولة': 'Answer type',
  'حفظ الإجابة في متغيّر': 'Save answer as variable',
  'عدد المحاولات': 'Retry attempts',
  'رسالة الخطأ': 'Error message',
  'المكوّن المنشور': 'Published component',
  'عنوان الطلب': 'Request URL',
  'طريقة الطلب': 'HTTP method',
  'المنطقة الزمنية': 'Time zone',
  'رسالة التحويل': 'Handoff message',
  'إضافة وسوم': 'Add tags',
  'إزالة وسوم': 'Remove tags',
  'افصل بين الوسوم بفاصلة. يمكن استخدام المتغيّرات.':
    'Separate tags with commas. Variables allowed.',
  'نص الملاحظة': 'Note text',
  'تُحفظ في ملف العميل ولا تظهر له.': 'Saved on the contact record, never shown to them.',
  المفتاح: 'Key',
  القيمة: 'Value',
  المدة: 'Duration',
  الوحدة: 'Unit',
  التعليمات: 'Instructions',
  'الحد الأقصى للرسائل': 'Maximum turns',
  'أقل قيمة': 'Minimum value',
  'أعلى قيمة': 'Maximum value',
  'احفظ الرقم في متغيّر': 'Save number as variable',
  'تم العثور': 'Found',
  'غير موجود': 'Not found',
  'رابط الشيت': 'Sheet link',
  'الشيت لازم يكون متاح لأي شخص معه الرابط (Anyone with the link). الصف الأول عناوين الأعمدة.':
    'The sheet must be shared as "Anyone with the link". The first row holds column headers.',
  'عمود البحث': 'Lookup column',
  'قيمة البحث': 'Lookup value',
  'لو تركت عمود البحث فاضي بيرجع أول صف.':
    'Leave the lookup column empty to use the first data row.',
  'حفظ أعمدة في متغيّرات': 'Save columns to variables',
  'اسم العمود ← اسم المتغيّر': 'Column name → variable name',
  'رقم صحيح عشوائي يشمل الحدّين، ويُحفظ لاستخدامه في الشروط والرسائل.':
    'A random whole number including both limits, saved for conditions and messages.',
};
export function editorLabel(value: string, language: string) {
  if (language !== 'en') return value;
  return (
    labels[value] ??
    value.replace(/^شرط (\d+)$/, 'Condition $1').replace(/^فرع (\d+)$/, 'Branch $1')
  );
}

/** Independent SVGs keep analytics symbols consistent across Arabic/English fonts. */
export function NodeStatIcon({ kind }: { kind: 'sent' | 'delivered' | 'subscribers' | 'errors' }) {
  const paths = {
    sent: 'M22 2 9 15M22 2l-7 20-6-7-7-6L22 2Z',
    delivered: 'm7 12 3 3 7-7M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
    subscribers:
      'M16 9a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM5 20a7 7 0 0 1 14 0M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
    errors:
      'M8 9h8v8a4 4 0 0 1-8 0V9ZM9 9V7a3 3 0 0 1 6 0v2M4 11h4m8 0h4M4 16h4m8 0h4M7 4l2 2m8-2-2 2M5 21l4-3m10 3-4-3',
  };
  return (
    <svg
      data-stat={kind}
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[kind]} />
    </svg>
  );
}
