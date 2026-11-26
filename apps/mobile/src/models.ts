export type ChannelType = 'whatsapp' | 'telegram' | 'facebook' | 'instagram' | 'web' | string;
export type MessageContent = {
  text?: string;
  reply?: { title?: string };
  media?: { kind?: string; caption?: string; filename?: string; url?: string };
  location?: { name?: string; address?: string };
  template?: { name?: string };
  event?: string;
};
export type Conversation = {
  id: string;
  contact_name: string;
  contact_phone?: string;
  channel_type: ChannelType;
  channel_name?: string;
  unread_count: number;
  last_message?: MessageContent | null;
  last_message_at: string;
  status: 'open' | 'pending' | 'closed';
  handled_by: 'human' | 'bot';
  assigned_to?: string | null;
  assignee_name?: string | null;
  important?: boolean;
};
export type ConversationDetail = Conversation & {
  whatsapp_window_expires_at?: string | null;
  contact_email?: string | null;
  contact_tags?: string[];
};
export type Message = {
  id: string;
  seq: number;
  direction: 'in' | 'out';
  sender_type: string;
  sender_name?: string;
  type: string;
  content: MessageContent;
  status: string;
  is_internal: boolean;
  created_at: string;
};
export type CrmTask = {
  id: string;
  contact_name?: string;
  title: string;
  status: 'open' | 'done';
  priority: 'low' | 'normal' | 'high';
  due_at: string;
};
export type CommerceOrder = {
  id: string;
  contact_name: string;
  status: string;
  snapshot: { name?: string; total?: number; currency?: string };
  created_at: string;
  assignee_name?: string | null;
};
export function messagePreview(content?: MessageContent | null): string {
  if (!content) return '';
  if (content.text) return content.text;
  if (content.reply?.title) return content.reply.title;
  if (content.media) return content.media.caption || content.media.filename || (
    content.media.kind === 'image' ? '📷 صورة' :
    content.media.kind === 'audio' ? '🎤 رسالة صوتية' : '📎 مرفق'
  );
  if (content.template) return 'رسالة قالب';
  if (content.location) return '📍 موقع';
  return 'رسالة';
}
export function clock(value?: string): string {
  if (!value) return '';
  const time = new Date(value);
  return Number.isNaN(time.getTime()) ? '' : time.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
}
export function calendar(value?: string): string {
  if (!value) return '';
  const time = new Date(value);
  return Number.isNaN(time.getTime()) ? '' : time.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
}
export function initials(name?: string): string {
  return (name || '؟').trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase();
}
export function channelName(kind?: string): string {
  return ({ whatsapp: 'واتساب', telegram: 'تليجرام', facebook: 'فيسبوك', instagram: 'إنستجرام', web: 'ويب شات' } as Record<string, string>)[kind || ''] || kind || 'محادثة';
}
export const ORDER_LABELS: Record<string, string> = {
  new: 'جديد', review: 'مراجعة', documents_required: 'مطلوب مستندات', processing: 'قيد التنفيذ',
  confirmed: 'مؤكد', completed: 'مكتمل', cancelled: 'ملغي',
};
export const ORDER_TRANSITIONS: Record<string, string[]> = {
  new: ['review', 'confirmed', 'cancelled'],
  review: ['documents_required', 'processing', 'confirmed', 'cancelled'],
  documents_required: ['review', 'processing', 'cancelled'],
  processing: ['documents_required', 'completed', 'cancelled'],
  confirmed: ['documents_required', 'processing', 'completed', 'cancelled'],
  completed: [],
  cancelled: [],
};
