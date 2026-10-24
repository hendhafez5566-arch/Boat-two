export function automationLabel(value: string, t: (ar: string, en: string) => string) {
  const labels: Record<string, [string, string]> = {
    note: ['ملاحظة', 'Note'],
    tag: ['إضافة وسم', 'Add tag'],
    task: ['مهمة متابعة', 'Follow-up task'],
    lifecycle: ['مرحلة العميل', 'Lifecycle'],
    branch: ['تفرّع شرطي', 'Conditional branch'],
    delay: ['انتظار', 'Delay'],
    http: ['طلب HTTP', 'HTTP request'],
    'crm.contacts.insert': ['إنشاء عميل', 'Contact created'],
    'crm.contacts.update': ['تحديث عميل', 'Contact updated'],
    'crm.crm_deals.insert': ['إنشاء صفقة', 'Deal created'],
    'crm.crm_deals.update': ['تحديث صفقة', 'Deal updated'],
    'crm.crm_tasks.insert': ['إنشاء متابعة', 'Task created'],
    'crm.crm_tasks.update': ['تحديث متابعة', 'Task updated'],
    'automation.scheduled': ['موعد مخصص', 'Scheduled'],
  };
  return labels[value] ? t(...labels[value]) : value;
}
