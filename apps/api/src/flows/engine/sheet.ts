/** Public Google Sheet support: URL parsing, CSV parsing and row lookup. Pure functions, no I/O. */

export interface SheetRef {
  /** CSV endpoint to request (always on docs.google.com) */
  csvUrl: string;
}

const ID_RE = /^[A-Za-z0-9_-]{10,200}$/;

/** Accepts the sheet's share/edit link or a "Publish to web" link; returns null for anything else. */
export function parseSheetUrl(raw: string): SheetRef | null {
  let u: URL;
  try {
    u = new URL(String(raw).trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.hostname !== 'docs.google.com') return null;
  const gid = (u.searchParams.get('gid') ?? new URLSearchParams(u.hash.replace(/^#/, '')).get('gid') ?? '').trim();
  if (gid && !/^\d{1,12}$/.test(gid)) return null;

  // published-to-web link: /spreadsheets/d/e/<key>/pub?output=csv
  const pub = u.pathname.match(/^\/spreadsheets\/d\/e\/([A-Za-z0-9_-]{10,300})\/pub/);
  if (pub) {
    const q = new URLSearchParams({ output: 'csv' });
    if (gid) q.set('gid', gid);
    return { csvUrl: `https://docs.google.com/spreadsheets/d/e/${pub[1]}/pub?${q}` };
  }
  const m = u.pathname.match(/^\/spreadsheets\/d\/([^/]+)/);
  if (!m || !ID_RE.test(m[1])) return null;
  const q = new URLSearchParams({ tqx: 'out:csv' });
  if (gid) q.set('gid', gid);
  return { csvUrl: `https://docs.google.com/spreadsheets/d/${m[1]}/gviz/tq?${q}` };
}

/** Hosts a sheet request may be redirected to. */
export function isAllowedSheetHost(host: string): boolean {
  return host === 'docs.google.com' || /^[a-z0-9-]+\.googleusercontent\.com$/.test(host);
}

/** RFC-4180 style CSV parser (quoted fields, escaped quotes, CRLF, newlines inside quotes). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();

/** Phone-ish values compare by digits so "+20 100-123" matches "20100123". */
function same(a: string, b: string): boolean {
  if (norm(a) === norm(b)) return true;
  const da = a.replace(/\D/g, '');
  const db = b.replace(/\D/g, '');
  return da.length >= 6 && da === db;
}

export interface SheetLookup {
  headers: string[];
  row: Record<string, string> | null;
  /** 1-based data row number (header excluded) of the match */
  index: number;
  total: number;
}

/** First row is the header. Without a lookup column the first data row is returned. */
export function lookupRow(rows: string[][], column: string | undefined, value: string): SheetLookup {
  const headers = (rows[0] ?? []).map((h) => h.trim());
  const data = rows.slice(1);
  const toObj = (r: string[]) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? '']));
  if (!column?.trim()) return { headers, row: data[0] ? toObj(data[0]) : null, index: data[0] ? 1 : 0, total: data.length };
  const col = headers.findIndex((h) => norm(h) === norm(column));
  if (col < 0) return { headers, row: null, index: 0, total: data.length };
  const at = data.findIndex((r) => same(r[col] ?? '', value));
  return { headers, row: at < 0 ? null : toObj(data[at]), index: at + 1, total: data.length };
}
