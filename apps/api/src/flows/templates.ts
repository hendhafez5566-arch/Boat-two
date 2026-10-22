import type { FlowGraph } from './engine';
const handoff = {
  id: 'handoff',
  type: 'handoff' as const,
  position: { x: 400, y: 500 },
  data: { message: 'سيتواصل معك أحد أفراد الفريق الآن.' },
  edges: {},
};
export const FLOW_TEMPLATES: { id: string; name: string; description: string; graph: FlowGraph }[] =
  [
    {
      id: 'support',
      name: 'خدمة العملاء · Customer support',
      description: 'ترحيب وقائمة مساعدة وتحويل إلى موظف.',
      graph: {
        startNodeId: 'welcome',
        nodes: [
          {
            id: 'welcome',
            type: 'message',
            position: { x: 100, y: 50 },
            data: {
              text: 'مرحبًا بك! كيف نساعدك اليوم؟',
              buttons: [
                { id: 'hours', title: 'مواعيد العمل' },
                { id: 'agent', title: 'تحدث مع موظف' },
              ],
            },
            edges: { 'option:hours': 'hours', 'option:agent': 'handoff', fallback: 'handoff' },
          },
          {
            id: 'hours',
            type: 'message',
            position: { x: 50, y: 280 },
            data: { text: 'يسعدنا خدمتك. يرجى تعديل هذه الرسالة لتوضيح مواعيد شركتك.' },
            edges: { next: 'handoff' },
          },
          handoff,
        ],
      },
    },
    {
      id: 'lead',
      name: 'جمع بيانات العملاء · Lead capture',
      description: 'اسأل عن الاسم والبريد واحفظهما في ملف العميل قبل التحويل.',
      graph: {
        startNodeId: 'name',
        nodes: [
          {
            id: 'name',
            type: 'question',
            position: { x: 100, y: 20 },
            data: {
              text: 'أهلًا! ما اسمك؟',
              answerType: 'text',
              saveAs: 'customer_name',
              retries: 2,
            },
            edges: { ok: 'save_name', fail: 'handoff' },
          },
          {
            id: 'save_name',
            type: 'set_attribute',
            position: { x: 100, y: 180 },
            data: { key: 'customer_name', value: '{{customer_name}}' },
            edges: { next: 'email' },
          },
          {
            id: 'email',
            type: 'question',
            position: { x: 100, y: 340 },
            data: {
              text: 'ما بريدك الإلكتروني للتواصل؟',
              answerType: 'email',
              saveAs: 'customer_email',
              retries: 2,
              errorText: 'يرجى إدخال بريد صحيح.',
            },
            edges: { ok: 'save_email', fail: 'handoff' },
          },
          {
            id: 'save_email',
            type: 'set_attribute',
            position: { x: 100, y: 500 },
            data: { key: 'customer_email', value: '{{customer_email}}' },
            edges: { next: 'handoff' },
          },
          { ...handoff, position: { x: 400, y: 680 } },
        ],
      },
    },
    {
      id: 'faq',
      name: 'أسئلة متكررة · FAQ',
      description: 'قائمة خدمات وأسعار قابلة للتعديل، مع تحويل بشري.',
      graph: {
        startNodeId: 'menu',
        nodes: [
          {
            id: 'menu',
            type: 'message',
            position: { x: 100, y: 20 },
            data: {
              text: 'ما الذي تريد معرفته؟',
              buttons: [
                { id: 'services', title: 'خدماتنا' },
                { id: 'pricing', title: 'الأسعار' },
                { id: 'agent', title: 'موظف' },
              ],
            },
            edges: {
              'option:services': 'services',
              'option:pricing': 'pricing',
              'option:agent': 'handoff',
              fallback: 'handoff',
            },
          },
          {
            id: 'services',
            type: 'message',
            position: { x: 0, y: 230 },
            data: { text: 'أضف وصف خدمات شركتك هنا قبل النشر.' },
            edges: { next: 'handoff' },
          },
          {
            id: 'pricing',
            type: 'message',
            position: { x: 320, y: 230 },
            data: { text: 'أضف أسعارك الفعلية هنا قبل النشر.' },
            edges: { next: 'handoff' },
          },
          handoff,
        ],
      },
    },
  ];
