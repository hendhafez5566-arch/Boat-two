// RFC 4180 quoted cells, embedded newlines and escaped quotes; export neutralizes formulas.
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (quoted) throw new Error('Unclosed quoted CSV cell');
  row.push(cell);
  if (row.some(Boolean)) rows.push(row);
  const headers = rows.shift()?.map((x) => x.trim()) || [];
  if (!headers.includes('name')) throw new Error('CSV must include a name column');
  if (new Set(headers).size !== headers.length) throw new Error('Duplicate CSV column');
  return rows.map((r) => {
    if (r.length !== headers.length) throw new Error('CSV row has a different number of columns');
    return Object.fromEntries(headers.map((h, i) => [h, r[i]]));
  });
}
export function exportCsv(rows: Record<string, unknown>[], headers: string[]) {
  const cell = (value: unknown) => {
    let s =
      value === null || value === undefined
        ? ''
        : Array.isArray(value)
          ? value.join(';')
          : String(value);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  };
  return (
    '\uFEFF' +
    [
      headers.map(cell).join(','),
      ...rows.map((r) => headers.map((h) => cell(r[h])).join(',')),
    ].join('\r\n')
  );
}
export function download(name: string, body: string, type = 'text/csv;charset=utf-8') {
  const u = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement('a');
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
