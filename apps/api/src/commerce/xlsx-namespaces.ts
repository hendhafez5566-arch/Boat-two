import JSZip from 'jszip';
import { SaxesParser } from 'saxes';

const spreadsheet = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const escape = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;')
    .replace(/>/g, '&gt;')
    .replace(/\r/g, '&#13;');

/** ExcelJS dispatches on literal tag names, although OOXML permits namespace prefixes. */
export function normalizeSpreadsheetXml(xml: string): string {
  const parser = new SaxesParser({ xmlns: true });
  let output = '';
  parser.on('doctype', () => {
    throw new Error('DTD is not allowed in spreadsheet XML');
  });
  parser.on('opentag', (node) => {
    const name = node.uri === spreadsheet ? node.local : node.name;
    output += '<' + name;
    for (const attr of Object.values(node.attributes)) {
      if (attr.uri === 'http://www.w3.org/2000/xmlns/' && attr.value === spreadsheet) continue;
      if (attr.name === 'xmlns') continue;
      output += ` ${attr.name}="${escape(attr.value)}"`;
    }
    // Explicit defaults also preserve nested foreign-namespace elements.
    if (node.uri === spreadsheet || !node.prefix) output += ` xmlns="${escape(node.uri)}"`;
    output += '>';
  });
  parser.on('closetag', (node) => {
    output += '</' + (node.uri === spreadsheet ? node.local : node.name) + '>';
  });
  parser.on('text', (value) => {
    output += escape(value);
  });
  parser.on('cdata', (value) => {
    output += escape(value);
  });
  parser.write(xml).close();
  return output;
}

export async function normalizeXlsxNamespaces(buffer: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  let expanded = 0;
  const files = Object.values(zip.files);
  if (files.length > 500) throw new Error('Workbook exceeds the safe entry limit');
  for (const entry of files) {
    if (entry.dir) continue;
    const bytes = await entry.async('nodebuffer');
    expanded += bytes.length;
    if (expanded > 25 * 1024 * 1024) throw new Error('Workbook expands beyond the safe size limit');
    if (/^xl\/.*\.xml$/i.test(entry.name)) {
      const xml = bytes.toString('utf8');
      // Normalize only spreadsheet documents; preserve drawings and other vocabularies.
      if (xml.includes(spreadsheet)) zip.file(entry.name, normalizeSpreadsheetXml(xml));
    }
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
