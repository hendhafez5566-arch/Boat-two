export const ACCOUNT_GROUPS = [
  {
    key: 'automation',
    icon: 'flows',
    ar: 'الأتمتة',
    en: 'Automation',
    sections: [
      'bot_reply',
      'message_templates',
      'sequences',
      'action_buttons',
      'webhook_workflows',
    ],
  },
  {
    key: 'collection',
    icon: 'crm',
    ar: 'جمع البيانات',
    en: 'Data Collection',
    sections: ['entry_points', 'whatsapp_flows', 'appointment_booking'],
  },
  {
    key: 'ai',
    icon: 'agents',
    ar: 'الذكاء الاصطناعي',
    en: 'AI',
    sections: ['ai_agents', 'knowledge'],
  },
  { key: 'engagement', icon: 'inbox', ar: 'التفاعل', en: 'Engagement', sections: ['chat_widget'] },
  {
    key: 'commerce',
    icon: 'commerce',
    ar: 'التجارة',
    en: 'Commerce',
    sections: ['product_catalog'],
  },
  {
    key: 'integrations',
    icon: 'integrations',
    ar: 'التكاملات',
    en: 'Integrations',
    sections: ['integrations'],
  },
];
export const ACCOUNT_SECTION_LABELS: Record<string, [string, string]> = {
  bot_reply: ['الردود والتدفقات', 'Keyword Replies'],
  message_templates: ['قوالب الرسائل', 'Message Templates'],
  sequences: ['تسلسلات المتابعة', 'Follow-up Sequences'],
  action_buttons: ['الإجراءات السريعة', 'Quick Actions'],
  webhook_workflows: ['مسارات Webhook', 'Webhook Workflows'],
  entry_points: ['تدفقات جمع البيانات', 'User Input Flows'],
  whatsapp_flows: ['نماذج WhatsApp', 'WhatsApp Flows'],
  appointment_booking: ['حجز المواعيد', 'Appointment Booking'],
  ai_agents: ['مساعدو الذكاء الاصطناعي', 'AI Agents'],
  knowledge: ['قاعدة المعرفة', 'Knowledge'],
  chat_widget: ['نقاط بدء المحادثة', 'Chat Entry'],
  product_catalog: ['كتالوج المنتجات', 'Product Catalog'],
  integrations: ['التكاملات', 'Integrations'],
  settings: ['إعدادات الحساب', 'Bot Settings'],
};
export function accountSection(search: string) {
  const section = new URLSearchParams(search).get('section') ?? 'bot_reply';
  return Object.hasOwn(ACCOUNT_SECTION_LABELS, section) ? section : 'bot_reply';
}
