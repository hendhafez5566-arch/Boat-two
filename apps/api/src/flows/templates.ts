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
      id: 'tourism_pro',
      name: 'بوت شركة سياحة احترافي · عمرة وحج ورحلات',
      description: 'قائمة واتساب تفاعلية متعددة الأقسام، طلبات عروض وأسعار بدون أرقام وهمية، حفظ اهتمامات العميل وتفاصيل الرحلة والتحويل للموظف.',
      graph: {
        startNodeId: 'tourism_welcome',
        policy: { startFrequency: 'always', sessionHours: 24 },
        nodes: [
          {
            id: 'tourism_welcome',
            type: 'interactive',
            position: { x: 80, y: 40 },
            data: {
              text: 'أهلًا وسهلًا بك في شركتنا للسياحة والسفر ✈️🌙\\nيسعدنا مساعدتك في العمرة والحج والرحلات والتأشيرات. اختار الخدمة من القائمة 👇',
              list: {
                buttonText: 'تصفح خدماتنا',
                sections: [
                  { title: 'خدمات السفر', rows: [
                    { id: 'umrah', title: 'برامج العمرة', description: 'اقتصادي ومميز وبرامج خاصة' },
                    { id: 'hajj', title: 'برامج الحج', description: 'استفسار ومتابعة البرامج' },
                    { id: 'egypt', title: 'رحلات داخل مصر', description: 'مصايف ومدن سياحية' },
                    { id: 'abroad', title: 'رحلات خارجية', description: 'وجهات خارج مصر' },
                    { id: 'visa', title: 'التأشيرات', description: 'متطلبات واستفسارات التأشيرة' },
                    { id: 'offers', title: 'العروض الحالية', description: 'طلب أحدث البرامج المتاحة' },
                    { id: 'agent', title: 'التحدث مع موظف', description: 'التحويل إلى فريق المبيعات' },
                  ] },
                ],
              },
            },
            edges: {
              'option:umrah': 'interest_umrah',
              'option:hajj': 'interest_hajj',
              'option:egypt': 'interest_egypt',
              'option:abroad': 'interest_abroad',
              'option:visa': 'interest_visa',
              'option:offers': 'interest_offers',
              'option:agent': 'tourism_handoff',
              fallback: 'tourism_welcome',
            },
          },
          ...[
            { id: 'umrah', value: 'عمرة', text: '🌙 برامج العمرة\\nيمكننا مساعدتك في مقارنة المدة والفنادق ومواعيد السفر ومستوى الخدمة. الأسعار والتوافر يتم تأكيدهما بواسطة الموظف.' },
            { id: 'hajj', value: 'حج', text: '🕋 برامج الحج\\nنساعدك في الاستفسار عن أنواع البرامج وإجراءات التقديم والمستندات وفق الضوابط السارية. تفاصيل الأسعار والمواعيد يحددها فريق الحج.' },
            { id: 'egypt', value: 'رحلات داخل مصر', text: '🏖️ رحلات داخل مصر\\nتقدر تستفسر عن الساحل الشمالي وشرم الشيخ والغردقة والأقصر وأسوان حسب موعدك والميزانية.' },
            { id: 'abroad', value: 'رحلات خارجية', text: '🌍 رحلات خارجية\\nقولي الدولة وموعد السفر وعدد المسافرين، وفريقنا يقترح برنامجًا مناسبًا حسب التوافر.' },
            { id: 'visa', value: 'تأشيرات', text: '🛂 استفسارات التأشيرات\\nالمتطلبات تختلف حسب الجنسية والوجهة والغرض من السفر. فريق التأشيرات هيراجع التفاصيل قبل تأكيد أي إجراء.' },
            { id: 'offers', value: 'العروض الحالية', text: '🎁 أحدث العروض\\nيسعدنا نرشح لك أفضل برنامج مناسب. العروض والأسعار والتوافر يتم تأكيدها عند الطلب، مش هنعرض أسعارًا غير محدثة.' },
          ].flatMap((service, index) => [
            {
              id: `interest_${service.id}`,
              type: 'set_attribute' as const,
              position: { x: 80 + (index % 3) * 360, y: 300 + Math.floor(index / 3) * 340 },
              data: { key: 'tourism_interest', value: service.value },
              edges: { next: `category_${service.id}` },
            },
            {
              id: `category_${service.id}`,
              type: 'interactive' as const,
              position: { x: 80 + (index % 3) * 360, y: 440 + Math.floor(index / 3) * 340 },
              data: {
                text: service.text,
                buttons: [
                  { id: 'request', title: 'طلب عرض سعر' },
                  { id: 'back', title: 'القائمة الرئيسية' },
                  { id: 'staff', title: 'تحدث مع موظف' },
                ],
              },
              edges: {
                'option:request': 'tourism_name',
                'option:back': 'tourism_welcome',
                'option:staff': 'tourism_handoff',
                fallback: 'tourism_welcome',
              },
            },
          ]),
          {
            id: 'tourism_name',
            type: 'question',
            position: { x: 500, y: 1180 },
            data: { text: 'تمام 🙌 علشان نجهز طلبك، ممكن أعرف اسم حضرتك؟', answerType: 'text', saveAs: 'tourism_name', retries: 2, errorText: 'من فضلك اكتب اسمك.' },
            edges: { ok: 'tourism_destination', fail: 'tourism_handoff' },
          },
          {
            id: 'tourism_destination',
            type: 'question',
            position: { x: 500, y: 1350 },
            data: { text: 'إيه الوجهة أو نوع البرنامج اللي مهتم بيه؟', answerType: 'text', saveAs: 'tourism_destination', retries: 2 },
            edges: { ok: 'tourism_departure', fail: 'tourism_handoff' },
          },
          {
            id: 'tourism_departure',
            type: 'question',
            position: { x: 500, y: 1520 },
            data: { text: 'موعد السفر المفضل إيه؟ (مثال: شهر ديسمبر أو يوم 15/12)', answerType: 'text', saveAs: 'tourism_departure', retries: 2 },
            edges: { ok: 'tourism_travelers', fail: 'tourism_handoff' },
          },
          {
            id: 'tourism_travelers',
            type: 'question',
            position: { x: 500, y: 1690 },
            data: { text: 'عدد المسافرين كام شخص؟', answerType: 'number', saveAs: 'tourism_travelers', retries: 2, errorText: 'من فضلك اكتب عدد الأشخاص بالأرقام.' },
            edges: { ok: 'tourism_save', fail: 'tourism_handoff' },
          },
          {
            id: 'tourism_save',
            type: 'note',
            position: { x: 500, y: 1870 },
            data: { body: 'استفسار سياحي من واتساب | الخدمة: {{contact.attr.tourism_interest}} | الاسم: {{tourism_name}} | الوجهة: {{tourism_destination}} | الموعد: {{tourism_departure}} | عدد المسافرين: {{tourism_travelers}}' },
            edges: { next: 'tourism_handoff' },
          },
          {
            id: 'tourism_handoff',
            type: 'handoff',
            position: { x: 900, y: 1890 },
            data: { message: 'شكرًا لحضرتك ✅ تم استلام الاستفسار، وهيتواصل معاك أحد ممثلي الشركة لتأكيد التفاصيل والسعر والتوافر. 🙏' },
            edges: {},
          },
        ],
      },
    },
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

// Localize only immutable built-in starter content; saved/user-authored graphs never pass here.
export function localizedFlowTemplates(language: 'ar' | 'en' = 'ar') {
  const translations: Record<string, string> = {
    'خدمة العملاء · Customer support': 'Customer support',
    'جمع بيانات العملاء · Lead capture': 'Lead capture',
    'أسئلة متكررة · FAQ': 'Frequently asked questions',
    'ترحيب وقائمة مساعدة وتحويل إلى موظف.': 'Welcome, offer help and hand off to a teammate.',
    'اسأل عن الاسم والبريد واحفظهما في ملف العميل قبل التحويل.':
      'Ask for name and email, save them to the contact and hand off.',
    'قائمة خدمات وأسعار قابلة للتعديل، مع تحويل بشري.':
      'Editable service and pricing choices with human handoff.',
    'سيتواصل معك أحد أفراد الفريق الآن.': 'A teammate will help you now.',
    'مرحبًا بك! كيف نساعدك اليوم؟': 'Welcome! How can we help today?',
    'مواعيد العمل': 'Opening hours',
    'تحدث مع موظف': 'Talk to a teammate',
    'يسعدنا خدمتك. يرجى تعديل هذه الرسالة لتوضيح مواعيد شركتك.':
      'We are happy to help. Edit this message to show your opening hours.',
    'أهلًا! ما اسمك؟': 'Hello! What is your name?',
    'ما بريدك الإلكتروني للتواصل؟': 'What email address can we use to contact you?',
    'يرجى إدخال بريد صحيح.': 'Please enter a valid email address.',
    'ما الذي تريد معرفته؟': 'What would you like to know?',
    خدماتنا: 'Our services',
    الأسعار: 'Pricing',
    موظف: 'Teammate',
    'أضف وصف خدمات شركتك هنا قبل النشر.': 'Add your service descriptions here before publishing.',
    'أضف أسعارك الفعلية هنا قبل النشر.': 'Add your actual prices here before publishing.',
  };
  const walk = (value: unknown): unknown =>
    typeof value === 'string'
      ? (translations[value] ?? value)
      : Array.isArray(value)
        ? value.map(walk)
        : value && typeof value === 'object'
          ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, walk(item)]))
          : value;
  const copy = structuredClone(FLOW_TEMPLATES);
  return language === 'en' ? (walk(copy) as typeof FLOW_TEMPLATES) : copy;
}
