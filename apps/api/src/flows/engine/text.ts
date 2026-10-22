export function normalizeDigits(s: string): string {
  return s
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/** توحيد النص للمقارنة: أرقام عربية، حروف الألف، الياء، التشكيل، المسافات */
export function normalizeText(s: string): string {
  return normalizeDigits(s.normalize('NFKC'))
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const part of path.split('.')) {
    if (part === '__proto__' || part === 'constructor' || part === 'prototype') return undefined;
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    if (Array.isArray(cur) && /^\d+$/.test(part)) {
      cur = cur[Number(part)];
    } else if (Object.prototype.hasOwnProperty.call(cur, part)) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return cur;
}

export type Escape = 'none' | 'json' | 'url';
export type Resolver = (path: string) => unknown;

const TAG = /\{\{\s*([\p{L}\p{N}_.-]+)\s*\}\}/gu;

function stringify(v: unknown): string {
  if (v === null || v === undefined) return '';
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}

export function interpolate(tpl: string, resolve: Resolver, escape: Escape = 'none'): string {
  return tpl.replace(TAG, (_m, p: string) => {
    const s = stringify(resolve(p));
    if (escape === 'json') return JSON.stringify(s).slice(1, -1);
    if (escape === 'url') return encodeURIComponent(s);
    return s;
  });
}

/** لو القيمة كلها متغير واحد ("{{age}}") نحافظ على نوعه الأصلي */
export function interpolateValue(tpl: string, resolve: Resolver): unknown {
  const m = /^\{\{\s*([\p{L}\p{N}_.-]+)\s*\}\}$/u.exec(tpl.trim());
  return m ? resolve(m[1]) : interpolate(tpl, resolve);
}
