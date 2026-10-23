import { NavIcon } from '../product/NavIcon';
import { NodeType, NODE_META } from '../../lib/flow-types';
export const NODE_EN: Record<NodeType, string> = {
  message: 'Send message',
  question: 'Ask a question',
  condition: 'Condition',
  set_variable: 'Set variable',
  set_attribute: 'Customer attribute',
  delay: 'Wait',
  http_request: 'HTTP request',
  business_hours: 'Business hours',
  split: 'Random split',
  ai_reply: 'AI assistant',
  handoff: 'Human handoff',
  end: 'End conversation',
  subflow: 'Reusable component',
};
export function nodeLabel(type: NodeType, language: string) {
  return language === 'en' ? NODE_EN[type] : NODE_META[type].label;
}
export const nodeIcon: Record<NodeType, string> = {
  message: 'inbox',
  question: 'question',
  condition: 'automations',
  set_variable: 'variable',
  set_attribute: 'crm',
  delay: 'sessions',
  http_request: 'globe',
  business_hours: 'sessions',
  split: 'flows',
  ai_reply: 'agents',
  handoff: 'team',
  end: 'check',
  subflow: 'flows',
};
export function NodeIcon({ type }: { type: NodeType }) {
  return <NavIcon name={nodeIcon[type]} />;
}
const labels: Record<string, string> = {
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
  المفتاح: 'Key',
  القيمة: 'Value',
  المدة: 'Duration',
  الوحدة: 'Unit',
  التعليمات: 'Instructions',
  'الحد الأقصى للرسائل': 'Maximum turns',
};
export function editorLabel(value: string, language: string) {
  if (language !== 'en') return value;
  return labels[value] ?? value.replace(/^شرط (\d+)$/, 'Condition $1');
}
