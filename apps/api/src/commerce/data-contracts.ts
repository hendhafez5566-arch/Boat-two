import { z } from 'zod';
export const mappingSchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(120),
  description: z.string().max(120).optional(),
  category: z.string().max(120).optional(),
  visible: z.string().max(120).optional(),
  order: z.string().max(120).optional(),
  categoryOrder: z.string().max(120).optional(),
  image: z.string().max(120).optional(),
  link: z.string().max(120).optional(),
  fields: z
    .array(
      z.object({
        column: z.string().min(1).max(120),
        label: z.string().min(1).max(120),
        kind: z.enum(['text', 'price']).default('text'),
      }),
    )
    .max(40)
    .default([]),
});
export const sourceSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    kind: z.enum(['file', 'google']),
    connectionId: z.string().uuid().optional(),
    spreadsheetId: z
      .string()
      .regex(/^[\w-]{10,200}$/)
      .optional(),
    range: z.string().min(1).max(200).optional(),
    mapping: mappingSchema,
    autoSync: z.boolean().default(false),
    aiEnabled: z.boolean().default(false),
  })
  .superRefine((v, c) => {
    if (v.kind === 'google' && (!v.connectionId || !v.spreadsheetId || !v.range))
      c.addIssue({
        code: 'custom',
        message: 'Choose an authorized Google account, spreadsheet and worksheet',
      });
    if (v.kind === 'file' && v.autoSync)
      c.addIssue({ code: 'custom', message: 'Local files require uploading a newer version' });
  });
export type SourceInput = z.infer<typeof sourceSchema>;
export type Mapping = z.infer<typeof mappingSchema>;
export type CatalogItem = {
  key: string;
  name: string;
  description: string;
  category: string;
  visible: boolean;
  sort: number;
  categorySort: number;
  image: string | null;
  link: string | null;
  fields: { label: string; value: string; kind: string }[];
};
const safeUrl = (v: string) => {
  if (!v) return null;
  const u = new URL(v);
  if (u.protocol !== 'https:' || u.username || u.password)
    throw new Error('Images and links must use HTTPS');
  return u.href;
};
export function normalizeRows(rows: string[][], m: Mapping) {
  if (rows.length < 2 || rows.length > 10001)
    throw new Error(
      'Provide 1–10000 data rows; empty updates cannot replace the last successful catalog',
    );
  const headers = rows[0].map((v) => v.trim());
  if (headers.some((v) => !v) || new Set(headers).size !== headers.length || headers.length > 100)
    throw new Error('Column names must be unique and nonempty (maximum 100)');
  const required = [
    m.id,
    m.name,
    ...[m.description, m.category, m.visible, m.order, m.categoryOrder, m.image, m.link].filter(
      Boolean,
    ),
    ...m.fields.map((f) => f.column),
  ];
  for (const col of required)
    if (!headers.includes(col!)) throw new Error(`Mapped column is missing: ${col}`);
  const seen = new Set<string>(),
    items: CatalogItem[] = [],
    errors: { row: number; message: string }[] = [];
  rows.slice(1).forEach((r, i) => {
    if (r.every((v) => !v.trim())) return;
    try {
      if (
        r.length > headers.length ||
        r.some((v) => v.length > 4000 || v.includes(String.fromCharCode(0)))
      )
        throw new Error('Invalid row width or cell length');
      const get = (col?: string) => (col ? (r[headers.indexOf(col)] ?? '').trim() : '');
      const key = get(m.id),
        name = get(m.name);
      if (!key || key.length > 200 || !name || name.length > 120)
        throw new Error('A stable ID and name are required');
      if (seen.has(key)) throw new Error(`Duplicate item ID: ${key}`);
      seen.add(key);
      const visibility = get(m.visible).toLowerCase();
      if (
        m.visible &&
        ![
          'true',
          '1',
          'yes',
          'visible',
          'published',
          'ظاهر',
          'نعم',
          'false',
          '0',
          'no',
          'hidden',
          'مخفي',
          'لا',
        ].includes(visibility)
      )
        throw new Error('Visibility must be explicit: visible/hidden or true/false');
      const sort = get(m.order),
        categorySort = get(m.categoryOrder);
      if (
        categorySort &&
        (!Number.isFinite(Number(categorySort)) || Math.abs(Number(categorySort)) > 100000000)
      )
        throw new Error('Invalid category order');
      if (sort && (!Number.isFinite(Number(sort)) || Math.abs(Number(sort)) > 100000000))
        throw new Error('Invalid display order');
      const fields = m.fields.map((f) => ({ label: f.label, value: get(f.column), kind: f.kind }));
      items.push({
        key,
        name,
        description: get(m.description),
        category: get(m.category).slice(0, 300),
        visible:
          !m.visible ||
          ['true', '1', 'yes', 'visible', 'published', 'ظاهر', 'نعم'].includes(visibility),
        sort: Number(sort || 0),
        categorySort: Number(categorySort || 0),
        image: safeUrl(get(m.image)),
        link: safeUrl(get(m.link)),
        fields,
      });
    } catch (e) {
      errors.push({ row: i + 2, message: (e as Error).message });
    }
  });
  return { headers, items, errors };
}
export function itemText(
  p: { name: string; description: string; dynamic_fields?: { label: string; value: string }[] },
  allowed?: string[],
) {
  return [
    p.name,
    p.description,
    ...(p.dynamic_fields ?? [])
      .filter((f) => !allowed?.length || allowed.includes(f.label))
      .filter((f) => f.value)
      .map((f) => `${f.label}: ${f.value}`),
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 3500);
}
export function searchTerms(q: string) {
  return q
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter(
      (w) =>
        (w.length > 1 || /^[a-z0-9]$/.test(w)) &&
        ![
          'عندكم',
          'عندك',
          'سعر',
          'السعر',
          'كام',
          'بكام',
          'في',
          'فى',
          'من',
          'هو',
          'هي',
          'ايه',
          'ما',
          'هل',
          'the',
          'in',
          'on',
          'for',
          'to',
          'me',
          'please',
          'can',
          'is',
          'a',
          'do',
          'you',
          'have',
          'price',
          'how',
          'much',
          'what',
          'available',
          'مقاس',
          'لون',
          'الغرفه',
          'الفرد',
          'programs',
          'برامج',
        ].includes(w),
    )
    .map((w) => w.replace(/^ال/, '').replace(/ه$/, ''))
    .filter((w) => w.length > 1 || /^[a-z0-9]$/.test(w))
    .slice(0, 12);
}
