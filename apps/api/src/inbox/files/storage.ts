import { randomBytes } from 'node:crypto';

export const ALLOWED_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
  'video/mp4': 'mp4',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

const EXT_TO_MIME = Object.fromEntries(Object.entries(ALLOWED_MIME).map(([m, e]) => [e, m]));
const STORED_NAME = /^[a-f0-9]{48}\.[a-z0-9]{2,5}$/;

export type MediaKind = 'image' | 'video' | 'audio' | 'file';

export function kindFromMime(mime: string): MediaKind {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'file';
}

/** يتحقق من أن بداية الملف تطابق نوعه المُعلَن (للأنواع التي لها توقيع معروف) */
export function sniffMatches(mime: string, buf: Buffer): boolean {
  const starts = (...bytes: number[]) => bytes.every((b, i) => buf[i] === b);
  switch (mime) {
    case 'image/jpeg': return starts(0xff, 0xd8, 0xff);
    case 'image/png': return starts(0x89, 0x50, 0x4e, 0x47);
    case 'image/gif': return starts(0x47, 0x49, 0x46, 0x38);
    case 'image/webp': return buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
    case 'application/pdf': return buf.toString('ascii', 0, 5) === '%PDF-';
    default: return true;
  }
}

/** اسم تخزين عشوائي غير قابل للتخمين؛ الاسم الأصلي لا يدخل مسار الملف أبداً */
export function newStoredName(mime: string): string | null {
  const ext = ALLOWED_MIME[mime];
  return ext ? `${randomBytes(24).toString('hex')}.${ext}` : null;
}

export function isStoredName(name: string): boolean {
  return STORED_NAME.test(name);
}

export function mimeFromStoredName(name: string): string | null {
  return EXT_TO_MIME[name.split('.').pop() ?? ''] ?? null;
}

export function safeDownloadName(original: string): string {
  const base = original.replace(/[\\/\0\r\n"]/g, '_').replace(/^\.+/, '').slice(0, 120);
  return base || 'file';
}
