import type { FlowGraph } from './engine/types';
export function initialFlowGraph(
  language: 'ar' | 'en' = 'ar',
  type: 'message' | 'user_input' | 'whatsapp_flow' = 'message',
): FlowGraph {
  const ar = language === 'ar';
  const data =
    type === 'user_input'
      ? {
          name: ar ? 'جمع بيانات العميل' : 'Customer details',
          questions: [
            {
              id: 'question_1',
              text: ar ? 'ما اسمك؟' : 'What is your name?',
              kind: 'text',
              saveAs: 'customer_name',
            },
          ],
          doneText: ar ? 'شكرًا لك' : 'Thank you',
        }
      : type === 'whatsapp_flow'
        ? {
            text: ar ? 'أكمل النموذج' : 'Complete the form',
            flowId: '',
            cta: ar ? 'فتح النموذج' : 'Open form',
            screen: 'START',
            saveAs: 'form',
          }
        : { text: ar ? 'مرحباً! كيف يمكنني مساعدتك؟' : 'Hello! How can I help you?' };
  return {
    startNodeId: 'start',
    nodes: [
      {
        id: 'start',
        type,
        position: { x: 80, y: 80 },
        data,
        edges: type === 'whatsapp_flow' ? { ok: 'end', fail: 'end' } : { next: 'end' },
      },
      { id: 'end', type: 'end', position: { x: 80, y: 380 }, data: {}, edges: {} },
    ],
  };
}
