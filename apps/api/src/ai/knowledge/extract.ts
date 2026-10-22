/* eslint-disable @typescript-eslint/no-explicit-any */
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', ndash: '–', mdash: '—' };

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(Math.min(parseInt(h, 16), 0x10ffff)))
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Math.min(Number(d), 0x10ffff)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

/** استخراج النص المقروء من صفحة HTML (بدون سكربتات/قوائم تنقّل/تذييل) */
export function htmlToText(html: string): { title: string; text: string } {
  const title = decodeEntities((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '').replace(/\s+/g, ' ').trim());
  let s = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|nav|footer|header|form|iframe|template)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|section|article|li|tr|h[1-6]|ul|ol|table|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<h([1-6])[^>]*>/gi, (_m, n) => `\n\n${'#'.repeat(Number(n))} `)
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s)
    .split('\n')
    .map((l) => l.replace(/[ \t\u00a0]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { title, text: s };
}

const load = (name: string): Promise<any> => import(name);

const TEXT_EXT = /\.(txt|md|markdown|csv|json|log)$/i;

/** استخراج النص من ملف مرفوع. PDF وDOCX يحتاجان مكتبتي pdf-parse وmammoth */
export async function extractFileText(name: string, mime: string, buf: Buffer): Promise<string> {
  const lower = name.toLowerCase();
  if (mime.startsWith('text/') || mime === 'application/json' || TEXT_EXT.test(lower)) {
    return buf.toString('utf8');
  }
  if (mime === 'application/pdf' || lower.endsWith('.pdf')) {
    const mod: any = await load('pdf-parse');
    const pdf = mod.default ?? mod;
    const r = await pdf(buf);
    return String(r.text ?? '');
  }
  if (lower.endsWith('.docx') || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const mod: any = await load('mammoth');
    const r = await (mod.default ?? mod).extractRawText({ buffer: buf });
    return String(r.value ?? '');
  }
  throw new Error('Unsupported file type. Use TXT, MD, CSV, PDF or DOCX.');
}
