import assert from 'node:assert/strict';
import { test } from 'node:test';
import JSZip from 'jszip';
import { Workbook } from 'exceljs';
import { normalizeSpreadsheetXml, normalizeXlsxNamespaces } from './xlsx-namespaces';

test('imports valid prefixed OOXML without losing Arabic, prices, relationships or hidden sheets', async () => {
  const original = new Workbook();
  original.addWorksheet('Catalog').addRows([
    ['id', 'name', 'price'],
    ['QA-T01', 'رحلة & اختبار', 1777],
  ]);
  original.addWorksheet('Other', { state: 'hidden' }).addRow(['keep']);
  const zip = await JSZip.loadAsync(await original.xlsx.writeBuffer());
  for (const entry of Object.values(zip.files)) {
    if (!/^xl\/.*\.xml$/.test(entry.name)) continue;
    let xml = await entry.async('string');
    if (!xml.includes('xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'))
      continue;
    xml = xml
      .replace(
        'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"',
        'xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"',
      )
      .replace(/<(\/?)([A-Za-z][\w-]*)(?=[\s/>])/g, '<$1x:$2');
    zip.file(entry.name, xml);
  }
  const result = new Workbook();
  await result.xlsx.load(
    (await normalizeXlsxNamespaces(await zip.generateAsync({ type: 'nodebuffer' }))) as never,
  );
  assert.equal(result.worksheets.length, 2);
  assert.equal(result.worksheets[0].getCell('B2').text, 'رحلة & اختبار');
  assert.equal(result.worksheets[0].getCell('C2').value, 1777);
  assert.equal(result.worksheets[1].state, 'hidden');
});

test('preserves foreign namespace tags and rejects DTD and malformed XML', () => {
  const uri = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const xml = normalizeSpreadsheetXml(
    `<s:workbook xmlns:s="${uri}" xmlns:e="urn:other"><e:extra a="&quot;"/><s:sheets/></s:workbook>`,
  );
  assert.match(xml, /<e:extra a="&quot;">/);
  assert.match(xml, /<sheets xmlns=/);
  assert.throws(() => normalizeSpreadsheetXml('<!DOCTYPE x><x/>'), /DTD/);
  assert.throws(() => normalizeSpreadsheetXml('<x>'));
});
