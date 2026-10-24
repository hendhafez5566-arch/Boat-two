import { getSession } from './api';

const TTL = 7 * 24 * 60 * 60 * 1000;
export type WizardDraft = {
  step: number; goal: string; template: string; name: string; welcome: string;
  channel: string; choices: { title: string; reply: string }[]; created: string;
};
export function wizardDraftKey(): string | null {
  try {
    const token = getSession()?.accessToken;
    if (!token) return null;
    const encoded = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(encoded));
    return claims.tid && claims.sub ? `boat:wizard:v1:${claims.tid}:${claims.sub}` : null;
  } catch { return null; }
}
export function readWizardDraft(key: string | null): WizardDraft | null {
  if (!key) return null;
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    const draft = saved?.draft;
    if (saved?.version !== 1 || !Number.isFinite(saved.expiresAt) || saved.expiresAt <= Date.now() ||
      !draft || !Number.isInteger(draft.step) || draft.step < 1 || draft.step > 7 ||
      !['goal', 'template', 'name', 'welcome', 'channel', 'created'].every(k => typeof draft[k] === 'string') ||
      !Array.isArray(draft.choices) || draft.choices.length > 3 ||
      !draft.choices.every((c: { title?: unknown; reply?: unknown }) => c && typeof c.title === 'string' && typeof c.reply === 'string')) {
      localStorage.removeItem(key); return null;
    }
    return draft;
  } catch { return null; }
}
export function writeWizardDraft(key: string | null, draft: WizardDraft | null): boolean {
  if (!key) return false;
  try {
    if (draft) localStorage.setItem(key, JSON.stringify({version: 1, expiresAt: Date.now() + TTL, draft}));
    else localStorage.removeItem(key);
    return true;
  } catch { return false; }
}
