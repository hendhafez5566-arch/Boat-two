import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const source = stripTypeScriptTypes(readFileSync('apps/web/lib/whatsapp-flow-builder.ts', 'utf8'));
const { buildNativeFlow } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
);
const fields = ['heading', 'text', 'textarea', 'checkbox', 'radio', 'select', 'date'].map(
  (type, index) => ({
    id: `field_${index}`,
    type,
    label: `Field ${index}`,
    required: true,
    options: [
      { id: 'a', title: 'First' },
      { id: 'b', title: 'Second' },
    ],
  }),
);
const form = { screenId: 'CONTACT', title: 'تواصل معنا', submitLabel: 'إرسال', fields };
const before = JSON.stringify(form);
const flow = buildNativeFlow(form);
assert.equal(JSON.stringify(form), before, 'building does not mutate editor state');
assert.equal(flow.screens[0].terminal, true);
const children = flow.screens[0].layout.children[0].children;
assert.deepEqual(
  children.map((field) => field.type),
  [
    'TextHeading',
    'TextInput',
    'TextArea',
    'CheckboxGroup',
    'RadioButtonsGroup',
    'Dropdown',
    'DatePicker',
    'Footer',
  ],
);
const payload = children.at(-1)['on-click-action'].payload;
assert.equal(Object.keys(payload).length, 6);
assert.equal(payload.field_1, '${form.field_1}');
assert.equal(payload.field_0, undefined, 'headings are not submitted as customer answers');
assert.equal(children[3]['data-source'][0].id, 'a');
assert.equal(children[1].required, true);
assert.throws(() => buildNativeFlow({ ...form, screenId: 'invalid screen' }), /Screen ID/);
assert.throws(() => buildNativeFlow({ ...form, fields: [fields[1], fields[1]] }), /unique/);
assert.throws(
  () => buildNativeFlow({ ...form, fields: [{ ...fields[3], options: [] }] }),
  /Choice/,
);
assert.throws(() => buildNativeFlow({ ...form, fields: [{ ...fields[1], label: '' }] }), /label/);
console.log(
  'PASS: all seven native fields, completion payload, localization, non-mutation and invalid keys/options',
);
