// Server render/data-preservation acceptance, not browser or pixel acceptance.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const source = createRequire(import.meta.url);
const api = createRequire(resolve('apps/api/package.json'));
api('tsx/cjs');
const web = createRequire(resolve('apps/web/package.json'));
const React = web('react');
globalThis.React = React;
const { renderToStaticMarkup } = web('react-dom/server');
source.extensions['.css'] = (module) => {
  module.exports = { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
};
const { TemplateDraftForm } = source('../apps/web/components/business/TemplateDraftForm.tsx');
const { parseTemplateDraft } = source('../apps/api/src/messaging/template-draft.ts');
let count = 0;
for (const mode of ['default', 'manager'])
  for (const category of ['UTILITY', 'MARKETING'])
    for (const format of ['NONE', 'TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT']) {
      const draft = {
        name: 'synthetic_template',
        language: 'ar',
        category,
        body: 'Synthetic {{1}}',
        examples: ['QA'],
        footer: 'Synthetic footer',
        buttons: [{ type: 'URL', text: 'Open item', url: 'https://example.test/item' }],
        ...(format === 'NONE'
          ? {}
          : {
              header: {
                type: 'HEADER',
                format,
                ...(format === 'TEXT'
                  ? { text: 'Synthetic header' }
                  : { example: { header_handle: ['synthetic-upload-handle'] } }),
              },
            }),
      };
      const parsed = parseTemplateDraft(draft);
      const initial = {
        ...parsed,
        id: 'synthetic',
        revision: 1,
        status: 'DRAFT',
        supported: true,
        error: null,
      };
      const html = renderToStaticMarkup(
        React.createElement(TemplateDraftForm, {
          mode,
          initial,
          busy: false,
          save: async () => true,
          saveAndReview: async () => true,
          cancel: () => {},
        }),
      );
      for (const value of [
        'synthetic_template',
        'Synthetic {{1}}',
        'QA',
        'Synthetic footer',
        'Open item',
        'https://example.test/item',
      ])
        assert.ok(html.includes(value), mode + ' lost ' + value);
      if (format === 'TEXT') assert.ok(html.includes('Synthetic header'));
      if (!['NONE', 'TEXT'].includes(format)) assert.ok(html.includes('synthetic-upload-handle'));
      assert.doesNotMatch(html, /role="dialog"|NaN|undefined/);
      if (mode === 'manager') {
        assert.equal((html.match(/name="templateHeader"/g) || []).length, 5);
        assert.equal((html.match(/name="templateCategory"/g) || []).length, 2);
        assert.match(html, /<aside/);
        assert.match(html, /name="intent" value="review"/);
        const headings = [
          'المعلومات الأساسية',
          'تصنيف القالب',
          'نوع الترويسة',
          'محتوى الرسالة',
          'نص التذييل',
          'الأزرار',
        ];
        let previous = -1;
        for (const text of headings) {
          const at = html.indexOf('<h3>' + text);
          assert.ok(at > previous, text);
          previous = at;
        }
      } else {
        assert.doesNotMatch(html, /<aside|name="intent"/);
        assert.match(html, /<select/);
      }
      const busy = renderToStaticMarkup(
        React.createElement(TemplateDraftForm, {
          mode,
          initial,
          busy: true,
          save: async () => true,
        }),
      );
      assert.match(busy, /<fieldset disabled=""/);
      count++;
    }
console.log(
  'PASS ' +
    count +
    ' populated draft render cases: supported headers/categories preserved in default and manager layouts; busy editing disabled. Browser/visual acceptance remains separate.',
);

const { templateLocales } = source('../apps/web/components/business/template-locales.ts');
assert.equal(new Set(templateLocales.map(([code]) => code)).size, templateLocales.length);
for (const [language] of templateLocales)
  assert.doesNotThrow(() =>
    parseTemplateDraft({
      name: 'locale_qa',
      language,
      category: 'UTILITY',
      body: 'Synthetic text',
      examples: [],
      buttons: [],
    }),
  );
console.log(
  'PASS ' +
    templateLocales.length +
    ' observed supported locale codes satisfy the actual draft API contract.',
);
