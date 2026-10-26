export type ConversationDraft = {
  text: string;
  internal: boolean;
  attach: { url?: string; [key: string]: unknown } | null;
};
export const emptyConversationDraft = (): ConversationDraft => ({
  text: '',
  internal: false,
  attach: null,
});
export function sameConversationDraft(a: ConversationDraft, b: ConversationDraft) {
  return a.text === b.text && a.internal === b.internal && a.attach?.url === b.attach?.url;
}
export class ConversationDrafts {
  private drafts = new Map<string, ConversationDraft>();
  read(id: string) {
    return this.drafts.get(id) ?? emptyConversationDraft();
  }
  write(id: string, draft: ConversationDraft) {
    this.drafts.set(id, { ...draft });
  }
  clearSent(id: string, sent: ConversationDraft) {
    const current = this.drafts.get(id);
    if (current && sameConversationDraft(current, sent)) this.drafts.delete(id);
  }
}
